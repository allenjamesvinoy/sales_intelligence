import json
from datetime import date, datetime
from zoneinfo import ZoneInfo

from .config import ENRICHMENT_CAP_PER_USER
from .db import now
from .ranking import RepContext, product_fit, score
from .scrape import enrich_websites, gaf_search_url, scrape_gaf_list

GAF_RADII = (25, 50, 100)


def rep_context(conn, user_id: int) -> tuple[RepContext, int | None]:
    scope = conn.execute("SELECT * FROM user_scopes WHERE user_id = ?", (user_id,)).fetchone()
    focus = {r["name"]: r["focus_level"] for r in conn.execute(
        """SELECT pc.name, up.focus_level FROM user_products up
           JOIN product_categories pc ON pc.id = up.product_category_id WHERE up.user_id = ?""", (user_id,))}
    snapshot = conn.execute(
        """SELECT s.id FROM inventory_snapshots s JOIN users u ON u.branch_id = s.branch_id
           WHERE u.id = ? ORDER BY s.taken_at DESC LIMIT 1""", (user_id,)).fetchone()
    stock = {}
    if snapshot:
        stock = {r["name"]: r["stock_priority"] for r in conn.execute(
            """SELECT pc.name, ii.stock_priority FROM inventory_items ii
               JOIN product_categories pc ON pc.id = ii.product_category_id WHERE ii.inventory_snapshot_id = ?""",
            (snapshot["id"],))}
    rep = RepContext(scope["territory_value"], scope["contractor_segment"], scope["maximum_distance_miles"], focus, stock)
    return rep, snapshot["id"] if snapshot else None


def rank_candidates(conn, user_id: int, rep: RepContext) -> list[tuple]:
    rows = conn.execute(
        """SELECT c.*, d.distance_miles FROM contractors c
           JOIN contractor_distances d ON d.contractor_id = c.id AND d.postal_code = ?
           LEFT JOIN lead_states s ON s.contractor_id = c.id AND s.user_id = ?
           WHERE (s.stage IS NULL OR s.stage = 'recommended')
             AND (c.segment IS NULL OR c.segment = ?)
             AND d.distance_miles <= ?""",
        (rep.postal_code, user_id, rep.segment, rep.max_distance),
    ).fetchall()
    return sorted(((row, *score(row, rep)) for row in rows), key=lambda t: -t[1])


def build_queues(conn, queue_date: date | None = None, user_ids: list[int] | None = None, rebuild: bool = False) -> None:
    """Publishes each active user's queue for the day. `rebuild` replaces an already published queue."""
    plans = []
    for user in conn.execute("SELECT * FROM users WHERE active = 1").fetchall():
        if user_ids and user["id"] not in user_ids:
            continue
        day = queue_date or datetime.now(ZoneInfo(user["timezone"])).date()
        existing = conn.execute("SELECT id, status FROM daily_queues WHERE user_id = ? AND queue_date = ?",
                                (user["id"], day.isoformat())).fetchone()
        if existing and existing["status"] == "published" and not rebuild:
            continue
        if existing:
            conn.execute("DELETE FROM daily_queue_items WHERE daily_queue_id = ?", (existing["id"],))
            conn.execute("DELETE FROM daily_queues WHERE id = ?", (existing["id"],))

        rep, snapshot_id = rep_context(conn, user["id"])
        prefs = conn.execute("SELECT * FROM user_queue_preferences WHERE user_id = ?", (user["id"],)).fetchone()
        limit = prefs["daily_recommendation_limit"] if prefs else 10
        index_version = conn.execute("SELECT MAX(id) FROM contractor_index_versions").fetchone()[0]
        queue_id = conn.execute(
            """INSERT INTO daily_queues (user_id, queue_date, status, initial_ranking_completed_at,
                 inventory_snapshot_id, contractor_index_version) VALUES (?, ?, 'ranking', ?, ?, ?)""",
            (user["id"], day.isoformat(), now(), snapshot_id, index_version),
        ).lastrowid
        initial = {row["id"]: (s, reasons) for row, s, reasons in rank_candidates(conn, user["id"], rep)}

        selected = []
        if not prefs or prefs["include_existing_focus"]:
            selected = [r["contractor_id"] for r in conn.execute(
                "SELECT contractor_id FROM lead_states WHERE user_id = ? AND stage = 'focus'", (user["id"],))]
        selected += list(initial)[:limit]
        plans.append((user["id"], queue_id, rep, limit, initial, set(selected[:ENRICHMENT_CAP_PER_USER])))
    conn.commit()

    crawl_set = set().union(*(p[5] for p in plans)) if plans else set()
    try:
        enrichment = enrich_websites(conn, crawl_set) if crawl_set else {}
    except Exception:
        for _, queue_id, *_ in plans:
            conn.execute("UPDATE daily_queues SET status = 'failed' WHERE id = ?", (queue_id,))
        conn.commit()
        raise

    for user_id, queue_id, rep, limit, initial, _ in plans:
        final = rank_candidates(conn, user_id, rep)[:limit]
        with conn:
            conn.execute("UPDATE daily_queues SET enrichment_completed_at = ? WHERE id = ?", (now(), queue_id))
            for position, (row, final_score, final_reasons) in enumerate(final, start=1):
                initial_score, initial_reasons = initial.get(row["id"], (0, []))
                status, trace_id = enrichment.get(row["id"], ("not_selected", None))
                conn.execute(
                    """INSERT INTO daily_queue_items (daily_queue_id, contractor_id, position, initial_score,
                         final_score, initial_reasons, final_reasons, product_categories, enrichment_status,
                         enrichment_trace_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (queue_id, row["id"], position, initial_score, final_score, json.dumps(initial_reasons),
                     json.dumps(final_reasons), json.dumps(list(product_fit(row))), status, trace_id),
                )
            conn.execute("UPDATE daily_queues SET status = 'published', published_at = ? WHERE id = ?",
                         (now(), queue_id))
            # A new queue brings a new ranking; manual Recommended order applied to the old one.
            conn.execute("UPDATE lead_states SET sort_order = NULL WHERE user_id = ? AND stage = 'recommended'",
                         (user_id,))


def refresh(conn, user_ids: list[int] | None = None, rebuild: bool = False) -> None:
    """Imports the first GAF results page for each rep's ZIP, then builds their queues."""
    scopes = conn.execute(
        "SELECT s.* FROM user_scopes s JOIN users u ON u.id = s.user_id WHERE u.active = 1").fetchall()
    searches = {(s["territory_value"], s["contractor_segment"],
                 next((r for r in GAF_RADII if r >= s["maximum_distance_miles"]), GAF_RADII[-1]))
                for s in scopes if not user_ids or s["user_id"] in user_ids}
    for postal_code, segment, radius in searches:
        scrape_gaf_list(conn, gaf_search_url(postal_code, radius, segment))
    build_queues(conn, user_ids=user_ids, rebuild=rebuild)

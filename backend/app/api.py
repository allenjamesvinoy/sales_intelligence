from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Response
from pydantic import BaseModel

from . import db
from .config import DEFAULT_USER_ID
from .db import loads, now
from .pipeline import rep_context
from .ranking import priority, product_fit, reason_sentence, score

app = FastAPI(title="InstaHermes API")

Stage = Literal["recommended", "focus", "done", "dismissed"]
Outcome = Literal["Connected", "No response", "Follow-up needed", "Qualified", "Not relevant"]


class StageIn(BaseModel):
    stage: Stage


class ActivityIn(BaseModel):
    outcome: Outcome
    note: str = ""
    followUp: str | None = None


def get_conn():
    conn = db.connect()
    try:
        yield conn
    finally:
        conn.close()


def user_id(x_user_id: int | None = Header(default=None)) -> int:
    return x_user_id or DEFAULT_USER_ID


def to_lead(c, rank: int, final_score: float, reasons: list[dict], next_action: str | None) -> dict:
    gaf = loads(c["gaf_facts"], {})
    web = loads(c["website_facts"], {})
    fit = product_fit(c)
    people = web.get("decision_makers") or []
    person = people[0] if people else None
    evidence = [{"fact": cert, "source": "GAF profile", "url": c["gaf_profile_url"]}
                for cert in loads(c["certifications"], [])]
    sources = web.get("sources") or []
    evidence += [{"fact": p["evidence"], "source": "Web research" if sources else "Company website",
                  "url": sources[0] if sources else c["website"]}
                 for p in web.get("product_fit", []) if p["evidence"]]
    return {
        "id": c["id"],
        "rank": rank,
        "name": c["name"],
        "location": ", ".join(filter(None, [c["city"], c["state"]])),
        "distanceMi": c["distance_miles"],
        "priority": priority(final_score),
        "reason": reason_sentence(reasons),
        "categories": sorted(fit, key=lambda k: fit[k] != "high")[:3],
        "nextAction": next_action or (f"Call {person['name']}" if person else "Ask for the owner or the person who orders materials"),
        "overview": {
            "businessType": f"{c['segment'].capitalize()} roofing contractor" if c["segment"] else None,
            "address": gaf.get("address"),
            "services": web.get("services") or gaf.get("services"),
            "rating": c["rating"],
            "reviewCount": c["review_count"],
            "yearsInBusiness": gaf.get("years_in_business"),
            "certifications": loads(c["certifications"], []),
        },
        "evidence": evidence,
        "productFit": [{k: p[k] for k in ("category", "level", "reason", "question")} for p in web.get("product_fit", [])],
        "contact": {
            "person": person and {"name": person["name"], "role": person["role"], "verified": True, "source": "Web research" if sources else "Company website"},
            "phone": c["phone"] or next(iter(web.get("phones", [])), None),
            "email": next(iter(web.get("emails", [])), None),
            "website": c["website"],
        },
        "opener": web.get("opener"),
        "questions": web.get("questions", []),
    }


@app.get("/leads")
def get_leads(uid: int = Depends(user_id), conn=Depends(get_conn)):
    queue = conn.execute(
        "SELECT * FROM daily_queues WHERE user_id = ? AND status = 'published' ORDER BY queue_date DESC LIMIT 1",
        (uid,)).fetchone()
    items = {}
    if queue:
        items = {r["contractor_id"]: r for r in conn.execute(
            "SELECT * FROM daily_queue_items WHERE daily_queue_id = ? ORDER BY position", (queue["id"],))}
    states = {r["contractor_id"]: r for r in conn.execute("SELECT * FROM lead_states WHERE user_id = ?", (uid,))}

    ids = list(items) + [cid for cid in states if cid not in items]
    contractors = {r["id"]: r for r in conn.execute(
        f"SELECT * FROM contractors WHERE id IN ({','.join('?' * len(ids))})", ids)}
    rep, _ = rep_context(conn, uid)

    leads = []
    for cid in ids:
        c, item, state = contractors[cid], items.get(cid), states.get(cid)
        if item:
            rank, final_score, reasons = item["position"], item["final_score"], loads(item["final_reasons"])
        else:
            rank, (final_score, reasons) = len(leads) + 1, score(c, rep)
        leads.append(to_lead(c, rank, final_score, reasons, state and state["next_action"]))

    activity = {}
    for a in conn.execute("SELECT * FROM activities WHERE user_id = ? ORDER BY created_at DESC", (uid,)):
        activity.setdefault(a["contractor_id"], []).append(
            {"outcome": a["outcome"], "note": a["note"], "followUp": a["follow_up_at"], "at": a["created_at"]})

    return {
        "updatedAt": queue["published_at"] if queue else now(),
        "leads": leads,
        "states": {cid: {"stage": s["stage"], "activity": activity.get(cid, []), "followUp": s["follow_up_at"]}
                   for cid, s in states.items()},
    }


def require_contractor(conn, contractor_id: str) -> None:
    if not conn.execute("SELECT 1 FROM contractors WHERE id = ?", (contractor_id,)).fetchone():
        raise HTTPException(404, "Contractor not found")


def upsert_state(conn, uid: int, contractor_id: str, stage: str, follow_up: str | None) -> None:
    conn.execute(
        """INSERT INTO lead_states (user_id, contractor_id, stage, assigned_at, follow_up_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (user_id, contractor_id) DO UPDATE SET stage = excluded.stage,
             follow_up_at = excluded.follow_up_at, updated_at = excluded.updated_at""",
        (uid, contractor_id, stage, now(), follow_up, now()),
    )


@app.put("/leads/{contractor_id}/stage", status_code=204)
def put_stage(contractor_id: str, body: StageIn, uid: int = Depends(user_id), conn=Depends(get_conn)):
    require_contractor(conn, contractor_id)
    with conn:
        current = conn.execute("SELECT follow_up_at FROM lead_states WHERE user_id = ? AND contractor_id = ?",
                               (uid, contractor_id)).fetchone()
        upsert_state(conn, uid, contractor_id, body.stage,
                     current["follow_up_at"] if current and body.stage == "done" else None)
    return Response(status_code=204)


@app.post("/leads/{contractor_id}/activity", status_code=204)
def post_activity(contractor_id: str, body: ActivityIn, uid: int = Depends(user_id), conn=Depends(get_conn)):
    require_contractor(conn, contractor_id)
    with conn:
        conn.execute(
            "INSERT INTO activities (user_id, contractor_id, outcome, note, follow_up_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (uid, contractor_id, body.outcome, body.note, body.followUp, now()),
        )
        upsert_state(conn, uid, contractor_id, "done", body.followUp)
    return Response(status_code=204)


@app.get("/leads/{contractor_id}/trace")
def get_trace(contractor_id: str, uid: int = Depends(user_id), conn=Depends(get_conn)):
    """Why this contractor was ranked where it was, and every AI call behind its data."""
    require_contractor(conn, contractor_id)
    items = conn.execute(
        """SELECT q.queue_date, q.published_at, q.inventory_snapshot_id, q.contractor_index_version, i.*
           FROM daily_queue_items i JOIN daily_queues q ON q.id = i.daily_queue_id
           WHERE q.user_id = ? AND i.contractor_id = ? ORDER BY q.queue_date DESC""",
        (uid, contractor_id)).fetchall()
    traces = conn.execute("SELECT * FROM ai_traces WHERE contractor_id = ? ORDER BY created_at DESC",
                          (contractor_id,)).fetchall()
    json_fields = ("initial_reasons", "final_reasons", "product_categories")
    return {
        "rankings": [{k: loads(i[k]) if k in json_fields else i[k] for k in i.keys()} for i in items],
        "aiCalls": [{**dict(t), "output": loads(t["output"])} for t in traces],
    }


@app.get("/me")
def get_me(uid: int = Depends(user_id), conn=Depends(get_conn)):
    user = conn.execute(
        """SELECT u.*, b.name AS branch, m.name AS manager FROM users u JOIN branches b ON b.id = u.branch_id
           LEFT JOIN users m ON m.id = u.manager_id WHERE u.id = ?""", (uid,)).fetchone()
    if not user:
        raise HTTPException(404, "User not found")
    scope = conn.execute("SELECT * FROM user_scopes WHERE user_id = ?", (uid,)).fetchone()
    prefs = conn.execute("SELECT * FROM user_queue_preferences WHERE user_id = ?", (uid,)).fetchone()
    products = conn.execute(
        """SELECT pc.name, up.focus_level FROM user_products up JOIN product_categories pc
           ON pc.id = up.product_category_id WHERE up.user_id = ? ORDER BY pc.id""", (uid,)).fetchall()
    primary = [p["name"].lower() for p in products if p["focus_level"] == "primary"]
    last = conn.execute("SELECT MAX(published_at) FROM daily_queues WHERE user_id = ? AND status = 'published'",
                        (uid,)).fetchone()[0]
    return {
        "profile": {k: user[k] for k in ("name", "email", "role", "team_id", "manager", "branch", "timezone")},
        "territory": dict(scope) if scope else None,
        "products": [dict(p) for p in products],
        "queue": {**dict(prefs), "lastRefresh": last} if prefs else None,
        "summary": f"{user['role']} for the {user['branch']} branch, covering contractors within "
                   f"{scope['maximum_distance_miles']:g} miles of {scope['territory_type']} {scope['territory_value']}. "
                   f"Primary product areas: {' and '.join(primary) or 'none'}." if scope else None,
    }

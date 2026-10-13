import re
import sqlite3
from typing import Literal

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Response
from pydantic import BaseModel, Field

from . import accounts, db, llm
from .config import DEFAULT_USER_ID
from .db import loads, now
from .pipeline import GAF_RADII, refresh, rep_context
from .ranking import priority, product_fit, reason_sentence, score

db.init()
app = FastAPI(title="InstaHermes.AI API")
refresh_status: dict[int, str] = {}
EMAIL = re.compile(r"^[\w.+-]+@[\w-]+(\.[\w-]+)+$")

Stage = Literal["recommended", "focus", "done", "dismissed"]
Outcome = Literal["Connected", "No response", "Follow-up needed", "Qualified", "Not relevant"]
Mode = Literal["call", "email", "text", "meeting"]
ISO_DATE = r"^\d{4}-\d{2}-\d{2}$"


class StageIn(BaseModel):
    stage: Stage
    order: float | None = None


class TerritoryIn(BaseModel):
    postalCode: str = Field(pattern=r"^\d{5}$")
    radiusMiles: Literal[GAF_RADII]


class InteractionIn(BaseModel):
    mode: Mode
    outcome: Outcome
    note: str = Field(default="", max_length=20000)
    contactIds: list[int] = []
    nextAction: str | None = None
    dueDate: str | None = Field(default=None, pattern=ISO_DATE)


class ContactIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    role: str | None = None
    phone: str | None = None
    email: str | None = Field(default=None, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class OpportunityIn(BaseModel):
    note: str = Field(min_length=1)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class AssistantIn(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=20)
    contractorId: str | None = None


class NextActionIn(BaseModel):
    nextAction: str = Field(min_length=1)
    dueDate: str = Field(pattern=ISO_DATE)


def get_conn():
    conn = db.connect()
    try:
        yield conn
    finally:
        conn.close()


def user_id(x_user_id: int | None = Header(default=None)) -> int:
    return x_user_id or DEFAULT_USER_ID


def account_json(a: dict) -> dict:
    return {"stage": a["stage"], "owner": {"id": a["owner_id"], "name": a["owner_name"]},
            "nextAction": a["next_action"], "dueDate": a["due_date"], "opportunityNote": a["opportunity_note"]}


def to_lead(c, rank: int, final_score: float, reasons: list[dict], account: dict, people: list[dict]) -> dict:
    gaf = loads(c["gaf_facts"], {})
    web = loads(c["website_facts"], {})
    fit = product_fit(c)
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
        "account": account_json(account),
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
            "person": person and {"name": person["name"], "role": person["role"] or "", "verified": False,
                                  "source": person["source"]},
            "phone": c["phone"] or (person and person["phone"]) or next(iter(web.get("phones", [])), None),
            "email": (person and person["email"]) or next((e for e in web.get("emails", []) if EMAIL.match(e)), None),
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
    rep, _ = rep_context(conn, uid)
    contractors = {r["id"]: r for r in conn.execute(
        f"""SELECT c.*, d.distance_miles FROM contractors c
            LEFT JOIN contractor_distances d ON d.contractor_id = c.id AND d.postal_code = ?
            WHERE c.id IN ({','.join('?' * len(ids))})""", [rep.postal_code, *ids])}

    leads = []
    for cid in ids:
        c, item = contractors[cid], items.get(cid)
        if item:
            rank, final_score, reasons = item["position"], item["final_score"], loads(item["final_reasons"])
        else:
            rank, (final_score, reasons) = len(leads) + 1, score(c, rep)
        leads.append(to_lead(c, rank, final_score, reasons, accounts.get_account(conn, cid, uid),
                             accounts.contacts(conn, cid)))

    return {
        "updatedAt": queue["published_at"] if queue else now(),
        "leads": leads,
        "states": {cid: {"stage": s["stage"], "order": s["sort_order"]} for cid, s in states.items()},
    }


def require_contractor(conn, contractor_id: str) -> None:
    if not conn.execute("SELECT 1 FROM contractors WHERE id = ?", (contractor_id,)).fetchone():
        raise HTTPException(404, "Contractor not found")


def board_stage(conn, uid: int, contractor_id: str) -> str:
    row = conn.execute("SELECT stage FROM lead_states WHERE user_id = ? AND contractor_id = ?",
                       (uid, contractor_id)).fetchone()
    return row["stage"] if row else "recommended"


def upsert_state(conn, uid: int, contractor_id: str, stage: str, order: float | None = None) -> None:
    conn.execute(
        """INSERT INTO lead_states (user_id, contractor_id, stage, assigned_at, sort_order, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (user_id, contractor_id) DO UPDATE SET stage = excluded.stage,
             sort_order = excluded.sort_order, updated_at = excluded.updated_at""",
        (uid, contractor_id, stage, now(), order, now()),
    )


@app.put("/leads/{contractor_id}/stage", status_code=204)
def put_stage(contractor_id: str, body: StageIn, uid: int = Depends(user_id), conn=Depends(get_conn)):
    """Moves a card on the rep's board; the shared account stage follows."""
    require_contractor(conn, contractor_id)
    with conn:
        before = board_stage(conn, uid, contractor_id)
        if body.stage == "done" and before == "recommended":
            raise HTTPException(409, "Move the lead to My Focus before completing it")
        upsert_state(conn, uid, contractor_id, body.stage, body.order)
        if body.stage == "focus" and before in ("recommended", "dismissed"):
            accounts.set_stage(conn, contractor_id, uid, "researching")
        elif body.stage == "done" and before != "done":
            accounts.set_stage(conn, contractor_id, uid, "opportunity")
        elif body.stage == "focus" and before == "done":
            contacted = conn.execute("SELECT 1 FROM activities WHERE contractor_id = ? AND mode != 'update'",
                                     (contractor_id,)).fetchone()
            accounts.set_stage(conn, contractor_id, uid, "contacted" if contacted else "researching", forward_only=False)
    return Response(status_code=204)


@app.get("/accounts/{contractor_id}")
def get_account(contractor_id: str, uid: int = Depends(user_id), conn=Depends(get_conn)):
    """The shared account and its full interaction log across reps, newest first."""
    require_contractor(conn, contractor_id)
    log = conn.execute(
        """SELECT a.id, a.created_at, u.name AS user, a.mode, a.outcome, a.note, a.next_action, a.due_date
           FROM activities a
           JOIN users u ON u.id = a.user_id WHERE a.contractor_id = ? ORDER BY a.created_at DESC, a.id DESC""",
        (contractor_id,)).fetchall()
    people = {}
    for r in conn.execute(
            """SELECT ac.activity_id, c.id, c.name, c.role FROM activity_contacts ac JOIN contacts c ON c.id = ac.contact_id
               WHERE c.contractor_id = ?""", (contractor_id,)):
        people.setdefault(r["activity_id"], []).append({"id": r["id"], "name": r["name"], "role": r["role"]})
    return {
        "account": account_json(accounts.get_account(conn, contractor_id, uid)),
        "contacts": accounts.contacts(conn, contractor_id),
        "interactions": [{"id": r["id"], "at": r["created_at"], "user": r["user"], "mode": r["mode"],
                          "outcome": r["outcome"], "note": r["note"], "nextAction": r["next_action"],
                          "dueDate": r["due_date"], "people": people.get(r["id"], [])} for r in log],
    }


def require_worked(conn, uid: int, contractor_id: str) -> None:
    require_contractor(conn, contractor_id)
    if board_stage(conn, uid, contractor_id) == "recommended":
        raise HTTPException(409, "Move the lead to My Focus first")


@app.post("/accounts/{contractor_id}/interactions", status_code=204)
def post_interaction(contractor_id: str, body: InteractionIn, uid: int = Depends(user_id), conn=Depends(get_conn)):
    """Logs a call, email, text or meeting. Logging a Recommended lead starts working it (moves it to My Focus)."""
    require_contractor(conn, contractor_id)
    known = {c["id"] for c in accounts.contacts(conn, contractor_id)}
    if not set(body.contactIds) <= known:
        raise HTTPException(422, "Unknown contact for this contractor")
    with conn:
        if board_stage(conn, uid, contractor_id) in ("recommended", "dismissed"):
            upsert_state(conn, uid, contractor_id, "focus")
            accounts.set_stage(conn, contractor_id, uid, "researching")
        accounts.set_stage(conn, contractor_id, uid, "contacted", last_outcome=body.outcome,
                           next_action=body.nextAction, due_date=body.dueDate)
        account = accounts.get_account(conn, contractor_id, uid)
        accounts.log(conn, contractor_id, uid, body.mode, body.outcome, body.note,
                     account["next_action"], account["due_date"], body.contactIds)
        if body.outcome == "Not relevant":
            upsert_state(conn, uid, contractor_id, "dismissed")
    return Response(status_code=204)


@app.post("/accounts/{contractor_id}/opportunity", status_code=204)
def post_opportunity(contractor_id: str, body: OpportunityIn, uid: int = Depends(user_id), conn=Depends(get_conn)):
    """Stage 4: the rep confirmed a real need."""
    require_worked(conn, uid, contractor_id)
    with conn:
        accounts.set_stage(conn, contractor_id, uid, "opportunity", note=body.note)
        upsert_state(conn, uid, contractor_id, "done")
    return Response(status_code=204)


@app.post("/accounts/{contractor_id}/contacts", status_code=201)
def post_contact(contractor_id: str, body: ContactIn, uid: int = Depends(user_id), conn=Depends(get_conn)):
    require_contractor(conn, contractor_id)
    with conn:
        try:
            contact_id = conn.execute(
                """INSERT INTO contacts (contractor_id, name, role, phone, email, source, created_by, created_at)
                   VALUES (?, ?, ?, ?, ?, 'Added by rep', ?, ?)""",
                (contractor_id, body.name.strip(), body.role, body.phone, body.email, uid, now())).lastrowid
        except sqlite3.IntegrityError:
            raise HTTPException(409, f"{body.name} is already listed for this contractor")
    return next(c for c in accounts.contacts(conn, contractor_id) if c["id"] == contact_id)


@app.put("/accounts/{contractor_id}/contacts/{contact_id}")
def put_contact(contractor_id: str, contact_id: int, body: ContactIn, uid: int = Depends(user_id), conn=Depends(get_conn)):
    with conn:
        updated = conn.execute(
            "UPDATE contacts SET name = ?, role = ?, phone = ?, email = ? WHERE id = ? AND contractor_id = ?",
            (body.name.strip(), body.role, body.phone, body.email, contact_id, contractor_id)).rowcount
    if not updated:
        raise HTTPException(404, "Contact not found")
    return next(c for c in accounts.contacts(conn, contractor_id) if c["id"] == contact_id)


@app.put("/accounts/{contractor_id}/next-action", status_code=204)
def put_next_action(contractor_id: str, body: NextActionIn, uid: int = Depends(user_id), conn=Depends(get_conn)):
    require_contractor(conn, contractor_id)
    with conn:
        stage = accounts.get_account(conn, contractor_id, uid)["stage"]
        accounts.set_stage(conn, contractor_id, uid, stage, next_action=body.nextAction, due_date=body.dueDate)
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
        "refresh": refresh_status.get(uid),
        "profile": {"name": user["name"], "email": user["email"], "role": user["role"], "team": user["team_id"],
                    "manager": user["manager"], "branch": user["branch"], "timezone": user["timezone"]},
        "territory": scope and {"segment": scope["contractor_segment"], "postalCode": scope["territory_value"],
                                "radiusMiles": scope["maximum_distance_miles"]},
        "products": [{"name": p["name"], "focus": p["focus_level"]} for p in products],
        "queue": prefs and {"dailyLimit": prefs["daily_recommendation_limit"],
                            "readyBy": prefs["morning_queue_ready_by"], "lastRefresh": last},
        "summary": f"{user['role']} for the {user['branch']} branch, covering contractors within "
                   f"{scope['maximum_distance_miles']:g} miles of {scope['territory_type']} {scope['territory_value']}. "
                   f"Primary product areas: {' and '.join(primary) or 'none'}." if scope else None,
    }


def refresh_in_background(uid: int) -> None:
    try:
        with db.transaction() as conn:
            refresh(conn, user_ids=[uid], rebuild=True)
        refresh_status[uid] = "done"
    except Exception as err:
        refresh_status[uid] = f"failed: {err}"


@app.put("/me/territory", status_code=202)
def put_territory(body: TerritoryIn, tasks: BackgroundTasks, uid: int = Depends(user_id), conn=Depends(get_conn)):
    """Saves the rep's ZIP and radius, then re-imports GAF results and rebuilds today's queue."""
    with conn:
        conn.execute("UPDATE user_scopes SET territory_type = 'ZIP', territory_value = ?, maximum_distance_miles = ? "
                     "WHERE user_id = ?", (body.postalCode, body.radiusMiles, uid))
    if refresh_status.get(uid) != "running":
        refresh_status[uid] = "running"
        tasks.add_task(refresh_in_background, uid)
    return {"refresh": "running"}


def assistant_context(conn, uid: int, contractor_id: str | None) -> str:
    me = get_me(uid, conn)
    lines = [f"Rep: {me['profile']['name']}. {me['summary']}", f"Today: {now()[:10]}"]
    if contractor_id:
        c = conn.execute("SELECT * FROM contractors WHERE id = ?", (contractor_id,)).fetchone()
        if not c:
            raise HTTPException(404, "Contractor not found")
        a = accounts.get_account(conn, contractor_id, uid)
        log = conn.execute(
            """SELECT a.created_at, u.name, a.mode, a.outcome, a.note FROM activities a JOIN users u ON u.id = a.user_id
               WHERE a.contractor_id = ? ORDER BY a.id DESC LIMIT 20""", (contractor_id,)).fetchall()
        lines += [
            f"Open account: {c['name']}, {c['city']}, {c['state']}. Stage {a['stage']}, owner {a['owner_name']}, "
            f"next action '{a['next_action']}' due {a['due_date']}.",
            "People: " + ("; ".join(f"{p['name']} ({p['role'] or 'role unknown'})" for p in accounts.contacts(conn, contractor_id)) or "none"),
            f"GAF facts: {c['gaf_facts']}", f"Website facts: {c['website_facts']}",
            "Interaction log (newest first): " + ("; ".join(
                f"{r['created_at'][:16]} {r['name']} {r['mode']}: {r['outcome']} {r['note']}" for r in log) or "none"),
        ]
    else:
        board = conn.execute(
            """SELECT c.name, s.stage, a.stage AS account_stage, a.next_action, a.due_date FROM lead_states s
               JOIN contractors c ON c.id = s.contractor_id LEFT JOIN accounts a ON a.contractor_id = c.id
               WHERE s.user_id = ? AND s.stage IN ('focus', 'done')""", (uid,)).fetchall()
        queue = conn.execute(
            """SELECT c.name, i.position, i.final_reasons FROM daily_queue_items i JOIN daily_queues q ON q.id = i.daily_queue_id
               JOIN contractors c ON c.id = i.contractor_id WHERE q.user_id = ? AND q.status = 'published'
                 AND q.queue_date = (SELECT MAX(queue_date) FROM daily_queues WHERE user_id = ? AND status = 'published')
               ORDER BY i.position""", (uid, uid)).fetchall()
        lines += ["Board: " + "; ".join(f"{r['name']} ({r['stage']}, {r['account_stage']}, next: {r['next_action']} "
                                        f"due {r['due_date']})" for r in board),
                  "Today's ranked recommendations: " + "; ".join(
                      f"#{r['position']} {r['name']}: {reason_sentence(loads(r['final_reasons']))}" for r in queue)]
    return "\n".join(lines)


@app.post("/assistant")
def post_assistant(body: AssistantIn, uid: int = Depends(user_id), conn=Depends(get_conn)):
    context = assistant_context(conn, uid, body.contractorId)
    with conn:
        reply = llm.chat(conn, context, [m.model_dump() for m in body.messages], body.contractorId)
    return {"reply": reply}

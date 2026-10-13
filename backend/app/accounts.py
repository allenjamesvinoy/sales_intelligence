from datetime import date, timedelta

from .db import loads, now

STAGES = ["discovered", "researching", "contacted", "opportunity", "customer"]
STAGE_LABELS = {"discovered": "Discovered", "researching": "Researching", "contacted": "Contacted",
                "opportunity": "Opportunity", "customer": "Customer"}


def get_account(conn, contractor_id: str, user_id: int) -> dict:
    """The account row, or the implied Discovered state for a lead nobody has worked yet."""
    row = conn.execute(
        """SELECT a.*, u.name AS owner_name FROM accounts a LEFT JOIN users u ON u.id = a.owner_id
           WHERE a.contractor_id = ?""", (contractor_id,)).fetchone()
    if row:
        return dict(row)
    owner = conn.execute("SELECT name FROM users WHERE id = ?", (user_id,)).fetchone()
    action, days = next_best_action(conn, contractor_id, "discovered", None)
    return {"contractor_id": contractor_id, "stage": "discovered", "owner_id": user_id,
            "owner_name": owner["name"] if owner else None, "next_action": action,
            "due_date": (date.today() + timedelta(days=days)).isoformat(), "opportunity_note": None}


def next_best_action(conn, contractor_id: str, stage: str, last_outcome: str | None) -> tuple[str, int]:
    """Suggested next step and how many days until it is due."""
    facts = loads(conn.execute("SELECT website_facts FROM contractors WHERE id = ?",
                               (contractor_id,)).fetchone()["website_facts"], {})
    person = (facts.get("decision_makers") or [None])[0]
    if stage in ("discovered", "researching"):
        return (f"Call {person['name']} ({person['role']})" if person
                else "Call the main line and ask for the owner or purchasing"), 0 if stage == "discovered" else 1
    if stage == "contacted":
        return {
            "No response": ("Try again by email or at a different time", 2),
            "Follow-up needed": ("Follow up as agreed", 3),
            "Qualified": ("Convert to an opportunity", 0),
        }.get(last_outcome, ("Confirm their material needs; convert to an opportunity if real", 3))
    if stage == "opportunity":
        return "Prepare a quote for the confirmed need", 2
    return "Review reorder timing and cross-sell", 7


def log(conn, contractor_id: str, user_id: int, mode: str, outcome: str, note: str = "",
        next_action: str | None = None, due_date: str | None = None) -> None:
    conn.execute(
        """INSERT INTO activities (user_id, contractor_id, mode, outcome, note, next_action, due_date, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (user_id, contractor_id, mode, outcome, note, next_action, due_date, now()))


def set_stage(conn, contractor_id: str, user_id: int, stage: str, *, last_outcome: str | None = None,
              next_action: str | None = None, due_date: str | None = None, note: str | None = None,
              forward_only: bool = True) -> None:
    """Moves the account to `stage` (never backwards unless asked), refreshing owner and next action."""
    current = get_account(conn, contractor_id, user_id)
    if forward_only and STAGES.index(stage) < STAGES.index(current["stage"]):
        stage = current["stage"]
    suggested, days = next_best_action(conn, contractor_id, stage, last_outcome)
    conn.execute(
        """INSERT INTO accounts (contractor_id, stage, owner_id, next_action, due_date, opportunity_note, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (contractor_id) DO UPDATE SET stage = excluded.stage,
             owner_id = COALESCE(accounts.owner_id, excluded.owner_id), next_action = excluded.next_action,
             due_date = excluded.due_date, opportunity_note = COALESCE(excluded.opportunity_note, accounts.opportunity_note),
             updated_at = excluded.updated_at""",
        (contractor_id, stage, user_id, next_action or suggested,
         due_date or (date.today() + timedelta(days=days)).isoformat(), note, now()))
    if stage != current["stage"]:
        log(conn, contractor_id, user_id, "update", f"Moved to {STAGE_LABELS[stage]}", note or "")

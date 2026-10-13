import json
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path

from .config import DATABASE_PATH


def now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def days_ago(days: int) -> str:
    return (datetime.now(UTC) - timedelta(days=days)).isoformat(timespec="seconds")


def connect() -> sqlite3.Connection:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def transaction():
    conn = connect()
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def init() -> None:
    with transaction() as conn:
        conn.executescript((Path(__file__).parent / "schema.sql").read_text())
        for table, column, ddl in [("lead_states", "sort_order", "REAL"),
                                   ("activities", "mode", "TEXT NOT NULL DEFAULT 'call'"),
                                   ("activities", "next_action", "TEXT"), ("activities", "due_date", "TEXT"),
                                   ("contacts", "verified_at", "TEXT"), ("contacts", "verified_by", "INTEGER")]:
            if column not in {r["name"] for r in conn.execute(f"PRAGMA table_info({table})")}:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")


def loads(value: str | None, default=None):
    return json.loads(value) if value else default

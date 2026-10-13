import argparse
from datetime import date

from . import db
from .db import now
from .pipeline import build_queues, refresh
from .scrape import scrape_gaf_list

CATEGORIES = ["Residential shingles", "Underlayment", "Ventilation", "Leak barriers", "Metal roofing",
              "Commercial membranes"]


def seed(conn) -> None:
    """Demo profile from the design: Alex, residential rep at the Manhattan branch."""
    conn.executemany("INSERT OR IGNORE INTO product_categories (id, name) VALUES (?, ?)", enumerate(CATEGORIES, 1))
    conn.execute("INSERT OR IGNORE INTO branches (id, name) VALUES (1, 'Manhattan')")
    conn.execute("""INSERT OR IGNORE INTO users (id, name, email, role, branch_id, timezone)
                    VALUES (1, 'Alex Rivera', 'alex@example.com', 'Residential sales representative', 1, 'America/New_York')""")
    conn.execute("""INSERT OR IGNORE INTO users (id, name, email, role, manager_id, branch_id, timezone)
                    VALUES (2, 'Jamie Chen', 'jamie@example.com', 'Residential sales representative', NULL, 1, 'America/New_York')""")
    conn.execute("""INSERT OR IGNORE INTO user_scopes VALUES (1, 'residential', 'ZIP', '10013', 25)""")
    conn.execute("""INSERT OR IGNORE INTO user_scopes VALUES (2, 'residential', 'ZIP', '10013', 25)""")
    for user_id in (1, 2):
        conn.executemany(
            "INSERT OR IGNORE INTO user_products VALUES (?, ?, ?)",
            [(user_id, 1, "primary"), (user_id, 2, "primary"), (user_id, 3, "secondary"), (user_id, 5, "secondary"),
             (user_id, 6, "not_assigned")],
        )
        conn.execute("INSERT OR IGNORE INTO user_queue_preferences (user_id) VALUES (?)", (user_id,))
    if not conn.execute("SELECT 1 FROM inventory_snapshots WHERE branch_id = 1").fetchone():
        snapshot = conn.execute("INSERT INTO inventory_snapshots (branch_id, taken_at) VALUES (1, ?)", (now(),)).lastrowid
        conn.executemany(
            "INSERT INTO inventory_items VALUES (?, ?, ?)",
            [(snapshot, 1, "excess"), (snapshot, 2, "normal"), (snapshot, 3, "excess"), (snapshot, 4, "normal"),
             (snapshot, 5, "low"), (snapshot, 6, "normal")],
        )


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("init", help="create tables and the demo user profile")
    scrape = commands.add_parser("scrape-gaf", help="import one GAF results page and its contractor profiles")
    scrape.add_argument("url")
    commands.add_parser("refresh", help="nightly job: import GAF results for every rep's ZIP, then build queues")
    build = commands.add_parser("build-queues", help="run the overnight ranking and publish morning queues")
    build.add_argument("--date", type=date.fromisoformat)
    args = parser.parse_args()

    db.init()
    with db.transaction() as conn:
        if args.command == "init":
            seed(conn)
        elif args.command == "scrape-gaf":
            print(f"Imported {len(scrape_gaf_list(conn, args.url))} contractors")
        elif args.command == "refresh":
            refresh(conn)
            print("Contractors imported and morning queues published")
        elif args.command == "build-queues":
            build_queues(conn, args.date)
            print("Morning queues published")


if __name__ == "__main__":
    main()

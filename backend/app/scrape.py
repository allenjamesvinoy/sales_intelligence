import json
from urllib.parse import parse_qs, urljoin, urlparse

from . import llm
from .apify import fetch_pages
from .config import PROFILE_REFETCH_DAYS
from .db import days_ago, now
from .perplexity import research


def gaf_search_url(postal_code: str, radius: int, segment: str = "residential", first_result: int = 0) -> str:
    url = f"https://www.gaf.com/en-us/roofing-contractors/{segment}?distance={radius}&postalCode={postal_code}&countryCode=us"
    return f"{url}#firstResult={first_result}" if first_result else url


def contractor_id(profile_url: str) -> str:
    return urlparse(profile_url).path.rstrip("/").rsplit("/", 1)[-1]


def extract_page(conn, url: str, cid: str, markdown: str, purpose: str, schema, instructions: str):
    """Runs extraction only when the page changed. Returns (facts, or None if unchanged, and the trace id)."""
    digest = llm.content_hash(markdown)
    previous = conn.execute("SELECT content_hash, extraction_trace_id FROM web_pages WHERE url = ?", (url,)).fetchone()
    if previous and previous["content_hash"] == digest:
        conn.execute("UPDATE web_pages SET fetched_at = ? WHERE url = ?", (now(), url))
        return None, previous["extraction_trace_id"]
    facts, trace_id = llm.extract(conn, purpose, schema, instructions, markdown, contractor_id=cid, source_url=url)
    conn.execute(
        """INSERT INTO web_pages (url, contractor_id, content_hash, fetched_at, extraction_trace_id)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (url) DO UPDATE SET content_hash = excluded.content_hash,
             fetched_at = excluded.fetched_at, extraction_trace_id = excluded.extraction_trace_id""",
        (url, cid, digest, now(), trace_id),
    )
    return facts, trace_id


def scrape_gaf_list(conn, url: str) -> list[str]:
    """Imports one GAF results page and each listed contractor's GAF profile into the shared index."""
    version_id = conn.execute(
        "INSERT INTO contractor_index_versions (source_url, created_at) VALUES (?, ?)", (url, now())
    ).lastrowid
    segment = "residential" if "/residential" in url else "commercial" if "/commercial" in url else None
    postal_code = parse_qs(urlparse(url).query).get("postalCode", [None])[0]
    if not postal_code:
        raise ValueError("The GAF URL needs a postalCode, e.g. " + gaf_search_url("10013", 25))

    page = next(iter(fetch_pages([url], browser=True).values()), "")
    start = page.find("Showing ")
    if start < 0:
        raise RuntimeError("GAF results did not load on the page; run the import again")
    page = page[start:]
    listing, _ = llm.extract(conn, "gaf_list", llm.GafListPage, llm.GAF_LIST_INSTRUCTIONS, page, source_url=url)

    ids, profile_urls = [], []
    for c in listing.contractors:
        profile_url = urljoin("https://www.gaf.com", c.gaf_profile_url)
        cid = contractor_id(profile_url)
        conn.execute(
            """INSERT INTO contractors (id, name, gaf_profile_url, city, state, segment,
                 certifications, rating, review_count, phone, index_version_id, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT (id) DO UPDATE SET name = excluded.name, gaf_profile_url = excluded.gaf_profile_url,
                 city = excluded.city, state = excluded.state, segment = excluded.segment, certifications = excluded.certifications, rating = excluded.rating,
                 review_count = excluded.review_count, phone = excluded.phone,
                 index_version_id = excluded.index_version_id, updated_at = excluded.updated_at""",
            (cid, c.name, profile_url, c.city, c.state, segment, json.dumps(c.certifications),
             c.rating, c.review_count, c.phone, version_id, now()),
        )
        if c.distance_miles is not None:
            conn.execute("INSERT OR REPLACE INTO contractor_distances VALUES (?, ?, ?)", (cid, postal_code, c.distance_miles))
        ids.append(cid)
        profile_urls.append(profile_url)
    conn.commit()

    recent = {r["url"] for r in conn.execute("SELECT url FROM web_pages WHERE fetched_at > ?",
                                             (days_ago(PROFILE_REFETCH_DAYS),))}
    stale = [u for u in profile_urls if u not in recent]
    for profile_url, markdown in (fetch_pages(stale, browser=True) if stale else {}).items():
        cid = contractor_id(profile_url)
        if cid not in ids or not markdown:
            continue
        profile, _ = extract_page(conn, profile_url, cid, markdown, "gaf_profile", llm.GafProfile,
                                  llm.GAF_PROFILE_INSTRUCTIONS)
        if profile:
            conn.execute(
                "UPDATE contractors SET gaf_facts = ?, website = COALESCE(?, website), updated_at = ? WHERE id = ?",
                (profile.model_dump_json(), profile.website, now(), cid),
            )
        conn.commit()
    return ids


def enrich_websites(conn, contractor_ids: set[str]) -> dict[str, tuple[str, int | None]]:
    """Checks each contractor's website, falling back to web research when there is none or it can't be read."""
    rows = {r["id"]: r for r in conn.execute(
        f"SELECT * FROM contractors WHERE id IN ({','.join('?' * len(contractor_ids))})", list(contractor_ids))}
    categories = [r["name"] for r in conn.execute("SELECT name FROM product_categories ORDER BY id")]
    sites = {r["website"]: cid for cid, r in rows.items() if r["website"]}
    pages = fetch_pages(list(sites)) if sites else {}

    results = {}
    for url, cid in sites.items():
        if not pages.get(url):
            continue
        try:
            facts, trace_id = extract_page(conn, url, cid, pages[url], "website_facts", llm.WebsiteFacts,
                                           llm.website_instructions(categories))
        except Exception:
            results[cid] = ("extraction_failed", None)
            continue
        if facts:
            conn.execute("UPDATE contractors SET website_facts = ?, updated_at = ? WHERE id = ?",
                         (facts.model_dump_json(), now(), cid))
        results[cid] = ("extracted" if facts else "unchanged", trace_id)

    for cid in rows.keys() - results.keys():
        results[cid] = research(conn, rows[cid], categories)
    conn.commit()
    return results

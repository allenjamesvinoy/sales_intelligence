import json
import time

import httpx

from . import llm
from .config import PERPLEXITY_API_KEY, PERPLEXITY_MODEL, RESEARCH_TTL_DAYS
from .db import days_ago, loads, now

URL = "https://api.perplexity.ai/chat/completions"
PURPOSE = "contractor_research"


def research(conn, contractor, categories: list[str]) -> tuple[str, int | None]:
    """Web research for a contractor whose website is unknown or unreadable. Cached for RESEARCH_TTL_DAYS."""
    if not PERPLEXITY_API_KEY:
        return ("no_website" if not contractor["website"] else "fetch_failed"), None

    cached = conn.execute(
        "SELECT id FROM ai_traces WHERE contractor_id = ? AND purpose = ? AND created_at > ? ORDER BY id DESC LIMIT 1",
        (contractor["id"], PURPOSE, days_ago(RESEARCH_TTL_DAYS))).fetchone()
    if cached:
        return "research_cached", cached["id"]

    place = ", ".join(filter(None, [contractor["city"], contractor["state"]]))
    query = f"Roofing contractor {contractor['name']} in {place}. GAF profile: {contractor['gaf_profile_url']}"
    instructions = llm.research_instructions(categories)
    started = time.monotonic()
    try:
        res = httpx.post(URL, timeout=120, headers={"Authorization": f"Bearer {PERPLEXITY_API_KEY}"}, json={
            "model": PERPLEXITY_MODEL,
            "messages": [{"role": "system", "content": instructions}, {"role": "user", "content": query}],
            "response_format": {"type": "json_schema",
                                "json_schema": {"schema": llm.ContractorResearch.model_json_schema()}},
            "web_search_options": {"search_context_size": "low"},
        })
        res.raise_for_status()
        data = res.json()
        facts = llm.ContractorResearch.model_validate_json(data["choices"][0]["message"]["content"])
    except (httpx.HTTPError, ValueError, KeyError):
        return "research_failed", None

    sources = data.get("citations") or []
    output = {**facts.model_dump(exclude={"website"}), "sources": sources}
    usage = data.get("usage") or {}
    trace_id = llm.record_trace(conn, PURPOSE, PERPLEXITY_MODEL, contractor["id"], None, instructions + query,
                                json.dumps({**output, "website": facts.website}),
                                usage.get("prompt_tokens"), usage.get("completion_tokens"), started)

    # Facts read from the contractor's own site outrank web research; never overwrite them.
    existing = loads(contractor["website_facts"])
    if existing is None or "sources" in existing:
        conn.execute("UPDATE contractors SET website_facts = ?, updated_at = ? WHERE id = ?",
                     (json.dumps(output), now(), contractor["id"]))
    if facts.website and not contractor["website"]:
        conn.execute("UPDATE contractors SET website = ? WHERE id = ?", (facts.website, contractor["id"]))
    return "researched", trace_id

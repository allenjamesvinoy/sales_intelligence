import httpx

from .config import APIFY_ACTOR, APIFY_TOKEN

RUN_URL = f"https://api.apify.com/v2/acts/{APIFY_ACTOR}/run-sync-get-dataset-items"


def fetch_pages(urls: list[str], browser: bool = False) -> dict[str, str]:
    """Returns each page's markdown, keyed by requested URL. `browser` forces full rendering for JS-heavy sites."""
    if not APIFY_TOKEN:
        raise RuntimeError("APIFY_TOKEN is not set")
    payload = {
        "startUrls": [{"url": url} for url in urls],
        "maxCrawlDepth": 0,
        "maxCrawlPages": len(urls),
        "crawlerType": "playwright:chrome" if browser else "playwright:adaptive",
        # The default readability cleanup drops GAF's result cards; keep the full page there.
        "htmlTransformer": "none" if browser else "readableText",
        "dynamicContentWaitSecs": 25 if browser else 10,
        "keepUrlFragments": True,
        "saveMarkdown": True,
    }
    res = httpx.post(RUN_URL, json=payload, headers={"Authorization": f"Bearer {APIFY_TOKEN}"}, timeout=600)
    res.raise_for_status()

    pages = {}
    for item in res.json():
        loaded = item.get("url", "")
        requested = next((u for u in urls if loaded.rstrip("/") == u.rstrip("/")), loaded)
        pages[requested] = item.get("markdown") or item.get("text") or ""
    return pages

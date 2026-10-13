from dataclasses import dataclass

from .db import loads

FOCUS_POINTS = {"primary": 15, "secondary": 7}
FIT_WEIGHT = {"high": 1.0, "medium": 0.6}
BASELINE_RESIDENTIAL = {"Residential shingles": "medium"}


@dataclass
class RepContext:
    postal_code: str
    segment: str
    max_distance: float
    focus: dict[str, str]
    stock: dict[str, str]


def product_fit(contractor) -> dict[str, str]:
    """Category -> fit level. Website evidence wins; otherwise a baseline from the GAF segment."""
    facts = loads(contractor["website_facts"])
    if facts:
        return {p["category"]: p["level"] for p in facts["product_fit"] if p["level"] != "unknown"}
    return dict(BASELINE_RESIDENTIAL) if contractor["segment"] == "residential" else {}


def score(contractor, rep: RepContext) -> tuple[float, list[dict]]:
    reasons = []

    def add(factor: str, points: float, detail: str):
        if points:
            reasons.append({"factor": factor, "points": round(points, 1), "detail": detail})

    distance = contractor["distance_miles"]
    if distance is None:
        add("territory", 5, "distance unknown")
    else:
        add("territory", 20 * max(0.0, 1 - distance / rep.max_distance), f"{distance:.1f} mi away")

    fit = product_fit(contractor)
    for category, level in fit.items():
        focus = rep.focus.get(category)
        if focus in FOCUS_POINTS:
            add("product_responsibility", FOCUS_POINTS[focus] * FIT_WEIGHT[level], f"{level} fit for your {focus} area: {category.lower()}")
        if focus in FOCUS_POINTS and rep.stock.get(category) == "excess":
            add("branch_stock", 10, f"branch has excess {category.lower()}")

    if contractor["segment"] == rep.segment:
        add("specialty", 10, f"{rep.segment} contractor")

    certifications = loads(contractor["certifications"], [])
    if any("master elite" in c.lower() for c in certifications):
        add("certification", 15, "GAF Master Elite")
    elif certifications:
        add("certification", 8, certifications[0])

    if (contractor["rating"] or 0) >= 4.5 and (contractor["review_count"] or 0) >= 20:
        add("reputation", 5, f"{contractor['rating']} rating, {contractor['review_count']} reviews")

    website = loads(contractor["website_facts"], {})
    if website.get("decision_makers"):
        add("contact", 10, "decision-maker identified")
    elif contractor["phone"]:
        add("contact", 4, "company phone listed")

    return round(sum(r["points"] for r in reasons), 1), reasons


def priority(score_value: float) -> str:
    return "high" if score_value >= 60 else "medium" if score_value >= 40 else "low"


def reason_sentence(reasons: list[dict]) -> str:
    top = [r["detail"] for r in sorted(reasons, key=lambda r: -r["points"])[:3]]
    text = ", ".join(top)
    return text[:1].upper() + text[1:] + "." if text else ""

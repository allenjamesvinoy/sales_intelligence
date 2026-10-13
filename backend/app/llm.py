import hashlib
import re
import time
from typing import Literal, TypeVar

from openai import OpenAI
from pydantic import BaseModel

from .config import OPENAI_MODEL, TRANSCRIBE_MODEL
from .db import now

PROMPT_VERSION = "2026-10-13.2"
MAX_INPUT_CHARS = 30_000

FitLevel = Literal["high", "medium", "unknown"]


class GafListing(BaseModel):
    name: str
    gaf_profile_url: str
    city: str | None
    state: str | None
    distance_miles: float | None
    certifications: list[str]
    rating: float | None
    review_count: int | None
    phone: str | None


class GafListPage(BaseModel):
    contractors: list[GafListing]


class GafProfile(BaseModel):
    website: str | None
    address: str | None
    summary: str
    services: list[str]
    residential: bool | None
    commercial: bool | None
    years_in_business: int | None
    certifications: list[str]


class Person(BaseModel):
    name: str
    role: str


class ProductEvidence(BaseModel):
    category: str
    level: FitLevel
    reason: str
    evidence: str
    question: str


class WebsiteFacts(BaseModel):
    summary: str
    services: list[str]
    service_area: str | None
    decision_makers: list[Person]
    emails: list[str]
    phones: list[str]
    product_fit: list[ProductEvidence]
    opener: str
    questions: list[str]


class ContractorResearch(WebsiteFacts):
    website: str | None


T = TypeVar("T", bound=BaseModel)

_client: OpenAI | None = None


def extract(conn, purpose: str, schema: type[T], instructions: str, content: str,
            contractor_id: str | None = None, source_url: str | None = None) -> tuple[T, int]:
    """Runs one structured extraction and records it in ai_traces. Returns the result and its trace id."""
    global _client
    _client = _client or OpenAI()
    content = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", content)[:MAX_INPUT_CHARS]

    started = time.monotonic()
    response = _client.responses.parse(model=OPENAI_MODEL, instructions=instructions, input=content, text_format=schema)
    result = response.output_parsed
    if result is None:
        raise RuntimeError(f"{purpose}: model returned no parsed output")

    usage = response.usage
    trace_id = record_trace(conn, purpose, OPENAI_MODEL, contractor_id, source_url, content, result.model_dump_json(),
                            usage.input_tokens if usage else None, usage.output_tokens if usage else None, started)
    return result, trace_id


def record_trace(conn, purpose: str, model: str, contractor_id: str | None, source_url: str | None, content: str,
                 output: str, input_tokens: int | None, output_tokens: int | None, started: float) -> int:
    return conn.execute(
        """INSERT INTO ai_traces (created_at, purpose, model, prompt_version, contractor_id, source_url,
             input_hash, input_chars, output, input_tokens, output_tokens, latency_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (now(), purpose, model, PROMPT_VERSION, contractor_id, source_url, content_hash(content), len(content),
         output, input_tokens, output_tokens, int((time.monotonic() - started) * 1000)),
    ).lastrowid


def content_hash(text: str) -> str:
    normalized = " ".join(text.split()).lower()
    return hashlib.sha256(normalized.encode()).hexdigest()


GAF_LIST_INSTRUCTIONS = """You read a GAF roofing-contractor search results page converted to markdown.
Return every contractor listed. Use the absolute URL of each contractor's GAF profile page.
Copy values exactly as shown; use null when a value is not on the page. Never invent data."""

GAF_PROFILE_INSTRUCTIONS = """You read one contractor's GAF profile page converted to markdown.
Extract the contractor's own website (not gaf.com), address, services and certifications.
summary: at most two plain sentences on what the contractor does and for whom.
Use null or empty lists when the page does not say. Never invent data."""


def website_instructions(categories: list[str]) -> str:
    return f"""You read a roofing contractor's website converted to markdown, for a roofing-supply sales rep.
summary: at most two plain sentences on what they do, for whom, and where.
decision_makers: only people named on the site with an owner, purchasing or management role.
product_fit: one entry per category in {categories}. level is "high" or "medium" only with
evidence quoted from the site in `evidence`; otherwise "unknown" with an empty evidence string.
reason: one sentence. question: one question the rep should ask about that category.
opener: one or two sentences the rep can open a call with, tied to a fact on the site.
questions: two or three qualifying questions. Never invent people, numbers or claims."""


def research_instructions(categories: list[str]) -> str:
    return website_instructions(categories).replace(
        "You read a roofing contractor's website converted to markdown",
        "You research one roofing contractor on the web") + """
website: the contractor's own official website, or null if you cannot confirm it.
Use only facts stated in the sources you cite; quote them in `evidence`."""


ASSISTANT_INSTRUCTIONS = """You are InstaHermes.AI, an assistant inside a sales tool for roofing-supply reps.
Answer the rep's question using only the context below. If the context does not say, say you don't know.
Be brief and practical: short paragraphs or a few bullet lines, plain text, no headings.

Context:
"""


def chat(conn, context: str, messages: list[dict], contractor_id: str | None) -> str:
    """One assistant turn, recorded in ai_traces like every other model call."""
    global _client
    _client = _client or OpenAI()
    started = time.monotonic()
    response = _client.responses.create(model=OPENAI_MODEL, instructions=ASSISTANT_INSTRUCTIONS + context, input=messages)
    usage = response.usage
    record_trace(conn, "assistant", OPENAI_MODEL, contractor_id, None, context + str(messages), response.output_text,
                 usage.input_tokens if usage else None, usage.output_tokens if usage else None, started)
    return response.output_text


class DraftPerson(BaseModel):
    contact_id: int | None
    name: str
    role: str | None


class InteractionDraft(BaseModel):
    ready: bool
    reply: str
    mode: Literal["call", "email", "meeting", "text"] | None
    outcome: Literal["Connected", "No response", "Follow-up needed", "Qualified", "Not relevant"] | None
    people: list[DraftPerson]
    note: str
    next_action: str | None
    due_date: str | None


DRAFT_INSTRUCTIONS = """You turn a sales rep's chat messages into one interaction log entry for a contractor account.
The rep may type casually, dictate by voice, or paste an email. Read the whole conversation; later messages correct earlier ones.

mode: call, email, meeting or text. outcome:
- Connected: reached someone and talked. - No response: no answer, voicemail, no reply.
- Follow-up needed: talked, agreed to reconnect later. - Qualified: confirmed a real need for materials.
- Not relevant: they are not a fit.
people: only the people the rep actually spoke with, met, or exchanged messages with in this interaction.
Leave out anyone who was only asked for, mentioned, unavailable, or is to be contacted later: listing someone
marks them as verified. Reuse contact_id from the known people when the name matches; otherwise contact_id null
with the name and role the rep gave.
note: a short, clean summary in the rep's voice, keeping names, numbers, products and dates.
next_action and due_date (yyyy-mm-dd): only if the rep stated or clearly implied them; resolve relative dates from today.
ready: true when mode and outcome are clear. reply: one short sentence. If ready, say what you will save;
if not, ask the single most important question. Never invent facts.

"""


def draft_interaction(conn, context: str, messages: list[dict], contractor_id: str) -> InteractionDraft:
    global _client
    _client = _client or OpenAI()
    started = time.monotonic()
    response = _client.responses.parse(model=OPENAI_MODEL, instructions=DRAFT_INSTRUCTIONS + context,
                                       input=messages, text_format=InteractionDraft)
    draft = response.output_parsed
    if draft is None:
        raise RuntimeError("log_draft: model returned no parsed output")
    usage = response.usage
    record_trace(conn, "log_draft", OPENAI_MODEL, contractor_id, None, context + str(messages), draft.model_dump_json(),
                 usage.input_tokens if usage else None, usage.output_tokens if usage else None, started)
    return draft


def transcribe(conn, audio: bytes, content_type: str) -> str:
    global _client
    _client = _client or OpenAI()
    started = time.monotonic()
    extension = content_type.split("/")[-1].split(";")[0] or "webm"
    result = _client.audio.transcriptions.create(model=TRANSCRIBE_MODEL, file=(f"note.{extension}", audio, content_type))
    record_trace(conn, "transcription", TRANSCRIBE_MODEL, None, None, hashlib.sha256(audio).hexdigest(), result.text,
                 None, None, started)
    return result.text

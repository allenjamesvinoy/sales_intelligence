import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

DATABASE_PATH = Path(os.getenv("DATABASE_PATH", ROOT / "data" / "instahermes.db"))
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5-mini")
APIFY_TOKEN = os.getenv("APIFY_TOKEN", "")
APIFY_ACTOR = os.getenv("APIFY_ACTOR", "apify~website-content-crawler")
PERPLEXITY_API_KEY = os.getenv("PERPLEXITY_API_KEY", "")
PERPLEXITY_MODEL = os.getenv("PERPLEXITY_MODEL", "sonar")
DEFAULT_USER_ID = int(os.getenv("DEFAULT_USER_ID", "1"))
ENRICHMENT_CAP_PER_USER = 25
PROFILE_REFETCH_DAYS = 7
RESEARCH_TTL_DAYS = 30

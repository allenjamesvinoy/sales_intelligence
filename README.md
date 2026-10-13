# InstaHermes

Sales intelligence for roofing-supply reps: find the right contractors, understand them fast, and walk into the call prepared.

```
sales_intelligence/
├── UI/        Web app (HTML, CSS, TypeScript, Vite)
└── backend/   API, GAF import, overnight ranking (Python, FastAPI, SQLite)
```

## Run it

```sh
# Backend (first time)
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env              # add OPENAI_API_KEY, APIFY_TOKEN, PERPLEXITY_API_KEY (optional)
.venv/bin/python -m app.cli init  # tables + demo rep (Alex, Manhattan, ZIP 10013, 25 mi)

# Fill the contractor index, then build today's queue
.venv/bin/python -m app.cli scrape-gaf "https://www.gaf.com/en-us/roofing-contractors/residential?distance=25#firstResult=20"
.venv/bin/python -m app.cli build-queues

# Serve the API on :8000
.venv/bin/uvicorn app.api:app --reload --port 8000

# UI, in another terminal
cd UI && npm install && npm run dev   # http://localhost:5173
```

`UI/.env.local` points the UI at the backend. Delete it to go back to the built-in sample data.

## How data flows

1. **`scrape-gaf URL`**: Apify renders the GAF results page. OpenAI extracts each listed contractor, and then each contractor's GAF profile, including their website. The results go into the shared `contractors` table.
2. **`build-queues`** (run nightly, e.g. from cron):
   - Ranks every eligible contractor for each rep, using their territory, product responsibilities, branch inventory and workflow state. This step uses no AI.
   - Checks the websites of the top Recommended, My Focus and follow-up-due accounts once each, shared across all reps. OpenAI runs only when a page's content hash has changed.
   - Re-ranks with the new facts and publishes each rep's queue in a single transaction. If the run fails, the previous queue stays live.
3. **API**: serves the latest published queue plus the rep's own workflow state.

## Keeping API costs down

| Service | Used for | Kept cheap by |
| --- | --- | --- |
| Apify | Loading pages | Full browser only for GAF pages; contractor sites use the cheaper adaptive crawler. GAF profiles are fetched at most once every 7 days. |
| OpenAI | Extracting facts from pages | Runs only when a page's content hash changed. Input is capped at 30k characters. |
| Perplexity | Researching contractors with no readable website | Only as a fallback, using the `sonar` model with low search depth. Results are kept for 30 days. A contractor's own site always replaces web research once found. |

## AI traceability

- Every OpenAI call is stored in `ai_traces`: purpose, model, prompt version, source URL, input hash, structured output, tokens and latency.
- Each queue item stores its initial and final scores, the points per factor, its enrichment status, and the trace ID of the extraction it used.
- `GET /leads/:id/trace` returns both, ready to show in the UI later.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/leads` | Latest morning queue + the rep's leads and states (`LeadsResponse` in `UI/src/types.ts`) |
| `PUT` | `/leads/:id/stage` | `{ stage }`, called when a card is dragged |
| `POST` | `/leads/:id/activity` | `{ outcome, note, followUp? }`: saves an outcome and moves the lead to Done |
| `GET` | `/leads/:id/trace` | Ranking factors and AI calls behind a lead |
| `GET` | `/me` | Rep profile, territory, product focus, queue settings |

The rep is selected with an `X-User-Id` header and defaults to user 1. There is no login yet.

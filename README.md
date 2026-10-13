# InstaHermes.AI

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
.venv/bin/python -m app.cli init  # tables + demo rep (Allen, Manhattan, ZIP 10013, 25 mi)

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

## Sales journey

Board columns (Recommended, My Focus, Done) belong to each rep. The account journey is shared by the team:

| # | Stage | Reached when |
| --- | --- | --- |
| 1 | Discovered | The contractor appears in a rep's ranked queue |
| 2 | Researching | A rep saves it to My Focus |
| 3 | Contacted | Anyone logs a call, email, text or visit |
| 4 | Opportunity | A rep records a confirmed need (or drags it to Done) |
| 5 | Customer | Future: needs order history for reorder, cross-sell and risk signals |

Every account always has a stage, owner, next action, due date and recommendation reason. The next action is suggested from the stage and the last outcome (`backend/app/accounts.py`), and reps can override it.

Decision makers found on the web start **unverified**. They become verified only when a rep logs an interaction that reached them (Connected, Follow-up needed or Qualified).

## AI traceability

- Every OpenAI call is stored in `ai_traces`: purpose, model, prompt version, source URL, input hash, structured output, tokens and latency.
- Each queue item stores its initial and final scores, the points per factor, its enrichment status, and the trace ID of the extraction it used.
- `GET /leads/:id/trace` returns both, ready to show in the UI later.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/leads` | Latest morning queue + the rep's leads and states (`LeadsResponse` in `UI/src/types.ts`) |
| `PUT` | `/leads/:id/stage` | `{ stage, order? }`: drag on the rep's board; the shared account stage follows |
| `GET` | `/accounts/:id` | Shared account (stage, owner, next action, due date) and the team's interaction log |
| `POST` | `/accounts/:id/interactions` | `{ mode, outcome, note, nextAction?, dueDate? }`: blank next action uses the suggested step |
| `POST` | `/accounts/:id/opportunity` | `{ note }`: stage 4, a confirmed need; moves the card to Done |
| `PUT` | `/accounts/:id/next-action` | `{ nextAction, dueDate }` |
| `POST` | `/accounts/:id/log-draft` | `{ messages }`: the rep's chat (typed, dictated or a pasted email) to a draft interaction to confirm |
| `POST` | `/transcribe` | Raw audio body (e.g. `audio/webm`) to `{ text }` |
| `POST` | `/accounts/:id/contacts`, `PUT …/contacts/:contactId` | Decision makers, shared by the team |
| `POST` | `/assistant` | `{ messages, contractorId? }`: the floating assistant |
| `GET` | `/leads/:id/trace` | Ranking factors and AI calls behind a lead |
| `GET` | `/me` | Rep profile, territory, product focus, queue settings |

The rep is selected with an `X-User-Id` header and defaults to user 1. There is no login yet.

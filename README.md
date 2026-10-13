# InstaHermes

Sales intelligence for roofing-supply reps: find the right contractors, understand them fast, and walk into the call prepared.

```
sales_intelligence/
├── UI/        Web app (HTML, CSS, TypeScript, built with Vite)
└── backend/   API service (not started yet)
```

## UI

```sh
cd UI
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check and build to UI/dist
```

The UI runs on built-in sample data until it is pointed at a backend. To use a backend, copy `UI/.env.example` to `UI/.env.local`. The dev server then forwards `/api/*` to `API_PROXY_TARGET` (default `http://localhost:8000`) with the `/api` prefix removed.

All network access is in `UI/src/api/`. Nothing else calls `fetch`.

| File | Purpose |
| --- | --- |
| `api/index.ts` | The `Api` interface; chooses the real or sample implementation |
| `api/http.ts` | Real implementation over HTTP |
| `api/mock.ts` | Sample data, used when `VITE_API_URL` is unset |

## API the backend should provide

All JSON. The shapes are defined in `UI/src/types.ts`.

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| `GET` | `/leads` | none | `LeadsResponse`: `{ updatedAt, leads: Lead[], states?: Record<id, LeadState> }` |
| `PUT` | `/leads/:id/stage` | `{ stage }`: `recommended` · `focus` · `done` · `dismissed` | `204` |
| `POST` | `/leads/:id/activity` | `ActivityEntry`: `{ outcome, note, followUp?, at }` | `204` |

- The UI updates the screen first and then sends each change.
- A failed request is only logged to the browser console; the UI doesn't show an error yet.
- Saving an activity moves the lead to `done`. The backend should do the same.
- A `followUp` date (`yyyy-mm-dd`) brings the lead back to `focus` on that day.

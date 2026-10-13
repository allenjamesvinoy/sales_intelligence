/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend base URL, e.g. "/api" (proxied in dev) or "https://api.example.com". Unset = sample data. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

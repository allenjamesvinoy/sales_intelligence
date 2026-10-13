-- Organization and user profile

CREATE TABLE IF NOT EXISTS branches (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  manager_id INTEGER REFERENCES users(id),
  team_id INTEGER,
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  timezone TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS user_scopes (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  contractor_segment TEXT NOT NULL,
  territory_type TEXT NOT NULL,
  territory_value TEXT NOT NULL,
  maximum_distance_miles REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS product_categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS user_products (
  user_id INTEGER NOT NULL REFERENCES users(id),
  product_category_id INTEGER NOT NULL REFERENCES product_categories(id),
  focus_level TEXT NOT NULL CHECK (focus_level IN ('primary', 'secondary', 'not_assigned')),
  PRIMARY KEY (user_id, product_category_id)
);

CREATE TABLE IF NOT EXISTS user_queue_preferences (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  daily_recommendation_limit INTEGER NOT NULL DEFAULT 10,
  morning_queue_ready_by TEXT NOT NULL DEFAULT '06:00',
  include_existing_focus INTEGER NOT NULL DEFAULT 1
);

-- Branch inventory

CREATE TABLE IF NOT EXISTS inventory_snapshots (
  id INTEGER PRIMARY KEY,
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  taken_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory_items (
  inventory_snapshot_id INTEGER NOT NULL REFERENCES inventory_snapshots(id),
  product_category_id INTEGER NOT NULL REFERENCES product_categories(id),
  stock_priority TEXT NOT NULL CHECK (stock_priority IN ('excess', 'normal', 'low')),
  PRIMARY KEY (inventory_snapshot_id, product_category_id)
);

-- Shared contractor intelligence

CREATE TABLE IF NOT EXISTS contractor_index_versions (
  id INTEGER PRIMARY KEY,
  source_url TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contractors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  gaf_profile_url TEXT,
  website TEXT,
  city TEXT,
  state TEXT,
  segment TEXT,
  certifications TEXT NOT NULL DEFAULT '[]',
  rating REAL,
  review_count INTEGER,
  phone TEXT,
  gaf_facts TEXT,
  website_facts TEXT,
  index_version_id INTEGER REFERENCES contractor_index_versions(id),
  updated_at TEXT NOT NULL
);

-- GAF reports distance from the searched ZIP, so it is stored per ZIP.
CREATE TABLE IF NOT EXISTS contractor_distances (
  contractor_id TEXT NOT NULL REFERENCES contractors(id),
  postal_code TEXT NOT NULL,
  distance_miles REAL NOT NULL,
  PRIMARY KEY (contractor_id, postal_code)
);

CREATE TABLE IF NOT EXISTS web_pages (
  url TEXT PRIMARY KEY,
  contractor_id TEXT NOT NULL REFERENCES contractors(id),
  content_hash TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  extraction_trace_id INTEGER REFERENCES ai_traces(id)
);

-- Every OpenAI call, so ranking inputs can be traced back to the model output that produced them.
CREATE TABLE IF NOT EXISTS ai_traces (
  id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL,
  purpose TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  contractor_id TEXT,
  source_url TEXT,
  input_hash TEXT NOT NULL,
  input_chars INTEGER NOT NULL,
  output TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  latency_ms INTEGER NOT NULL
);

-- Per-user workflow

CREATE TABLE IF NOT EXISTS lead_states (
  user_id INTEGER NOT NULL REFERENCES users(id),
  contractor_id TEXT NOT NULL REFERENCES contractors(id),
  stage TEXT NOT NULL CHECK (stage IN ('recommended', 'focus', 'done', 'dismissed')),
  assigned_at TEXT NOT NULL,
  last_viewed_at TEXT,
  dismissed_reason TEXT,
  sort_order REAL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, contractor_id)
);

-- Team-wide sales journey for a contractor; board columns stay per rep.
CREATE TABLE IF NOT EXISTS accounts (
  contractor_id TEXT PRIMARY KEY REFERENCES contractors(id),
  stage TEXT NOT NULL CHECK (stage IN ('discovered', 'researching', 'contacted', 'opportunity', 'customer')),
  owner_id INTEGER REFERENCES users(id),
  next_action TEXT,
  due_date TEXT,
  opportunity_note TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  contractor_id TEXT NOT NULL REFERENCES contractors(id),
  outreach_task_id INTEGER,
  mode TEXT NOT NULL DEFAULT 'call' CHECK (mode IN ('call', 'email', 'text', 'visit', 'update')),
  outcome TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  next_action TEXT,
  due_date TEXT,
  created_at TEXT NOT NULL
);

-- Immutable morning queues

CREATE TABLE IF NOT EXISTS daily_queues (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  queue_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ranking', 'published', 'failed')),
  initial_ranking_completed_at TEXT,
  enrichment_completed_at TEXT,
  published_at TEXT,
  inventory_snapshot_id INTEGER REFERENCES inventory_snapshots(id),
  contractor_index_version INTEGER REFERENCES contractor_index_versions(id),
  UNIQUE (user_id, queue_date)
);

CREATE TABLE IF NOT EXISTS daily_queue_items (
  daily_queue_id INTEGER NOT NULL REFERENCES daily_queues(id),
  contractor_id TEXT NOT NULL REFERENCES contractors(id),
  position INTEGER NOT NULL,
  initial_score REAL NOT NULL,
  final_score REAL NOT NULL,
  initial_reasons TEXT NOT NULL,
  final_reasons TEXT NOT NULL,
  product_categories TEXT NOT NULL,
  enrichment_status TEXT NOT NULL,
  enrichment_trace_id INTEGER REFERENCES ai_traces(id),
  PRIMARY KEY (daily_queue_id, contractor_id)
);

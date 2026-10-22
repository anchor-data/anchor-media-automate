CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  instagram_handle TEXT NOT NULL,
  canva_template_id TEXT NOT NULL,
  tone TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  company TEXT NOT NULL,
  role TEXT NOT NULL,
  location TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- Human-uploaded guideline (versioned; one active per account)
CREATE TABLE IF NOT EXISTS guidelines (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  target TEXT NOT NULL,
  concept TEXT NOT NULL,
  tone TEXT NOT NULL,
  content_pillars_json TEXT NOT NULL DEFAULT '[]',
  ng_rules_json TEXT NOT NULL DEFAULT '[]',
  cta_policy TEXT NOT NULL DEFAULT '',
  hashtag_policy TEXT NOT NULL DEFAULT '',
  job_pick_enabled INTEGER NOT NULL DEFAULT 0,
  system_prompt TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_guidelines_account_active
  ON guidelines(account_id, active);

-- Human-uploaded reference library (inspired-by structures, docs, hooks)
CREATE TABLE IF NOT EXISTS content_references (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  kind TEXT NOT NULL CHECK (kind IN ('slide_pattern', 'hook_pattern', 'voice_sample', 'doc', 'url_note')),
  title TEXT NOT NULL,
  source_note TEXT NOT NULL DEFAULT '',
  structure_json TEXT,
  examples_text TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_content_references_account_kind
  ON content_references(account_id, kind, active);

-- System memory for dedupe / learning (Backend writes; humans can remove)
CREATE TABLE IF NOT EXISTS memory_items (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  kind TEXT NOT NULL CHECK (kind IN ('topic_used', 'hook_used', 'idea_rejected', 'editor_feedback', 'preference')),
  topic_key TEXT NOT NULL,
  content TEXT NOT NULL,
  source_post_id TEXT,
  source_idea_id TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_memory_account_topic
  ON memory_items(account_id, topic_key);

CREATE TABLE IF NOT EXISTS ideas (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  pillar TEXT NOT NULL,
  topic_key TEXT NOT NULL,
  hook TEXT NOT NULL DEFAULT '',
  angle TEXT NOT NULL DEFAULT '',
  reference_ids_json TEXT NOT NULL DEFAULT '[]',
  job_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued', 'selected', 'rejected', 'used')),
  agent_run_id TEXT,
  score REAL,
  rationale TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_ideas_account_status
  ON ideas(account_id, status);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  idea_id TEXT REFERENCES ideas(id),
  post_type TEXT CHECK (post_type IN ('knowhow', 'job_pick')),
  title TEXT NOT NULL,
  caption TEXT NOT NULL,
  slides_json TEXT,
  hashtags_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK (status IN ('draft', 'approved', 'scheduled', 'published', 'rejected', 'failed')),
  generation_status TEXT NOT NULL DEFAULT 'ready'
    CHECK (generation_status IN ('pending', 'generating_copy', 'rendering', 'ready', 'failed')),
  generation_error TEXT,
  reject_reason TEXT,
  scheduled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS post_assets (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id),
  image_url TEXT NOT NULL,
  canva_design_id TEXT,
  slide_index INTEGER NOT NULL DEFAULT 0,
  template_id TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS post_insights (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id),
  impressions INTEGER NOT NULL DEFAULT 0,
  reach INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  fetched_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  created_post_id TEXT REFERENCES posts(id),
  kind TEXT NOT NULL DEFAULT 'creation'
    CHECK (kind IN ('ideation', 'creation', 'regenerate')),
  summary TEXT NOT NULL,
  output_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- Canva rotates the refresh_token on every exchange, so the latest one lives here (single row).
CREATE TABLE IF NOT EXISTS canva_tokens (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  refresh_token TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- Exported page URLs per Canva design (short-lived signed URLs; design id stays the source of truth).
CREATE TABLE IF NOT EXISTS canva_design_cache (
  design_id TEXT PRIMARY KEY,
  page_urls_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- ============================================================================
-- Migration: 001_initial_schema.sql
-- Project:   FabSoft Redes Sociales (Pipeline Agéntico HITL)
-- Target:    PostgreSQL 17
-- Notes:     Idempotent migration safe for repeated execution by migration
--            runners. Designed to run inside a runner-managed transaction.
-- ============================================================================

-- 1. Enum: post_status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'post_status'
      AND n.nspname = current_schema()
  ) THEN
    CREATE TYPE post_status AS ENUM (
      'draft',
      'pending_approval',
      'publishing',
      'published',
      'discarded',
      'failed'
    );
  END IF;
END
$$;

-- 2. Table: schema_migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Table: social_posts
CREATE TABLE IF NOT EXISTS social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL DEFAULT 'instagram',
  pillar TEXT NOT NULL CHECK (
    pillar IN (
      'educacion',
      'tendencias',
      'productos',
      'noticias',
      'proceso',
      'inspiracion'
    )
  ),
  audience TEXT NOT NULL CHECK (
    audience IN ('b2b', 'comunidad_dev')
  ),
  tone_mode TEXT NOT NULL CHECK (
    tone_mode IN ('empresarial', 'educativo')
  ),
  template TEXT NOT NULL CHECK (
    template IN ('dark_tech_hero', 'editorial_light', 'dev_tip_card')
  ),
  topic TEXT NOT NULL,
  headline TEXT NOT NULL,
  subheadline TEXT,
  highlight_phrase TEXT,
  caption TEXT NOT NULL,
  hashtags TEXT[] NOT NULL DEFAULT '{}',
  visual_concept TEXT,
  image_prompt TEXT,
  media_urls JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (
    jsonb_typeof(media_urls) = 'array'
  ),
  status post_status NOT NULL DEFAULT 'draft',
  telegram_message_id BIGINT,
  awaiting_edit_from_user BIGINT,
  external_post_id TEXT,
  external_post_url TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

-- 4. Table: oauth_tokens
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  account_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_social_posts_status
  ON social_posts (status);

CREATE INDEX IF NOT EXISTS idx_social_posts_created_at
  ON social_posts (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_posts_awaiting_edit
  ON social_posts (awaiting_edit_from_user)
  WHERE awaiting_edit_from_user IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_social_posts_telegram_message_id
  ON social_posts (telegram_message_id)
  WHERE telegram_message_id IS NOT NULL;

-- 6. Trigger function: set_updated_at()
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 7. Triggers: auto-update updated_at on UPDATE
DROP TRIGGER IF EXISTS trg_social_posts_set_updated_at ON social_posts;
CREATE TRIGGER trg_social_posts_set_updated_at
  BEFORE UPDATE ON social_posts
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_oauth_tokens_set_updated_at ON oauth_tokens;
CREATE TRIGGER trg_oauth_tokens_set_updated_at
  BEFORE UPDATE ON oauth_tokens
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

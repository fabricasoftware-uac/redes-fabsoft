-- ============================================================================
-- Migration: 002_ideas_and_recordings.sql
-- Project:   FabSoft Redes Sociales (Pipeline Agéntico HITL)
-- Target:    PostgreSQL 17
-- Notes:     Idempotent migration creating idea_suggestions and recording_ideas.
-- ============================================================================

-- 1. Table: idea_suggestions
CREATE TABLE IF NOT EXISTS idea_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  pillar TEXT NOT NULL,
  angle TEXT NOT NULL,
  why_trending TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'suggested' CHECK (
    status IN ('suggested', 'selected', 'dismissed')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Table: recording_ideas
CREATE TABLE IF NOT EXISTS recording_ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode TEXT NOT NULL CHECK (
    mode IN ('oficina', 'virtual_duo')
  ),
  title TEXT NOT NULL,
  hook TEXT NOT NULL,
  script_steps JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (
    jsonb_typeof(script_steps) = 'array'
  ),
  filming_tip TEXT NOT NULL,
  cta TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_idea_suggestions_created_at
  ON idea_suggestions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_recording_ideas_created_at
  ON recording_ideas (created_at DESC);

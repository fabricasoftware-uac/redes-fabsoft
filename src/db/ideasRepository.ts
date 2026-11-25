import type { RecordingMode } from '../ai/schemas.js';
import type { PillarKey } from '../config/brandKit.js';
import { query } from './pool.js';

export type IdeaSuggestionStatus = 'suggested' | 'selected' | 'dismissed';

export interface IdeaSuggestion {
  id: string;
  title: string;
  pillar: PillarKey;
  angle: string;
  whyTrending: string;
  status: IdeaSuggestionStatus;
  createdAt: Date;
}

interface IdeaSuggestionRow {
  id: string;
  title: string;
  pillar: PillarKey;
  angle: string;
  why_trending: string;
  status: IdeaSuggestionStatus;
  created_at: Date;
}

function mapIdeaRow(row: IdeaSuggestionRow): IdeaSuggestion {
  return {
    id: row.id,
    title: row.title,
    pillar: row.pillar,
    angle: row.angle,
    whyTrending: row.why_trending,
    status: row.status,
    createdAt: new Date(row.created_at),
  };
}

export interface CreateIdeaSuggestionInput {
  title: string;
  pillar: PillarKey;
  angle: string;
  whyTrending: string;
}

export async function saveIdeaSuggestions(
  ideas: CreateIdeaSuggestionInput[]
): Promise<IdeaSuggestion[]> {
  if (ideas.length === 0) return [];

  const saved: IdeaSuggestion[] = [];
  for (const idea of ideas) {
    const res = await query<IdeaSuggestionRow>(
      `INSERT INTO idea_suggestions (title, pillar, angle, why_trending)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [idea.title, idea.pillar, idea.angle, idea.whyTrending]
    );
    const row = res.rows[0];
    if (!row) {
      throw new Error('Failed to insert idea_suggestions record');
    }
    saved.push(mapIdeaRow(row));
  }
  return saved;
}

export async function getIdeaSuggestionById(
  id: string
): Promise<IdeaSuggestion | null> {
  const res = await query<IdeaSuggestionRow>(
    'SELECT * FROM idea_suggestions WHERE id = $1',
    [id]
  );
  return res.rows[0] ? mapIdeaRow(res.rows[0]) : null;
}

export async function markIdeaSuggestionSelected(
  id: string
): Promise<IdeaSuggestion | null> {
  const res = await query<IdeaSuggestionRow>(
    `UPDATE idea_suggestions
     SET status = 'selected'
     WHERE id = $1
       AND status = 'suggested'
     RETURNING *`,
    [id]
  );
  return res.rows[0] ? mapIdeaRow(res.rows[0]) : null;
}

export async function getRecentIdeaTitles(limit = 20): Promise<string[]> {
  const res = await query<{ title: string }>(
    `SELECT title
     FROM idea_suggestions
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return res.rows.map((r) => r.title);
}

export interface RecordingIdea {
  id: string;
  mode: RecordingMode;
  title: string;
  hook: string;
  scriptSteps: string[];
  filmingTip: string;
  cta: string;
  createdAt: Date;
}

interface RecordingIdeaRow {
  id: string;
  mode: RecordingMode;
  title: string;
  hook: string;
  script_steps: string[];
  filming_tip: string;
  cta: string;
  created_at: Date;
}

function mapRecordingRow(row: RecordingIdeaRow): RecordingIdea {
  return {
    id: row.id,
    mode: row.mode,
    title: row.title,
    hook: row.hook,
    scriptSteps: Array.isArray(row.script_steps) ? row.script_steps : [],
    filmingTip: row.filming_tip,
    cta: row.cta,
    createdAt: new Date(row.created_at),
  };
}

export interface CreateRecordingIdeaInput {
  mode: RecordingMode;
  title: string;
  hook: string;
  scriptSteps: string[];
  filmingTip: string;
  cta: string;
}

export async function saveRecordingIdea(
  input: CreateRecordingIdeaInput
): Promise<RecordingIdea> {
  const res = await query<RecordingIdeaRow>(
    `INSERT INTO recording_ideas (mode, title, hook, script_steps, filming_tip, cta)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)
     RETURNING *`,
    [
      input.mode,
      input.title,
      input.hook,
      JSON.stringify(input.scriptSteps),
      input.filmingTip,
      input.cta,
    ]
  );

  const row = res.rows[0];
  if (!row) {
    throw new Error('Failed to insert recording_ideas record');
  }
  return mapRecordingRow(row);
}

export async function getRecentRecordingTitles(limit = 15): Promise<string[]> {
  const res = await query<{ title: string }>(
    `SELECT title
     FROM recording_ideas
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return res.rows.map((r) => r.title);
}

export async function getLastRecordingMode(): Promise<RecordingMode | null> {
  const res = await query<{ mode: RecordingMode }>(
    `SELECT mode
     FROM recording_ideas
     ORDER BY created_at DESC
     LIMIT 1`
  );
  return res.rows[0]?.mode ?? null;
}

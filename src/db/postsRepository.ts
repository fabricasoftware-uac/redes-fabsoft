import type { AudienceKey, PillarKey, TemplateKey, ToneModeKey } from '../config/brandKit.js';
import { query } from './pool.js';

export type PostStatus =
  | 'draft'
  | 'pending_approval'
  | 'publishing'
  | 'published'
  | 'discarded'
  | 'failed';

export interface SocialPost {
  id: string;
  platform: string;
  pillar: PillarKey;
  audience: AudienceKey;
  toneMode: ToneModeKey;
  template: TemplateKey;
  topic: string;
  headline: string;
  subheadline: string | null;
  highlightPhrase: string | null;
  caption: string;
  hashtags: string[];
  visualConcept: string | null;
  imagePrompt: string | null;
  mediaUrls: string[];
  status: PostStatus;
  telegramMessageId: number | null;
  awaitingEditFromUser: number | null;
  externalPostId: string | null;
  externalPostUrl: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
}

interface SocialPostRow {
  id: string;
  platform: string;
  pillar: PillarKey;
  audience: AudienceKey;
  tone_mode: ToneModeKey;
  template: TemplateKey;
  topic: string;
  headline: string;
  subheadline: string | null;
  highlight_phrase: string | null;
  caption: string;
  hashtags: string[];
  visual_concept: string | null;
  image_prompt: string | null;
  media_urls: string[];
  status: PostStatus;
  telegram_message_id: string | number | null;
  awaiting_edit_from_user: string | number | null;
  external_post_id: string | null;
  external_post_url: string | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
  published_at: Date | null;
}

function mapRow(row: SocialPostRow): SocialPost {
  return {
    id: row.id,
    platform: row.platform,
    pillar: row.pillar,
    audience: row.audience,
    toneMode: row.tone_mode,
    template: row.template,
    topic: row.topic,
    headline: row.headline,
    subheadline: row.subheadline,
    highlightPhrase: row.highlight_phrase,
    caption: row.caption,
    hashtags: Array.isArray(row.hashtags) ? row.hashtags : [],
    visualConcept: row.visual_concept,
    imagePrompt: row.image_prompt,
    mediaUrls: Array.isArray(row.media_urls) ? row.media_urls : [],
    status: row.status,
    telegramMessageId:
      row.telegram_message_id !== null ? Number(row.telegram_message_id) : null,
    awaitingEditFromUser:
      row.awaiting_edit_from_user !== null ? Number(row.awaiting_edit_from_user) : null,
    externalPostId: row.external_post_id,
    externalPostUrl: row.external_post_url,
    errorMessage: row.error_message,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    publishedAt: row.published_at ? new Date(row.published_at) : null,
  };
}

export interface CreatePostInput {
  platform?: string;
  pillar: PillarKey;
  audience: AudienceKey;
  toneMode: ToneModeKey;
  template: TemplateKey;
  topic: string;
  headline: string;
  subheadline?: string | null;
  highlightPhrase?: string | null;
  caption: string;
  hashtags: string[];
  visualConcept?: string | null;
  imagePrompt?: string | null;
  mediaUrls?: string[];
  status?: PostStatus;
}

export async function createPost(input: CreatePostInput): Promise<SocialPost> {
  const res = await query<SocialPostRow>(
    `INSERT INTO social_posts (
      platform, pillar, audience, tone_mode, template,
      topic, headline, subheadline, highlight_phrase,
      caption, hashtags, visual_concept, image_prompt,
      media_urls, status
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9,
      $10, $11, $12, $13,
      $14::jsonb, $15
    )
    RETURNING *`,
    [
      input.platform ?? 'instagram',
      input.pillar,
      input.audience,
      input.toneMode,
      input.template,
      input.topic,
      input.headline,
      input.subheadline ?? null,
      input.highlightPhrase ?? null,
      input.caption,
      input.hashtags,
      input.visualConcept ?? null,
      input.imagePrompt ?? null,
      JSON.stringify(input.mediaUrls ?? []),
      input.status ?? 'pending_approval',
    ]
  );

  const row = res.rows[0];
  if (!row) {
    throw new Error('Failed to create social_posts record');
  }
  return mapRow(row);
}

export async function getPostById(id: string): Promise<SocialPost | null> {
  const res = await query<SocialPostRow>(
    'SELECT * FROM social_posts WHERE id = $1',
    [id]
  );
  return res.rows[0] ? mapRow(res.rows[0]) : null;
}

export async function getRecentTopics(limit = 15): Promise<string[]> {
  const res = await query<{ topic: string; headline: string }>(
    `SELECT topic, headline
     FROM social_posts
     WHERE status <> 'discarded'
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return res.rows.map((r) => `${r.topic} — ${r.headline}`);
}

export async function setTelegramMessageId(
  id: string,
  messageId: number
): Promise<SocialPost | null> {
  const res = await query<SocialPostRow>(
    `UPDATE social_posts
     SET telegram_message_id = $2
     WHERE id = $1
     RETURNING *`,
    [id, messageId]
  );
  return res.rows[0] ? mapRow(res.rows[0]) : null;
}

export interface UpdatePostCopyInput {
  headline?: string;
  subheadline?: string | null;
  highlightPhrase?: string | null;
  caption: string;
  hashtags?: string[];
  visualConcept?: string | null;
}

export async function updatePostCopy(
  id: string,
  input: UpdatePostCopyInput
): Promise<SocialPost | null> {
  const res = await query<SocialPostRow>(
    `UPDATE social_posts
     SET headline = COALESCE($2, headline),
         subheadline = CASE WHEN $3::boolean THEN $4 ELSE subheadline END,
         highlight_phrase = CASE WHEN $5::boolean THEN $6 ELSE highlight_phrase END,
         caption = $7,
         hashtags = COALESCE($8, hashtags),
         visual_concept = CASE WHEN $9::boolean THEN $10 ELSE visual_concept END,
         awaiting_edit_from_user = NULL,
         status = CASE WHEN status = 'failed' THEN 'pending_approval' ELSE status END
     WHERE id = $1
     RETURNING *`,
    [
      id,
      input.headline ?? null,
      input.subheadline !== undefined,
      input.subheadline ?? null,
      input.highlightPhrase !== undefined,
      input.highlightPhrase ?? null,
      input.caption,
      input.hashtags ?? null,
      input.visualConcept !== undefined,
      input.visualConcept ?? null,
    ]
  );
  return res.rows[0] ? mapRow(res.rows[0]) : null;
}

export interface UpdatePostMediaInput {
  imagePrompt?: string | null;
  mediaUrls: string[];
}

export async function updatePostMedia(
  id: string,
  input: UpdatePostMediaInput
): Promise<SocialPost | null> {
  const res = await query<SocialPostRow>(
    `UPDATE social_posts
     SET image_prompt = COALESCE($2, image_prompt),
         media_urls = $3::jsonb
     WHERE id = $1
     RETURNING *`,
    [id, input.imagePrompt ?? null, JSON.stringify(input.mediaUrls)]
  );
  return res.rows[0] ? mapRow(res.rows[0]) : null;
}

export async function setAwaitingEdit(
  id: string,
  telegramUserId: number | null
): Promise<SocialPost | null> {
  if (telegramUserId !== null) {
    // Clear any previous pending edit for this user so only one post is active at a time
    await query(
      `UPDATE social_posts
       SET awaiting_edit_from_user = NULL
       WHERE awaiting_edit_from_user = $1 AND id <> $2`,
      [telegramUserId, id]
    );
  }

  const res = await query<SocialPostRow>(
    `UPDATE social_posts
     SET awaiting_edit_from_user = $2
     WHERE id = $1
     RETURNING *`,
    [id, telegramUserId]
  );
  return res.rows[0] ? mapRow(res.rows[0]) : null;
}

export async function findPostAwaitingEditByUser(
  telegramUserId: number
): Promise<SocialPost | null> {
  const res = await query<SocialPostRow>(
    `SELECT * FROM social_posts
     WHERE awaiting_edit_from_user = $1
       AND status = 'pending_approval'
     ORDER BY updated_at DESC
     LIMIT 1`,
    [telegramUserId]
  );
  return res.rows[0] ? mapRow(res.rows[0]) : null;
}

/**
 * ATOMIC LOCK for strict publishing idempotency.
 * Only transitions a post from 'pending_approval' -> 'publishing'.
 * Returns null if already claimed, published, discarded, or missing.
 */
export async function claimPostForPublishing(id: string): Promise<SocialPost | null> {
  const res = await query<SocialPostRow>(
    `UPDATE social_posts
     SET status = 'publishing',
         error_message = NULL,
         awaiting_edit_from_user = NULL
     WHERE id = $1
       AND status = 'pending_approval'
     RETURNING *`,
    [id]
  );
  return res.rows[0] ? mapRow(res.rows[0]) : null;
}

export async function releasePostToPendingApproval(
  id: string,
  note?: string
): Promise<SocialPost | null> {
  const res = await query<SocialPostRow>(
    `UPDATE social_posts
     SET status = 'pending_approval',
         error_message = $2
     WHERE id = $1
       AND status = 'publishing'
     RETURNING *`,
    [id, note ?? null]
  );
  return res.rows[0] ? mapRow(res.rows[0]) : null;
}

export async function markPostPublished(
  id: string,
  externalPostId: string,
  externalPostUrl: string | null
): Promise<SocialPost | null> {
  const res = await query<SocialPostRow>(
    `UPDATE social_posts
     SET status = 'published',
         external_post_id = $2,
         external_post_url = $3,
         error_message = NULL,
         published_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, externalPostId, externalPostUrl]
  );
  return res.rows[0] ? mapRow(res.rows[0]) : null;
}

export async function markPostFailed(
  id: string,
  errorMessage: string
): Promise<SocialPost | null> {
  const res = await query<SocialPostRow>(
    `UPDATE social_posts
     SET status = 'failed',
         error_message = $2
     WHERE id = $1
     RETURNING *`,
    [id, errorMessage.slice(0, 2000)]
  );
  return res.rows[0] ? mapRow(res.rows[0]) : null;
}

export async function markPostDiscarded(id: string): Promise<SocialPost | null> {
  const res = await query<SocialPostRow>(
    `UPDATE social_posts
     SET status = 'discarded',
         awaiting_edit_from_user = NULL
     WHERE id = $1
       AND status IN ('draft', 'pending_approval', 'failed')
     RETURNING *`,
    [id]
  );
  return res.rows[0] ? mapRow(res.rows[0]) : null;
}

export async function getStatusSummary(): Promise<{
  counts: Record<PostStatus, number>;
  recent: SocialPost[];
}> {
  const countRes = await query<{ status: PostStatus; count: string }>(
    `SELECT status, COUNT(*)::text AS count
     FROM social_posts
     GROUP BY status`
  );

  const counts: Record<PostStatus, number> = {
    draft: 0,
    pending_approval: 0,
    publishing: 0,
    published: 0,
    discarded: 0,
    failed: 0,
  };

  for (const row of countRes.rows) {
    counts[row.status] = Number(row.count);
  }

  const recentRes = await query<SocialPostRow>(
    `SELECT * FROM social_posts ORDER BY created_at DESC LIMIT 5`
  );

  return {
    counts,
    recent: recentRes.rows.map(mapRow),
  };
}

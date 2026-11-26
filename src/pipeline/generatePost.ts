import { randomUUID } from 'node:crypto';
import { runArtDirectorAgent } from '../ai/artDirectorAgent.js';
import { runCarouselAgent } from '../ai/carouselAgent.js';
import { runCopywriterAgent } from '../ai/copywriterAgent.js';
import { getAIProvider } from '../ai/provider.js';
import { BRAND_KIT } from '../config/brandKit.js';
import { requireEnv } from '../config/env.js';
import {
  createPost,
  getPostById,
  getRecentTopics,
  setTelegramMessageId,
  updatePostCopy,
  updatePostMedia,
  type SocialPost,
} from '../db/postsRepository.js';
import { composeCarouselSlides, composePostImage } from '../media/compositor.js';
import { getMediaStorage } from '../media/storage.js';
import {
  escapeHtml,
  getTelegramClient,
  type InlineKeyboardMarkup,
} from '../telegram/telegramClient.js';

export function buildApprovalKeyboard(postId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '✅ Aprobar', callback_data: `approve:${postId}` },
        { text: '❌ Descartar', callback_data: `discard:${postId}` },
      ],
      [
        { text: '🛠 Corregir con IA', callback_data: `revise_ai:${postId}` },
        { text: '✏️ Editar Copy', callback_data: `edit_copy:${postId}` },
      ],
      [
        { text: '🔄 Regenerar Copy', callback_data: `regen_copy:${postId}` },
        { text: '🎨 Regenerar Imagen', callback_data: `regen_img:${postId}` },
      ],
    ],
  };
}

export function buildCarouselApprovalKeyboard(postId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '✅ Aprobar', callback_data: `approve:${postId}` },
        { text: '❌ Descartar', callback_data: `discard:${postId}` },
      ],
      [
        { text: '🛠 Corregir con IA', callback_data: `revise_ai:${postId}` },
        { text: '✏️ Editar Copy', callback_data: `edit_copy:${postId}` },
      ],
      [{ text: '🔄 Regenerar Carrusel', callback_data: `regen_copy:${postId}` }],
    ],
  };
}

export function buildInstagramCaption(post: Pick<SocialPost, 'caption' | 'hashtags'>): string {
  const tags = post.hashtags.join(' ').trim();
  return tags.length > 0 ? `${post.caption.trim()}\n\n${tags}` : post.caption.trim();
}

export function formatTelegramPreviewCaption(post: SocialPost): {
  photoCaption: string;
  overflowFullCaption: string | null;
} {
  const pillarLabel = BRAND_KIT.pillars[post.pillar].label;
  const header = [
    `<b>🚀 Propuesta FabSoft</b>`,
    `<b>Pilar:</b> ${escapeHtml(pillarLabel)} · <b>Plantilla:</b> <code>${escapeHtml(post.template)}</code>`,
    `<b>Titular:</b> ${escapeHtml(post.headline)}`,
    '',
  ].join('\n');

  const fullBody = escapeHtml(buildInstagramCaption(post));
  const combined = `${header}${fullBody}`;

  // Telegram sendPhoto caption hard limit is 1024 characters
  if (combined.length <= 1020) {
    return { photoCaption: combined, overflowFullCaption: null };
  }

  const maxBodyLen = Math.max(100, 1000 - header.length);
  const truncatedBody = `${fullBody.slice(0, maxBodyLen)}…`;
  return {
    photoCaption: `${header}${truncatedBody}\n\n<i>(Caption completo en el siguiente mensaje)</i>`,
    overflowFullCaption: `<b>📝 Caption completo:</b>\n\n${fullBody}`,
  };
}

function buildMediaKey(postId: string): string {
  const now = new Date();
  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return `posts/${ym}/${postId}-${randomUUID().slice(0, 8)}.jpg`;
}

export async function sendCarouselPreviewToTelegram(
  post: SocialPost,
  chatId?: string | number
): Promise<SocialPost> {
  const telegram = getTelegramClient();
  const targetChatId = chatId ?? requireEnv('TELEGRAM_CHAT_ID');

  if (post.mediaUrls.length < 2) {
    throw new Error(`Carousel post ${post.id} requires at least 2 media URLs`);
  }

  // 1. Send album of slides via sendMediaGroup
  await telegram.sendMediaGroup(targetChatId, post.mediaUrls);

  // 2. Send approval message with full copy + inline keyboard
  const pillarLabel = BRAND_KIT.pillars[post.pillar].label;
  const fullBody = escapeHtml(buildInstagramCaption(post));
  const header = [
    `<b>🎠 Propuesta Carrusel FabSoft (${post.mediaUrls.length} slides)</b>`,
    `<b>Pilar:</b> ${escapeHtml(pillarLabel)} · <b>Modo:</b> <code>${escapeHtml(post.toneMode)}</code>`,
    `<b>Portada:</b> ${escapeHtml(post.headline)}`,
    '',
  ].join('\n');

  const rawMessage = `${header}${fullBody}`;
  const text =
    rawMessage.length <= 4090
      ? rawMessage
      : `${rawMessage.slice(0, 4085)}…`;

  const sent = await telegram.sendMessage({
    chatId: targetChatId,
    text,
    parseMode: 'HTML',
    replyMarkup: buildCarouselApprovalKeyboard(post.id),
  });

  const updated = await setTelegramMessageId(post.id, sent.message_id);
  return updated ?? post;
}

export async function sendPostPreviewToTelegram(post: SocialPost): Promise<SocialPost> {
  if (post.mediaUrls.length > 1) {
    return sendCarouselPreviewToTelegram(post);
  }

  const telegram = getTelegramClient();
  const chatId = requireEnv('TELEGRAM_CHAT_ID');
  const imageUrl = post.mediaUrls[0];

  if (!imageUrl) {
    throw new Error(`Post ${post.id} has no media URL to preview`);
  }

  const { photoCaption, overflowFullCaption } = formatTelegramPreviewCaption(post);

  const sent = await telegram.sendPhoto({
    chatId,
    photo: imageUrl,
    caption: photoCaption,
    parseMode: 'HTML',
    replyMarkup: buildApprovalKeyboard(post.id),
  });

  if (overflowFullCaption) {
    await telegram.sendMessage({
      chatId,
      text: overflowFullCaption,
      parseMode: 'HTML',
      replyToMessageId: sent.message_id,
    });
  }

  const updated = await setTelegramMessageId(post.id, sent.message_id);
  return updated ?? post;
}

export async function generateAndSendCarousel(
  topic: string | null,
  chatId?: string | number
): Promise<SocialPost> {
  const ai = getAIProvider();
  const storage = getMediaStorage();

  // 1. Fetch recent topics for anti-repetition
  const recentTopics = await getRecentTopics(15);

  // 2. Carousel Agent (5 slides: cover + 3 numbered + closing)
  const carousel = await runCarouselAgent(ai, {
    topic,
    recentTopics,
  });

  // 3. Compose 5 strict 1080x1350 sRGB JPEGs
  const slideBuffers = await composeCarouselSlides(carousel);

  // 4. Upload all slides to Cloudflare R2
  const batchId = randomUUID();
  const uploadedUrls = await Promise.all(
    slideBuffers.map((buf, index) =>
      storage.uploadJpeg(`posts/carousel-${batchId}-slide-${index + 1}.jpg`, buf)
    )
  );

  // 5. Persist in PostgreSQL (media_urls JSONB array of 5 URLs)
  const post = await createPost({
    platform: 'instagram',
    pillar: carousel.pillar,
    audience: carousel.audience,
    toneMode: carousel.toneMode,
    template: 'editorial_light',
    topic: carousel.topic,
    headline: carousel.coverHeadline,
    subheadline: carousel.coverSubtitle,
    highlightPhrase: carousel.coverHighlight,
    caption: carousel.caption,
    hashtags: carousel.hashtags,
    visualConcept: `Carrusel editorial ${slideBuffers.length} slides (30X × FabSoft)`,
    imagePrompt: null,
    mediaUrls: uploadedUrls,
    status: 'pending_approval',
  });

  // 6. Send album + approval buttons to Telegram
  return sendCarouselPreviewToTelegram(post, chatId);
}

export async function generateAndSendPost(topic: string | null): Promise<SocialPost> {
  const ai = getAIProvider();
  const storage = getMediaStorage();

  // 1. Fetch recent topics for anti-repetition
  const recentTopics = await getRecentTopics(15);

  // 2. Copywriter Agent
  const copy = await runCopywriterAgent(ai, {
    topic,
    recentTopics,
  });

  // 3. Art Director Agent
  const art = await runArtDirectorAgent(ai, {
    template: copy.template,
    pillar: copy.pillar,
    headline: copy.headline,
    visualConcept: copy.visualConcept,
  });

  // 4. Optional AI background image generation
  let aiBackgroundBuffer: Buffer | null = null;
  if (art.needsAiBackground && art.imagePrompt) {
    const aspectRatio = copy.template === 'dev_tip_card' ? '16:9' : '4:5';
    aiBackgroundBuffer = await ai.generateImage(art.imagePrompt, aspectRatio);
  }

  // 5. Compose strict 1080x1350 sRGB JPEG
  const jpegBuffer = await composePostImage({
    template: copy.template,
    pillar: copy.pillar,
    headline: copy.headline,
    subheadline: copy.subheadline,
    highlightPhrase: copy.highlightPhrase,
    accentLabel: art.accentLabel,
    aiBackgroundBuffer,
  });

  // 6. Upload to Cloudflare R2
  const tempKey = buildMediaKey(randomUUID().slice(0, 8));
  const publicImageUrl = await storage.uploadJpeg(tempKey, jpegBuffer);

  // 7. Persist in PostgreSQL
  const post = await createPost({
    platform: 'instagram',
    pillar: copy.pillar,
    audience: copy.audience,
    toneMode: copy.toneMode,
    template: copy.template,
    topic: copy.topic,
    headline: copy.headline,
    subheadline: copy.subheadline,
    highlightPhrase: copy.highlightPhrase,
    caption: copy.caption,
    hashtags: copy.hashtags,
    visualConcept: copy.visualConcept,
    imagePrompt: art.imagePrompt,
    mediaUrls: [publicImageUrl],
    status: 'pending_approval',
  });

  // 8. Send HITL preview to Telegram group
  return sendPostPreviewToTelegram(post);
}

export async function regeneratePostCopy(
  postId: string,
  customInstruction?: string
): Promise<SocialPost> {
  const existing = await getPostById(postId);
  if (!existing) {
    throw new Error(`Post ${postId} not found`);
  }

  const ai = getAIProvider();
  const storage = getMediaStorage();
  const recentTopics = await getRecentTopics(15);

  if (existing.mediaUrls.length > 1) {
    const feedback = customInstruction
      ? `CORRECCIÓN OBLIGATORIA DEL EQUIPO: "${customInstruction}".\nPortada actual: "${existing.headline}". Caption actual: "${existing.caption.slice(0, 500)}".\nAplica EXACTAMENTE esta corrección en todos los slides y caption manteniendo el pilar "${existing.pillar}".`
      : `La portada anterior era "${existing.headline}". Mantén el pilar "${existing.pillar}", pero propón un enfoque, slides y copy mucho más potentes y guardables.`;

    const carousel = await runCarouselAgent(ai, {
      topic: existing.topic,
      recentTopics,
      feedback,
    });

    const slideBuffers = await composeCarouselSlides(carousel);
    const batchId = randomUUID();
    const uploadedUrls = await Promise.all(
      slideBuffers.map((buf, index) =>
        storage.uploadJpeg(`posts/carousel-${batchId}-slide-${index + 1}.jpg`, buf)
      )
    );

    await updatePostCopy(existing.id, {
      headline: carousel.coverHeadline,
      subheadline: carousel.coverSubtitle,
      highlightPhrase: carousel.coverHighlight,
      caption: carousel.caption,
      hashtags: carousel.hashtags,
      visualConcept: `Carrusel editorial ${slideBuffers.length} slides (30X × FabSoft)`,
    });

    const updated = await updatePostMedia(existing.id, {
      mediaUrls: uploadedUrls,
    });

    if (!updated) {
      throw new Error(`Failed to update carousel post ${existing.id}`);
    }

    return sendCarouselPreviewToTelegram(updated);
  }

  const feedback = customInstruction
    ? `CORRECCIÓN OBLIGATORIA DEL EQUIPO: "${customInstruction}".\nTitular actual: "${existing.headline}". Bajada actual: "${existing.subheadline ?? ''}". Caption actual: "${existing.caption.slice(0, 600)}".\nMantén la plantilla "${existing.template}" y el pilar "${existing.pillar}", aplicando EXACTAMENTE la corrección solicitada en titular, bajada y caption.`
    : `El titular anterior era "${existing.headline}". Mantén la plantilla "${existing.template}" y el pilar "${existing.pillar}", pero propón un gancho, titular y copy mucho más potentes y distintos.`;

  const copy = await runCopywriterAgent(ai, {
    topic: existing.topic,
    recentTopics,
    feedback,
  });

  // Re-compose image with new typography (re-generating background if template needs it)
  let aiBackgroundBuffer: Buffer | null = null;
  if (existing.template !== 'editorial_light' && existing.imagePrompt) {
    const aspectRatio = existing.template === 'dev_tip_card' ? '16:9' : '4:5';
    aiBackgroundBuffer = await ai.generateImage(existing.imagePrompt, aspectRatio);
  }

  const jpegBuffer = await composePostImage({
    template: existing.template,
    pillar: existing.pillar,
    headline: copy.headline,
    subheadline: copy.subheadline,
    highlightPhrase: copy.highlightPhrase,
    aiBackgroundBuffer,
  });

  const publicImageUrl = await storage.uploadJpeg(buildMediaKey(existing.id), jpegBuffer);

  await updatePostCopy(existing.id, {
    headline: copy.headline,
    subheadline: copy.subheadline,
    highlightPhrase: copy.highlightPhrase,
    caption: copy.caption,
    hashtags: copy.hashtags,
    visualConcept: copy.visualConcept,
  });

  const updated = await updatePostMedia(existing.id, {
    mediaUrls: [publicImageUrl],
  });

  if (!updated) {
    throw new Error(`Failed to update post ${existing.id}`);
  }

  return sendPostPreviewToTelegram(updated);
}

export async function regeneratePostImage(postId: string): Promise<SocialPost> {
  const existing = await getPostById(postId);
  if (!existing) {
    throw new Error(`Post ${postId} not found`);
  }

  const ai = getAIProvider();
  const storage = getMediaStorage();

  const art = await runArtDirectorAgent(ai, {
    template: existing.template,
    pillar: existing.pillar,
    headline: existing.headline,
    visualConcept: existing.visualConcept ?? existing.topic,
    feedback: 'Genera una dirección visual nueva, más limpia y llamativa que la anterior.',
  });

  let aiBackgroundBuffer: Buffer | null = null;
  if (art.needsAiBackground && art.imagePrompt) {
    const aspectRatio = existing.template === 'dev_tip_card' ? '16:9' : '4:5';
    aiBackgroundBuffer = await ai.generateImage(art.imagePrompt, aspectRatio);
  }

  const jpegBuffer = await composePostImage({
    template: existing.template,
    pillar: existing.pillar,
    headline: existing.headline,
    subheadline: existing.subheadline,
    highlightPhrase: existing.highlightPhrase,
    accentLabel: art.accentLabel,
    aiBackgroundBuffer,
  });

  const publicImageUrl = await storage.uploadJpeg(buildMediaKey(existing.id), jpegBuffer);

  const updated = await updatePostMedia(existing.id, {
    imagePrompt: art.imagePrompt,
    mediaUrls: [publicImageUrl],
  });

  if (!updated) {
    throw new Error(`Failed to update media for post ${existing.id}`);
  }

  return sendPostPreviewToTelegram(updated);
}

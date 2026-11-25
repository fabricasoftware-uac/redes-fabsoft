import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SocialPost } from '../src/db/postsRepository.js';

const AUTHORIZED_GROUP_CHAT_ID = -1001234567890;

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  answerCallbackQuery: vi.fn(),
  editMessageReplyMarkup: vi.fn(),
  generateAndSendPost: vi.fn(),
  regeneratePostCopy: vi.fn(),
  regeneratePostImage: vi.fn(),
  sendPostPreviewToTelegram: vi.fn(),
  generateAndSaveTrendIdeas: vi.fn(),
  generateAndSendRecordingIdea: vi.fn(),
  markIdeaSuggestionSelected: vi.fn(),
  claimPostForPublishing: vi.fn(),
  releasePostToPendingApproval: vi.fn(),
  markPostPublished: vi.fn(),
  markPostFailed: vi.fn(),
  markPostDiscarded: vi.fn(),
  getPostById: vi.fn(),
  getStatusSummary: vi.fn(),
  findPostAwaitingEditByUser: vi.fn(),
  setAwaitingEdit: vi.fn(),
  updatePostCopy: vi.fn(),
  publishSingleImage: vi.fn(),
  isInstagramConfigured: vi.fn(),
}));

vi.mock('../src/config/env.js', () => ({
  requireEnv: vi.fn((key: string) => {
    if (key === 'TELEGRAM_CHAT_ID') return String(AUTHORIZED_GROUP_CHAT_ID);
    return `mock-${key}`;
  }),
  getEnv: vi.fn(() => ({
    CRON_ENABLED: false,
    CRON_SCHEDULE: '0 10 * * 1,3,5',
    CRON_TIMEZONE: 'America/Bogota',
    RECORDING_CRON_ENABLED: true,
    RECORDING_CRON_SCHEDULE: '0 9 * * 1,4',
    META_GRAPH_API_VERSION: 'v22.0',
  })),
  isInstagramConfigured: mocks.isInstagramConfigured,
}));

vi.mock('../src/telegram/telegramClient.js', () => ({
  getTelegramClient: vi.fn(() => ({
    sendMessage: mocks.sendMessage,
    answerCallbackQuery: mocks.answerCallbackQuery,
    editMessageReplyMarkup: mocks.editMessageReplyMarkup,
  })),
  escapeHtml: (text: string) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
}));

vi.mock('../src/db/postsRepository.js', () => ({
  claimPostForPublishing: mocks.claimPostForPublishing,
  releasePostToPendingApproval: mocks.releasePostToPendingApproval,
  markPostPublished: mocks.markPostPublished,
  markPostFailed: mocks.markPostFailed,
  markPostDiscarded: mocks.markPostDiscarded,
  getPostById: mocks.getPostById,
  getStatusSummary: mocks.getStatusSummary,
  findPostAwaitingEditByUser: mocks.findPostAwaitingEditByUser,
  setAwaitingEdit: mocks.setAwaitingEdit,
  updatePostCopy: mocks.updatePostCopy,
}));

vi.mock('../src/pipeline/generatePost.js', () => ({
  generateAndSendPost: mocks.generateAndSendPost,
  regeneratePostCopy: mocks.regeneratePostCopy,
  regeneratePostImage: mocks.regeneratePostImage,
  sendPostPreviewToTelegram: mocks.sendPostPreviewToTelegram,
  buildApprovalKeyboard: vi.fn(() => ({ inline_keyboard: [] })),
  buildInstagramCaption: vi.fn(
    (post: SocialPost) => `${post.caption}\n\n${post.hashtags.join(' ')}`
  ),
}));

vi.mock('../src/db/ideasRepository.js', () => ({
  markIdeaSuggestionSelected: mocks.markIdeaSuggestionSelected,
}));

vi.mock('../src/ai/trendsAgent.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/ai/trendsAgent.js')>();
  return {
    ...actual,
    generateAndSaveTrendIdeas: mocks.generateAndSaveTrendIdeas,
  };
});

vi.mock('../src/ai/recordingAgent.js', () => ({
  generateAndSendRecordingIdea: mocks.generateAndSendRecordingIdea,
}));

vi.mock('../src/publishers/instagramPublisher.js', () => ({
  InstagramPublisher: vi.fn().mockImplementation(() => ({
    publishSingleImage: mocks.publishSingleImage,
  })),
}));

import { processTelegramUpdate } from '../src/telegram/handlers.js';

function makeSamplePost(overrides: Partial<SocialPost> = {}): SocialPost {
  return {
    id: 'post-uuid-1',
    platform: 'instagram',
    pillar: 'educacion',
    audience: 'comunidad_dev',
    toneMode: 'educativo',
    template: 'dev_tip_card',
    topic: 'Arquitectura limpia',
    headline: 'Desacopla tu dominio',
    subheadline: 'Código mantenible desde el día uno',
    highlightPhrase: null,
    caption: 'Caption listo para publicar en Instagram.',
    hashtags: ['#FabSoft', '#TypeScript', '#CleanCode'],
    visualConcept: 'Tarjeta minimalista',
    imagePrompt: null,
    mediaUrls: ['https://cdn.fabsoft.tech/posts/post-uuid-1.jpg'],
    status: 'publishing',
    telegramMessageId: 42,
    awaitingEditFromUser: null,
    externalPostId: null,
    externalPostUrl: null,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    publishedAt: null,
    ...overrides,
  };
}

describe('Telegram webhook handlers — security, commands & idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendMessage.mockResolvedValue({ message_id: 1, chat: { id: AUTHORIZED_GROUP_CHAT_ID, type: 'supergroup' } });
    mocks.answerCallbackQuery.mockResolvedValue(true);
    mocks.editMessageReplyMarkup.mockResolvedValue(true);
    mocks.isInstagramConfigured.mockReturnValue(true);
  });

  it('rejects messages from unauthorized private chats or other groups', async () => {
    // Private positive chat ID
    await processTelegramUpdate({
      update_id: 1001,
      message: {
        message_id: 10,
        from: { id: 777, username: 'intruder' },
        chat: { id: 777, type: 'private' },
        text: '/idea hackear el bot',
      },
    });

    // Different negative group chat ID
    await processTelegramUpdate({
      update_id: 1002,
      message: {
        message_id: 11,
        from: { id: 777, username: 'intruder' },
        chat: { id: -1009999999999, type: 'supergroup' },
        text: '/help',
      },
    });

    expect(mocks.generateAndSendPost).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it('rejects callback_query from unauthorized chat', async () => {
    await processTelegramUpdate({
      update_id: 1003,
      callback_query: {
        id: 'cb-unauth',
        from: { id: 777, username: 'intruder' },
        message: {
          message_id: 20,
          chat: { id: -1009999999999, type: 'supergroup' },
        },
        data: 'approve:post-uuid-1',
      },
    });

    expect(mocks.claimPostForPublishing).not.toHaveBeenCalled();
    expect(mocks.publishSingleImage).not.toHaveBeenCalled();
    expect(mocks.answerCallbackQuery).not.toHaveBeenCalled();
  });

  it('accepts authorized negative group chat and supports /idea@botname <tema>', async () => {
    mocks.generateAndSendPost.mockResolvedValueOnce(makeSamplePost());

    await processTelegramUpdate({
      update_id: 1004,
      message: {
        message_id: 12,
        from: { id: 55, username: 'founder' },
        chat: { id: AUTHORIZED_GROUP_CHAT_ID, type: 'supergroup' },
        text: '/idea@fabsoft_social_bot Automatización de procesos B2B con IA',
      },
    });

    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    expect(mocks.generateAndSendPost).toHaveBeenCalledTimes(1);
    expect(mocks.generateAndSendPost).toHaveBeenCalledWith(
      'Automatización de procesos B2B con IA'
    );
  });

  it('supports /idea@botname without topic (autonomous generation)', async () => {
    mocks.generateAndSendPost.mockResolvedValueOnce(makeSamplePost());

    await processTelegramUpdate({
      update_id: 1005,
      message: {
        message_id: 13,
        from: { id: 55, username: 'founder' },
        chat: { id: AUTHORIZED_GROUP_CHAT_ID, type: 'supergroup' },
        text: '/idea@fabsoft_social_bot',
      },
    });

    expect(mocks.generateAndSendPost).toHaveBeenCalledWith(null);
  });

  it('enforces strict idempotency when claimPostForPublishing returns null', async () => {
    mocks.claimPostForPublishing.mockResolvedValueOnce(null);

    await processTelegramUpdate({
      update_id: 1006,
      callback_query: {
        id: 'cb-already-claimed',
        from: { id: 55, username: 'founder' },
        message: {
          message_id: 42,
          chat: { id: AUTHORIZED_GROUP_CHAT_ID, type: 'supergroup' },
        },
        data: 'approve:post-uuid-1',
      },
    });

    expect(mocks.claimPostForPublishing).toHaveBeenCalledWith('post-uuid-1');
    expect(mocks.answerCallbackQuery).toHaveBeenCalledWith({
      callbackQueryId: 'cb-already-claimed',
      text: 'Ya fue aprobado, publicado o descartado.',
      showAlert: true,
    });
    expect(mocks.publishSingleImage).not.toHaveBeenCalled();
    expect(mocks.markPostPublished).not.toHaveBeenCalled();
  });

  it('publishes only once on rapid double-click approve callbacks', async () => {
    const claimedPost = makeSamplePost();
    mocks.claimPostForPublishing
      .mockResolvedValueOnce(claimedPost)
      .mockResolvedValueOnce(null);

    mocks.publishSingleImage.mockResolvedValueOnce({
      externalPostId: 'ig_media_999',
      externalPostUrl: 'https://www.instagram.com/p/FAB123/',
    });

    const approveUpdate = (updateId: number, cbId: string) => ({
      update_id: updateId,
      callback_query: {
        id: cbId,
        from: { id: 55, username: 'founder' },
        message: {
          message_id: 42,
          chat: { id: AUTHORIZED_GROUP_CHAT_ID, type: 'supergroup' },
        },
        data: 'approve:post-uuid-1',
      },
    });

    await processTelegramUpdate(approveUpdate(2001, 'cb-1'));
    await processTelegramUpdate(approveUpdate(2002, 'cb-2'));

    expect(mocks.claimPostForPublishing).toHaveBeenCalledTimes(2);
    expect(mocks.publishSingleImage).toHaveBeenCalledTimes(1);
    expect(mocks.markPostPublished).toHaveBeenCalledTimes(1);
    expect(mocks.markPostPublished).toHaveBeenCalledWith(
      'post-uuid-1',
      'ig_media_999',
      'https://www.instagram.com/p/FAB123/'
    );
  });

  it('releases post back to pending_approval if Instagram credentials are not configured', async () => {
    mocks.isInstagramConfigured.mockReturnValue(false);
    mocks.claimPostForPublishing.mockResolvedValueOnce(makeSamplePost());

    await processTelegramUpdate({
      update_id: 2003,
      callback_query: {
        id: 'cb-phase4',
        from: { id: 55, username: 'founder' },
        message: {
          message_id: 42,
          chat: { id: AUTHORIZED_GROUP_CHAT_ID, type: 'supergroup' },
        },
        data: 'approve:post-uuid-1',
      },
    });

    expect(mocks.releasePostToPendingApproval).toHaveBeenCalledTimes(1);
    expect(mocks.publishSingleImage).not.toHaveBeenCalled();
  });

  it('ignores malformed updates without throwing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await expect(processTelegramUpdate({ invalid: true })).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(mocks.sendMessage).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('handles /tendencias@botname with optional focus and renders 4 inline pick buttons + refresh', async () => {
    const sampleIdeas = [
      {
        id: 'idea-1',
        title: 'Agentes de IA en WhatsApp',
        pillar: 'tendencias' as const,
        angle: 'Caso SpartanBot para pymes',
        whyTrending: 'Explosión de automatización conversacional',
        status: 'suggested' as const,
        createdAt: new Date(),
      },
      {
        id: 'idea-2',
        title: 'PWAs offline para restaurantes',
        pillar: 'productos' as const,
        angle: 'Arquitectura de Xeiva sin internet',
        whyTrending: 'Conectividad inestable en comercios LATAM',
        status: 'suggested' as const,
        createdAt: new Date(),
      },
      {
        id: 'idea-3',
        title: 'TypeScript estricto en producción',
        pillar: 'educacion' as const,
        angle: 'Evitar bugs en tiempo de compilación',
        whyTrending: 'Estándar dominante en equipos backend',
        status: 'suggested' as const,
        createdAt: new Date(),
      },
      {
        id: 'idea-4',
        title: 'Entregas cada viernes sin excusas',
        pillar: 'proceso' as const,
        angle: 'Cómo trabajamos desde Emprendelab Popayán',
        whyTrending: 'Transparencia en desarrollo a medida',
        status: 'suggested' as const,
        createdAt: new Date(),
      },
    ];
    mocks.generateAndSaveTrendIdeas.mockResolvedValueOnce(sampleIdeas);

    await processTelegramUpdate({
      update_id: 3001,
      message: {
        message_id: 50,
        from: { id: 55, username: 'founder' },
        chat: { id: AUTHORIZED_GROUP_CHAT_ID, type: 'supergroup' },
        text: '/tendencias@fabsoft_social_bot IA para pymes',
      },
    });

    expect(mocks.generateAndSaveTrendIdeas).toHaveBeenCalledWith('IA para pymes');
    expect(mocks.sendMessage).toHaveBeenCalledTimes(2);
    const secondCall = mocks.sendMessage.mock.calls[1]?.[0];
    expect(secondCall.text).toContain('Agentes de IA en WhatsApp');
    expect(secondCall.replyMarkup.inline_keyboard).toEqual([
      [
        { text: '1️⃣ Generar #1', callback_data: 'pick_idea:idea-1' },
        { text: '2️⃣ Generar #2', callback_data: 'pick_idea:idea-2' },
      ],
      [
        { text: '3️⃣ Generar #3', callback_data: 'pick_idea:idea-3' },
        { text: '4️⃣ Generar #4', callback_data: 'pick_idea:idea-4' },
      ],
      [{ text: '🔄 Nuevas tendencias', callback_data: 'refresh_trends' }],
    ]);
  });

  it('handles pick_idea:<id> callback by marking selected and calling generateAndSendPost', async () => {
    mocks.markIdeaSuggestionSelected.mockResolvedValueOnce({
      id: 'idea-1',
      title: 'Agentes de IA en WhatsApp',
      pillar: 'tendencias',
      angle: 'Caso SpartanBot para pymes',
      whyTrending: 'Alta demanda B2B',
      status: 'selected',
      createdAt: new Date(),
    });
    mocks.generateAndSendPost.mockResolvedValueOnce(makeSamplePost());

    await processTelegramUpdate({
      update_id: 3002,
      callback_query: {
        id: 'cb-pick-1',
        from: { id: 55, username: 'founder' },
        message: {
          message_id: 51,
          chat: { id: AUTHORIZED_GROUP_CHAT_ID, type: 'supergroup' },
        },
        data: 'pick_idea:idea-1',
      },
    });

    expect(mocks.markIdeaSuggestionSelected).toHaveBeenCalledWith('idea-1');
    expect(mocks.answerCallbackQuery).toHaveBeenCalledWith({
      callbackQueryId: 'cb-pick-1',
      text: 'Generando propuesta…',
    });
    expect(mocks.generateAndSendPost).toHaveBeenCalledWith(
      'Agentes de IA en WhatsApp — Caso SpartanBot para pymes'
    );
  });

  it('prevents duplicate generation if pick_idea:<id> was already selected', async () => {
    mocks.markIdeaSuggestionSelected.mockResolvedValueOnce(null);

    await processTelegramUpdate({
      update_id: 3003,
      callback_query: {
        id: 'cb-pick-dup',
        from: { id: 55, username: 'founder' },
        message: {
          message_id: 51,
          chat: { id: AUTHORIZED_GROUP_CHAT_ID, type: 'supergroup' },
        },
        data: 'pick_idea:idea-1',
      },
    });

    expect(mocks.generateAndSendPost).not.toHaveBeenCalled();
    expect(mocks.answerCallbackQuery).toHaveBeenCalledWith({
      callbackQueryId: 'cb-pick-dup',
      text: 'Esta idea ya fue seleccionada o no existe.',
      showAlert: true,
    });
  });

  it('handles /grabar with auto-alternate, oficina, and virtual arguments', async () => {
    mocks.generateAndSendRecordingIdea.mockResolvedValue({ id: 'rec-1' });

    await processTelegramUpdate({
      update_id: 3004,
      message: {
        message_id: 60,
        from: { id: 55, username: 'founder' },
        chat: { id: AUTHORIZED_GROUP_CHAT_ID, type: 'supergroup' },
        text: '/grabar',
      },
    });

    await processTelegramUpdate({
      update_id: 3005,
      message: {
        message_id: 61,
        from: { id: 55, username: 'founder' },
        chat: { id: AUTHORIZED_GROUP_CHAT_ID, type: 'supergroup' },
        text: '/grabar oficina',
      },
    });

    await processTelegramUpdate({
      update_id: 3006,
      message: {
        message_id: 62,
        from: { id: 55, username: 'founder' },
        chat: { id: AUTHORIZED_GROUP_CHAT_ID, type: 'supergroup' },
        text: '/grabar@fabsoft_social_bot virtual',
      },
    });

    expect(mocks.generateAndSendRecordingIdea).toHaveBeenNthCalledWith(
      1,
      null,
      AUTHORIZED_GROUP_CHAT_ID
    );
    expect(mocks.generateAndSendRecordingIdea).toHaveBeenNthCalledWith(
      2,
      'oficina',
      AUTHORIZED_GROUP_CHAT_ID
    );
    expect(mocks.generateAndSendRecordingIdea).toHaveBeenNthCalledWith(
      3,
      'virtual_duo',
      AUTHORIZED_GROUP_CHAT_ID
    );
  });

  it('lists all commands in /help', async () => {
    await processTelegramUpdate({
      update_id: 3007,
      message: {
        message_id: 63,
        from: { id: 55, username: 'founder' },
        chat: { id: AUTHORIZED_GROUP_CHAT_ID, type: 'supergroup' },
        text: '/help',
      },
    });

    const helpMsg = mocks.sendMessage.mock.calls[0]?.[0]?.text as string;
    expect(helpMsg).toContain('/idea');
    expect(helpMsg).toContain('/tendencias');
    expect(helpMsg).toContain('/grabar');
    expect(helpMsg).toContain('/status');
    expect(helpMsg).toContain('/help');
  });
});

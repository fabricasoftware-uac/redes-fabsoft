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
});

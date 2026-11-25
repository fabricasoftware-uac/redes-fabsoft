import { z } from 'zod';
import { getEnv, isInstagramConfigured, requireEnv } from '../config/env.js';
import {
  claimPostForPublishing,
  findPostAwaitingEditByUser,
  getPostById,
  getStatusSummary,
  markPostDiscarded,
  markPostFailed,
  markPostPublished,
  releasePostToPendingApproval,
  setAwaitingEdit,
  updatePostCopy,
} from '../db/postsRepository.js';
import {
  buildApprovalKeyboard,
  buildInstagramCaption,
  generateAndSendPost,
  regeneratePostCopy,
  regeneratePostImage,
  sendPostPreviewToTelegram,
} from '../pipeline/generatePost.js';
import { InstagramPublisher } from '../publishers/instagramPublisher.js';
import { escapeHtml, getTelegramClient } from './telegramClient.js';

const telegramUserSchema = z.object({
  id: z.number(),
  first_name: z.string().optional(),
  username: z.string().optional(),
});

const telegramChatSchema = z.object({
  id: z.number(),
  type: z.string().optional(),
});

const telegramMessageSchema = z.object({
  message_id: z.number(),
  from: telegramUserSchema.optional(),
  chat: telegramChatSchema,
  text: z.string().optional(),
});

const telegramCallbackQuerySchema = z.object({
  id: z.string(),
  from: telegramUserSchema,
  message: telegramMessageSchema.optional(),
  data: z.string().optional(),
});

export const telegramUpdateSchema = z.object({
  update_id: z.number(),
  message: telegramMessageSchema.optional(),
  callback_query: telegramCallbackQuerySchema.optional(),
});

export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;

function isAuthorizedChat(chatId: number): boolean {
  const allowedChatId = requireEnv('TELEGRAM_CHAT_ID').trim();
  return String(chatId) === allowedChatId;
}

async function notifyError(chatId: string | number, context: string, err: unknown): Promise<void> {
  const telegram = getTelegramClient();
  const message = err instanceof Error ? err.message : String(err);
  const summary = message.length > 350 ? `${message.slice(0, 350)}…` : message;

  try {
    await telegram.sendMessage({
      chatId,
      text: `⚠️ <b>Error (${escapeHtml(context)}):</b>\n<code>${escapeHtml(summary)}</code>`,
      parseMode: 'HTML',
    });
  } catch (notifyErr) {
    console.error('[telegram] Failed to send error notification:', notifyErr);
  }
}

async function handleCommand(
  chatId: number,
  userId: number | undefined,
  text: string
): Promise<void> {
  const telegram = getTelegramClient();
  const match = text.trim().match(/^\/([a-zA-Z0-9_]+)(?:@[a-zA-Z0-9_]+)?(?:\s+([\s\S]*))?$/);
  if (!match) return;

  const command = match[1]?.toLowerCase();
  const arg = (match[2] ?? '').trim();

  if (command === 'help' || command === 'start') {
    const helpText = [
      '<b>🤖 FabSoft Social Pipeline — Comandos</b>',
      '',
      '• <code>/idea &lt;tema&gt;</code> — Genera una propuesta completa sobre un tema específico.',
      '• <code>/idea</code> — Genera una propuesta autónoma (anti-repetición).',
      '• <code>/status</code> — Muestra el resumen de publicaciones y estado del sistema.',
      '• <code>/cancel</code> — Cancela una edición de copy en curso.',
      '• <code>/help</code> — Muestra esta ayuda.',
      '',
      '<b>Flujo HITL:</b>',
      'Usa los botones bajo cada propuesta: ✅ Aprobar, 🔄 Regenerar Copy, 🎨 Regenerar Imagen, ✏️ Editar Copy o ❌ Descartar.',
    ].join('\n');

    await telegram.sendMessage({ chatId, text: helpText, parseMode: 'HTML' });
    return;
  }

  if (command === 'cancel' && userId !== undefined) {
    const pendingEdit = await findPostAwaitingEditByUser(userId);
    if (pendingEdit) {
      await setAwaitingEdit(pendingEdit.id, null);
      await telegram.sendMessage({
        chatId,
        text: '✅ Edición cancelada.',
      });
    } else {
      await telegram.sendMessage({
        chatId,
        text: 'ℹ️ No tienes ninguna edición pendiente.',
      });
    }
    return;
  }

  if (command === 'status') {
    const env = getEnv();
    const summary = await getStatusSummary();
    const igStatus = isInstagramConfigured(env)
      ? '✅ Configurado'
      : '⏳ Pendiente (Fase 4)';
    const cronStatus = env.CRON_ENABLED
      ? `✅ Activo (${env.CRON_SCHEDULE} ${env.CRON_TIMEZONE})`
      : '⏸ Desactivado';

    const recentLines =
      summary.recent.length > 0
        ? summary.recent
            .map(
              (p) =>
                `• <code>${p.status}</code> · ${escapeHtml(p.headline.slice(0, 48))}`
            )
            .join('\n')
        : '• Sin publicaciones registradas aún.';

    const statusText = [
      '<b>📊 Estado del Pipeline FabSoft</b>',
      '',
      `<b>Instagram API:</b> ${igStatus}`,
      `<b>Cron autónomo:</b> ${escapeHtml(cronStatus)}`,
      '',
      `<b>Contadores:</b>`,
      `• Pendientes de aprobación: <b>${summary.counts.pending_approval}</b>`,
      `• Publicados: <b>${summary.counts.published}</b>`,
      `• Fallidos: <b>${summary.counts.failed}</b>`,
      `• Descartados: <b>${summary.counts.discarded}</b>`,
      '',
      '<b>Últimas piezas:</b>',
      recentLines,
    ].join('\n');

    await telegram.sendMessage({ chatId, text: statusText, parseMode: 'HTML' });
    return;
  }

  if (command === 'idea') {
    const topic = arg.length > 0 ? arg : null;
    await telegram.sendMessage({
      chatId,
      text: topic
        ? `🚀 Generando propuesta sobre: <b>${escapeHtml(topic)}</b>…`
        : '🚀 Generando propuesta autónoma de FabSoft…',
      parseMode: 'HTML',
    });

    try {
      await generateAndSendPost(topic);
    } catch (err) {
      console.error('[telegram] /idea failed:', err);
      await notifyError(chatId, '/idea', err);
    }
  }
}

async function handleCallbackQuery(
  callback: z.infer<typeof telegramCallbackQuerySchema>
): Promise<void> {
  const telegram = getTelegramClient();
  const chatId = callback.message?.chat.id;
  const messageId = callback.message?.message_id;

  if (chatId === undefined || !isAuthorizedChat(chatId)) {
    return;
  }

  const data = callback.data ?? '';
  const separatorIdx = data.indexOf(':');
  if (separatorIdx === -1) {
    await telegram.answerCallbackQuery({
      callbackQueryId: callback.id,
      text: 'Acción no reconocida.',
    });
    return;
  }

  const action = data.slice(0, separatorIdx);
  const postId = data.slice(separatorIdx + 1);

  if (action === 'approve') {
    const claimed = await claimPostForPublishing(postId);
    if (!claimed) {
      await telegram.answerCallbackQuery({
        callbackQueryId: callback.id,
        text: 'Ya fue aprobado, publicado o descartado.',
        showAlert: true,
      });
      return;
    }

    await telegram.answerCallbackQuery({
      callbackQueryId: callback.id,
      text: 'Procesando publicación…',
    });

    if (messageId !== undefined) {
      await telegram.editMessageReplyMarkup({ chatId, messageId }).catch(() => {});
    }

    if (!isInstagramConfigured()) {
      await releasePostToPendingApproval(
        postId,
        'Pendiente credenciales de Instagram (Fase 4)'
      );
      if (messageId !== undefined) {
        await telegram
          .editMessageReplyMarkup({
            chatId,
            messageId,
            replyMarkup: buildApprovalKeyboard(postId),
          })
          .catch(() => {});
      }
      await telegram.sendMessage({
        chatId,
        text: [
          '⏳ <b>Publicación en pausa (Fase 4 pendiente)</b>',
          'Faltan <code>INSTAGRAM_ACCESS_TOKEN</code> e <code>INSTAGRAM_ACCOUNT_ID</code> en las variables de entorno.',
          'La pieza volvió a estado <code>pending_approval</code> lista para publicar apenas conectes Meta Graph API.',
        ].join('\n'),
        parseMode: 'HTML',
      });
      return;
    }

    const imageUrl = claimed.mediaUrls[0];
    if (!imageUrl) {
      await markPostFailed(postId, 'Missing media URL');
      await notifyError(chatId, 'Publicación Instagram', new Error('Post sin URL de imagen'));
      return;
    }

    try {
      const publisher = new InstagramPublisher();
      const fullCaption = buildInstagramCaption(claimed);
      const result = await publisher.publishSingleImage(imageUrl, fullCaption);

      await markPostPublished(postId, result.externalPostId, result.externalPostUrl);

      const linkLine = result.externalPostUrl
        ? `\n🔗 ${escapeHtml(result.externalPostUrl)}`
        : '';

      await telegram.sendMessage({
        chatId,
        text: `✅ <b>¡Publicado en Instagram!</b>\nID: <code>${escapeHtml(result.externalPostId)}</code>${linkLine}`,
        parseMode: 'HTML',
      });
    } catch (err) {
      console.error('[telegram] Instagram publish failed:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      await markPostFailed(postId, errMsg);
      await notifyError(chatId, 'Publicación Instagram', err);
    }
    return;
  }

  if (action === 'discard') {
    const discarded = await markPostDiscarded(postId);
    if (!discarded) {
      await telegram.answerCallbackQuery({
        callbackQueryId: callback.id,
        text: 'Esta propuesta ya no puede descartarse.',
        showAlert: true,
      });
      return;
    }

    await telegram.answerCallbackQuery({
      callbackQueryId: callback.id,
      text: 'Propuesta descartada.',
    });

    if (messageId !== undefined) {
      await telegram.editMessageReplyMarkup({ chatId, messageId }).catch(() => {});
    }

    await telegram.sendMessage({
      chatId,
      text: `🗑 Propuesta descartada: <i>${escapeHtml(discarded.headline)}</i>`,
      parseMode: 'HTML',
    });
    return;
  }

  if (action === 'edit_copy') {
    const post = await getPostById(postId);
    if (!post || post.status !== 'pending_approval') {
      await telegram.answerCallbackQuery({
        callbackQueryId: callback.id,
        text: 'Esta propuesta ya no está pendiente de aprobación.',
        showAlert: true,
      });
      return;
    }

    await setAwaitingEdit(postId, callback.from.id);
    await telegram.answerCallbackQuery({
      callbackQueryId: callback.id,
      text: 'Envía el nuevo caption en el chat.',
    });

    const userLabel = callback.from.username
      ? `@${callback.from.username}`
      : callback.from.first_name ?? 'usuario';

    await telegram.sendMessage({
      chatId,
      text: `✏️ <b>${escapeHtml(userLabel)}</b>, envía ahora el nuevo <b>caption</b> para:\n<i>"${escapeHtml(post.headline)}"</i>\n\n(Los hashtags actuales se conservan. Usa <code>/cancel</code> para cancelar.)`,
      parseMode: 'HTML',
    });
    return;
  }

  if (action === 'regen_copy') {
    const post = await getPostById(postId);
    if (!post || post.status !== 'pending_approval') {
      await telegram.answerCallbackQuery({
        callbackQueryId: callback.id,
        text: 'Esta propuesta ya no está pendiente de aprobación.',
        showAlert: true,
      });
      return;
    }

    await telegram.answerCallbackQuery({
      callbackQueryId: callback.id,
      text: 'Regenerando copy…',
    });

    if (messageId !== undefined) {
      await telegram.editMessageReplyMarkup({ chatId, messageId }).catch(() => {});
    }

    await telegram.sendMessage({
      chatId,
      text: '🔄 Regenerando copy y composición…',
    });

    try {
      await regeneratePostCopy(postId);
    } catch (err) {
      console.error('[telegram] regen_copy failed:', err);
      await notifyError(chatId, 'Regenerar Copy', err);
    }
    return;
  }

  if (action === 'regen_img') {
    const post = await getPostById(postId);
    if (!post || post.status !== 'pending_approval') {
      await telegram.answerCallbackQuery({
        callbackQueryId: callback.id,
        text: 'Esta propuesta ya no está pendiente de aprobación.',
        showAlert: true,
      });
      return;
    }

    await telegram.answerCallbackQuery({
      callbackQueryId: callback.id,
      text: 'Regenerando imagen…',
    });

    if (messageId !== undefined) {
      await telegram.editMessageReplyMarkup({ chatId, messageId }).catch(() => {});
    }

    await telegram.sendMessage({
      chatId,
      text: '🎨 Regenerando dirección de arte e imagen…',
    });

    try {
      await regeneratePostImage(postId);
    } catch (err) {
      console.error('[telegram] regen_img failed:', err);
      await notifyError(chatId, 'Regenerar Imagen', err);
    }
    return;
  }

  await telegram.answerCallbackQuery({
    callbackQueryId: callback.id,
    text: 'Acción desconocida.',
  });
}

export async function processTelegramUpdate(rawUpdate: unknown): Promise<void> {
  const parsed = telegramUpdateSchema.safeParse(rawUpdate);
  if (!parsed.success) {
    console.warn('[telegram] Ignored malformed update:', parsed.error.message);
    return;
  }

  const update = parsed.data;

  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query);
    return;
  }

  const msg = update.message;
  if (!msg || !msg.text) {
    return;
  }

  if (!isAuthorizedChat(msg.chat.id)) {
    return;
  }

  const text = msg.text.trim();
  if (text.startsWith('/')) {
    await handleCommand(msg.chat.id, msg.from?.id, text);
    return;
  }

  // Check if this user is currently editing a post caption
  if (msg.from?.id !== undefined) {
    const awaitingPost = await findPostAwaitingEditByUser(msg.from.id);
    if (awaitingPost) {
      try {
        const updated = await updatePostCopy(awaitingPost.id, {
          caption: text,
        });
        if (updated) {
          await sendPostPreviewToTelegram(updated);
        }
      } catch (err) {
        console.error('[telegram] Failed to save edited copy:', err);
        await notifyError(msg.chat.id, 'Editar Copy', err);
      }
    }
  }
}

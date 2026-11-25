import { requireEnv } from '../config/env.js';

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface TelegramMessageResult {
  message_id: number;
  chat: { id: number; type: string };
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

export class TelegramClient {
  private readonly baseUrl: string;

  constructor(botToken?: string) {
    const token = botToken ?? requireEnv('TELEGRAM_BOT_TOKEN');
    this.baseUrl = `https://api.telegram.org/bot${token}`;
  }

  private async call<T>(
    method: string,
    payload: Record<string, unknown>
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as TelegramApiResponse<T>;
    if (!response.ok || !data.ok || data.result === undefined) {
      throw new Error(
        `Telegram API ${method} failed (${data.error_code ?? response.status}): ${data.description ?? 'Unknown error'}`
      );
    }

    return data.result;
  }

  async getMe(): Promise<{ id: number; username?: string; first_name: string }> {
    return this.call('getMe', {});
  }

  async sendMessage(params: {
    chatId: string | number;
    text: string;
    parseMode?: 'HTML' | 'MarkdownV2';
    replyMarkup?: InlineKeyboardMarkup;
    replyToMessageId?: number;
    disableWebPagePreview?: boolean;
  }): Promise<TelegramMessageResult> {
    return this.call<TelegramMessageResult>('sendMessage', {
      chat_id: params.chatId,
      text: params.text,
      ...(params.parseMode ? { parse_mode: params.parseMode } : {}),
      ...(params.replyMarkup ? { reply_markup: params.replyMarkup } : {}),
      ...(params.replyToMessageId
        ? { reply_to_message_id: params.replyToMessageId }
        : {}),
      ...(params.disableWebPagePreview
        ? { disable_web_page_preview: true }
        : {}),
    });
  }

  async sendPhoto(params: {
    chatId: string | number;
    photo: string;
    caption?: string;
    parseMode?: 'HTML' | 'MarkdownV2';
    replyMarkup?: InlineKeyboardMarkup;
  }): Promise<TelegramMessageResult> {
    return this.call<TelegramMessageResult>('sendPhoto', {
      chat_id: params.chatId,
      photo: params.photo,
      ...(params.caption ? { caption: params.caption } : {}),
      ...(params.parseMode ? { parse_mode: params.parseMode } : {}),
      ...(params.replyMarkup ? { reply_markup: params.replyMarkup } : {}),
    });
  }

  async answerCallbackQuery(params: {
    callbackQueryId: string;
    text?: string;
    showAlert?: boolean;
  }): Promise<boolean> {
    return this.call<boolean>('answerCallbackQuery', {
      callback_query_id: params.callbackQueryId,
      ...(params.text ? { text: params.text } : {}),
      ...(params.showAlert ? { show_alert: params.showAlert } : {}),
    });
  }

  async editMessageCaption(params: {
    chatId: string | number;
    messageId: number;
    caption: string;
    parseMode?: 'HTML' | 'MarkdownV2';
    replyMarkup?: InlineKeyboardMarkup;
  }): Promise<unknown> {
    return this.call('editMessageCaption', {
      chat_id: params.chatId,
      message_id: params.messageId,
      caption: params.caption,
      ...(params.parseMode ? { parse_mode: params.parseMode } : {}),
      ...(params.replyMarkup ? { reply_markup: params.replyMarkup } : {}),
    });
  }

  async editMessageReplyMarkup(params: {
    chatId: string | number;
    messageId: number;
    replyMarkup?: InlineKeyboardMarkup;
  }): Promise<unknown> {
    return this.call('editMessageReplyMarkup', {
      chat_id: params.chatId,
      message_id: params.messageId,
      reply_markup: params.replyMarkup ?? { inline_keyboard: [] },
    });
  }

  async setWebhook(params: {
    url: string;
    secretToken: string;
    dropPendingUpdates?: boolean;
  }): Promise<boolean> {
    return this.call<boolean>('setWebhook', {
      url: params.url,
      secret_token: params.secretToken,
      allowed_updates: ['message', 'callback_query'],
      ...(params.dropPendingUpdates ? { drop_pending_updates: true } : {}),
    });
  }
}

let defaultClient: TelegramClient | null = null;

export function getTelegramClient(): TelegramClient {
  if (!defaultClient) {
    defaultClient = new TelegramClient();
  }
  return defaultClient;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

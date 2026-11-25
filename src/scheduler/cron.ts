import cron, { type ScheduledTask } from 'node-cron';
import { generateAndSendRecordingIdea } from '../ai/recordingAgent.js';
import { getEnv, requireEnv } from '../config/env.js';
import { generateAndSendPost } from '../pipeline/generatePost.js';
import { escapeHtml, getTelegramClient } from '../telegram/telegramClient.js';

let activePostTask: ScheduledTask | null = null;
let activeRecordingTask: ScheduledTask | null = null;

async function notifyCronError(context: string, err: unknown): Promise<void> {
  try {
    const telegram = getTelegramClient();
    const chatId = requireEnv('TELEGRAM_CHAT_ID');
    const msg = err instanceof Error ? err.message : String(err);
    await telegram.sendMessage({
      chatId,
      text: `⚠️ <b>Error en ${escapeHtml(context)} (Cron):</b>\n<code>${escapeHtml(msg.slice(0, 350))}</code>`,
      parseMode: 'HTML',
    });
  } catch (notifyErr) {
    console.error('[cron] Failed to notify Telegram about cron error:', notifyErr);
  }
}

export function startScheduler(): {
  postTask: ScheduledTask | null;
  recordingTask: ScheduledTask | null;
} {
  const env = getEnv();

  if (env.CRON_ENABLED) {
    if (!cron.validate(env.CRON_SCHEDULE)) {
      throw new Error(`Invalid CRON_SCHEDULE expression: "${env.CRON_SCHEDULE}"`);
    }

    activePostTask = cron.schedule(
      env.CRON_SCHEDULE,
      async () => {
        console.log('[cron] Triggering autonomous FabSoft post generation...');
        try {
          const post = await generateAndSendPost(null);
          console.log(`[cron] Generated and sent post ${post.id} (${post.template})`);
        } catch (err) {
          console.error('[cron] Autonomous post generation failed:', err);
          await notifyCronError('generación programada', err);
        }
      },
      {
        timezone: env.CRON_TIMEZONE,
      }
    );

    console.log(
      `[cron] Post scheduler active: "${env.CRON_SCHEDULE}" (${env.CRON_TIMEZONE})`
    );
  } else {
    console.log('[cron] Autonomous post scheduler is disabled (CRON_ENABLED=false).');
  }

  if (env.RECORDING_CRON_ENABLED) {
    if (!cron.validate(env.RECORDING_CRON_SCHEDULE)) {
      throw new Error(
        `Invalid RECORDING_CRON_SCHEDULE expression: "${env.RECORDING_CRON_SCHEDULE}"`
      );
    }

    activeRecordingTask = cron.schedule(
      env.RECORDING_CRON_SCHEDULE,
      async () => {
        console.log('[cron] Triggering FabSoft recording recommendation...');
        try {
          const idea = await generateAndSendRecordingIdea(null);
          console.log(`[cron] Sent recording idea ${idea.id} (${idea.mode})`);
        } catch (err) {
          console.error('[cron] Recording recommendation failed:', err);
          await notifyCronError('recomendación de grabación', err);
        }
      },
      {
        timezone: env.CRON_TIMEZONE,
      }
    );

    console.log(
      `[cron] Recording scheduler active: "${env.RECORDING_CRON_SCHEDULE}" (${env.CRON_TIMEZONE})`
    );
  } else {
    console.log(
      '[cron] Recording scheduler is disabled (RECORDING_CRON_ENABLED=false).'
    );
  }

  return {
    postTask: activePostTask,
    recordingTask: activeRecordingTask,
  };
}

export function stopScheduler(): void {
  if (activePostTask) {
    activePostTask.stop();
    activePostTask = null;
  }
  if (activeRecordingTask) {
    activeRecordingTask.stop();
    activeRecordingTask = null;
  }
}

import { buildBrandContextPrompt } from '../config/brandKit.js';
import { requireEnv } from '../config/env.js';
import {
  getLastRecordingMode,
  getRecentRecordingTitles,
  saveRecordingIdea,
  type RecordingIdea,
} from '../db/ideasRepository.js';
import { escapeHtml, getTelegramClient } from '../telegram/telegramClient.js';
import { getAIProvider, type AIProvider } from './provider.js';
import {
  recordingIdeaOutputSchema,
  type RecordingIdeaOutput,
  type RecordingMode,
} from './schemas.js';

export interface RunRecordingAgentInput {
  mode: RecordingMode;
  recentTitles: string[];
}

const MODE_DESCRIPTIONS: Record<RecordingMode, string> = {
  oficina:
    'OFICINA PRESENCIAL: Los dos fundadores grabando en vivo desde su oficina en Emprendelab Autónoma (Popayán): escritorio, laptops, pizarra, café, detrás de escena real construyendo proyectos de software e IA.',
  virtual_duo:
    'VIRTUAL DÚO: Los dos socios grabando en videollamada / pantalla compartida (Meet, Discord o Loom): debate tech rápido, code review real, mostrando un feature funcionando o comparando herramientas.',
};

const SYSTEM_INSTRUCTION = `Eres el director creativo de video corto (Reels / TikTok / Shorts de 30 a 45 segundos) para los dos fundadores de FabSoft (Emprendelab Autónoma, Popayán, Colombia).
Tu trabajo es entregar una recomendación de grabación ultra accionable, fácil de ejecutar en menos de 15 minutos sin equipo de cine (solo celular, luz natural o pantalla compartida), que construya marca personal, autoridad técnica y cercanía (Build in Public + impacto B2B).

${buildBrandContextPrompt()}

FORMATO DE RESPUESTA:
Devuelve EXCLUSIVAMENTE un objeto JSON válido con esta estructura exacta:
{
  "mode": "oficina" | "virtual_duo",
  "title": "Título atractivo del Reel/Video corto",
  "durationSeconds": 35,
  "hook": "Frase o acción exacta de los primeros 3 segundos para frenar el scroll",
  "scriptSteps": [
    "Paso 1 concreto (quién habla o qué se muestra en pantalla)",
    "Paso 2 concreto",
    "Paso 3 concreto"
  ],
  "filmingTip": "Consejo práctico de cámara, encuadre, audio o ritmo para que se vea natural y dinámico",
  "cta": "Llamado a la acción final breve y coherente"
}

REGLAS CRÍTICAS:
1. "durationSeconds" debe estar entre 30 y 45 segundos.
2. "scriptSteps" debe tener entre 3 y 4 pasos concretos y accionables.
3. "mode" DEBE coincidir exactamente con la modalidad solicitada.
4. Todo en español natural de Latinoamérica (Colombia), cercano, auténtico y sin humo.
5. No repitas títulos recientes.`;

export async function runRecordingAgent(
  provider: AIProvider,
  input: RunRecordingAgentInput
): Promise<RecordingIdeaOutput> {
  const recentBlock =
    input.recentTitles.length > 0
      ? `TÍTULOS RECIENTES (NO REPETIR):\n${input.recentTitles.map((t) => `- ${t}`).join('\n')}`
      : 'TÍTULOS RECIENTES: Ninguno todavía.';

  const userPrompt = [
    `MODALIDAD SOLICITADA: "${input.mode}"`,
    MODE_DESCRIPTIONS[input.mode],
    '',
    recentBlock,
    '',
    'Genera una idea fresca, concreta y fácil de grabar hoy mismo.',
  ].join('\n');

  const output = await provider.generateJson({
    systemInstruction: SYSTEM_INSTRUCTION,
    userPrompt,
    schema: recordingIdeaOutputSchema,
    temperature: 0.85,
  });

  return {
    ...output,
    mode: input.mode,
  };
}

export async function resolveNextRecordingMode(
  requestedMode?: RecordingMode | null
): Promise<RecordingMode> {
  if (requestedMode) {
    return requestedMode;
  }
  const lastMode = await getLastRecordingMode();
  return lastMode === 'oficina' ? 'virtual_duo' : 'oficina';
}

export function formatRecordingIdeaMessage(
  idea: RecordingIdea,
  durationSeconds = 40
): string {
  const modeBadge =
    idea.mode === 'oficina'
      ? '🏢 Oficina Presencial (Emprendelab)'
      : '💻 Virtual Dúo (Videollamada / Pantalla)';

  const stepsLines = idea.scriptSteps
    .map((step, idx) => `${idx + 1}. ${escapeHtml(step)}`)
    .join('\n');

  return [
    '🎬 <b>Recomendación de Grabación — Reel / Video Corto</b>',
    `📍 <b>Modalidad:</b> ${modeBadge} · ⏱ ~${durationSeconds}s`,
    '',
    `🔥 <b>${escapeHtml(idea.title)}</b>`,
    '',
    `🪝 <b>Hook (0–3s):</b>\n<i>"${escapeHtml(idea.hook)}"</i>`,
    '',
    '📝 <b>Guion paso a paso:</b>',
    stepsLines,
    '',
    `🎥 <b>Tip de grabación:</b> ${escapeHtml(idea.filmingTip)}`,
    `📣 <b>CTA:</b> ${escapeHtml(idea.cta)}`,
  ].join('\n');
}

export async function generateAndSendRecordingIdea(
  requestedMode?: RecordingMode | null,
  chatId?: string | number,
  provider: AIProvider = getAIProvider()
): Promise<RecordingIdea> {
  const mode = await resolveNextRecordingMode(requestedMode);
  const recentTitles = await getRecentRecordingTitles(15);

  const generated = await runRecordingAgent(provider, { mode, recentTitles });

  const saved = await saveRecordingIdea({
    mode: generated.mode,
    title: generated.title,
    hook: generated.hook,
    scriptSteps: generated.scriptSteps,
    filmingTip: generated.filmingTip,
    cta: generated.cta,
  });

  const telegram = getTelegramClient();
  const targetChatId = chatId ?? requireEnv('TELEGRAM_CHAT_ID');

  await telegram.sendMessage({
    chatId: targetChatId,
    text: formatRecordingIdeaMessage(saved, generated.durationSeconds),
    parseMode: 'HTML',
  });

  return saved;
}

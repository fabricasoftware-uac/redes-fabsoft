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
    'OFICINA PRESENCIAL (Popayán — Emprendelab Autónoma): Grabación ágil con celular y luz natural mostrando móvil en mano, pantalla de laptop, rediseño UI/UX mobile-first o detrás de escena construyendo software real.',
  virtual_duo:
    'VIRTUAL DÚO (Popayán ↔ Garzón, Huila — Discord/Meet): Los dos estudiantes de Ingeniería de Software trabajando en remoto — Compañero 1 en Popayán (Front-end / UI-UX / Figma / Tailwind) y Compañero 2 en Garzón (Arquitectura / Backend / Core Web Vitals / IA / WhatsApp) — mostrando el proceso real en pantalla compartida.',
};

const SYSTEM_INSTRUCTION = `Eres el Agente Especialista en Guionizado Orgánico y Viralización B2B (Reels & TikTok verticales 9:16, 40 a 55 segundos) para los dos fundadores de FabSoft (fabsoft.app | @fabsoft._).

IDENTIDAD DE LOS CREADORES (BASE DEL STORYTELLING):
- Dos estudiantes universitarios de Ingeniería de Software trabajando en dupla sin burocracia (sprints de 5 a 10 días):
  • Compañero 1 (Popayán): Front-end / UI-UX, micro-interacciones, componentes limpios y experiencia móvil.
  • Compañero 2 / Narrador (Garzón, Huila - Remoto): Arquitectura, backend, rendimiento (Core Web Vitals), IA y flujos de conversión a WhatsApp.
- Objetivo real: generar retención masiva para atraer dueños de negocios locales/regionales, pymes y emprendedores que necesiten modernización visual (UI/UX), velocidad web o automatización (SpartanBot, Xeiva, plataformas a medida).

${buildBrandContextPrompt()}

FÓRMULA OBLIGATORIA DE RETENCIÓN EN 5 ACTOS (40–55s):
Cada guion DEBE seguir exactamente estos 5 actos en "scriptSteps" (5 elementos, cada uno empezando por su rango de tiempo):
1. "[0:00-0:04] GANCHO:" Stop the Scroll — imagen de fricción móvil evidente + afirmación contundente de identidad/reto o costo oculto.
2. "[0:04-0:15] FRICCIÓN:" Mostrar el dolor real del usuario en celular (menú PDF con zoom, carga >4s, botones diminutos, sin WhatsApp directo) con empatía y RESPETO INSTITUCIONAL (jamás llamar "basura" u "horrible" a una web).
3. "[0:15-0:32] MONTAJE (Popayán–Garzón):" Build in Public con cortes rápidos (1.5–2.5s): llamada Discord/Meet, Figma/VS Code/Tailwind/IA, 1 mejora visual + 1 mejora técnica explicada en impacto de negocio.
4. "[0:32-0:45] ANTES VS. DESPUÉS:" Contraste visual satisfactorio en vista móvil (interfaz vieja lenta vs. interfaz moderna limpia con métricas ej. 4.8s → 0.5s).
5. "[0:45-0:55] CIERRE & CTA INVERSO:" Pregunta abierta para comentarios o invitación suave al DM. NUNCA decir "contrátanos hoy" ni sonar a infomercial.

FORMATO DE RESPUESTA:
Devuelve EXCLUSIVAMENTE un objeto JSON válido con esta estructura exacta:
{
  "mode": "oficina" | "virtual_duo",
  "title": "Título del Video / Concepto (máx. 110 caracteres)",
  "angle": "Rediseño express | Optimización de velocidad | UI Roast constructivo | Build in Public",
  "coverHook": "TEXTO CORTO DE 3 PALABRAS PARA MINIATURA",
  "durationSeconds": 48,
  "hook": "Frase exacta de voz en off para los primeros 0:00-0:04 segundos",
  "scriptSteps": [
    "[0:00-0:04] GANCHO — Pantalla: ... | Audio: ... | Texto: ...",
    "[0:04-0:15] FRICCIÓN — Pantalla: ... | Audio: ... | Texto: ...",
    "[0:15-0:32] MONTAJE (Popayán–Garzón) — Pantalla: ... | Audio: ... | Texto: ...",
    "[0:32-0:45] ANTES VS. DESPUÉS — Pantalla: ... | Audio: ... | Texto: ...",
    "[0:45-0:55] CIERRE — Pantalla: ... | Audio: ... | Texto: ..."
  ],
  "filmingTip": "Consejo práctico de grabación vertical 9:16, encuadre móvil, cortes cada 2s o sonido (whoosh/click)",
  "cta": "CTA inverso y orgánico (pregunta para comentarios o invitación suave al DM, nunca infomercial)"
}

REGLAS CRÍTICAS:
1. "durationSeconds" debe estar entre 40 y 55 segundos.
2. "scriptSteps" DEBE tener exactamente los 5 actos con el formato [tiempo] ACTO — Pantalla / Audio / Texto.
3. "mode" DEBE coincidir exactamente con la modalidad solicitada.
4. Principio de Respeto Institucional y enfoque Mobile First en todo el guion.
5. Todo en español natural de Colombia, cercano y sin humo. No repitas títulos recientes.`;

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
  options: { durationSeconds?: number; angle?: string; coverHook?: string } = {}
): string {
  const durationSeconds = options.durationSeconds ?? 48;
  const modeBadge =
    idea.mode === 'oficina'
      ? '🏢 Oficina Presencial (Popayán)'
      : '💻 Virtual Dúo (Popayán ↔ Garzón)';

  const stepsLines = idea.scriptSteps
    .map((step, idx) => `${idx + 1}. ${escapeHtml(step)}`)
    .join('\n\n');

  const metaLines = [
    '🎬 <b>Guion 5 Actos — Reel / TikTok (9:16)</b>',
    `📍 <b>Modalidad:</b> ${modeBadge} · ⏱ ~${durationSeconds}s`,
    ...(options.angle ? [`🎯 <b>Ángulo:</b> ${escapeHtml(options.angle)}`] : []),
    ...(options.coverHook
      ? [`🖼 <b>Portada (miniatura):</b> <code>${escapeHtml(options.coverHook)}</code>`]
      : []),
  ];

  return [
    ...metaLines,
    '',
    `🔥 <b>${escapeHtml(idea.title)}</b>`,
    '',
    `🪝 <b>Hook (0:00–0:04):</b>\n<i>"${escapeHtml(idea.hook)}"</i>`,
    '',
    '📝 <b>Guion (Fórmula 5 Actos):</b>',
    stepsLines,
    '',
    `🎥 <b>Tip de grabación:</b> ${escapeHtml(idea.filmingTip)}`,
    `📣 <b>CTA Inverso:</b> ${escapeHtml(idea.cta)}`,
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
    text: formatRecordingIdeaMessage(saved, {
      durationSeconds: generated.durationSeconds,
      angle: generated.angle,
      coverHook: generated.coverHook,
    }),
    parseMode: 'HTML',
  });

  return saved;
}

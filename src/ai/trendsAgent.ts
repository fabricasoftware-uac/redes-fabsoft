import { BRAND_KIT, buildBrandContextPrompt } from '../config/brandKit.js';
import {
  getRecentIdeaTitles,
  saveIdeaSuggestions,
  type IdeaSuggestion,
} from '../db/ideasRepository.js';
import { getRecentTopics } from '../db/postsRepository.js';
import {
  escapeHtml,
  type InlineKeyboardMarkup,
} from '../telegram/telegramClient.js';
import { getAIProvider, type AIProvider } from './provider.js';
import { trendsOutputSchema, type TrendsOutput } from './schemas.js';

export interface RunTrendsAgentInput {
  focus: string | null;
  recentTopics: string[];
}

const NUMBER_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'] as const;

const SYSTEM_INSTRUCTION = `Eres el radar de tendencias y estratega editorial de FabSoft (fabsoft.app).
Tu misión es detectar 4 ideas FRESCAS, concretas y accionables para Instagram basadas en tendencias actuales reales de:
- Inteligencia Artificial aplicada y agentes
- Desarrollo de software moderno (web, móvil, cloud, arquitectura)
- Automatización práctica para pymes y negocios
- Ecosistema tech y startups en Latinoamérica

${buildBrandContextPrompt()}

FORMATO DE RESPUESTA:
Devuelve EXCLUSIVAMENTE un objeto JSON válido con esta estructura exacta:
{
  "ideas": [
    {
      "title": "Título claro, concreto y llamativo de la idea (máximo 110 caracteres)",
      "pillar": "educacion" | "tendencias" | "productos" | "noticias" | "proceso" | "inspiracion",
      "angle": "Ángulo específico de FabSoft: cómo aterrizarlo para empresas o devs en LATAM (máx. 200 caracteres, 1-2 frases directas, sin URLs)",
      "whyTrending": "Por qué este tema es tendencia ahora y genera conversación real (máx. 200 caracteres, 1-2 frases directas, sin URLs ni citas)"
    }
  ]
}

REGLAS CRÍTICAS:
1. Devuelve EXACTAMENTE 4 ideas en el arreglo "ideas".
2. Alterna pilares y públicos (mezcla B2B y comunidad dev) para dar variedad real al equipo.
3. Todo en español natural de Latinoamérica (Colombia), directo y sin humo.
4. Evita repetir cualquier tema de la lista de temas recientes.`;

export async function runTrendsAgent(
  provider: AIProvider,
  input: RunTrendsAgentInput
): Promise<TrendsOutput> {
  const recentBlock =
    input.recentTopics.length > 0
      ? `TEMAS RECIENTES A EVITAR:\n${input.recentTopics.map((t) => `- ${t}`).join('\n')}`
      : 'TEMAS RECIENTES A EVITAR: Ninguno todavía.';

  const focusBlock = input.focus
    ? `ENFOQUE SOLICITADO POR EL EQUIPO:\n"${input.focus}"\nPrioriza tendencias actuales conectadas con este enfoque.`
    : 'ENFOQUE: Radar general de IA, desarrollo de software, automatización para negocios y ecosistema tech LATAM.';

  const today = new Date().toISOString().slice(0, 10);
  const userPrompt = `FECHA ACTUAL: ${today}\n\n${focusBlock}\n\n${recentBlock}\n\nPropón 4 ideas frescas y actuales.`;

  return provider.generateJson({
    systemInstruction: SYSTEM_INSTRUCTION,
    userPrompt,
    schema: trendsOutputSchema,
    temperature: 0.85,
    useWebSearch: true,
  });
}

export async function generateAndSaveTrendIdeas(
  focus: string | null,
  provider: AIProvider = getAIProvider()
): Promise<IdeaSuggestion[]> {
  const [recentPosts, recentIdeas] = await Promise.all([
    getRecentTopics(15),
    getRecentIdeaTitles(20),
  ]);

  const recentTopics = [...recentPosts, ...recentIdeas];
  const output = await runTrendsAgent(provider, { focus, recentTopics });

  return saveIdeaSuggestions(
    output.ideas.map((item) => ({
      title: item.title,
      pillar: item.pillar,
      angle: item.angle,
      whyTrending: item.whyTrending,
    }))
  );
}

export function formatTrendsMessage(
  ideas: IdeaSuggestion[],
  focus: string | null
): string {
  const header = focus
    ? `🔥 <b>Tendencias FabSoft</b> · <i>${escapeHtml(focus)}</i>`
    : '🔥 <b>4 Tendencias Frescas para FabSoft</b>';

  const blocks = ideas.map((idea, index) => {
    const num = NUMBER_EMOJIS[index] ?? `${index + 1}.`;
    const pillarLabel = BRAND_KIT.pillars[idea.pillar]?.label ?? idea.pillar;
    return [
      `${num} <b>${escapeHtml(idea.title)}</b>`,
      `🏷 <i>${escapeHtml(pillarLabel)}</i>`,
      `📈 <b>Por qué es tendencia:</b> ${escapeHtml(idea.whyTrending)}`,
      `🎯 <b>Ángulo FabSoft:</b> ${escapeHtml(idea.angle)}`,
    ].join('\n');
  });

  return [
    header,
    '',
    ...blocks.flatMap((block, idx) => (idx === 0 ? [block] : ['', block])),
    '',
    '👇 <i>Elige una idea para generar automáticamente el post completo (copy + arte 4:5):</i>',
  ].join('\n');
}

export function buildTrendsKeyboard(
  ideas: IdeaSuggestion[]
): InlineKeyboardMarkup {
  const row1 = ideas.slice(0, 2).map((idea, i) => ({
    text: `${NUMBER_EMOJIS[i]} Generar #${i + 1}`,
    callback_data: `pick_idea:${idea.id}`,
  }));

  const row2 = ideas.slice(2, 4).map((idea, i) => ({
    text: `${NUMBER_EMOJIS[i + 2]} Generar #${i + 3}`,
    callback_data: `pick_idea:${idea.id}`,
  }));

  const inline_keyboard = [
    ...(row1.length > 0 ? [row1] : []),
    ...(row2.length > 0 ? [row2] : []),
    [{ text: '🔄 Nuevas tendencias', callback_data: 'refresh_trends' }],
  ];

  return { inline_keyboard };
}

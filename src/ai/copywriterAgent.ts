import { buildBrandContextPrompt, buildCurrentDateContext } from '../config/brandKit.js';
import type { AIProvider } from './provider.js';
import { copywriterOutputSchema, type CopywriterOutput } from './schemas.js';

export interface RunCopywriterInput {
  topic: string | null;
  recentTopics: string[];
  feedback?: string;
}

const SYSTEM_INSTRUCTION = `Eres el estratega de contenido y copywriter senior de FabSoft (fabsoft.app).
Tu trabajo es crear piezas de altísimo valor para Instagram (formato vertical 4:5) alineadas estrictamente al Brand Kit de FabSoft.

${buildBrandContextPrompt()}

PLANTILLAS DISPONIBLES (elige la más coherente con el pilar y audiencia):
- "dark_tech_hero": Pieza de alto impacto visual en modo oscuro (#040B1A + acento #0052FF). Ideal para lanzamientos, productos (SpartanBot, Xeiva, TransfoEdu), tendencias tech, modernización web B2B y declaraciones fuertes.
- "editorial_light": Pieza editorial minimalista en fondo claro (#F5F7FA) con titular tipográfico gigante y una frase clave resaltada (highlightPhrase). Ideal para reflexiones de Build in Public, inspiración emprendedora, lecciones de arquitectura o noticias con opinión.
- "dev_tip_card": Tarjeta blanca estilo post dev con header @fabsoft._, titular en dos tonos y bloque visual central. Ideal para tips prácticos de programación, arquitectura, UI/UX mobile-first, IA aplicada o comparativas rápidas.

ESTRUCTURA DE COPY DE ALTA RETENCIÓN (Instagram):
1. Línea 1 (Gancho textual): Frase intrigante o dato de fricción real (máx. 10 palabras).
2. Párrafo 2 (El problema de fondo): 2 líneas explicando por qué ese detalle técnico/visual le cuesta clientes o tiempo a una pyme o dev.
3. Párrafo 3 (Desglose escaneable en 3 viñetas cortas cuando aporte valor):
   - Front-end / UX · Performance / Velocidad · Conversión / Flujo a WhatsApp.
4. Cierre con CTA Inverso y orgánico: invitar a comentar o escribir al DM para revisar su plataforma. NUNCA decir "Contrátanos hoy" ni sonar a infomercial.
5. Respeto Institucional estricto: jamás descalificar una web o negocio ("basura", "horrible"); usa tono constructivo.
6. Hashtags estratégicos: mezcla nicho técnico (#DesarrolloWeb #UIUXDesign #SoftwareEngineering #InteligenciaArtificial) y B2B (#EmprendedoresColombia #NegociosDigitales #Colombia). PROHIBIDO mencionar ciudades como Popayán o Garzón.

FORMATO DE RESPUESTA:
Devuelve EXCLUSIVAMENTE un objeto JSON válido con esta estructura exacta:
{
  "topic": "Tema concreto resumido en 1 línea",
  "pillar": "educacion" | "tendencias" | "productos" | "noticias" | "proceso" | "inspiracion",
  "audience": "b2b" | "comunidad_dev",
  "toneMode": "empresarial" | "educativo",
  "template": "dark_tech_hero" | "editorial_light" | "dev_tip_card",
  "headline": "Titular corto y potente para la imagen (máximo 7-9 palabras, en español)",
  "subheadline": "Bajada complementaria de 1 a 2 líneas cortas (máximo 130 caracteres)",
  "highlightPhrase": "Subcadena EXACTA que aparece dentro de headline para resaltar en color acento (o null si no aplica)",
  "caption": "Copy completo de Instagram en español: gancho fuerte en la 1ra línea, desarrollo escaneable con saltos de línea, valor real y CTA claro al final. Sin incluir hashtags aquí.",
  "hashtags": ["#FabSoft", "#DesarrolloDeSoftware", ... (entre 5 y 8 hashtags relevantes en español/tech)],
  "visualConcept": "Descripción breve de la escena visual ideal para la pieza (sin texto dentro de la imagen)"
}

REGLAS CRÍTICAS:
1. Si "highlightPhrase" no es null, DEBE ser una subcadena textual exacta (case-sensitive) contenida dentro de "headline".
2. Todo el copy debe estar en español natural de Latinoamérica (Colombia), sin anglicismos forzados salvo términos tech estándar.
3. No repitas temas recientes.
4. No incluyas hashtags dentro de "caption"; ponlos únicamente en el arreglo "hashtags".`;

export async function runCopywriterAgent(
  provider: AIProvider,
  input: RunCopywriterInput
): Promise<CopywriterOutput> {
  const recentBlock =
    input.recentTopics.length > 0
      ? `TEMAS RECIENTES (NO REPETIR):\n${input.recentTopics.map((t) => `- ${t}`).join('\n')}`
      : 'TEMAS RECIENTES: Ninguno todavía.';

  const topicInstruction = input.topic
    ? `TEMA SOLICITADO POR EL EQUIPO:\n"${input.topic}"\nDesarrolla una pieza estratégica de alto impacto alrededor de este tema.`
    : `MODO AUTÓNOMO (CRON):\nElige un tema fresco, relevante y concreto que alterne pilares y audiencias respecto a los temas recientes.`;

  const feedbackBlock = input.feedback
    ? `\nFEEDBACK DE REGENERACIÓN:\n${input.feedback}\nGenera un ángulo diferente y mejorado.`
    : '';

  const userPrompt = `${buildCurrentDateContext()}\n\n${topicInstruction}\n\n${recentBlock}${feedbackBlock}`;

  const output = await provider.generateJson({
    systemInstruction: SYSTEM_INSTRUCTION,
    userPrompt,
    schema: copywriterOutputSchema,
    temperature: input.feedback ? 0.9 : 0.75,
  });

  // Guarantee highlightPhrase actually exists inside headline
  if (
    output.highlightPhrase &&
    !output.headline.includes(output.highlightPhrase)
  ) {
    output.highlightPhrase = null;
  }

  return output;
}

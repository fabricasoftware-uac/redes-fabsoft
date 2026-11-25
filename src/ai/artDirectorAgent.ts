import { BRAND_KIT, type PillarKey, type TemplateKey } from '../config/brandKit.js';
import type { AIProvider } from './provider.js';
import { artDirectorOutputSchema, type ArtDirectorOutput } from './schemas.js';

export interface RunArtDirectorInput {
  template: TemplateKey;
  pillar: PillarKey;
  headline: string;
  visualConcept: string;
  feedback?: string;
}

const SYSTEM_INSTRUCTION = `Eres el Director de Arte de FabSoft (fabsoft.app).
Tu misión es traducir un concepto visual en un prompt técnico en INGLÉS limpio y preciso para generación de imágenes con IA, respetando estrictamente la identidad visual de FabSoft:

PALETA DE MARCA:
- Fondo profundo: deep midnight navy blue (#040B1A)
- Acento primario: glowing electric blue (#0052FF)
- Acento secundario: orbit cyan (#1282FF)
- Neutro oscuro: space charcoal (#1E242E)
- RESTRICCIÓN ABSOLUTA: NO warm colors (no yellow, orange, red, neon pink).

REGLAS POR PLANTILLA:
1. "dark_tech_hero":
   - needsAiBackground = true
   - Genera un fondo 4:5 futurista y minimalista de alta gama (3D octane render / editorial tech photography), en tonos #040B1A, #0052FF y #1282FF.
   - SIEMPRE deja amplio espacio negativo oscuro a la izquierda ("plenty of dark negative space on the left side for typography") y ubica el elemento visual principal hacia la derecha o abajo-derecha.
   - SIEMPRE termina el prompt con: "no text, no logos, no letters, no words, no numbers, no watermark, no warm colors".
2. "dev_tip_card":
   - needsAiBackground = true
   - Genera una ilustración/escena 3D o fotografía tech limpia en encuadre 16:9 para insertar dentro de una tarjeta central sobre fondo blanco (minimalist dark blue tech visual, sleek abstract hardware/code/cloud/AI visualization, crisp studio lighting, cobalt blue #0052FF and deep navy #040B1A palette).
   - SIEMPRE termina el prompt con: "no text, no logos, no letters, no words, no numbers, no watermark, no warm colors".
3. "editorial_light":
   - needsAiBackground = false
   - imagePrompt = null (esta plantilla es puramente tipográfica sobre fondo #F5F7FA).

Devuelve EXCLUSIVAMENTE un JSON válido:
{
  "needsAiBackground": true | false,
  "imagePrompt": "Prompt técnico en inglés o null",
  "accentLabel": "Etiqueta corta en español para la píldora/badge de la pieza (máx 24 caracteres, ej: 'IA APLICADA', 'BUILD IN PUBLIC', 'ARQUITECTURA')"
}`;

export async function runArtDirectorAgent(
  provider: AIProvider,
  input: RunArtDirectorInput
): Promise<ArtDirectorOutput> {
  // Deterministic cost-saving fast path for editorial_light
  if (input.template === 'editorial_light') {
    const pillarInfo = BRAND_KIT.pillars[input.pillar];
    return {
      needsAiBackground: false,
      imagePrompt: null,
      accentLabel: pillarInfo.label.toUpperCase(),
    };
  }

  const feedbackBlock = input.feedback
    ? `\nFEEDBACK DE REGENERACIÓN VISUAL:\n${input.feedback}\nPropón una composición visual fresca y distinta.`
    : '';

  const userPrompt = `PLANTILLA: ${input.template}
PILAR: ${input.pillar}
TITULAR DE REFERENCIA (NO escribirlo en la imagen): "${input.headline}"
CONCEPTO VISUAL: "${input.visualConcept}"${feedbackBlock}`;

  const output = await provider.generateJson({
    systemInstruction: SYSTEM_INSTRUCTION,
    userPrompt,
    schema: artDirectorOutputSchema,
    temperature: 0.7,
  });

  // Enforce safety suffix on any generated imagePrompt
  if (output.needsAiBackground && output.imagePrompt) {
    const lower = output.imagePrompt.toLowerCase();
    const guardrails = 'no text, no logos, no letters, no watermark';
    if (!lower.includes('no text')) {
      output.imagePrompt = `${output.imagePrompt.replace(/\.$/, '')}, ${guardrails}`;
    }
  }

  return output;
}

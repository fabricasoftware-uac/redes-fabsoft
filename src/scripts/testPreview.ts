import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  composePostImage,
  type ComposePostImageInput,
} from '../media/compositor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, '../../preview-output');

const SAMPLES: Array<{ filename: string; input: ComposePostImageInput }> = [
  {
    filename: 'dark_tech_hero.jpg',
    input: {
      template: 'dark_tech_hero',
      pillar: 'productos',
      headline: 'Tu WhatsApp atendiendo y agendando 24/7 con IA',
      subheadline:
        'SpartanBot automatiza reservas, responde preguntas frecuentes y escala tus ventas sin perder el trato humano.',
      accentLabel: 'SPARTANBOT · IA',
      aiBackgroundBuffer: null,
    },
  },
  {
    filename: 'editorial_light.jpg',
    input: {
      template: 'editorial_light',
      pillar: 'proceso',
      headline: 'Empezamos FabSoft entre clases de Ingeniería de Software',
      subheadline:
        'Sin plantillas ni intermediarios: código 100% del cliente y una versión real funcionando cada viernes.',
      highlightPhrase: 'entre clases',
      accentLabel: 'BUILD IN PUBLIC',
      aiBackgroundBuffer: null,
    },
  },
  {
    filename: 'dev_tip_card.jpg',
    input: {
      template: 'dev_tip_card',
      pillar: 'educacion',
      headline: '3 errores de arquitectura que frenan tu primera app',
      subheadline:
        'Evita mezclar lógica de negocio en tus rutas y valida siempre tus contratos con Zod desde el día uno.',
      highlightPhrase: '3 errores de arquitectura',
      accentLabel: 'DEV TIP · ARQUITECTURA',
      aiBackgroundBuffer: null,
    },
  },
];

async function main(): Promise<void> {
  await mkdir(OUTPUT_DIR, { recursive: true });

  console.log(`\nGenerating 3 local Instagram 4:5 (1080x1350) previews in ${OUTPUT_DIR}...\n`);

  for (const sample of SAMPLES) {
    const buffer = await composePostImage(sample.input);
    const outPath = path.join(OUTPUT_DIR, sample.filename);
    await writeFile(outPath, buffer);

    const meta = await sharp(buffer).metadata();
    const sizeKb = (buffer.byteLength / 1024).toFixed(1);

    if (
      meta.format !== 'jpeg' ||
      meta.width !== CANVAS_WIDTH ||
      meta.height !== CANVAS_HEIGHT ||
      meta.space !== 'srgb'
    ) {
      throw new Error(
        `Invalid image metadata for ${sample.filename}: ${JSON.stringify({
          format: meta.format,
          width: meta.width,
          height: meta.height,
          space: meta.space,
        })}`
      );
    }

    console.log(
      `✅ ${sample.filename} — ${meta.format.toUpperCase()} ${meta.width}x${meta.height} (${meta.space}) · ${sizeKb} KB`
    );
  }

  console.log('\nAll 3 previews generated and verified successfully!\n');
}

main().catch((err) => {
  console.error('[preview:local] Failed:', err);
  process.exit(1);
});

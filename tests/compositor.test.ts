import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  composePostImage,
} from '../src/media/compositor.js';

const MAX_INSTAGRAM_BYTES = 8 * 1024 * 1024;

async function assertValidInstagramJpeg(buffer: Buffer): Promise<void> {
  expect(Buffer.isBuffer(buffer)).toBe(true);
  expect(buffer.byteLength).toBeGreaterThan(10_000);
  expect(buffer.byteLength).toBeLessThan(MAX_INSTAGRAM_BYTES);

  const metadata = await sharp(buffer).metadata();
  expect(metadata.format).toBe('jpeg');
  expect(metadata.space).toBe('srgb');
  expect(metadata.width).toBe(CANVAS_WIDTH);
  expect(metadata.height).toBe(CANVAS_HEIGHT);
}

describe('composePostImage (Satori + Resvg + Sharp)', () => {
  it('renders dark_tech_hero without AI background as 1080x1350 sRGB JPEG < 8 MB', async () => {
    const buffer = await composePostImage({
      template: 'dark_tech_hero',
      pillar: 'tendencias',
      headline: 'Software a medida que escala con tu operación',
      subheadline:
        'Diseñamos plataformas web, móviles y automatizaciones con IA listas para producción.',
      accentLabel: 'TENDENCIAS',
    });

    await assertValidInstagramJpeg(buffer);
  }, 15_000);

  it('renders dark_tech_hero with an AI background buffer as 1080x1350 sRGB JPEG < 8 MB', async () => {
    const syntheticBg = await sharp({
      create: {
        width: 1024,
        height: 1024,
        channels: 3,
        background: { r: 6, g: 24, b: 64 },
      },
    })
      .png()
      .toBuffer();

    const buffer = await composePostImage({
      template: 'dark_tech_hero',
      pillar: 'productos',
      headline: 'Lanza tu producto digital sin deuda técnica',
      subheadline: 'Arquitectura modular, CI/CD y observabilidad desde el día uno.',
      accentLabel: 'PRODUCTOS',
      aiBackgroundBuffer: syntheticBg,
    });

    await assertValidInstagramJpeg(buffer);
  }, 15_000);

  it('renders editorial_light with highlightPhrase as 1080x1350 sRGB JPEG < 8 MB', async () => {
    const buffer = await composePostImage({
      template: 'editorial_light',
      pillar: 'proceso',
      headline: 'Por qué entregamos valor real cada semana',
      highlightPhrase: 'valor real',
      subheadline:
        'Sprints cortos, pruebas automatizadas y visibilidad total para tu equipo directivo.',
      accentLabel: 'PROCESO',
    });

    await assertValidInstagramJpeg(buffer);
  }, 15_000);

  it('renders dev_tip_card with and without card image as 1080x1350 sRGB JPEG < 8 MB', async () => {
    const bufferWithoutBg = await composePostImage({
      template: 'dev_tip_card',
      pillar: 'educacion',
      headline: 'Valida tus contratos con Zod en los bordes',
      highlightPhrase: 'Zod',
      subheadline:
        'Evita errores silenciosos en producción validando webhooks y respuestas de LLMs.',
      accentLabel: 'DEV TIP',
    });

    await assertValidInstagramJpeg(bufferWithoutBg);

    const syntheticCard = await sharp({
      create: {
        width: 944,
        height: 540,
        channels: 3,
        background: { r: 0, g: 82, b: 255 },
      },
    })
      .jpeg()
      .toBuffer();

    const bufferWithBg = await composePostImage({
      template: 'dev_tip_card',
      pillar: 'educacion',
      headline: 'Idempotencia atómica en PostgreSQL',
      subheadline: 'Usa UPDATE ... WHERE status = ... RETURNING * para evitar duplicados.',
      accentLabel: 'ARQUITECTURA',
      aiBackgroundBuffer: syntheticCard,
    });

    await assertValidInstagramJpeg(bufferWithBg);
  }, 15_000);
});

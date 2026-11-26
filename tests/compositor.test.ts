import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  composeCarouselSlides,
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

describe('composeCarouselSlides (5-slide 30X x FabSoft)', () => {
  const sampleCarousel = {
    topic: '3 errores de rendimiento web en negocios locales',
    pillar: 'educacion' as const,
    audience: 'b2b' as const,
    toneMode: 'educativo' as const,
    coverHeadline: '3 detalles que hacen lenta tu web en celular',
    coverHighlight: 'lenta tu web',
    coverSubtitle: 'Guía rápida Mobile First para convertir visitas en mensajes reales.',
    slides: [
      {
        number: '01' as const,
        highlight: 'Imágenes sin comprimir',
        heading: 'Subir fotos de 6 MB directo desde la cámara frena todo',
        body: 'Convierte tus recursos a WebP o JPEG optimizado y ajusta el tamaño real al contenedor móvil.',
      },
      {
        number: '02' as const,
        highlight: 'Menús en PDF pesado',
        heading: 'Obligar a descargar un archivo rompe la experiencia táctil',
        body: 'Una vista web responsiva carga al instante y permite buscar o escribir a WhatsApp en un toque.',
      },
      {
        number: '03' as const,
        highlight: 'Sin botón directo',
        heading: 'Si el cliente busca tu contacto por 20 segundos, se va',
        body: 'Ubica un llamado a la acción claro en el primer pantallazo con mensaje prellenado.',
      },
    ],
    closingHeadline: 'Pequeños ajustes técnicos, gran impacto en ventas',
    closingBody:
      'Construimos interfaces rápidas y código propio cada semana desde Popayán y Garzón.',
    closingCta: 'Guarda este carrusel o envíanos tu web por DM para revisarla juntos.',
    caption:
      'La mayoría de tus clientes te visitan desde el celular con datos móviles. Revisa estos 3 puntos hoy mismo.',
    hashtags: [
      '#FabSoft',
      '#Popayán',
      '#DesarrolloWeb',
      '#UIUXDesign',
      '#EmprendedoresColombia',
    ],
  };

  it('renders 5 valid 1080x1350 sRGB JPEGs in educativo (light cover) mode', async () => {
    const buffers = await composeCarouselSlides(sampleCarousel);
    expect(buffers).toHaveLength(5);

    for (const buf of buffers) {
      await assertValidInstagramJpeg(buf);
    }
  }, 25_000);

  it('renders 5 valid 1080x1350 sRGB JPEGs in empresarial (dark cover) mode', async () => {
    const buffers = await composeCarouselSlides({
      ...sampleCarousel,
      toneMode: 'empresarial',
    });
    expect(buffers).toHaveLength(5);

    for (const buf of buffers) {
      await assertValidInstagramJpeg(buf);
    }
  }, 25_000);
});

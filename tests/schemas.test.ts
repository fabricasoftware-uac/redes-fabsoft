import { describe, expect, it } from 'vitest';
import {
  artDirectorOutputSchema,
  copywriterOutputSchema,
  recordingIdeaOutputSchema,
  trendsOutputSchema,
} from '../src/ai/schemas.js';

const validCopywriterPayload = {
  topic: 'Arquitectura limpia en microservicios Node.js',
  pillar: 'educacion',
  audience: 'comunidad_dev',
  toneMode: 'educativo',
  template: 'dev_tip_card',
  headline: 'Desacopla tu dominio antes de escalar',
  subheadline: 'Separar reglas de negocio de infraestructura evita reescrituras costosas.',
  caption:
    'Cuando tu lógica de negocio depende directamente del framework o la base de datos, cada cambio se vuelve riesgoso. Empieza con puertos y adaptadores simples.',
  hashtags: ['FabSoft', '#TypeScript', 'arquitectura limpia', '#NodeJS'],
  visualConcept: 'Tarjeta limpia con diagrama minimalista de capas en azul eléctrico.',
};

describe('copywriterOutputSchema', () => {
  it('accepts a valid payload, applies default highlightPhrase and normalizes hashtags', () => {
    const parsed = copywriterOutputSchema.parse(validCopywriterPayload);

    expect(parsed.pillar).toBe('educacion');
    expect(parsed.template).toBe('dev_tip_card');
    expect(parsed.highlightPhrase).toBeNull();
    expect(parsed.hashtags).toEqual([
      '#FabSoft',
      '#TypeScript',
      '#arquitecturalimpia',
      '#NodeJS',
    ]);
  });

  it('accepts an explicit highlightPhrase within length limits', () => {
    const parsed = copywriterOutputSchema.parse({
      ...validCopywriterPayload,
      highlightPhrase: 'Desacopla tu dominio',
    });

    expect(parsed.highlightPhrase).toBe('Desacopla tu dominio');
  });

  it('rejects invalid enum values for pillar, audience, toneMode or template', () => {
    expect(
      copywriterOutputSchema.safeParse({
        ...validCopywriterPayload,
        pillar: 'ventas_directas',
      }).success
    ).toBe(false);

    expect(
      copywriterOutputSchema.safeParse({
        ...validCopywriterPayload,
        audience: 'general',
      }).success
    ).toBe(false);

    expect(
      copywriterOutputSchema.safeParse({
        ...validCopywriterPayload,
        toneMode: 'informal',
      }).success
    ).toBe(false);

    expect(
      copywriterOutputSchema.safeParse({
        ...validCopywriterPayload,
        template: 'neon_cyberpunk',
      }).success
    ).toBe(false);
  });

  it('rejects headlines, captions and hashtags outside allowed bounds', () => {
    expect(
      copywriterOutputSchema.safeParse({
        ...validCopywriterPayload,
        headline: 'Hi',
      }).success
    ).toBe(false);

    expect(
      copywriterOutputSchema.safeParse({
        ...validCopywriterPayload,
        headline: 'A'.repeat(111),
      }).success
    ).toBe(false);

    expect(
      copywriterOutputSchema.safeParse({
        ...validCopywriterPayload,
        caption: 'Demasiado corto',
      }).success
    ).toBe(false);

    expect(
      copywriterOutputSchema.safeParse({
        ...validCopywriterPayload,
        hashtags: ['#Uno', '#Dos'],
      }).success
    ).toBe(false);

    expect(
      copywriterOutputSchema.safeParse({
        ...validCopywriterPayload,
        hashtags: Array.from({ length: 13 }, (_, i) => `#Tag${i}`),
      }).success
    ).toBe(false);
  });
});

describe('artDirectorOutputSchema', () => {
  it('accepts valid payloads with and without AI background', () => {
    const withBg = artDirectorOutputSchema.parse({
      needsAiBackground: true,
      imagePrompt: 'Minimalist dark blue glass geometric nodes with electric cyan glow',
      accentLabel: 'TENDENCIAS IA',
    });
    expect(withBg.needsAiBackground).toBe(true);
    expect(withBg.imagePrompt).toContain('glass geometric');

    const withoutBg = artDirectorOutputSchema.parse({
      needsAiBackground: false,
      imagePrompt: null,
      accentLabel: 'EDUCACIÓN',
    });
    expect(withoutBg.needsAiBackground).toBe(false);
    expect(withoutBg.imagePrompt).toBeNull();
  });

  it('rejects invalid accentLabel, oversized imagePrompt or non-boolean flag', () => {
    expect(
      artDirectorOutputSchema.safeParse({
        needsAiBackground: 'yes',
        imagePrompt: null,
        accentLabel: 'DEV',
      }).success
    ).toBe(false);

    expect(
      artDirectorOutputSchema.safeParse({
        needsAiBackground: false,
        imagePrompt: null,
        accentLabel: 'A',
      }).success
    ).toBe(false);

    expect(
      artDirectorOutputSchema.safeParse({
        needsAiBackground: true,
        imagePrompt: 'X'.repeat(1201),
        accentLabel: 'TENDENCIAS',
      }).success
    ).toBe(false);
  });
});

describe('trendsOutputSchema', () => {
  const validTrendIdea = {
    title: 'Agentes de IA para atención en WhatsApp B2B',
    pillar: 'tendencias' as const,
    angle: 'Cómo SpartanBot automatiza agendamiento y ventas 24/7 para pymes en LATAM.',
    whyTrending: 'Creciente adopción de asistentes autónomos en comercios y clínicas locales.',
  };

  it('accepts exactly 4 valid trend ideas', () => {
    const parsed = trendsOutputSchema.parse({
      ideas: [
        validTrendIdea,
        { ...validTrendIdea, title: 'PWAs offline-first para restaurantes', pillar: 'productos' },
        { ...validTrendIdea, title: 'Arquitectura limpia con TypeScript', pillar: 'educacion' },
        { ...validTrendIdea, title: 'Construir una startup desde Popayán', pillar: 'proceso' },
      ],
    });

    expect(parsed.ideas).toHaveLength(4);
    expect(parsed.ideas[0]?.pillar).toBe('tendencias');
  });

  it('rejects fewer or more than 4 ideas or invalid pillars', () => {
    expect(
      trendsOutputSchema.safeParse({ ideas: [validTrendIdea, validTrendIdea] }).success
    ).toBe(false);

    expect(
      trendsOutputSchema.safeParse({
        ideas: [
          validTrendIdea,
          validTrendIdea,
          validTrendIdea,
          { ...validTrendIdea, pillar: 'otro_pilar' },
        ],
      }).success
    ).toBe(false);
  });
});

describe('recordingIdeaOutputSchema', () => {
  const validRecordingPayload = {
    mode: 'oficina' as const,
    title: 'Cómo entregamos una versión funcional cada viernes',
    durationSeconds: 35,
    hook: '¿Pagaste por software y llevas 3 meses sin ver nada funcionando?',
    scriptSteps: [
      'Socio 1 frente a la pizarra explica el problema de los proyectos interminables.',
      'Socio 2 gira la cámara al monitor mostrando un deploy real en staging.',
      'Ambos cierran explicando el método de entregas semanales de FabSoft.',
    ],
    filmingTip: 'Grabar con luz natural cerca a la ventana en Emprendelab, plano medio dinámico.',
    cta: 'Agenda un diagnóstico gratis en fabsoft.app.',
  };

  it('accepts valid oficina and virtual_duo recording ideas', () => {
    const oficina = recordingIdeaOutputSchema.parse(validRecordingPayload);
    expect(oficina.mode).toBe('oficina');
    expect(oficina.scriptSteps).toHaveLength(3);

    const virtual = recordingIdeaOutputSchema.parse({
      ...validRecordingPayload,
      mode: 'virtual_duo',
      durationSeconds: '45',
      scriptSteps: [...validRecordingPayload.scriptSteps, 'Cierre con pantalla compartida.'],
    });
    expect(virtual.mode).toBe('virtual_duo');
    expect(virtual.durationSeconds).toBe(45);
    expect(virtual.scriptSteps).toHaveLength(4);
  });

  it('rejects invalid mode, duration out of bounds or wrong scriptSteps count', () => {
    expect(
      recordingIdeaOutputSchema.safeParse({
        ...validRecordingPayload,
        mode: 'estudio_tv',
      }).success
    ).toBe(false);

    expect(
      recordingIdeaOutputSchema.safeParse({
        ...validRecordingPayload,
        durationSeconds: 10,
      }).success
    ).toBe(false);

    expect(
      recordingIdeaOutputSchema.safeParse({
        ...validRecordingPayload,
        scriptSteps: ['Solo un paso muy corto', 'Y otro paso corto'],
      }).success
    ).toBe(false);

    expect(
      recordingIdeaOutputSchema.safeParse({
        ...validRecordingPayload,
        scriptSteps: [
          'Paso 1 concreto',
          'Paso 2 concreto',
          'Paso 3 concreto',
          'Paso 4 concreto',
          'Paso 5 concreto',
          'Paso 6 extra',
        ],
      }).success
    ).toBe(false);
  });
});

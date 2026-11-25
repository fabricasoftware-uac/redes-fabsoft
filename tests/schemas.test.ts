import { describe, expect, it } from 'vitest';
import {
  artDirectorOutputSchema,
  copywriterOutputSchema,
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

import { z } from 'zod';

export const pillarSchema = z.enum([
  'educacion',
  'tendencias',
  'productos',
  'noticias',
  'proceso',
  'inspiracion',
]);

export const audienceSchema = z.enum(['b2b', 'comunidad_dev']);

export const toneModeSchema = z.enum(['empresarial', 'educativo']);

export const templateSchema = z.enum([
  'dark_tech_hero',
  'editorial_light',
  'dev_tip_card',
]);

export const copywriterOutputSchema = z.object({
  topic: z.string().min(3).max(200),
  pillar: pillarSchema,
  audience: audienceSchema,
  toneMode: toneModeSchema,
  template: templateSchema,
  headline: z.string().min(4).max(110),
  subheadline: z.string().min(4).max(180),
  highlightPhrase: z.string().max(60).nullable().default(null),
  caption: z.string().min(20).max(2100),
  hashtags: z
    .array(
      z
        .string()
        .min(2)
        .max(40)
        .transform((tag) => (tag.startsWith('#') ? tag : `#${tag.replace(/\s+/g, '')}`))
    )
    .min(3)
    .max(12),
  visualConcept: z.string().min(10).max(400),
});

export type CopywriterOutput = z.infer<typeof copywriterOutputSchema>;

export const artDirectorOutputSchema = z.object({
  needsAiBackground: z.boolean(),
  imagePrompt: z.string().max(1200).nullable(),
  accentLabel: z.string().min(2).max(40),
});

export type ArtDirectorOutput = z.infer<typeof artDirectorOutputSchema>;

const trimmedMax = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .transform((val) =>
      val.length > max ? `${val.slice(0, max - 1).trimEnd()}…` : val
    );

export const trendIdeaItemSchema = z.object({
  title: trimmedMax(5, 160),
  pillar: pillarSchema,
  angle: trimmedMax(10, 420),
  whyTrending: trimmedMax(10, 420),
});

export type TrendIdeaItem = z.infer<typeof trendIdeaItemSchema>;

export const trendsOutputSchema = z.object({
  ideas: z.array(trendIdeaItemSchema).length(4),
});

export type TrendsOutput = z.infer<typeof trendsOutputSchema>;

export const recordingModeSchema = z.enum(['oficina', 'virtual_duo']);

export type RecordingMode = z.infer<typeof recordingModeSchema>;

export const recordingIdeaOutputSchema = z.object({
  mode: recordingModeSchema,
  title: trimmedMax(5, 160),
  angle: trimmedMax(5, 120).optional().default('Build in Public / Modernización Web'),
  coverHook: trimmedMax(3, 60).optional().default('ANTES VS DESPUÉS'),
  durationSeconds: z.coerce.number().int().min(20).max(90),
  hook: trimmedMax(8, 320),
  scriptSteps: z.array(trimmedMax(5, 420)).min(3).max(5),
  filmingTip: trimmedMax(8, 420),
  cta: trimmedMax(5, 280),
});

export type RecordingIdeaOutput = z.infer<typeof recordingIdeaOutputSchema>;

export const carouselSlideSchema = z.object({
  number: z.enum(['01', '02', '03', '04']),
  highlight: trimmedMax(4, 70),
  heading: trimmedMax(5, 110),
  body: trimmedMax(10, 220),
});

export type CarouselSlide = z.infer<typeof carouselSlideSchema>;

export const carouselOutputSchema = z.object({
  topic: trimmedMax(3, 200),
  pillar: pillarSchema,
  audience: audienceSchema,
  toneMode: toneModeSchema,
  coverHeadline: trimmedMax(5, 100),
  coverHighlight: trimmedMax(3, 50).nullable().default(null),
  coverSubtitle: trimmedMax(5, 140),
  slides: z.array(carouselSlideSchema).min(3).max(4),
  closingHeadline: trimmedMax(5, 100),
  closingBody: trimmedMax(10, 180),
  closingCta: trimmedMax(5, 120),
  caption: trimmedMax(20, 2100),
  hashtags: z
    .array(
      z
        .string()
        .trim()
        .min(2)
        .max(40)
        .transform((tag) => (tag.startsWith('#') ? tag : `#${tag.replace(/\s+/g, '')}`))
    )
    .min(5)
    .max(8),
});

export type CarouselOutput = z.infer<typeof carouselOutputSchema>;

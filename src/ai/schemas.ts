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

export const trendIdeaItemSchema = z.object({
  title: z.string().min(5).max(140),
  pillar: pillarSchema,
  angle: z.string().min(10).max(260),
  whyTrending: z.string().min(10).max(260),
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
  title: z.string().min(5).max(140),
  durationSeconds: z.coerce.number().int().min(20).max(90),
  hook: z.string().min(8).max(240),
  scriptSteps: z.array(z.string().min(5).max(280)).min(3).max(4),
  filmingTip: z.string().min(8).max(300),
  cta: z.string().min(5).max(220),
});

export type RecordingIdeaOutput = z.infer<typeof recordingIdeaOutputSchema>;

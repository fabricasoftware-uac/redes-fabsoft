import { GoogleGenAI, Modality } from '@google/genai';
import type { ZodType, ZodTypeDef } from 'zod';
import { getEnv, requireEnv } from '../config/env.js';

export type ImageAspectRatio = '4:5' | '1:1' | '16:9' | '9:16';

export interface GenerateJsonParams<T> {
  systemInstruction: string;
  userPrompt: string;
  schema: ZodType<T, ZodTypeDef, unknown>;
  temperature?: number;
  useWebSearch?: boolean;
}

export interface AIProvider {
  generateJson<T>(params: GenerateJsonParams<T>): Promise<T>;
  generateImage(prompt: string, aspectRatio: ImageAspectRatio): Promise<Buffer>;
}

export class GeminiProvider implements AIProvider {
  private readonly client: GoogleGenAI;
  private readonly textModel: string;
  private readonly imageModel: string;

  constructor(options?: {
    apiKey?: string;
    textModel?: string;
    imageModel?: string;
  }) {
    const env = getEnv();
    const apiKey = options?.apiKey ?? requireEnv('GEMINI_API_KEY');
    this.client = new GoogleGenAI({ apiKey });
    this.textModel = options?.textModel ?? env.GEMINI_TEXT_MODEL;
    this.imageModel = options?.imageModel ?? env.GEMINI_IMAGE_MODEL;
  }

  async generateJson<T>(params: GenerateJsonParams<T>): Promise<T> {
    const response = await this.client.models.generateContent({
      model: this.textModel,
      contents: params.userPrompt,
      config: {
        systemInstruction: params.systemInstruction,
        responseMimeType: 'application/json',
        temperature: params.temperature ?? 0.75,
      },
    });

    const rawText = response.text;
    if (!rawText || rawText.trim().length === 0) {
      throw new Error('Gemini returned an empty response for JSON generation');
    }

    const cleaned = rawText
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(cleaned);
    } catch (err) {
      throw new Error(
        `Gemini returned invalid JSON: ${(err as Error).message}. Raw snippet: ${cleaned.slice(0, 240)}`
      );
    }

    const validated = params.schema.safeParse(parsedJson);
    if (!validated.success) {
      const issues = validated.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      throw new Error(`Gemini JSON failed Zod validation: ${issues}`);
    }

    return validated.data;
  }

  async generateImage(
    prompt: string,
    aspectRatio: ImageAspectRatio = '4:5'
  ): Promise<Buffer> {
    const enrichedPrompt = `${prompt}\nAspect ratio: ${aspectRatio}. Strictly no text, no letters, no words, no numbers, no logos, no watermarks.`;

    const response = await this.client.models.generateContent({
      model: this.imageModel,
      contents: enrichedPrompt,
      config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
      },
    });

    const candidates = response.candidates ?? [];
    for (const candidate of candidates) {
      const parts = candidate.content?.parts ?? [];
      for (const part of parts) {
        if (part.inlineData?.data) {
          return Buffer.from(part.inlineData.data, 'base64');
        }
      }
    }

    throw new Error(
      `Gemini image model (${this.imageModel}) did not return inline image data`
    );
  }
}

interface OpenRouterImageItem {
  type?: string;
  image_url?: { url?: string };
  url?: string;
}

interface OpenRouterContentPart {
  type?: string;
  text?: string;
  image_url?: { url?: string };
}

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string | OpenRouterContentPart[] | null;
      images?: OpenRouterImageItem[];
    };
  }>;
  error?: { message?: string; code?: number | string };
}

async function decodeImageUrlToBuffer(url: string): Promise<Buffer> {
  const dataUriMatch = /^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/s.exec(url);
  if (dataUriMatch?.[1]) {
    return Buffer.from(dataUriMatch[1], 'base64');
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch generated image URL (${res.status})`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export class OpenRouterProvider implements AIProvider {
  private readonly apiKey: string;
  private readonly textModel: string;
  private readonly imageModel: string;
  private readonly baseUrl = 'https://openrouter.ai/api/v1/chat/completions';

  constructor(options?: {
    apiKey?: string;
    textModel?: string;
    imageModel?: string;
  }) {
    const env = getEnv();
    this.apiKey = options?.apiKey ?? requireEnv('OPENROUTER_API_KEY');
    this.textModel = options?.textModel ?? env.OPENROUTER_TEXT_MODEL;
    this.imageModel = options?.imageModel ?? env.OPENROUTER_IMAGE_MODEL;
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://fabsoft.app',
      'X-Title': 'FabSoft Social Pipeline',
    };
  }

  private async requestJson<T>(
    model: string,
    params: GenerateJsonParams<T>
  ): Promise<T> {
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        model,
        temperature: params.temperature ?? 0.75,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: params.systemInstruction },
          { role: 'user', content: params.userPrompt },
        ],
      }),
    });

    const payload = (await res.json()) as OpenRouterResponse;
    if (!res.ok || payload.error) {
      throw new Error(
        `OpenRouter JSON error (${res.status}): ${payload.error?.message ?? JSON.stringify(payload).slice(0, 240)}`
      );
    }

    const content = payload.choices?.[0]?.message?.content;
    const rawText =
      typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content.map((p) => p.text ?? '').join('')
          : '';

    if (!rawText.trim()) {
      throw new Error('OpenRouter returned an empty response for JSON generation');
    }

    const cleaned = rawText
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(cleaned);
    } catch (err) {
      throw new Error(
        `OpenRouter returned invalid JSON: ${(err as Error).message}. Raw snippet: ${cleaned.slice(0, 240)}`
      );
    }

    const validated = params.schema.safeParse(parsedJson);
    if (!validated.success) {
      const issues = validated.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      throw new Error(`OpenRouter JSON failed Zod validation: ${issues}`);
    }

    return validated.data;
  }

  async generateJson<T>(params: GenerateJsonParams<T>): Promise<T> {
    if (params.useWebSearch && !this.textModel.endsWith(':online')) {
      const onlineModel = `${this.textModel}:online`;
      try {
        return await this.requestJson(onlineModel, params);
      } catch (err) {
        console.warn(
          `[openrouter] Web search model (${onlineModel}) failed, falling back to ${this.textModel}:`,
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    return this.requestJson(this.textModel, params);
  }

  async generateImage(
    prompt: string,
    aspectRatio: ImageAspectRatio = '4:5'
  ): Promise<Buffer> {
    const enrichedPrompt = `${prompt}\nAspect ratio: ${aspectRatio}. Strictly no text, no letters, no words, no numbers, no logos, no watermarks.`;

    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        model: this.imageModel,
        modalities: ['image', 'text'],
        image_config: { aspect_ratio: aspectRatio },
        messages: [{ role: 'user', content: enrichedPrompt }],
      }),
    });

    const payload = (await res.json()) as OpenRouterResponse;
    if (!res.ok || payload.error) {
      throw new Error(
        `OpenRouter image error (${res.status}): ${payload.error?.message ?? JSON.stringify(payload).slice(0, 240)}`
      );
    }

    const message = payload.choices?.[0]?.message;
    const images = message?.images ?? [];
    for (const img of images) {
      const url = img.image_url?.url ?? img.url;
      if (url) {
        return decodeImageUrlToBuffer(url);
      }
    }

    if (Array.isArray(message?.content)) {
      for (const part of message.content) {
        if (part.image_url?.url) {
          return decodeImageUrlToBuffer(part.image_url.url);
        }
      }
    }

    throw new Error(
      `OpenRouter image model (${this.imageModel}) did not return image data`
    );
  }
}

let defaultProvider: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (!defaultProvider) {
    const env = getEnv();
    if (
      env.AI_PROVIDER === 'openrouter' ||
      (env.AI_PROVIDER === 'auto' && env.OPENROUTER_API_KEY)
    ) {
      defaultProvider = new OpenRouterProvider();
    } else {
      defaultProvider = new GeminiProvider();
    }
  }
  return defaultProvider;
}

import { getEnv, requireEnv } from '../config/env.js';
import type { PublishResult, SocialPublisher } from './interface.js';

interface MetaErrorPayload {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
}

interface CreateContainerResponse extends MetaErrorPayload {
  id?: string;
}

interface ContainerStatusResponse extends MetaErrorPayload {
  status_code?: 'EXPIRED' | 'ERROR' | 'FINISHED' | 'IN_PROGRESS' | 'PUBLISHED';
  status?: string;
}

interface PublishMediaResponse extends MetaErrorPayload {
  id?: string;
}

interface PermalinkResponse extends MetaErrorPayload {
  permalink?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class InstagramPublisher implements SocialPublisher {
  readonly platform = 'instagram';
  private readonly accessToken: string;
  private readonly accountId: string;
  private readonly apiVersion: string;
  private readonly baseUrl: string;

  constructor(options?: {
    accessToken?: string;
    accountId?: string;
    apiVersion?: string;
  }) {
    const env = getEnv();
    this.accessToken = options?.accessToken ?? requireEnv('INSTAGRAM_ACCESS_TOKEN');
    this.accountId = options?.accountId ?? requireEnv('INSTAGRAM_ACCOUNT_ID');
    this.apiVersion = options?.apiVersion ?? env.META_GRAPH_API_VERSION;
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;
  }

  private async requestJson<T extends MetaErrorPayload>(
    url: string,
    init?: RequestInit
  ): Promise<T> {
    const response = await fetch(url, init);
    const data = (await response.json()) as T;

    if (!response.ok || data.error) {
      const errMsg = data.error?.message ?? `HTTP ${response.status}`;
      const code = data.error?.code ? ` (code ${data.error.code})` : '';
      throw new Error(`Meta Graph API error${code}: ${errMsg}`);
    }

    return data;
  }

  async publishSingleImage(
    imageUrl: string,
    caption: string
  ): Promise<PublishResult> {
    // Step 1: Create media container
    const createParams = new URLSearchParams({
      image_url: imageUrl,
      caption,
      access_token: this.accessToken,
    });

    const container = await this.requestJson<CreateContainerResponse>(
      `${this.baseUrl}/${this.accountId}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: createParams.toString(),
      }
    );

    if (!container.id) {
      throw new Error('Meta Graph API did not return a container ID');
    }

    // Step 2: Poll container status until FINISHED (backoff up to ~60s)
    const maxAttempts = 12;
    let delayMs = 2000;
    let isReady = false;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const statusUrl = new URL(`${this.baseUrl}/${container.id}`);
      statusUrl.searchParams.set('fields', 'status_code,status');
      statusUrl.searchParams.set('access_token', this.accessToken);

      const statusData = await this.requestJson<ContainerStatusResponse>(
        statusUrl.toString()
      );

      if (statusData.status_code === 'FINISHED' || statusData.status_code === 'PUBLISHED') {
        isReady = true;
        break;
      }

      if (statusData.status_code === 'ERROR' || statusData.status_code === 'EXPIRED') {
        throw new Error(
          `Instagram media container failed with status ${statusData.status_code}: ${statusData.status ?? 'unknown error'}`
        );
      }

      if (attempt < maxAttempts) {
        await sleep(delayMs);
        delayMs = Math.min(delayMs + 1500, 8000);
      }
    }

    if (!isReady) {
      throw new Error(
        `Timed out waiting for Instagram media container ${container.id} to reach FINISHED`
      );
    }

    // Step 3: Publish container
    const publishParams = new URLSearchParams({
      creation_id: container.id,
      access_token: this.accessToken,
    });

    const published = await this.requestJson<PublishMediaResponse>(
      `${this.baseUrl}/${this.accountId}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: publishParams.toString(),
      }
    );

    if (!published.id) {
      throw new Error('Meta Graph API did not return a published media ID');
    }

    // Step 4: Fetch permalink (best-effort)
    let permalink: string | null = null;
    try {
      const permalinkUrl = new URL(`${this.baseUrl}/${published.id}`);
      permalinkUrl.searchParams.set('fields', 'permalink');
      permalinkUrl.searchParams.set('access_token', this.accessToken);
      const permData = await this.requestJson<PermalinkResponse>(
        permalinkUrl.toString()
      );
      permalink = permData.permalink ?? null;
    } catch {
      permalink = null;
    }

    return {
      externalPostId: published.id,
      externalPostUrl: permalink,
    };
  }

  async checkConnection(): Promise<{ ok: boolean; username?: string }> {
    try {
      const url = new URL(`${this.baseUrl}/${this.accountId}`);
      url.searchParams.set('fields', 'id,username');
      url.searchParams.set('access_token', this.accessToken);
      const data = await this.requestJson<{ id?: string; username?: string } & MetaErrorPayload>(
        url.toString()
      );
      return { ok: Boolean(data.id), username: data.username };
    } catch {
      return { ok: false };
    }
  }
}

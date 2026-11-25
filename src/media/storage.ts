import { HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { requireEnv } from '../config/env.js';

export interface MediaStorage {
  uploadJpeg(key: string, buffer: Buffer): Promise<string>;
  checkConnection(): Promise<boolean>;
}

export class R2Storage implements MediaStorage {
  private readonly client: S3Client;
  private readonly bucketName: string;
  private readonly publicUrl: string;

  constructor(options?: {
    accountId?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    bucketName?: string;
    publicUrl?: string;
  }) {
    const accountId = options?.accountId ?? requireEnv('R2_ACCOUNT_ID');
    const accessKeyId = options?.accessKeyId ?? requireEnv('R2_ACCESS_KEY_ID');
    const secretAccessKey =
      options?.secretAccessKey ?? requireEnv('R2_SECRET_ACCESS_KEY');

    this.bucketName = options?.bucketName ?? requireEnv('R2_BUCKET_NAME');
    this.publicUrl = (options?.publicUrl ?? requireEnv('R2_PUBLIC_URL')).replace(
      /\/+$/,
      ''
    );

    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async uploadJpeg(key: string, buffer: Buffer): Promise<string> {
    const normalizedKey = key.replace(/^\/+/, '');

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: normalizedKey,
        Body: buffer,
        ContentType: 'image/jpeg',
        CacheControl: 'public, max-age=31536000, immutable',
      })
    );

    return `${this.publicUrl}/${normalizedKey}`;
  }

  async checkConnection(): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucketName }));
      return true;
    } catch {
      return false;
    }
  }
}

let defaultStorage: MediaStorage | null = null;

export function getMediaStorage(): MediaStorage {
  if (!defaultStorage) {
    defaultStorage = new R2Storage();
  }
  return defaultStorage;
}

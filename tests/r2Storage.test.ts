import { HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { R2Storage } from '../src/media/storage.js';

describe('R2Storage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('uploads JPEG with ContentType image/jpeg and builds a clean HTTPS public URL without double slashes', async () => {
    const sendSpy = vi
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValueOnce({} as never);

    const storage = new R2Storage({
      accountId: 'acc-123',
      accessKeyId: 'key-123',
      secretAccessKey: 'secret-123',
      bucketName: 'fabsoft-media',
      publicUrl: 'https://cdn.fabsoft.tech///',
    });

    const payload = Buffer.from('fake-jpeg-bytes');
    const url = await storage.uploadJpeg('///posts/2026/sample.jpg', payload);

    expect(url).toBe('https://cdn.fabsoft.tech/posts/2026/sample.jpg');
    expect(url.replace(/^https:\/\//, '')).not.toContain('//');

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const command = sendSpy.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect((command as PutObjectCommand).input).toEqual({
      Bucket: 'fabsoft-media',
      Key: 'posts/2026/sample.jpg',
      Body: payload,
      ContentType: 'image/jpeg',
      CacheControl: 'public, max-age=31536000, immutable',
    });
  });

  it('builds the expected URL when publicUrl and key have no extra slashes', async () => {
    vi.spyOn(S3Client.prototype, 'send').mockResolvedValueOnce({} as never);

    const storage = new R2Storage({
      accountId: 'acc-123',
      accessKeyId: 'key-123',
      secretAccessKey: 'secret-123',
      bucketName: 'fabsoft-media',
      publicUrl: 'https://media.fabsoft.tech',
    });

    const url = await storage.uploadJpeg('posts/clean.jpg', Buffer.from('jpg'));
    expect(url).toBe('https://media.fabsoft.tech/posts/clean.jpg');
  });

  it('checks bucket connectivity via HeadBucketCommand', async () => {
    const sendSpy = vi
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(new Error('AccessDenied'));

    const storage = new R2Storage({
      accountId: 'acc-123',
      accessKeyId: 'key-123',
      secretAccessKey: 'secret-123',
      bucketName: 'fabsoft-media',
      publicUrl: 'https://media.fabsoft.tech',
    });

    await expect(storage.checkConnection()).resolves.toBe(true);
    await expect(storage.checkConnection()).resolves.toBe(false);
    expect(sendSpy.mock.calls[0]?.[0]).toBeInstanceOf(HeadBucketCommand);
  });
});

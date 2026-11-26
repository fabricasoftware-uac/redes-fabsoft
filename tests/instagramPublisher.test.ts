import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstagramPublisher } from '../src/publishers/instagramPublisher.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('InstagramPublisher (Meta Graph API)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('executes the 3-step flow (media -> polling IN_PROGRESS then FINISHED -> media_publish -> permalink)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      // Step 1: POST /{ig-user-id}/media
      .mockResolvedValueOnce(jsonResponse({ id: 'container_123' }))
      // Step 2a: GET /{container-id} -> IN_PROGRESS
      .mockResolvedValueOnce(jsonResponse({ status_code: 'IN_PROGRESS' }))
      // Step 2b: GET /{container-id} -> FINISHED
      .mockResolvedValueOnce(jsonResponse({ status_code: 'FINISHED' }))
      // Step 3: POST /{ig-user-id}/media_publish
      .mockResolvedValueOnce(jsonResponse({ id: 'ig_published_999' }))
      // Step 4: GET /{media-id}?fields=permalink
      .mockResolvedValueOnce(
        jsonResponse({ permalink: 'https://www.instagram.com/p/FabSoftTest/' })
      );

    vi.stubGlobal('fetch', fetchMock);

    const publisher = new InstagramPublisher({
      accessToken: 'test-token',
      accountId: '17841400000000000',
      apiVersion: 'v22.0',
    });

    const publishPromise = publisher.publishSingleImage(
      'https://cdn.fabsoft.tech/posts/sample.jpg',
      'Caption de prueba #FabSoft'
    );

    // Advance past the 2000ms polling backoff between IN_PROGRESS and FINISHED
    await vi.advanceTimersByTimeAsync(2500);

    const result = await publishPromise;

    expect(result).toEqual({
      externalPostId: 'ig_published_999',
      externalPostUrl: 'https://www.instagram.com/p/FabSoftTest/',
    });

    expect(fetchMock).toHaveBeenCalledTimes(5);

    // Verify Step 1 URL & method
    const [step1Url, step1Init] = fetchMock.mock.calls[0]!;
    expect(String(step1Url)).toBe(
      'https://graph.facebook.com/v22.0/17841400000000000/media'
    );
    expect(step1Init?.method).toBe('POST');
    expect(String(step1Init?.body)).toContain(
      'image_url=https%3A%2F%2Fcdn.fabsoft.tech%2Fposts%2Fsample.jpg'
    );

    // Verify Step 3 URL & creation_id
    const [step3Url, step3Init] = fetchMock.mock.calls[3]!;
    expect(String(step3Url)).toBe(
      'https://graph.facebook.com/v22.0/17841400000000000/media_publish'
    );
    expect(step3Init?.method).toBe('POST');
    expect(String(step3Init?.body)).toContain('creation_id=container_123');
  });

  it('throws and aborts before media_publish when container polling returns status_code ERROR', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: 'container_err' }))
      .mockResolvedValueOnce(
        jsonResponse({
          status_code: 'ERROR',
          status: 'Unsupported image format or aspect ratio',
        })
      );

    vi.stubGlobal('fetch', fetchMock);

    const publisher = new InstagramPublisher({
      accessToken: 'test-token',
      accountId: '17841400000000000',
      apiVersion: 'v22.0',
    });

    await expect(
      publisher.publishSingleImage(
        'https://cdn.fabsoft.tech/posts/bad.jpg',
        'Caption'
      )
    ).rejects.toThrow(
      /Instagram media container failed with status ERROR: Unsupported image format or aspect ratio/
    );

    // Only /media and 1 status check should have been called (never /media_publish)
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('propagates Meta Graph API error payloads with code and message', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse(
        {
          error: {
            message: 'Error validating access token',
            type: 'OAuthException',
            code: 190,
          },
        },
        400
      )
    );

    vi.stubGlobal('fetch', fetchMock);

    const publisher = new InstagramPublisher({
      accessToken: 'expired-token',
      accountId: '17841400000000000',
      apiVersion: 'v22.0',
    });

    await expect(
      publisher.publishSingleImage('https://cdn.fabsoft.tech/posts/a.jpg', 'Test')
    ).rejects.toThrow('Meta Graph API error (code 190): Error validating access token');
  });

  it('still returns externalPostId with null externalPostUrl if best-effort permalink fails', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: 'container_ok' }))
      .mockResolvedValueOnce(jsonResponse({ status_code: 'FINISHED' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'ig_published_777' }))
      .mockRejectedValueOnce(new Error('Network blip'));

    vi.stubGlobal('fetch', fetchMock);

    const publisher = new InstagramPublisher({
      accessToken: 'test-token',
      accountId: '17841400000000000',
      apiVersion: 'v22.0',
    });

    const result = await publisher.publishSingleImage(
      'https://cdn.fabsoft.tech/posts/ok.jpg',
      'Caption'
    );

    expect(result).toEqual({
      externalPostId: 'ig_published_777',
      externalPostUrl: null,
    });
  });

  it('publishes a multi-slide carousel (child items -> poll -> parent CAROUSEL -> poll -> media_publish -> permalink)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      // Child 1 create + poll (IN_PROGRESS -> FINISHED)
      .mockResolvedValueOnce(jsonResponse({ id: 'child_1' }))
      .mockResolvedValueOnce(jsonResponse({ status_code: 'IN_PROGRESS' }))
      .mockResolvedValueOnce(jsonResponse({ status_code: 'FINISHED' }))
      // Child 2 create + poll (FINISHED)
      .mockResolvedValueOnce(jsonResponse({ id: 'child_2' }))
      .mockResolvedValueOnce(jsonResponse({ status_code: 'FINISHED' }))
      // Child 3 create + poll (FINISHED)
      .mockResolvedValueOnce(jsonResponse({ id: 'child_3' }))
      .mockResolvedValueOnce(jsonResponse({ status_code: 'FINISHED' }))
      // Parent CAROUSEL create + poll (FINISHED)
      .mockResolvedValueOnce(jsonResponse({ id: 'parent_carousel_1' }))
      .mockResolvedValueOnce(jsonResponse({ status_code: 'FINISHED' }))
      // Publish parent
      .mockResolvedValueOnce(jsonResponse({ id: 'ig_carousel_555' }))
      // Permalink
      .mockResolvedValueOnce(
        jsonResponse({ permalink: 'https://www.instagram.com/p/FabSoftCarousel/' })
      );

    vi.stubGlobal('fetch', fetchMock);

    const publisher = new InstagramPublisher({
      accessToken: 'test-token',
      accountId: '17841400000000000',
      apiVersion: 'v22.0',
    });

    const publishPromise = publisher.publishCarousel(
      [
        'https://cdn.fabsoft.tech/posts/carousel-slide-1.jpg',
        'https://cdn.fabsoft.tech/posts/carousel-slide-2.jpg',
        'https://cdn.fabsoft.tech/posts/carousel-slide-3.jpg',
      ],
      'Caption carrusel #FabSoft'
    );

    await vi.advanceTimersByTimeAsync(2500);

    const result = await publishPromise;

    expect(result).toEqual({
      externalPostId: 'ig_carousel_555',
      externalPostUrl: 'https://www.instagram.com/p/FabSoftCarousel/',
    });

    expect(fetchMock).toHaveBeenCalledTimes(11);

    // Verify Child 1 request includes is_carousel_item=true
    const [child1Url, child1Init] = fetchMock.mock.calls[0]!;
    expect(String(child1Url)).toBe(
      'https://graph.facebook.com/v22.0/17841400000000000/media'
    );
    expect(child1Init?.method).toBe('POST');
    expect(String(child1Init?.body)).toContain('is_carousel_item=true');

    // Verify Parent CAROUSEL container request
    const [parentUrl, parentInit] = fetchMock.mock.calls[7]!;
    expect(String(parentUrl)).toBe(
      'https://graph.facebook.com/v22.0/17841400000000000/media'
    );
    expect(parentInit?.method).toBe('POST');
    const parentBody = new URLSearchParams(String(parentInit?.body));
    expect(parentBody.get('media_type')).toBe('CAROUSEL');
    expect(parentBody.get('children')).toBe('child_1,child_2,child_3');
    expect(parentBody.get('caption')).toBe('Caption carrusel #FabSoft');

    // Verify media_publish uses parent container ID
    const [publishUrl, publishInit] = fetchMock.mock.calls[9]!;
    expect(String(publishUrl)).toBe(
      'https://graph.facebook.com/v22.0/17841400000000000/media_publish'
    );
    expect(String(publishInit?.body)).toContain('creation_id=parent_carousel_1');
  });

  it('rejects carousel publish when fewer than 2 images are provided', async () => {
    const publisher = new InstagramPublisher({
      accessToken: 'test-token',
      accountId: '17841400000000000',
      apiVersion: 'v22.0',
    });

    await expect(
      publisher.publishCarousel(
        ['https://cdn.fabsoft.tech/posts/only-one.jpg'],
        'Caption'
      )
    ).rejects.toThrow(/requires between 2 and 10 images/);
  });
});

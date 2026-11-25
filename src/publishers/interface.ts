export interface PublishResult {
  externalPostId: string;
  externalPostUrl: string | null;
}

export interface SocialPublisher {
  readonly platform: string;
  publishSingleImage(imageUrl: string, caption: string): Promise<PublishResult>;
}

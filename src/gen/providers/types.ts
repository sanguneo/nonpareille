export interface ImageGenRequest {
  prompt: string;
  negative?: string;
  size: [number, number];
  refs?: string[];
  seed?: number;
}

export interface ImageGenResult {
  png: Uint8Array;
  meta: Record<string, unknown>;
}

export interface ImageProvider {
  id: string;
  generate(req: ImageGenRequest): Promise<ImageGenResult>;
}

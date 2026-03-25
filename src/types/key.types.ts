export interface ApiKeyRecord {
  id: string;
  hashedKey: string;
  keyHint: string;
  name: string;
  createdAt: string;
  expiresAt: string;
  rateLimit: number;
  isActive: boolean;
}

export interface ApiKeyCreateRequest {
  name: string;
  expiresAt: string;
  rateLimit?: number;
}

export interface ApiKeyCreateResponse {
  id: string;
  key: string;
  name: string;
  createdAt: string;
  expiresAt: string;
  rateLimit: number;
}

export interface ApiKeyListItem {
  id: string;
  keyHint: string;
  name: string;
  createdAt: string;
  expiresAt: string;
  rateLimit: number;
  isActive: boolean;
}

export interface RateLimitEntry {
  count: number;
  windowStart: number;
}

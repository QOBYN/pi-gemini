import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { generateApiKey, hashApiKey, verifyApiKey } from '../lib/crypto.js';
import type {
  ApiKeyRecord,
  ApiKeyCreateRequest,
  ApiKeyCreateResponse,
  ApiKeyListItem,
  RateLimitEntry,
} from '../types/key.types.js';

const __ks_dirname = dirname(fileURLToPath(import.meta.url));
const KEYS_FILE = join(__ks_dirname, 'keys.json');
const DEFAULT_RATE_LIMIT = 60;

export class KeyService {
  private keys: ApiKeyRecord[] = [];
  private rateLimits = new Map<string, RateLimitEntry>();
  private writeLock: Promise<void> = Promise.resolve();

  constructor(
    private readonly secretKey: string,
    private readonly saltKey: string,
  ) {}

  async init(): Promise<void> {
    if (existsSync(KEYS_FILE)) {
      const data = await readFile(KEYS_FILE, 'utf-8');
      this.keys = JSON.parse(data) as ApiKeyRecord[];
    }
  }

  private async save(): Promise<void> {
    this.writeLock = this.writeLock
      .catch(() => {
        // Reset chain on previous error so subsequent saves can proceed
      })
      .then(async () => {
        await writeFile(KEYS_FILE, JSON.stringify(this.keys, null, 2), 'utf-8');
      });
    await this.writeLock;
  }

  async createKey(request: ApiKeyCreateRequest): Promise<ApiKeyCreateResponse> {
    const rawKey = generateApiKey(this.secretKey);
    const hashed = hashApiKey(rawKey, this.saltKey);
    const now = new Date().toISOString();

    const record: ApiKeyRecord = {
      id: randomUUID(),
      hashedKey: hashed,
      keyHint: rawKey.slice(-4),
      name: request.name,
      createdAt: now,
      expiresAt: request.expiresAt,
      rateLimit: request.rateLimit ?? DEFAULT_RATE_LIMIT,
      isActive: true,
    };

    this.keys.push(record);
    await this.save();

    return {
      id: record.id,
      key: rawKey,
      name: record.name,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      rateLimit: record.rateLimit,
    };
  }

  listKeys(): ApiKeyListItem[] {
    return this.keys.map((k) => ({
      id: k.id,
      keyHint: k.keyHint ?? '****',
      name: k.name,
      createdAt: k.createdAt,
      expiresAt: k.expiresAt,
      rateLimit: k.rateLimit,
      isActive: k.isActive,
    }));
  }

  async toggleKey(id: string): Promise<boolean> {
    const record = this.keys.find((k) => k.id === id);
    if (!record) {
      return false;
    }
    record.isActive = !record.isActive;
    await this.save();
    return true;
  }

  async deleteKey(id: string): Promise<boolean> {
    const index = this.keys.findIndex((k) => k.id === id);
    if (index === -1) {
      return false;
    }
    this.keys.splice(index, 1);
    this.rateLimits.delete(id);
    await this.save();
    return true;
  }

  validateKey(rawKey: string): {
    valid: boolean;
    error?: string;
    keyId?: string;
  } {
    const record = this.findKeyByRaw(rawKey);

    if (!record) {
      return { valid: false, error: 'Invalid API key' };
    }

    if (!record.isActive) {
      return { valid: false, error: 'API key is deactivated' };
    }

    const expiryDate = new Date(record.expiresAt);
    if (isNaN(expiryDate.getTime()) || expiryDate < new Date()) {
      return { valid: false, error: 'API key has expired' };
    }

    if (!this.checkRateLimit(record.id, record.rateLimit)) {
      return {
        valid: false,
        error: 'Rate limit exceeded. Try again later.',
      };
    }

    return { valid: true, keyId: record.id };
  }

  private checkRateLimit(keyId: string, limit: number): boolean {
    const now = Date.now();
    const entry = this.rateLimits.get(keyId);

    if (!entry || now - entry.windowStart > 60_000) {
      this.rateLimits.set(keyId, { count: 1, windowStart: now });
      return true;
    }

    if (entry.count >= limit) {
      return false;
    }

    entry.count++;
    return true;
  }

  private findKeyByRaw(rawKey: string): ApiKeyRecord | undefined {
    return this.keys.find((k) => verifyApiKey(rawKey, k.hashedKey, this.saltKey));
  }
}

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { UsageService } from '../../../src/services/usage.service.js';

let tmpDir: string;
let svc: UsageService;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'usage-test-'));
  svc = new UsageService(join(tmpDir, 'usage.db'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('UsageService.record', () => {
  it('records tokens and request_count, getStats reflects them', () => {
    svc.record(100, 50);
    const stats = svc.getStats();
    expect(stats.today.input_tokens).toBe(100);
    expect(stats.today.output_tokens).toBe(50);
    expect(stats.today.request_count).toBe(1);
  });

  it('accumulates multiple calls on same day', () => {
    svc.record(100, 50);
    svc.record(200, 75);
    const stats = svc.getStats();
    expect(stats.today.input_tokens).toBe(300);
    expect(stats.today.output_tokens).toBe(125);
    expect(stats.today.request_count).toBe(2);
  });

  it('does not throw on DB error (graceful failure)', () => {
    const badSvc = new UsageService('/nonexistent-dir/usage.db');
    expect(() => badSvc.record(100, 50)).not.toThrow();
  });
});

describe('UsageService.getStats', () => {
  it('returns zero totals including request_count when no data', () => {
    const stats = svc.getStats();
    expect(stats.today.input_tokens).toBe(0);
    expect(stats.today.output_tokens).toBe(0);
    expect(stats.today.request_count).toBe(0);
    expect(stats.month.request_count).toBe(0);
    expect(stats.allTime.request_count).toBe(0);
    expect(stats.last30Days).toEqual([]);
  });

  it('allTime sums all rows including request_count', () => {
    svc.record(500, 200);
    const stats = svc.getStats();
    expect(stats.allTime.input_tokens).toBe(500);
    expect(stats.allTime.output_tokens).toBe(200);
    expect(stats.allTime.request_count).toBe(1);
  });

  it('last30Days includes today with request_count', () => {
    svc.record(10, 5);
    const stats = svc.getStats();
    expect(stats.last30Days.length).toBe(1);
    const today = new Date().toISOString().slice(0, 10);
    expect(stats.last30Days[0]!.date).toBe(today);
    expect(stats.last30Days[0]!.request_count).toBe(1);
  });

  it('month totals match today when only today has data', () => {
    svc.record(100, 50);
    const stats = svc.getStats();
    expect(stats.month.input_tokens).toBe(stats.today.input_tokens);
    expect(stats.month.output_tokens).toBe(stats.today.output_tokens);
    expect(stats.month.request_count).toBe(stats.today.request_count);
  });
});

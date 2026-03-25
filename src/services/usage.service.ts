import { createRequire } from 'node:module';
import type { Database as BetterSqlite3Database } from 'better-sqlite3';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Database = require('better-sqlite3') as any;

export interface DailyUsage {
  date: string;
  input_tokens: number;
  output_tokens: number;
  request_count: number;
}

export interface UsageTotals {
  input_tokens: number;
  output_tokens: number;
  request_count: number;
}

export interface UsageStats {
  today: UsageTotals;
  month: UsageTotals;
  allTime: UsageTotals;
  last30Days: DailyUsage[];
}

function zeroStats(): UsageStats {
  return {
    today:      { input_tokens: 0, output_tokens: 0, request_count: 0 },
    month:      { input_tokens: 0, output_tokens: 0, request_count: 0 },
    allTime:    { input_tokens: 0, output_tokens: 0, request_count: 0 },
    last30Days: [],
  };
}

export class UsageService {
  private db: BetterSqlite3Database | null = null;

  constructor(dbPath: string) {
    try {
      this.db = new Database(dbPath) as BetterSqlite3Database;
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS daily_usage (
          date          TEXT    PRIMARY KEY,
          input_tokens  INTEGER NOT NULL DEFAULT 0,
          output_tokens INTEGER NOT NULL DEFAULT 0,
          request_count INTEGER NOT NULL DEFAULT 0
        )
      `);
      // Idempotent migration: adds column to existing DBs; silently ignored if already present.
      try {
        this.db.exec(`ALTER TABLE daily_usage ADD COLUMN request_count INTEGER NOT NULL DEFAULT 0`);
      } catch {
        // Column already exists — safe to ignore.
      }
    } catch (err) {
      process.stderr.write(`[UsageService] Failed to open DB at ${dbPath}: ${String(err)}\n`);
      this.db = null;
    }
  }

  record(inputTokens: number, outputTokens: number, requestCount = 1): void {
    if (!this.db) return;
    try {
      const date = new Date().toISOString().slice(0, 10);
      this.db.prepare(`
        INSERT INTO daily_usage (date, input_tokens, output_tokens, request_count)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(date) DO UPDATE SET
          input_tokens  = input_tokens  + excluded.input_tokens,
          output_tokens = output_tokens + excluded.output_tokens,
          request_count = request_count + excluded.request_count
      `).run(date, inputTokens, outputTokens, requestCount);
    } catch (err) {
      process.stderr.write(`[UsageService] record() failed: ${String(err)}\n`);
    }
  }

  getStats(): UsageStats {
    if (!this.db) return zeroStats();
    try {
      const today = new Date().toISOString().slice(0, 10);
      const monthPrefix = new Date().toISOString().slice(0, 7);
      const thirtyDaysAgo = new Date(Date.now() - 29 * 86400_000).toISOString().slice(0, 10);

      const todayRow = this.db.prepare(
        `SELECT COALESCE(SUM(input_tokens),0) as input_tokens,
                COALESCE(SUM(output_tokens),0) as output_tokens,
                COALESCE(SUM(request_count),0) as request_count
         FROM daily_usage WHERE date = ?`
      ).get(today) as UsageTotals;

      const monthRow = this.db.prepare(
        `SELECT COALESCE(SUM(input_tokens),0) as input_tokens,
                COALESCE(SUM(output_tokens),0) as output_tokens,
                COALESCE(SUM(request_count),0) as request_count
         FROM daily_usage WHERE date LIKE ?`
      ).get(`${monthPrefix}%`) as UsageTotals;

      const allTimeRow = this.db.prepare(
        `SELECT COALESCE(SUM(input_tokens),0) as input_tokens,
                COALESCE(SUM(output_tokens),0) as output_tokens,
                COALESCE(SUM(request_count),0) as request_count
         FROM daily_usage`
      ).get() as UsageTotals;

      const last30Days = this.db.prepare(
        `SELECT date, input_tokens, output_tokens, request_count
         FROM daily_usage
         WHERE date >= ? ORDER BY date DESC LIMIT 30`
      ).all(thirtyDaysAgo) as DailyUsage[];

      return { today: todayRow, month: monthRow, allTime: allTimeRow, last30Days };
    } catch (err) {
      process.stderr.write(`[UsageService] getStats() failed: ${String(err)}\n`);
      return zeroStats();
    }
  }
}

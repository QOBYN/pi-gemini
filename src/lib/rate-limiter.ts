// pi-gemini/src/lib/rate-limiter.ts
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;   // 5 minutes
const IDLE_EXPIRY_MS = 30 * 60 * 1000;        // 30 minutes

interface IpState {
  failures: number;
  blockedUntil: number;  // Unix ms; 0 = not blocked
  lastSeen: number;      // Unix ms
}

export class RateLimiter {
  private readonly state = new Map<string, IpState>();
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref?.();
  }

  /** Returns { blockedUntil, failures } for the IP. blockedUntil=0 means not blocked. */
  check(ip: string): { blockedUntil: number; failures: number } {
    const entry = this.state.get(ip);
    if (!entry) return { blockedUntil: 0, failures: 0 };
    entry.lastSeen = Date.now();
    return { blockedUntil: entry.blockedUntil, failures: entry.failures };
  }

  /** Records a wrong-key attempt. Returns new failure count. */
  recordFailure(ip: string): number {
    const now = Date.now();
    const entry = this.state.get(ip) ?? { failures: 0, blockedUntil: 0, lastSeen: now };
    entry.failures += 1;
    entry.lastSeen = now;
    this.state.set(ip, entry);
    return entry.failures;
  }

  /** Sets blockedUntil = Date.now() + delayMs. */
  block(ip: string, delayMs: number): void {
    const now = Date.now();
    const entry = this.state.get(ip) ?? { failures: 0, blockedUntil: 0, lastSeen: now };
    entry.blockedUntil = now + delayMs;
    entry.lastSeen = now;
    this.state.set(ip, entry);
  }

  /** Resets the entry for this IP on successful auth. */
  recordSuccess(ip: string): void {
    this.state.delete(ip);
  }

  /** Remove entries idle for more than 30 minutes. */
  private cleanup(): void {
    const cutoff = Date.now() - IDLE_EXPIRY_MS;
    for (const [ip, entry] of this.state) {
      if (entry.lastSeen < cutoff) {
        this.state.delete(ip);
      }
    }
  }

  /** Call on server shutdown to clear the cleanup timer. */
  destroy(): void {
    clearInterval(this.cleanupTimer);
  }
}

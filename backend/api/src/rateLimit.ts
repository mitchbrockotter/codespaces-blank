type RateEntry = {
  count: number;
  resetAt: number;
};

const limits = new Map<string, RateEntry>();

export function checkRateLimit(key: string, max: number, windowSeconds: number) {
  const now = Date.now();
  const existing = limits.get(key);

  if (!existing || now > existing.resetAt) {
    limits.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return;
  }

  if (existing.count >= max) {
    const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    const error = new Error("Rate limit exceeded");
    (error as Error & { status?: number; retryAfter?: number }).status = 429;
    (error as Error & { status?: number; retryAfter?: number }).retryAfter = retryAfter;
    throw error;
  }

  existing.count += 1;
}

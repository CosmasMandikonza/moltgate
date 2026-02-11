import type { Request, Response, NextFunction } from "express";
import { TtlCache } from "../utils/cache.js";
import { X402_HEADERS } from "../types.js";

// ---------------------------------------------------------------------------
// Idempotency-Key support
//
// If a client retries with the same Idempotency-Key header for the same
// route + method, the gateway returns the cached 2xx response — including
// the original PAYMENT-RESPONSE receipt — without settling again.
//
// Runs FIRST in the protected stack so cache hits bypass validation,
// replay checks, and the facilitator entirely.
// ---------------------------------------------------------------------------

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface CachedResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export const idempotencyCache = new TtlCache<CachedResponse>(DEFAULT_TTL_MS);

export function idempotencyKey(
  token: string,
  method: string,
  path: string,
): string {
  return `idem:${method.toUpperCase()}:${path}:${token}`;
}

export function idempotency() {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers["idempotency-key"] as string | undefined;
    if (!token) return next();

    const key = idempotencyKey(token, req.method, req.path);
    const cached = idempotencyCache.get(key);

    // ── Cache hit → return stored response verbatim ───────────────────
    if (cached) {
      for (const [h, v] of Object.entries(cached.headers)) {
        res.set(h, v);
      }
      res.status(cached.status).json(cached.body);
      return;
    }

    // ── Cache miss → capture the eventual response for future hits ────
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const headersToCache: Record<string, string> = {};
        const pr = res.getHeader(X402_HEADERS.RESPONSE);
        if (pr) headersToCache[X402_HEADERS.RESPONSE] = String(pr);

        idempotencyCache.set(key, {
          status: res.statusCode,
          headers: headersToCache,
          body,
        });
      }
      return originalJson(body);
    };

    return next();
  };
}

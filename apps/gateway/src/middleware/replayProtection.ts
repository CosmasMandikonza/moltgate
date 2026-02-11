import type { Request, Response, NextFunction } from "express";
import { TtlCache } from "../utils/cache.js";
import { X402_HEADERS, type PaymentPayload } from "../types.js";

// ---------------------------------------------------------------------------
// Replay protection
//
// After validateSignature has decoded and stashed the PaymentPayload on
// res.locals.paymentPayload, this middleware checks the nonce (and optional
// memo) against a TTL cache.  Duplicate nonces within the window are
// rejected with 409.
//
// If no decoded payload exists (header absent) we fall through — the
// paymentRequired middleware will issue a 402.
// ---------------------------------------------------------------------------

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

export const replayNonces = new TtlCache<true>(DEFAULT_TTL_MS);

/**
 * Build a cache key from the payment payload's nonce + optional memo.
 * Using both fields prevents an attacker from reusing a nonce with a
 * different memo (or vice-versa).
 */
export function extractNonceKey(payload: PaymentPayload): string {
  const parts = [payload.nonce];
  if (payload.memo) parts.push(payload.memo);
  return `nonce:${parts.join(":")}`;
}

export function replayProtection() {
  return (req: Request, res: Response, next: NextFunction) => {
    // No signature header at all → skip (402 will be issued later)
    const raw = req.headers[X402_HEADERS.SIGNATURE.toLowerCase()] as
      | string
      | undefined;
    if (!raw) return next();

    // Grab the validated payload stashed by validateSignature
    const payload: PaymentPayload | undefined = res.locals.paymentPayload;
    if (!payload) {
      // validateSignature already rejected with 400 — should not reach here,
      // but guard defensively.
      return next();
    }

    const nonceKey = extractNonceKey(payload);

    if (replayNonces.has(nonceKey)) {
      res.status(409).json({
        success: false,
        error: "Replay detected: payment nonce has already been used",
      });
      return;
    }

    // Mark nonce as seen *before* settlement
    replayNonces.set(nonceKey, true);
    return next();
  };
}

import type { Request, Response, NextFunction } from "express";
import { findPolicy } from "../policies.js";
import { config } from "../config.js";
import {
  X402_HEADERS,
  PAYMENT_PAYLOAD_REQUIRED_FIELDS,
  type PaymentPayload,
  type PaymentAccept,
} from "../types.js";

// ---------------------------------------------------------------------------
// validateSignature middleware
//
// Runs BEFORE paymentRequired.  If the request carries a PAYMENT-SIGNATURE
// header this middleware:
//
//   1. Base64-decodes the header value
//   2. Parses the JSON
//   3. Asserts all required fields are present and non-empty
//   4. Cross-references scheme / network / asset / payTo / amount against the
//      PaymentAccept offer for this route
//   5. Stores the validated payload on  res.locals.paymentPayload  so
//      downstream middleware (replay guard, payment gate) can use it
//
// On any validation failure the request is rejected with 400.
// ---------------------------------------------------------------------------

function decodePayload(raw: string): PaymentPayload {
  const json = Buffer.from(raw, "base64").toString("utf-8");
  return JSON.parse(json) as PaymentPayload;
}

function buildAccept(
  policy: NonNullable<ReturnType<typeof findPolicy>>,
  req: Request,
): PaymentAccept {
  const base = config.baseUrl ?? `${req.protocol}://${req.get("host")}`;
  return {
    scheme: policy.scheme,
    network: policy.network,
    maxAmountRequired: policy.maxAmountRequired,
    resource: `${base}${policy.path}`,
    description: policy.description,
    mimeType: policy.mimeType,
    payTo: policy.payTo,
    maxTimeoutSeconds: policy.maxTimeoutSeconds,
    asset: policy.asset,
    ...(policy.extra ? { extra: policy.extra } : {}),
  };
}

export function validateSignature() {
  return (req: Request, res: Response, next: NextFunction) => {
    const raw = req.headers[X402_HEADERS.SIGNATURE] as
      | string
      | undefined;

    // No header → let paymentRequired handle the 402
    if (!raw) return next();

    // ── 1. Decode base64 ──────────────────────────────────────────────
    let payload: PaymentPayload;
    try {
      payload = decodePayload(raw);
    } catch {
      res.status(400).json({
        success: false,
        error: "PAYMENT-SIGNATURE is not valid base64-encoded JSON",
      });
      return;
    }

    // ── 2. Require all mandatory fields ───────────────────────────────
    const missing = PAYMENT_PAYLOAD_REQUIRED_FIELDS.filter((f) => {
      const val = payload[f];
      return val === undefined || val === null || val === "";
    });

    if (missing.length > 0) {
      res.status(400).json({
        success: false,
        error: `PAYMENT-SIGNATURE missing required fields: ${missing.join(", ")}`,
      });
      return;
    }

    // ── 3. x402 version check ─────────────────────────────────────────
    if (payload.x402Version !== 2) {
      res.status(400).json({
        success: false,
        error: `Unsupported x402Version: ${payload.x402Version} (expected 2)`,
      });
      return;
    }

    // ── 4. Cross-reference against the route's offer ──────────────────
    const policy = findPolicy(req.path, req.method);
    if (policy) {
      const accept = buildAccept(policy, req);
      const mismatches: string[] = [];

      if (payload.network !== accept.network) {
        mismatches.push(`network: expected ${accept.network}, got ${payload.network}`);
      }
      if (payload.asset !== accept.asset) {
        mismatches.push(`asset: expected ${accept.asset}, got ${payload.asset}`);
      }
      if (payload.payTo !== accept.payTo) {
        mismatches.push(`payTo: expected ${accept.payTo}, got ${payload.payTo}`);
      }
      if (payload.scheme !== accept.scheme) {
        mismatches.push(`scheme: expected ${accept.scheme}, got ${payload.scheme}`);
      }

      if (mismatches.length > 0) {
        res.status(400).json({
          success: false,
          error: `PAYMENT-SIGNATURE does not match offer: ${mismatches.join("; ")}`,
        });
        return;
      }

      // ── 5. Amount must meet minimum ─────────────────────────────────
      const offeredAmount = BigInt(accept.maxAmountRequired);
      let paidAmount: bigint;
      try {
        paidAmount = BigInt(payload.amount);
      } catch {
        res.status(400).json({
          success: false,
          error: "PAYMENT-SIGNATURE amount is not a valid integer string",
        });
        return;
      }

      if (paidAmount < offeredAmount) {
        res.status(400).json({
          success: false,
          error: `Insufficient payment: required ${accept.maxAmountRequired}, got ${payload.amount}`,
        });
        return;
      }
    }

    // ── All checks passed — stash payload for downstream ──────────────
    res.locals.paymentPayload = payload;
    return next();
  };
}

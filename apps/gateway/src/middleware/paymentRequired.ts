import type { Request, Response, NextFunction } from "express";
import { findPolicy } from "../policies.js";
import { verifyPayment, settlePayment } from "../utils/facilitator.js";
import { config } from "../config.js";
import type {
  PaymentRequirements,
  PaymentAccept,
  PaymentReceipt,
  PaymentPayload,
} from "../types.js";
import { X402_HEADERS } from "../types.js";

// ---------------------------------------------------------------------------
// Build the x402 v2 PaymentRequired payload from a route policy
// ---------------------------------------------------------------------------
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

function buildRequirements(accept: PaymentAccept): PaymentRequirements {
  return { x402Version: 2, accepts: [accept] };
}

function toBase64(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64");
}

// ---------------------------------------------------------------------------
// Middleware
//
// By this point validateSignature has already decoded and validated the
// PAYMENT-SIGNATURE into  res.locals.paymentPayload.  We trust that object
// here and focus on the 402 / mock / facilitator branching.
// ---------------------------------------------------------------------------
export function paymentRequired() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const policy = findPolicy(req.path, req.method);

    // No policy → not a paid route, pass through
    if (!policy) return next();

    const accept = buildAccept(policy, req);

    // The validated payload (set by validateSignature middleware)
    const payload: PaymentPayload | undefined = res.locals.paymentPayload;

    // ── No payload → 402 ──────────────────────────────────────────────
    if (!payload) {
      const requirements = buildRequirements(accept);
      res
        .status(402)
        .set(X402_HEADERS.REQUIRED, toBase64(requirements))
        .json(requirements);
      return;
    }

    // ── Mock mode → accept validated payload, return fake receipt ──────
    if (config.mockPayments) {
      const mockReceipt: PaymentReceipt = {
        txHash: "0x" + "0".repeat(64),
        network: config.network,
        payer: "ST1MOCK000000000000000000000000000000000",
        amount: payload.amount,
        timestamp: Date.now(),
        settled: true,
      };

      res.set(X402_HEADERS.RESPONSE, toBase64(mockReceipt));
      res.locals.receipt = mockReceipt;
      return next();
    }

    // ── Live mode → facilitator verify + settle ───────────────────────
    try {
      // Forward the raw base64 header to the facilitator
      const rawSig = req.headers[X402_HEADERS.SIGNATURE] as string;

      const verification = await verifyPayment(rawSig, accept);

      if (!verification.valid) {
        res.status(401).json({
          success: false,
          error: "Payment signature verification failed",
        });
        return;
      }

      const settlement = await settlePayment(rawSig, accept);

      const receipt: PaymentReceipt = {
        txHash: settlement.txHash,
        network: settlement.network,
        payer: verification.payer,
        amount: verification.amount,
        timestamp: settlement.timestamp,
        settled: settlement.settled,
      };

      res.set(X402_HEADERS.RESPONSE, toBase64(receipt));
      res.locals.receipt = receipt;
      return next();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Facilitator error";
      res.status(502).json({ success: false, error: message });
      return;
    }
  };
}

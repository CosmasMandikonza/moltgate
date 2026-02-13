import type { PaymentRequirements, PaymentReceipt } from "@moltgate/policy";
import {
  type StacksAccount,
  type PaymentPayload,
  buildPaymentPayload,
  pickAccept,
  toBase64,
  fromBase64,
} from "./signer.js";

// ---------------------------------------------------------------------------
// x402 v2 header constants (must match gateway)
// ---------------------------------------------------------------------------

const HEADER_REQUIRED = "payment-required";
const HEADER_SIGNATURE = "payment-signature";
const HEADER_RESPONSE = "payment-response";

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface AutopayResult<T = unknown> {
  /** The final HTTP response (after payment, if any). */
  response: Response;
  /** Parsed JSON body. */
  data: T;
  /** True if a 402 was intercepted and payment was made. */
  paid: boolean;
  /** Decoded payment receipt from PAYMENT-RESPONSE header. */
  receipt?: PaymentReceipt;
  /** The requirements that were satisfied. */
  requirements?: PaymentRequirements;
  /** The payment payload that was sent. */
  payload?: PaymentPayload;
}

// ---------------------------------------------------------------------------
// Event hooks — let callers observe the 402→pay→200 flow
// ---------------------------------------------------------------------------

export interface AutopayHooks {
  /** Fired when a 402 is received (before signing). */
  on402?: (url: string, requirements: PaymentRequirements) => void;
  /** Fired after signing, before the retry request. */
  onSign?: (url: string, payload: PaymentPayload) => void;
  /** Fired after a successful paid response. */
  onPaid?: (url: string, receipt: PaymentReceipt) => void;
}

// ---------------------------------------------------------------------------
// WrappedFetch — a fetch-like function with x402 auto-payment
// ---------------------------------------------------------------------------

export type WrappedFetch = <T = unknown>(
  url: string | URL,
  init?: RequestInit,
) => Promise<AutopayResult<T>>;

// ---------------------------------------------------------------------------
// wrapFetch(baseFetch, account, hooks?)
//
// Returns a fetch-like function that automatically handles HTTP 402:
//
//   1. Fires the original request.
//   2. If 402, decodes PAYMENT-REQUIRED header → PaymentRequirements.
//   3. Builds a PaymentPayload matching the offer, signs with account.
//   4. Retries with PAYMENT-SIGNATURE header (base64 JSON).
//   5. Decodes PAYMENT-RESPONSE header → PaymentReceipt.
//   6. Returns { response, data, paid, receipt, requirements, payload }.
//
// The upstream never needs to know about x402 — this is the buyer-side
// primitive that completes the payment loop.
// ---------------------------------------------------------------------------

export function wrapFetch(
  baseFetch: typeof globalThis.fetch,
  account: StacksAccount,
  hooks?: AutopayHooks,
): WrappedFetch {
  return async <T = unknown>(
    url: string | URL,
    init?: RequestInit,
  ): Promise<AutopayResult<T>> => {
    const urlStr = url.toString();

    // ── 1. Initial request ──────────────────────────────────────────
    let response = await baseFetch(url, init);

    // ── 2. Not a 402 → return as-is ────────────────────────────────
    if (response.status !== 402) {
      const data = await parseBody<T>(response);
      return { response, data, paid: false };
    }

    // ── 3. Decode 402 requirements ──────────────────────────────────
    const headerValue = response.headers.get(HEADER_REQUIRED);
    let requirements: PaymentRequirements;

    if (headerValue) {
      requirements = fromBase64<PaymentRequirements>(headerValue);
    } else {
      // Fallback: parse from body
      requirements = (await response.json()) as PaymentRequirements;
    }

    hooks?.on402?.(urlStr, requirements);

    // ── 4. Build & sign payment payload ─────────────────────────────
    const accept = pickAccept(requirements);
    const payload = buildPaymentPayload(accept, account);

    hooks?.onSign?.(urlStr, payload);

    // ── 5. Retry with PAYMENT-SIGNATURE ─────────────────────────────
    const retryHeaders = new Headers(init?.headers);
    retryHeaders.set(HEADER_SIGNATURE, toBase64(payload));

    response = await baseFetch(url, {
      ...init,
      headers: retryHeaders,
    });

    // ── 6. Decode receipt ───────────────────────────────────────────
    let receipt: PaymentReceipt | undefined;
    const receiptHeader = response.headers.get(HEADER_RESPONSE);
    if (receiptHeader) {
      receipt = fromBase64<PaymentReceipt>(receiptHeader);
      hooks?.onPaid?.(urlStr, receipt);
    }

    // ── 7. Parse body and return ────────────────────────────────────
    const data = await parseBody<T>(response);

    return {
      response,
      data,
      paid: true,
      receipt,
      requirements,
      payload,
    };
  };
}

// ---------------------------------------------------------------------------
// Helper: parse response body
// ---------------------------------------------------------------------------

async function parseBody<T>(response: Response): Promise<T> {
  const ct = response.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    return (await response.json()) as T;
  }
  return (await response.text()) as unknown as T;
}

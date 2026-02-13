import type { PaymentAccept, PaymentRequirements } from "@moltgate/policy";
import { randomBytes } from "node:crypto";

// ---------------------------------------------------------------------------
// Stacks account — represents a buyer's wallet identity
// ---------------------------------------------------------------------------

export interface StacksAccount {
  /** Stacks address, e.g. "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM" */
  address: string;
  /**
   * Hex-encoded private key for transaction signing.
   * In mock mode this is used as the signature seed.
   * In production, x402-stacks uses this to sign a real STX transfer.
   */
  privateKey: string;
}

// ---------------------------------------------------------------------------
// PaymentPayload — the structure the gateway expects in PAYMENT-SIGNATURE
//
// This mirrors the PaymentPayload type in the gateway's validateSignature
// middleware.  Every field is cross-referenced against the 402 offer.
// ---------------------------------------------------------------------------

export interface PaymentPayload {
  x402Version: number;
  scheme: string;
  network: string;
  asset: string;
  payTo: string;
  amount: string;
  nonce: string;
  signature: string;
  resource: string;
  memo?: string;
}

// ---------------------------------------------------------------------------
// Build + sign a payment payload from a 402 offer
//
// In production, the `signature` field would contain a Stacks-signed
// transaction hash created via @stacks/transactions.  For local/mock mode,
// we produce a structurally valid payload with a deterministic signature
// derived from the private key + nonce — good enough for the gateway's
// MOCK_PAYMENTS=true mode and for validateSignature's structural checks.
// ---------------------------------------------------------------------------

function generateNonce(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Build a signed PaymentPayload from a PaymentAccept offer.
 *
 * The returned object matches every field the gateway's validateSignature
 * middleware cross-references: scheme, network, asset, payTo, plus
 * amount >= maxAmountRequired.
 */
export function buildPaymentPayload(
  accept: PaymentAccept,
  account: StacksAccount,
): PaymentPayload {
  const nonce = generateNonce();

  // In production: sign a real STX transfer with @stacks/transactions
  // For mock/dev: hash(privateKey + nonce) as a deterministic placeholder
  const signature = `${account.privateKey.slice(0, 16)}:${nonce}`;

  return {
    x402Version: 2,
    scheme: accept.scheme,
    network: accept.network,
    asset: accept.asset,
    payTo: accept.payTo,
    amount: accept.maxAmountRequired,
    nonce,
    signature,
    resource: accept.resource,
  };
}

/**
 * Select the best PaymentAccept from a 402's requirements.
 *
 * Currently picks the first entry.  A future version could match on
 * preferred network, asset, or maximum budget.
 */
export function pickAccept(requirements: PaymentRequirements): PaymentAccept {
  if (!requirements.accepts?.length) {
    throw new Error("402 response contains no accepted payment schemes");
  }
  return requirements.accepts[0];
}

/**
 * Encode an object as base64 JSON (for PAYMENT-SIGNATURE header).
 */
export function toBase64(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64");
}

/**
 * Decode a base64 JSON header value.
 */
export function fromBase64<T>(encoded: string): T {
  return JSON.parse(Buffer.from(encoded, "base64").toString("utf-8")) as T;
}

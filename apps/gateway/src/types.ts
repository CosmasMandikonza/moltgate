// ---------------------------------------------------------------------------
// Re-export canonical types from @moltgate/policy.
// ---------------------------------------------------------------------------

export type {
  PaymentRequirements,
  PaymentAccept,
  PaymentReceipt,
  GatewayResponse,
  FacilitatorVerifyResponse,
  FacilitatorSettleResponse,
  RoutePolicy,
  HttpMethod,
} from "@moltgate/policy";

// ---------------------------------------------------------------------------
// x402 v2 standardised header names (upper-case per spec).
// ---------------------------------------------------------------------------

export const X402_HEADERS = {
  /** Server → Client: base64 JSON PaymentRequired (on 402). */
  REQUIRED: "payment-required",

  /** Client → Server: base64 JSON signed payment payload. */
  SIGNATURE: "payment-signature",

  /** Server → Client: base64 JSON settlement receipt (on 200). */
  RESPONSE: "payment-response",
} as const;

// ---------------------------------------------------------------------------
// Decoded structure of the PAYMENT-SIGNATURE header.
//
// The client base64-encodes this JSON object after signing a payment
// transaction.  The gateway decodes it, validates every field against the
// offer it issued in the 402 PAYMENT-REQUIRED header, then forwards
// the raw signature to the facilitator for cryptographic verification.
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

/** Fields we require on every incoming PaymentPayload. */
export const PAYMENT_PAYLOAD_REQUIRED_FIELDS: readonly (keyof PaymentPayload)[] = [
  "x402Version",
  "scheme",
  "network",
  "asset",
  "payTo",
  "amount",
  "nonce",
  "signature",
  "resource",
];

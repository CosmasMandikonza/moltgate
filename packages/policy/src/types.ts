// ---------------------------------------------------------------------------
// x402 protocol v2 types — shared across all MoltGate packages
// ---------------------------------------------------------------------------

/** Wire format returned in the 402 body and payment-required header. */
export interface PaymentRequirements {
  x402Version: 2;
  accepts: PaymentAccept[];
  error?: string;
}

/** A single accepted payment scheme inside a 402 response. */
export interface PaymentAccept {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra?: Record<string, unknown>;
}

/** Receipt attached to a successful 200 via the payment-response header. */
export interface PaymentReceipt {
  txHash?: string;
  network: string;
  payer: string;
  amount: string;
  timestamp: number;
  settled: boolean;
}

/** Envelope every gateway JSON response is wrapped in. */
export interface GatewayResponse<T = unknown> {
  success: boolean;
  data: T;
  receipt?: PaymentReceipt;
}

// ── Facilitator DTOs ──────────────────────────────────────────────────────

export interface FacilitatorVerifyRequest {
  paymentSignature: string;
  requirements: PaymentAccept;
}

export interface FacilitatorVerifyResponse {
  valid: boolean;
  payer: string;
  amount: string;
  network: string;
  txHash?: string;
}

export interface FacilitatorSettleRequest {
  paymentSignature: string;
  requirements: PaymentAccept;
}

export interface FacilitatorSettleResponse {
  settled: boolean;
  txHash: string;
  network: string;
  timestamp: number;
}

// ── Endpoint I/O schema (x402scan discovery) ──────────────────────────────

/** Describes a single field in an input or output schema. */
export interface SchemaField {
  type: "string" | "number" | "boolean" | "object" | "array";
  description?: string;
  required?: boolean;
  example?: unknown;
}

/** Describes the input + output contract of a paid endpoint. */
export interface EndpointSchema {
  /** HTTP method this schema applies to. */
  method: string;
  /** Input parameters the caller must provide. */
  input: {
    /** Query-string parameters (for GET). */
    query?: Record<string, SchemaField>;
    /** JSON body fields (for POST/PUT/PATCH). */
    body?: Record<string, SchemaField>;
  };
  /** Output fields the endpoint returns. */
  output: Record<string, SchemaField>;
}

// ── Route policy ──────────────────────────────────────────────────────────

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export interface RoutePolicy {
  /** Express-style path, e.g. "/v1/premium/echo" */
  path: string;
  method: HttpMethod;
  /** Payment scheme identifier */
  scheme: string;
  /** CAIP-2 network id or shorthand like "stacks-testnet" */
  network: string;
  /** Token symbol, e.g. "STX", "USDC" */
  asset: string;
  /** Smallest-unit amount string, e.g. "100000" for 0.10 STX */
  maxAmountRequired: string;
  /** Address that receives payment */
  payTo: string;
  /** Human-readable description shown to payers */
  description: string;
  /** Response content type */
  mimeType: string;
  /** Max seconds the gateway will wait for payment settlement */
  maxTimeoutSeconds: number;
  /** Arbitrary metadata forwarded to the facilitator */
  extra?: Record<string, unknown>;
  /** I/O schema for x402scan discovery — describes input params and output fields */
  outputSchema?: EndpointSchema;
}

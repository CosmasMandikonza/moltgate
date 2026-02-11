// ---------------------------------------------------------------------------
// Gateway configuration
//
// All env vars are read once at import time.  PAY_TO and AMOUNT_MICROSTX are
// required when MOCK_PAYMENTS is false; in mock mode they fall back to
// well-formed defaults so the 402 envelope is always structurally valid.
// ---------------------------------------------------------------------------

function required(name: string, fallback?: string): string {
  const val = process.env[name] ?? fallback;
  if (!val) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return val;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === "true" || raw === "1";
}

export const config = {
  /** CAIP-2 chain identifier for Stacks testnet. */
  network: process.env.NETWORK ?? "stacks:2147483648",

  /** x402 facilitator endpoint. */
  facilitatorUrl:
    process.env.FACILITATOR_URL ?? "https://facilitator.stacksx402.com",

  /** Stacks address that receives payments. */
  payTo: required(
    "PAY_TO",
    // Safe mock-mode default — a well-known Stacks testnet address.
    process.env.MOCK_PAYMENTS !== "false"
      ? "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM"
      : undefined,
  ),

  /** Price per request in micro-STX (1 STX = 1 000 000 µSTX). */
  amountMicroStx: required(
    "AMOUNT_MICROSTX",
    process.env.MOCK_PAYMENTS !== "false" ? "100000" : undefined,
  ),

  /** When true, skip facilitator and accept any payment-signature. */
  mockPayments: bool("MOCK_PAYMENTS", true),

  /** Express listen port. */
  port: parseInt(process.env.PORT ?? "3000", 10),

  /** Upstream API base URL for proxy mode. */
  upstreamUrl: process.env.UPSTREAM_URL ?? "http://localhost:4000",

  /** Canonical base URL used in x402 resource fields and PAYMENT-REQUIRED. */
  baseUrl: process.env.BASE_URL,

  /**
   * Public HTTPS base URL for x402scan discovery.
   *
   * This is the URL that external clients, wallets, and agents will use
   * to reach the gateway.  Must be HTTPS in production.
   *
   * Falls back to BASE_URL → http://localhost:{port} for local dev.
   */
  publicBaseUrl:
    process.env.PUBLIC_BASE_URL ??
    process.env.BASE_URL ??
    `http://localhost:${parseInt(process.env.PORT ?? "3000", 10)}`,
} as const;

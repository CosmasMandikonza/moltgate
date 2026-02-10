import type { PolicyEngine, RoutePolicy, EndpointSchema } from "@moltgate/policy";

// ---------------------------------------------------------------------------
// x402scan discovery schema types
//
// Served at GET /.well-known/x402 — allows crawlers, wallets, AI agents,
// and x402scan to discover all paid endpoints, their pricing, and their
// I/O schemas without triggering a 402.
//
// Shape follows the x402scan spec:
//   { name, image, accepts[] }
// where each accepts[] entry describes one paid endpoint including an
// outputSchema that documents the endpoint's input params and output fields.
// ---------------------------------------------------------------------------

/** Top-level x402scan discovery document. */
export interface X402Discovery {
  x402Version: 2;
  name: string;
  description: string;
  image: string;
  url: string;
  accepts: X402AcceptEntry[];
}

/** One paid endpoint in the discovery document. */
export interface X402AcceptEntry {
  /** Must be "stacks" for the Stacks ecosystem. */
  network: string;
  /** Public HTTPS URL of the endpoint. */
  resource: string;
  /** Payment scheme identifier. */
  scheme: string;
  /** Stacks address that receives payment. */
  payTo: string;
  /** Cost in smallest unit (µSTX). */
  maxAmountRequired: string;
  /** Token symbol. */
  asset: string;
  /** Human-readable description. */
  description: string;
  /** Response content type. */
  mimeType: string;
  /** Max seconds to wait for settlement. */
  maxTimeoutSeconds: number;
  /** I/O schema — describes HTTP method, input params, and output fields. */
  outputSchema: EndpointSchema;
}

// ---------------------------------------------------------------------------
// Generator options
// ---------------------------------------------------------------------------

export interface DiscoveryOptions {
  /** Human-readable service name. */
  name?: string;
  /** One-liner description. */
  description?: string;
  /** Image/logo URL (placeholder ok). */
  image?: string;
  /**
   * Public base URL used to build resource URIs.
   * Must be an HTTPS URL in production.
   * Falls back to http://localhost:3000 for local dev.
   */
  publicBaseUrl: string;
}

// ---------------------------------------------------------------------------
// Convert a RoutePolicy → X402AcceptEntry
// ---------------------------------------------------------------------------

function policyToAccept(
  p: RoutePolicy,
  publicBaseUrl: string,
): X402AcceptEntry {
  const resource = `${publicBaseUrl.replace(/\/+$/, "")}${p.path}`;

  // Default outputSchema when the policy doesn't provide one
  const fallbackSchema: EndpointSchema = {
    method: p.method,
    input: {},
    output: {
      data: { type: "object", description: "Response payload" },
    },
  };

  return {
    network: "stacks",
    resource,
    scheme: p.scheme,
    payTo: p.payTo,
    maxAmountRequired: p.maxAmountRequired,
    asset: p.asset,
    description: p.description,
    mimeType: p.mimeType,
    maxTimeoutSeconds: p.maxTimeoutSeconds,
    outputSchema: p.outputSchema ?? fallbackSchema,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate an x402scan-compatible discovery document from a PolicyEngine.
 *
 * ```ts
 * const doc = generateDiscovery(engine, {
 *   publicBaseUrl: "https://api.example.com",
 * });
 * ```
 */
export function generateDiscovery(
  engine: PolicyEngine,
  opts: DiscoveryOptions,
): X402Discovery {
  const publicBaseUrl = opts.publicBaseUrl;

  return {
    x402Version: 2,
    name: opts.name ?? "moltgate",
    description: opts.description ?? "x402 payment gateway",
    image: opts.image ?? `${publicBaseUrl.replace(/\/+$/, "")}/logo.png`,
    url: publicBaseUrl,
    accepts: engine
      .all()
      .map((p) => policyToAccept(p, publicBaseUrl)),
  };
}

/**
 * Serialize a discovery document to pretty-printed JSON.
 */
export function serializeDiscovery(doc: X402Discovery): string {
  return JSON.stringify(doc, null, 2);
}

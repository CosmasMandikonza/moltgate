import type { Request, Response } from "express";
import { config } from "../config.js";
import { X402_HEADERS } from "../types.js";

// ---------------------------------------------------------------------------
// Reverse-proxy handler
//
// Core primitive: turn any API into an x402-paid API.
//
//   Client → /proxy/api/weather?city=Tokyo
//   Gateway strips /proxy, enforces payment, then forwards:
//   Upstream ← /api/weather?city=Tokyo
//
// The upstream is *completely unaware* of x402.  It never sees payment
// headers — it just receives a normal HTTP request and returns content.
// The gateway wraps the upstream response with a payment receipt when
// settlement has occurred.
// ---------------------------------------------------------------------------

const STRIP_PREFIX = "/proxy";

/** Headers that MUST NOT be forwarded in either direction. */
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

/** x402 headers the gateway manages — never leak to upstream. */
const PAYMENT_HEADERS: Set<string> = new Set([
  X402_HEADERS.REQUIRED,
  X402_HEADERS.SIGNATURE,
  X402_HEADERS.RESPONSE,
]);

/** Headers to suppress when relaying from upstream back to client. */
const SUPPRESS_UPSTREAM = new Set([
  ...HOP_BY_HOP,
  // Upstream's content-length is stale after we re-serialize JSON.
  "content-length",
]);

// ---------------------------------------------------------------------------
// Build clean headers for the upstream request
// ---------------------------------------------------------------------------
function buildUpstreamHeaders(incoming: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(incoming.headers)) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower)) continue;
    if (PAYMENT_HEADERS.has(lower)) continue; // ← key: strip x402 headers
    if (typeof value === "string") out[key] = value;
    else if (Array.isArray(value)) out[key] = value.join(", ");
  }
  return out;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export async function proxyHandler(req: Request, res: Response) {
  // Read at request time (not import time) so tests can override
  const upstreamBase = (
    process.env.UPSTREAM_URL ?? config.upstreamUrl
  ).replace(/\/+$/, "");

  // /proxy/api/weather?city=Tokyo  →  /api/weather?city=Tokyo
  const upstreamPath = req.originalUrl.slice(STRIP_PREFIX.length);
  const target = `${upstreamBase}${upstreamPath}`;

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const headers = buildUpstreamHeaders(req);
  if (hasBody && !headers["content-type"]) {
    headers["content-type"] = "application/json";
  }

  try {
    // ── Forward to upstream ───────────────────────────────────────────
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? JSON.stringify(req.body) : undefined,
    });

    // ── Relay upstream response headers (clean) ───────────────────────
    for (const [key, value] of upstream.headers.entries()) {
      if (!SUPPRESS_UPSTREAM.has(key.toLowerCase())) {
        res.set(key, value);
      }
    }

    // Re-apply the gateway's PAYMENT-RESPONSE header (set by paymentRequired)
    const paymentResponse = res.getHeader(X402_HEADERS.RESPONSE);
    if (paymentResponse) {
      res.set(X402_HEADERS.RESPONSE, String(paymentResponse));
    }

    // ── Parse upstream body ───────────────────────────────────────────
    const ct = upstream.headers.get("content-type") ?? "";
    const isJson = ct.includes("application/json");
    const upstreamBody = isJson ? await upstream.json() : await upstream.text();

    // ── Send to client ────────────────────────────────────────────────
    res.status(upstream.status);

    const receipt = res.locals.receipt;

    if (receipt && isJson) {
      // Wrap in gateway envelope so the client gets both the upstream
      // data and the payment receipt in a single response.
      res.json({
        success: upstream.ok,
        data: upstreamBody,
        receipt,
      });
    } else if (isJson) {
      res.json(upstreamBody);
    } else {
      res.send(upstreamBody);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upstream unreachable";
    res.status(502).json({ success: false, error: message });
  }
}

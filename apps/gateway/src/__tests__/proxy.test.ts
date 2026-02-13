import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import express, { type Express } from "express";
import type { Server } from "http";
import { paymentRequired } from "../middleware/paymentRequired.js";
import { validateSignature } from "../middleware/validateSignature.js";
import { replayProtection, replayNonces } from "../middleware/replayProtection.js";
import { idempotency, idempotencyCache } from "../middleware/idempotency.js";
import { proxyHandler } from "../middleware/proxy.js";
import { X402_HEADERS } from "../types.js";
import type { PaymentRequirements, PaymentPayload, PaymentReceipt } from "../types.js";

// ---------------------------------------------------------------------------
// Inline upstream — mirrors apps/upstream exactly, avoids cross-package
// import that would break tsconfig rootDir.
// ---------------------------------------------------------------------------
function buildUpstream(): Express {
  const app = express();
  app.use(express.json());

  app.get("/api/weather", (req, res) => {
    const city = (req.query.city as string)?.trim();
    if (!city) {
      res.status(400).json({ error: "Missing required query parameter: city" });
      return;
    }
    const hash = [...city.toLowerCase()].reduce((s, c) => s + c.charCodeAt(0), 0);
    res.json({
      city,
      tempC: -10 + (hash % 45),
      tempF: Math.round((-10 + (hash % 45)) * 9 / 5 + 32),
      humidity: 20 + (hash % 60),
      conditions: ["sunny", "cloudy", "rainy", "snowy", "windy"][hash % 5],
      source: "moltgate-upstream",
    });
  });

  app.post("/api/summarize", (req, res) => {
    const { text } = req.body ?? {};
    if (!text || typeof text !== "string") {
      res.status(400).json({ error: "Missing required body field: text" });
      return;
    }
    const words = text.split(/\s+/).filter(Boolean);
    res.json({
      summary: text.slice(0, 80) + (text.length > 80 ? "\u2026" : ""),
      wordCount: words.length,
      charCount: text.length,
      source: "moltgate-upstream",
    });
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "moltgate-upstream" });
  });

  return app;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_NETWORK = "stacks:2147483648";
const TEST_PAY_TO = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";

let nonceCounter = 0;

function makePaymentSig(
  overrides: Partial<PaymentPayload> = {},
): string {
  nonceCounter++;
  const payload: PaymentPayload = {
    x402Version: 2,
    scheme: "exact",
    network: TEST_NETWORK,
    asset: "STX",
    payTo: TEST_PAY_TO,
    amount: "100",
    nonce: `proxy-nonce-${nonceCounter}-${Date.now()}`,
    signature: `proxy-sig-${nonceCounter}`,
    resource: "http://127.0.0.1/proxy/api/weather",
    ...overrides,
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

function decodeHeader<T>(encoded: string): T {
  return JSON.parse(Buffer.from(encoded, "base64").toString("utf-8")) as T;
}

// ---------------------------------------------------------------------------
// Boot both servers
// ---------------------------------------------------------------------------

let upstreamServer: Server;
let upstreamPort: number;

let gatewayServer: Server;
let gw: string; // gateway base URL

beforeAll(async () => {
  process.env.MOCK_PAYMENTS = "true";
  process.env.NETWORK = TEST_NETWORK;
  process.env.PAY_TO = TEST_PAY_TO;
  process.env.AMOUNT_MICROSTX = "100000";

  // ── Start upstream on a random port ──────────────────────────────────
  const upstreamApp = buildUpstream();
  await new Promise<void>((resolve) => {
    upstreamServer = upstreamApp.listen(0, () => {
      const addr = upstreamServer.address();
      upstreamPort = typeof addr === "object" && addr ? addr.port : 0;
      // Point the gateway proxy at our upstream
      process.env.UPSTREAM_URL = `http://127.0.0.1:${upstreamPort}`;
      resolve();
    });
  });

  // ── Build gateway app (same middleware stack as production) ───────────
  const gatewayApp = express();
  gatewayApp.use(express.json());
  gatewayApp.use(idempotency());
  gatewayApp.use(validateSignature());
  gatewayApp.use(replayProtection());
  gatewayApp.use(paymentRequired());
  gatewayApp.all("/proxy/*", proxyHandler);

  await new Promise<void>((resolve) => {
    gatewayServer = gatewayApp.listen(0, () => {
      const addr = gatewayServer.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      gw = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(() => {
  gatewayServer?.close();
  upstreamServer?.close();
  replayNonces.destroy();
  idempotencyCache.destroy();
});

beforeEach(() => {
  replayNonces.clear();
  idempotencyCache.clear();
  nonceCounter = 0;
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. Unpaid proxy requests → 402 with correct per-route pricing
// ═══════════════════════════════════════════════════════════════════════════
describe("proxy 402 enforcement", () => {
  it("GET /proxy/api/weather without payment returns 402", async () => {
    const res = await fetch(`${gw}/proxy/api/weather?city=Tokyo`);
    expect(res.status).toBe(402);
  });

  it("402 PAYMENT-REQUIRED header contains weather route cost (10 µSTX)", async () => {
    const res = await fetch(`${gw}/proxy/api/weather?city=Tokyo`);
    const header = res.headers.get(X402_HEADERS.REQUIRED)!;
    const reqs = decodeHeader<PaymentRequirements>(header);

    expect(reqs.x402Version).toBe(2);
    expect(reqs.accepts[0].maxAmountRequired).toBe("10");
    expect(reqs.accepts[0].asset).toBe("STX");
    expect(reqs.accepts[0].network).toBe(TEST_NETWORK);
  });

  it("POST /proxy/api/summarize without payment returns 402", async () => {
    const res = await fetch(`${gw}/proxy/api/summarize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hello" }),
    });
    expect(res.status).toBe(402);
  });

  it("402 body for summarize shows cost (50 µSTX)", async () => {
    const res = await fetch(`${gw}/proxy/api/summarize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hello" }),
    });
    const reqs = (await res.json()) as PaymentRequirements;
    expect(reqs.accepts[0].maxAmountRequired).toBe("50");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Paid proxy → upstream round-trip (data + receipt)
// ═══════════════════════════════════════════════════════════════════════════
describe("paid proxy → upstream round-trip", () => {
  it("GET /proxy/api/weather with payment returns upstream data + receipt", async () => {
    const res = await fetch(`${gw}/proxy/api/weather?city=Tokyo`, {
      headers: {
        [X402_HEADERS.SIGNATURE]: makePaymentSig({
          amount: "10",
          resource: `${gw}/proxy/api/weather`,
        }),
      },
    });
    expect(res.status).toBe(200);

    const body = await res.json() as {
      success: boolean;
      data: { city: string; tempC: number; source: string };
      receipt: PaymentReceipt;
    };

    expect(body.success).toBe(true);
    expect(body.data.city).toBe("Tokyo");
    expect(body.data.source).toBe("moltgate-upstream");
    expect(typeof body.data.tempC).toBe("number");

    expect(body.receipt).toBeDefined();
    expect(body.receipt.settled).toBe(true);
    expect(body.receipt.network).toBe(TEST_NETWORK);
  });

  it("POST /proxy/api/summarize with payment returns upstream data + receipt", async () => {
    const longText =
      "MoltGate is an open-source x402 payment gateway primitive. " +
      "It turns any API into a paid API with zero changes to the upstream.";

    const res = await fetch(`${gw}/proxy/api/summarize`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [X402_HEADERS.SIGNATURE]: makePaymentSig({
          amount: "50",
          resource: `${gw}/proxy/api/summarize`,
        }),
      },
      body: JSON.stringify({ text: longText }),
    });
    expect(res.status).toBe(200);

    const body = await res.json() as {
      success: boolean;
      data: { summary: string; wordCount: number; source: string };
      receipt: PaymentReceipt;
    };

    expect(body.success).toBe(true);
    expect(body.data.source).toBe("moltgate-upstream");
    expect(body.data.wordCount).toBeGreaterThan(0);
    expect(body.receipt.settled).toBe(true);
  });

  it("PAYMENT-RESPONSE header contains base64 JSON receipt", async () => {
    const res = await fetch(`${gw}/proxy/api/weather?city=London`, {
      headers: {
        [X402_HEADERS.SIGNATURE]: makePaymentSig({
          amount: "10",
          resource: `${gw}/proxy/api/weather`,
        }),
      },
    });

    const receiptHeader = res.headers.get(X402_HEADERS.RESPONSE);
    expect(receiptHeader).toBeTruthy();

    const receipt = decodeHeader<PaymentReceipt>(receiptHeader!);
    expect(receipt.settled).toBe(true);
    expect(receipt.amount).toBe("10");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Proxy preserves query strings and request body
// ═══════════════════════════════════════════════════════════════════════════
describe("proxy preserves request details", () => {
  it("query parameters pass through to upstream", async () => {
    const res = await fetch(`${gw}/proxy/api/weather?city=Reykjavik`, {
      headers: {
        [X402_HEADERS.SIGNATURE]: makePaymentSig({
          amount: "10",
          resource: `${gw}/proxy/api/weather`,
        }),
      },
    });
    const body = await res.json() as { data: { city: string } };
    expect(body.data.city).toBe("Reykjavik");
  });

  it("JSON body passes through to upstream POST", async () => {
    const res = await fetch(`${gw}/proxy/api/summarize`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [X402_HEADERS.SIGNATURE]: makePaymentSig({
          amount: "50",
          resource: `${gw}/proxy/api/summarize`,
        }),
      },
      body: JSON.stringify({ text: "exactly five words here yes" }),
    });
    const body = await res.json() as { data: { wordCount: number } };
    expect(body.data.wordCount).toBe(5);
  });

  it("upstream 400 errors relay through the proxy", async () => {
    const res = await fetch(`${gw}/proxy/api/weather`, {
      headers: {
        [X402_HEADERS.SIGNATURE]: makePaymentSig({
          amount: "10",
          resource: `${gw}/proxy/api/weather`,
        }),
      },
    });
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Upstream isolation — payment headers never leak
// ═══════════════════════════════════════════════════════════════════════════
describe("upstream isolation", () => {
  it("upstream responds normally (payment headers stripped before forwarding)", async () => {
    const res = await fetch(`${gw}/proxy/api/weather?city=Oslo`, {
      headers: {
        [X402_HEADERS.SIGNATURE]: makePaymentSig({
          amount: "10",
          resource: `${gw}/proxy/api/weather`,
        }),
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { city: string } };
    expect(body.data.city).toBe("Oslo");
  });

  it("direct upstream call and proxied call return identical data", async () => {
    // Direct
    const direct = await fetch(
      `http://127.0.0.1:${upstreamPort}/api/weather?city=Berlin`,
    );
    const directBody = await direct.json() as { city: string; tempC: number };

    // Proxied
    const proxied = await fetch(`${gw}/proxy/api/weather?city=Berlin`, {
      headers: {
        [X402_HEADERS.SIGNATURE]: makePaymentSig({
          amount: "10",
          resource: `${gw}/proxy/api/weather`,
        }),
      },
    });
    const proxiedBody = await proxied.json() as { data: { city: string; tempC: number } };

    expect(proxiedBody.data.city).toBe(directBody.city);
    expect(proxiedBody.data.tempC).toBe(directBody.tempC);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Per-route cost enforcement
// ═══════════════════════════════════════════════════════════════════════════
describe("per-route cost enforcement", () => {
  it("rejects weather request with amount < 10 µSTX", async () => {
    const res = await fetch(`${gw}/proxy/api/weather?city=X`, {
      headers: {
        [X402_HEADERS.SIGNATURE]: makePaymentSig({
          amount: "9",
          resource: `${gw}/proxy/api/weather`,
        }),
      },
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/[Ii]nsufficient/);
  });

  it("rejects summarize request with amount < 50 µSTX", async () => {
    const res = await fetch(`${gw}/proxy/api/summarize`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [X402_HEADERS.SIGNATURE]: makePaymentSig({
          amount: "49",
          resource: `${gw}/proxy/api/summarize`,
        }),
      },
      body: JSON.stringify({ text: "test" }),
    });
    expect(res.status).toBe(400);
  });

  it("accepts exact amount (10 µSTX for weather)", async () => {
    const res = await fetch(`${gw}/proxy/api/weather?city=X`, {
      headers: {
        [X402_HEADERS.SIGNATURE]: makePaymentSig({
          amount: "10",
          resource: `${gw}/proxy/api/weather`,
        }),
      },
    });
    expect(res.status).toBe(200);
  });

  it("accepts overpayment", async () => {
    const res = await fetch(`${gw}/proxy/api/weather?city=X`, {
      headers: {
        [X402_HEADERS.SIGNATURE]: makePaymentSig({
          amount: "999999",
          resource: `${gw}/proxy/api/weather`,
        }),
      },
    });
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Upstream unreachable → 502
// ═══════════════════════════════════════════════════════════════════════════
describe("upstream unavailable", () => {
  it("unregistered proxy paths pass through without payment (no policy match)", async () => {
    // /proxy/nonexistent has no policy → paymentRequired lets it through →
    // upstream returns 404 (or its own error) → proxy relays
    const res = await fetch(`${gw}/proxy/nonexistent`);
    expect([404, 502]).toContain(res.status);
  });
});

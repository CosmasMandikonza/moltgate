import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import express from "express";
import type { Server } from "http";
import { wrapFetch, type StacksAccount } from "@moltgate/autopay";
import { paymentRequired } from "../middleware/paymentRequired.js";
import { validateSignature } from "../middleware/validateSignature.js";
import { replayProtection, replayNonces } from "../middleware/replayProtection.js";
import { idempotency, idempotencyCache } from "../middleware/idempotency.js";
import { proxyHandler } from "../middleware/proxy.js";
import type { PaymentReceipt, PaymentRequirements } from "../types.js";

// ---------------------------------------------------------------------------
// Test account
// ---------------------------------------------------------------------------

const account: StacksAccount = {
  address: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  privateKey: "753b7cc01a1a2e86221266a154af739463fce51219d97e4f856cd7200c3bd2a601",
};

const TEST_NETWORK = "stacks:2147483648";
const TEST_PAY_TO = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";

// ---------------------------------------------------------------------------
// Inline upstream
// ---------------------------------------------------------------------------

function buildUpstream() {
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
      source: "moltgate-upstream",
    });
  });

  return app;
}

// ---------------------------------------------------------------------------
// Boot upstream + gateway
// ---------------------------------------------------------------------------

let upstreamServer: Server;
let gatewayServer: Server;
let gw: string;

beforeAll(async () => {
  process.env.MOCK_PAYMENTS = "true";
  process.env.NETWORK = TEST_NETWORK;
  process.env.PAY_TO = TEST_PAY_TO;
  process.env.AMOUNT_MICROSTX = "100000";

  // Upstream
  const upstreamApp = buildUpstream();
  await new Promise<void>((resolve) => {
    upstreamServer = upstreamApp.listen(0, () => {
      const addr = upstreamServer.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      process.env.UPSTREAM_URL = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  // Gateway
  const gatewayApp = express();
  gatewayApp.use(express.json());
  gatewayApp.use(idempotency());
  gatewayApp.use(validateSignature());
  gatewayApp.use(replayProtection());
  gatewayApp.use(paymentRequired());

  gatewayApp.get("/v1/premium/echo", (req, res) => {
    const msg = (req.query.msg as string) ?? "";
    res.json({
      success: true,
      data: { echo: msg, ts: new Date().toISOString() },
      ...(res.locals.receipt ? { receipt: res.locals.receipt } : {}),
    });
  });

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
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. wrapFetch auto-handles 402→pay→200 for local routes
// ═══════════════════════════════════════════════════════════════════════════
describe("wrapFetch — /v1/premium/echo", () => {
  it("returns paid=true after auto-paying", async () => {
    const x402 = wrapFetch(globalThis.fetch, account);
    const result = await x402(`${gw}/v1/premium/echo?msg=hello`);

    expect(result.paid).toBe(true);
    expect(result.response.status).toBe(200);
  });

  it("returns parsed data from the echo endpoint", async () => {
    const x402 = wrapFetch(globalThis.fetch, account);
    const result = await x402<{ success: boolean; data: { echo: string } }>(
      `${gw}/v1/premium/echo?msg=autopay`,
    );

    expect(result.data.success).toBe(true);
    expect(result.data.data.echo).toBe("autopay");
  });

  it("returns decoded receipt from PAYMENT-RESPONSE header", async () => {
    const x402 = wrapFetch(globalThis.fetch, account);
    const result = await x402(`${gw}/v1/premium/echo?msg=receipt`);

    expect(result.receipt).toBeDefined();
    expect(result.receipt!.settled).toBe(true);
    expect(result.receipt!.network).toBe(TEST_NETWORK);
  });

  it("returns the requirements that were satisfied", async () => {
    const x402 = wrapFetch(globalThis.fetch, account);
    const result = await x402(`${gw}/v1/premium/echo?msg=reqs`);

    expect(result.requirements).toBeDefined();
    expect(result.requirements!.x402Version).toBe(2);
    expect(result.requirements!.accepts.length).toBeGreaterThan(0);
  });

  it("returns the signed payload", async () => {
    const x402 = wrapFetch(globalThis.fetch, account);
    const result = await x402(`${gw}/v1/premium/echo?msg=payload`);

    expect(result.payload).toBeDefined();
    expect(result.payload!.x402Version).toBe(2);
    expect(result.payload!.network).toBe(TEST_NETWORK);
    expect(result.payload!.nonce).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. wrapFetch auto-handles 402→pay→200 for proxy routes
// ═══════════════════════════════════════════════════════════════════════════
describe("wrapFetch — /proxy/api/weather", () => {
  it("returns upstream weather data after auto-paying", async () => {
    const x402 = wrapFetch(globalThis.fetch, account);
    const result = await x402<{
      success: boolean;
      data: { city: string; tempC: number; source: string };
      receipt: PaymentReceipt;
    }>(`${gw}/proxy/api/weather?city=Tokyo`);

    expect(result.paid).toBe(true);
    expect(result.response.status).toBe(200);
    expect(result.data.data.city).toBe("Tokyo");
    expect(result.data.data.source).toBe("moltgate-upstream");
  });

  it("receipt matches the proxy route cost", async () => {
    const x402 = wrapFetch(globalThis.fetch, account);
    const result = await x402(`${gw}/proxy/api/weather?city=Oslo`);

    expect(result.receipt).toBeDefined();
    expect(result.receipt!.amount).toBe("10");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Hooks fire in the correct order
// ═══════════════════════════════════════════════════════════════════════════
describe("wrapFetch hooks", () => {
  it("calls on402 → onSign → onPaid in order", async () => {
    const order: string[] = [];

    const x402 = wrapFetch(globalThis.fetch, account, {
      on402: () => order.push("on402"),
      onSign: () => order.push("onSign"),
      onPaid: () => order.push("onPaid"),
    });

    await x402(`${gw}/v1/premium/echo?msg=hooks`);

    expect(order).toEqual(["on402", "onSign", "onPaid"]);
  });

  it("on402 receives requirements with accepts[]", async () => {
    let captured: PaymentRequirements | undefined;

    const x402 = wrapFetch(globalThis.fetch, account, {
      on402: (_url: string, reqs: PaymentRequirements) => { captured = reqs; },
    });

    await x402(`${gw}/v1/premium/echo?msg=capture`);

    expect(captured).toBeDefined();
    expect(captured!.accepts.length).toBeGreaterThan(0);
    expect(captured!.accepts[0].asset).toBe("STX");
  });

  it("onPaid receives the settlement receipt", async () => {
    let captured: PaymentReceipt | undefined;

    const x402 = wrapFetch(globalThis.fetch, account, {
      onPaid: (_url: string, receipt: PaymentReceipt) => { captured = receipt; },
    });

    await x402(`${gw}/v1/premium/echo?msg=receipt-hook`);

    expect(captured).toBeDefined();
    expect(captured!.settled).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Non-402 responses pass through without payment
// ═══════════════════════════════════════════════════════════════════════════
describe("wrapFetch — non-402 passthrough", () => {
  it("returns paid=false for free endpoints that return 200", async () => {
    // /proxy/nonexistent has no policy → no 402 → just upstream response
    const x402 = wrapFetch(globalThis.fetch, account);
    const result = await x402(`${gw}/proxy/nonexistent`);

    expect(result.paid).toBe(false);
    expect(result.receipt).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Each call uses a unique nonce (no replays)
// ═══════════════════════════════════════════════════════════════════════════
describe("wrapFetch — unique nonces", () => {
  it("consecutive calls succeed (no replay rejection)", async () => {
    const x402 = wrapFetch(globalThis.fetch, account);

    const r1 = await x402(`${gw}/v1/premium/echo?msg=call1`);
    const r2 = await x402(`${gw}/v1/premium/echo?msg=call2`);
    const r3 = await x402(`${gw}/v1/premium/echo?msg=call3`);

    expect(r1.response.status).toBe(200);
    expect(r2.response.status).toBe(200);
    expect(r3.response.status).toBe(200);

    // All nonces are different
    expect(r1.payload!.nonce).not.toBe(r2.payload!.nonce);
    expect(r2.payload!.nonce).not.toBe(r3.payload!.nonce);
  });
});

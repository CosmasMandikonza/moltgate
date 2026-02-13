import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import express, { type Express } from "express";
import { paymentRequired } from "../middleware/paymentRequired.js";
import { validateSignature } from "../middleware/validateSignature.js";
import { replayProtection, replayNonces } from "../middleware/replayProtection.js";
import { idempotency, idempotencyCache } from "../middleware/idempotency.js";
import { TtlCache } from "../utils/cache.js";
import { X402_HEADERS } from "../types.js";
import type { PaymentRequirements, PaymentReceipt, GatewayResponse, PaymentPayload } from "../types.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const TEST_NETWORK = "stacks:2147483648";
const TEST_PAY_TO = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
const TEST_AMOUNT = "100000";

let nonceCounter = 0;

/**
 * Build a well-formed, base64-encoded PAYMENT-SIGNATURE payload that will
 * pass strict validation against the test route's offer.
 */
function makePaymentSig(overrides: Partial<PaymentPayload> = {}): string {
  nonceCounter++;
  const payload: PaymentPayload = {
    x402Version: 2,
    scheme: "exact",
    network: TEST_NETWORK,
    asset: "STX",
    payTo: TEST_PAY_TO,
    amount: TEST_AMOUNT,
    nonce: `test-nonce-${nonceCounter}-${Date.now()}`,
    signature: `sig-${nonceCounter}`,
    resource: `http://127.0.0.1/v1/premium/echo`,
    ...overrides,
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

/** Decode a base64 header back to its JSON value. */
function decodeHeader<T>(encoded: string): T {
  return JSON.parse(Buffer.from(encoded, "base64").toString("utf-8")) as T;
}

interface EchoData { echo: string; ts: string }
type EchoResponse = GatewayResponse<EchoData>;

// ---------------------------------------------------------------------------
// Test app — mirrors production middleware stack
// ---------------------------------------------------------------------------

function buildApp(): Express {
  const app = express();
  app.use(express.json());

  // Same order as production
  app.use(idempotency());
  app.use(validateSignature());
  app.use(replayProtection());
  app.use(paymentRequired());

  app.get("/v1/premium/echo", (req, res) => {
    const msg = (req.query.msg as string) ?? "";
    res.json({
      success: true,
      data: { echo: msg, ts: new Date().toISOString() },
      ...(res.locals.receipt ? { receipt: res.locals.receipt } : {}),
    });
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  return app;
}

let app: Express;
let server: ReturnType<typeof app.listen>;
let baseUrl: string;

beforeAll(async () => {
  process.env.MOCK_PAYMENTS = "true";
  process.env.NETWORK = TEST_NETWORK;
  process.env.PAY_TO = TEST_PAY_TO;
  process.env.AMOUNT_MICROSTX = TEST_AMOUNT;

  app = buildApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(() => {
  server?.close();
  replayNonces.destroy();
  idempotencyCache.destroy();
});

beforeEach(() => {
  replayNonces.clear();
  idempotencyCache.clear();
  nonceCounter = 0;
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. Health route — free, no x402 enforcement
// ═══════════════════════════════════════════════════════════════════════════
describe("GET /health (free)", () => {
  it("returns 200 without any payment headers", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get(X402_HEADERS.REQUIRED)).toBeNull();
    expect(res.headers.get(X402_HEADERS.RESPONSE)).toBeNull();
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("ok");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. 402 response — PAYMENT-REQUIRED header & body (x402 v2)
// ═══════════════════════════════════════════════════════════════════════════
describe("402 Payment Required (x402 v2)", () => {
  it("returns 402 when no PAYMENT-SIGNATURE header is sent", async () => {
    const res = await fetch(`${baseUrl}/v1/premium/echo?msg=hello`);
    expect(res.status).toBe(402);
  });

  it("sets PAYMENT-REQUIRED header", async () => {
    const res = await fetch(`${baseUrl}/v1/premium/echo`);
    const header = res.headers.get(X402_HEADERS.REQUIRED);
    expect(header).toBeTruthy();
  });

  it("PAYMENT-REQUIRED header is valid base64 that decodes to JSON", async () => {
    const res = await fetch(`${baseUrl}/v1/premium/echo`);
    const raw = res.headers.get(X402_HEADERS.REQUIRED)!;
    const decoded = decodeHeader<PaymentRequirements>(raw);
    expect(decoded).toBeDefined();
    expect(typeof decoded).toBe("object");
  });

  it("decoded PAYMENT-REQUIRED contains x402Version: 2", async () => {
    const res = await fetch(`${baseUrl}/v1/premium/echo`);
    const raw = res.headers.get(X402_HEADERS.REQUIRED)!;
    const decoded = decodeHeader<PaymentRequirements>(raw);
    expect(decoded.x402Version).toBe(2);
  });

  it("decoded PAYMENT-REQUIRED contains non-empty accepts array", async () => {
    const res = await fetch(`${baseUrl}/v1/premium/echo`);
    const raw = res.headers.get(X402_HEADERS.REQUIRED)!;
    const decoded = decodeHeader<PaymentRequirements>(raw);
    expect(Array.isArray(decoded.accepts)).toBe(true);
    expect(decoded.accepts.length).toBeGreaterThan(0);
  });

  it("accepts[0] includes all required x402 v2 fields", async () => {
    const res = await fetch(`${baseUrl}/v1/premium/echo`);
    const raw = res.headers.get(X402_HEADERS.REQUIRED)!;
    const decoded = decodeHeader<PaymentRequirements>(raw);
    const accept = decoded.accepts[0];

    for (const field of [
      "scheme", "network", "maxAmountRequired", "resource",
      "description", "mimeType", "payTo", "maxTimeoutSeconds", "asset",
    ]) {
      expect(accept).toHaveProperty(field);
    }
  });

  it("body mirrors PAYMENT-REQUIRED header content", async () => {
    const res = await fetch(`${baseUrl}/v1/premium/echo`);
    const headerDecoded = decodeHeader<PaymentRequirements>(
      res.headers.get(X402_HEADERS.REQUIRED)!,
    );
    const body = (await res.json()) as PaymentRequirements;

    expect(body.x402Version).toBe(headerDecoded.x402Version);
    expect(body.accepts).toEqual(headerDecoded.accepts);
  });

  it("uses CAIP-2 network stacks:2147483648 and asset STX", async () => {
    const res = await fetch(`${baseUrl}/v1/premium/echo`);
    const body = (await res.json()) as PaymentRequirements;
    expect(body.accepts[0].network).toBe("stacks:2147483648");
    expect(body.accepts[0].asset).toBe("STX");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Successful paid flow — PAYMENT-RESPONSE header & receipt
// ═══════════════════════════════════════════════════════════════════════════
describe("Successful paid flow (mock)", () => {
  it("returns 200 when a valid PAYMENT-SIGNATURE is provided", async () => {
    const res = await fetch(`${baseUrl}/v1/premium/echo?msg=paid`, {
      headers: { [X402_HEADERS.SIGNATURE]: makePaymentSig() },
    });
    expect(res.status).toBe(200);
  });

  it("200 response includes PAYMENT-RESPONSE header", async () => {
    const res = await fetch(`${baseUrl}/v1/premium/echo?msg=paid`, {
      headers: { [X402_HEADERS.SIGNATURE]: makePaymentSig() },
    });
    expect(res.headers.get(X402_HEADERS.RESPONSE)).toBeTruthy();
  });

  it("PAYMENT-RESPONSE header is valid base64 JSON receipt", async () => {
    const res = await fetch(`${baseUrl}/v1/premium/echo?msg=paid`, {
      headers: { [X402_HEADERS.SIGNATURE]: makePaymentSig() },
    });

    const receipt = decodeHeader<PaymentReceipt>(
      res.headers.get(X402_HEADERS.RESPONSE)!,
    );
    expect(receipt).toHaveProperty("txHash");
    expect(receipt).toHaveProperty("network", TEST_NETWORK);
    expect(receipt).toHaveProperty("payer");
    expect(receipt).toHaveProperty("amount");
    expect(receipt).toHaveProperty("timestamp");
    expect(receipt).toHaveProperty("settled", true);
  });

  it("body includes success:true, data, and receipt", async () => {
    const res = await fetch(`${baseUrl}/v1/premium/echo?msg=check`, {
      headers: { [X402_HEADERS.SIGNATURE]: makePaymentSig() },
    });
    const body = (await res.json()) as EchoResponse;

    expect(body.success).toBe(true);
    expect(body.data.echo).toBe("check");
    expect(body.receipt).toBeDefined();
    expect(body.receipt!.settled).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Strict validation of PAYMENT-SIGNATURE payload
// ═══════════════════════════════════════════════════════════════════════════
describe("PAYMENT-SIGNATURE validation", () => {
  it("rejects non-base64 value (400)", async () => {
    const res = await fetch(`${baseUrl}/v1/premium/echo`, {
      headers: { [X402_HEADERS.SIGNATURE]: "not-valid-base64!!!" },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/base64/i);
  });

  it("rejects valid base64 that is not JSON (400)", async () => {
    const raw = Buffer.from("this is not json").toString("base64");
    const res = await fetch(`${baseUrl}/v1/premium/echo`, {
      headers: { [X402_HEADERS.SIGNATURE]: raw },
    });
    expect(res.status).toBe(400);
  });

  it("rejects payload missing required fields (400)", async () => {
    const incomplete = Buffer.from(JSON.stringify({
      x402Version: 2,
      scheme: "exact",
      // missing: network, asset, payTo, amount, nonce, signature, resource
    })).toString("base64");

    const res = await fetch(`${baseUrl}/v1/premium/echo`, {
      headers: { [X402_HEADERS.SIGNATURE]: incomplete },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/missing required fields/i);
  });

  it("rejects wrong x402Version (400)", async () => {
    const res = await fetch(`${baseUrl}/v1/premium/echo`, {
      headers: { [X402_HEADERS.SIGNATURE]: makePaymentSig({ x402Version: 1 }) },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/x402Version/);
  });

  it("rejects mismatched network (400)", async () => {
    const res = await fetch(`${baseUrl}/v1/premium/echo`, {
      headers: { [X402_HEADERS.SIGNATURE]: makePaymentSig({ network: "eip155:1" }) },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/network/);
  });

  it("rejects mismatched asset (400)", async () => {
    const res = await fetch(`${baseUrl}/v1/premium/echo`, {
      headers: { [X402_HEADERS.SIGNATURE]: makePaymentSig({ asset: "BTC" }) },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/asset/);
  });

  it("rejects mismatched payTo (400)", async () => {
    const res = await fetch(`${baseUrl}/v1/premium/echo`, {
      headers: { [X402_HEADERS.SIGNATURE]: makePaymentSig({ payTo: "ST_WRONG_ADDRESS" }) },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/payTo/);
  });

  it("rejects insufficient amount (400)", async () => {
    const res = await fetch(`${baseUrl}/v1/premium/echo`, {
      headers: { [X402_HEADERS.SIGNATURE]: makePaymentSig({ amount: "1" }) },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/[Ii]nsufficient/);
  });

  it("accepts overpayment (amount > required)", async () => {
    const res = await fetch(`${baseUrl}/v1/premium/echo?msg=over`, {
      headers: { [X402_HEADERS.SIGNATURE]: makePaymentSig({ amount: "999999999" }) },
    });
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Replay protection — duplicate nonces rejected
// ═══════════════════════════════════════════════════════════════════════════
describe("Replay protection", () => {
  it("accepts a fresh nonce", async () => {
    const res = await fetch(`${baseUrl}/v1/premium/echo?msg=a`, {
      headers: { [X402_HEADERS.SIGNATURE]: makePaymentSig({ nonce: "fresh-nonce-1" }) },
    });
    expect(res.status).toBe(200);
  });

  it("rejects duplicate nonce with 409", async () => {
    const sharedNonce = "duplicate-nonce-test";

    const first = await fetch(`${baseUrl}/v1/premium/echo?msg=a`, {
      headers: { [X402_HEADERS.SIGNATURE]: makePaymentSig({ nonce: sharedNonce }) },
    });
    expect(first.status).toBe(200);

    const second = await fetch(`${baseUrl}/v1/premium/echo?msg=a`, {
      headers: { [X402_HEADERS.SIGNATURE]: makePaymentSig({ nonce: sharedNonce }) },
    });
    expect(second.status).toBe(409);
    const body = (await second.json()) as { error: string };
    expect(body.error).toMatch(/[Rr]eplay/);
  });

  it("allows different nonces for the same route", async () => {
    const r1 = await fetch(`${baseUrl}/v1/premium/echo?msg=a`, {
      headers: { [X402_HEADERS.SIGNATURE]: makePaymentSig({ nonce: "nonce-A" }) },
    });
    const r2 = await fetch(`${baseUrl}/v1/premium/echo?msg=a`, {
      headers: { [X402_HEADERS.SIGNATURE]: makePaymentSig({ nonce: "nonce-B" }) },
    });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
  });

  it("considers nonce + memo together for uniqueness", async () => {
    // Same nonce, different memo → both accepted
    const r1 = await fetch(`${baseUrl}/v1/premium/echo?msg=a`, {
      headers: {
        [X402_HEADERS.SIGNATURE]: makePaymentSig({ nonce: "shared", memo: "memo-A" }),
      },
    });
    const r2 = await fetch(`${baseUrl}/v1/premium/echo?msg=a`, {
      headers: {
        [X402_HEADERS.SIGNATURE]: makePaymentSig({ nonce: "shared", memo: "memo-B" }),
      },
    });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    // Same nonce + same memo → replay
    const r3 = await fetch(`${baseUrl}/v1/premium/echo?msg=a`, {
      headers: {
        [X402_HEADERS.SIGNATURE]: makePaymentSig({ nonce: "shared", memo: "memo-B" }),
      },
    });
    expect(r3.status).toBe(409);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Idempotency-Key — cached receipt without re-settlement
// ═══════════════════════════════════════════════════════════════════════════
describe("Idempotency-Key", () => {
  it("returns cached 200 on second request with same key (no re-charge)", async () => {
    const idemKey = "idem-cached-receipt";

    const first = await fetch(`${baseUrl}/v1/premium/echo?msg=idem`, {
      headers: {
        [X402_HEADERS.SIGNATURE]: makePaymentSig({ nonce: "idem-n1" }),
        "idempotency-key": idemKey,
      },
    });
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as EchoResponse;

    // Second call — same idempotency key, different payment payload
    // Should return cached response without any payment processing
    const second = await fetch(`${baseUrl}/v1/premium/echo?msg=idem`, {
      headers: {
        [X402_HEADERS.SIGNATURE]: makePaymentSig({ nonce: "idem-n2" }),
        "idempotency-key": idemKey,
      },
    });
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as EchoResponse;

    expect(secondBody).toEqual(firstBody);
  });

  it("preserves PAYMENT-RESPONSE header on idempotent replay", async () => {
    const idemKey = "idem-header-preserve";

    const first = await fetch(`${baseUrl}/v1/premium/echo?msg=h`, {
      headers: {
        [X402_HEADERS.SIGNATURE]: makePaymentSig({ nonce: "hdr-n1" }),
        "idempotency-key": idemKey,
      },
    });
    const firstReceipt = first.headers.get(X402_HEADERS.RESPONSE);
    expect(firstReceipt).toBeTruthy();

    const second = await fetch(`${baseUrl}/v1/premium/echo?msg=h`, {
      headers: {
        [X402_HEADERS.SIGNATURE]: makePaymentSig({ nonce: "hdr-n2" }),
        "idempotency-key": idemKey,
      },
    });
    const secondReceipt = second.headers.get(X402_HEADERS.RESPONSE);

    expect(secondReceipt).toBe(firstReceipt);
  });

  it("different idempotency keys produce independent responses", async () => {
    const r1 = await fetch(`${baseUrl}/v1/premium/echo?msg=a`, {
      headers: {
        [X402_HEADERS.SIGNATURE]: makePaymentSig({ nonce: "ind-n1" }),
        "idempotency-key": "key-alpha",
      },
    });
    const r2 = await fetch(`${baseUrl}/v1/premium/echo?msg=b`, {
      headers: {
        [X402_HEADERS.SIGNATURE]: makePaymentSig({ nonce: "ind-n2" }),
        "idempotency-key": "key-beta",
      },
    });

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    const b1 = (await r1.json()) as EchoResponse;
    const b2 = (await r2.json()) as EchoResponse;
    expect(b1.data.echo).toBe("a");
    expect(b2.data.echo).toBe("b");
  });

  it("does not cache 402 responses", async () => {
    const idemKey = "idem-no-cache-402";

    // First: no sig → 402
    const first = await fetch(`${baseUrl}/v1/premium/echo`, {
      headers: { "idempotency-key": idemKey },
    });
    expect(first.status).toBe(402);

    // Second: valid sig + same key → should NOT return cached 402
    const second = await fetch(`${baseUrl}/v1/premium/echo?msg=now`, {
      headers: {
        [X402_HEADERS.SIGNATURE]: makePaymentSig({ nonce: "idem-402-n" }),
        "idempotency-key": idemKey,
      },
    });
    expect(second.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Base64 round-trip integrity
// ═══════════════════════════════════════════════════════════════════════════
describe("base64 round-trip", () => {
  it("PAYMENT-REQUIRED header ↔ body are identical after decode", async () => {
    const res = await fetch(`${baseUrl}/v1/premium/echo`);
    const headerDecoded = decodeHeader<PaymentRequirements>(
      res.headers.get(X402_HEADERS.REQUIRED)!,
    );
    const body = (await res.json()) as PaymentRequirements;
    expect(headerDecoded).toEqual(body);
  });

  it("arbitrary JSON survives base64 encode→decode without loss", () => {
    const original = {
      x402Version: 2,
      accepts: [{ scheme: "exact", asset: "STX", network: "stacks:2147483648" }],
    };
    const encoded = Buffer.from(JSON.stringify(original)).toString("base64");
    const decoded = JSON.parse(Buffer.from(encoded, "base64").toString("utf-8"));
    expect(decoded).toEqual(original);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. TtlCache unit tests
// ═══════════════════════════════════════════════════════════════════════════
describe("TtlCache", () => {
  it("stores and retrieves values", () => {
    const cache = new TtlCache<string>(60_000);
    cache.set("a", "hello");
    expect(cache.get("a")).toBe("hello");
    cache.destroy();
  });

  it("expires entries after TTL", async () => {
    const cache = new TtlCache<string>(50);
    cache.set("b", "world");
    await new Promise((r) => setTimeout(r, 80));
    expect(cache.get("b")).toBeUndefined();
    cache.destroy();
  });

  it("has() returns false for expired keys", async () => {
    const cache = new TtlCache<number>(30);
    cache.set("c", 42);
    await new Promise((r) => setTimeout(r, 60));
    expect(cache.has("c")).toBe(false);
    cache.destroy();
  });
});

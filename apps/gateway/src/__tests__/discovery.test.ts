import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express, { type Express } from "express";
import type { Server } from "http";
import { x402Discovery } from "@moltgate/schema";
import type { X402Discovery, X402AcceptEntry } from "@moltgate/schema";
import { engine } from "../policies.js";
import { config } from "../config.js";

// ---------------------------------------------------------------------------
// Boot a minimal app with just the discovery endpoint
// ---------------------------------------------------------------------------

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  process.env.MOCK_PAYMENTS = "true";
  process.env.NETWORK = "stacks:2147483648";
  process.env.PAY_TO = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
  process.env.AMOUNT_MICROSTX = "100000";
  process.env.PUBLIC_BASE_URL = "https://gateway.example.com";

  const app = express();
  app.get(
    "/.well-known/x402",
    x402Discovery(engine, {
      name: "MoltGate Gateway",
      description: "test gateway",
      publicBaseUrl: "https://gateway.example.com",
    }),
  );

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
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. Discovery endpoint returns 200 with valid JSON
// ═══════════════════════════════════════════════════════════════════════════
describe("GET /.well-known/x402", () => {
  it("returns 200", async () => {
    const res = await fetch(`${baseUrl}/.well-known/x402`);
    expect(res.status).toBe(200);
  });

  it("returns Content-Type application/json", async () => {
    const res = await fetch(`${baseUrl}/.well-known/x402`);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("body is valid JSON", async () => {
    const res = await fetch(`${baseUrl}/.well-known/x402`);
    const doc = (await res.json()) as X402Discovery;
    expect(doc).toBeDefined();
    expect(typeof doc).toBe("object");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Top-level structure: name, image, accepts[]
// ═══════════════════════════════════════════════════════════════════════════
describe("discovery document structure", () => {
  let doc: X402Discovery;

  beforeAll(async () => {
    const res = await fetch(`${baseUrl}/.well-known/x402`);
    doc = (await res.json()) as X402Discovery;
  });

  it("contains x402Version: 2", () => {
    expect(doc.x402Version).toBe(2);
  });

  it("contains name", () => {
    expect(doc.name).toBe("MoltGate Gateway");
  });

  it("contains image URL", () => {
    expect(typeof doc.image).toBe("string");
    expect(doc.image.length).toBeGreaterThan(0);
  });

  it("contains description", () => {
    expect(typeof doc.description).toBe("string");
    expect(doc.description.length).toBeGreaterThan(0);
  });

  it("contains non-empty accepts array", () => {
    expect(Array.isArray(doc.accepts)).toBe(true);
    expect(doc.accepts.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. accepts[] entries — required fields
// ═══════════════════════════════════════════════════════════════════════════
describe("accepts[] entries", () => {
  let accepts: X402AcceptEntry[];

  beforeAll(async () => {
    const res = await fetch(`${baseUrl}/.well-known/x402`);
    const doc = (await res.json()) as X402Discovery;
    accepts = doc.accepts;
  });

  it("every entry has network = 'stacks'", () => {
    for (const entry of accepts) {
      expect(entry.network).toBe("stacks");
    }
  });

  it("every entry has an HTTPS resource URL", () => {
    for (const entry of accepts) {
      expect(entry.resource).toMatch(/^https:\/\//);
    }
  });

  it("every entry has payTo", () => {
    for (const entry of accepts) {
      expect(typeof entry.payTo).toBe("string");
      expect(entry.payTo.length).toBeGreaterThan(0);
    }
  });

  it("every entry has maxAmountRequired", () => {
    for (const entry of accepts) {
      expect(typeof entry.maxAmountRequired).toBe("string");
      expect(entry.maxAmountRequired.length).toBeGreaterThan(0);
    }
  });

  it("every entry has description", () => {
    for (const entry of accepts) {
      expect(typeof entry.description).toBe("string");
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it("every entry has asset = 'STX'", () => {
    for (const entry of accepts) {
      expect(entry.asset).toBe("STX");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. outputSchema — exists and is non-empty on every entry
// ═══════════════════════════════════════════════════════════════════════════
describe("outputSchema", () => {
  let accepts: X402AcceptEntry[];

  beforeAll(async () => {
    const res = await fetch(`${baseUrl}/.well-known/x402`);
    const doc = (await res.json()) as X402Discovery;
    accepts = doc.accepts;
  });

  it("every entry has an outputSchema object", () => {
    for (const entry of accepts) {
      expect(entry.outputSchema).toBeDefined();
      expect(typeof entry.outputSchema).toBe("object");
    }
  });

  it("every outputSchema has a method field", () => {
    for (const entry of accepts) {
      expect(typeof entry.outputSchema.method).toBe("string");
      expect(["GET", "POST", "PUT", "DELETE", "PATCH"]).toContain(
        entry.outputSchema.method,
      );
    }
  });

  it("every outputSchema has an input object", () => {
    for (const entry of accepts) {
      expect(typeof entry.outputSchema.input).toBe("object");
    }
  });

  it("every outputSchema has a non-empty output object", () => {
    for (const entry of accepts) {
      expect(typeof entry.outputSchema.output).toBe("object");
      expect(Object.keys(entry.outputSchema.output).length).toBeGreaterThan(0);
    }
  });

  it("GET routes have query params in input", () => {
    const getEntries = accepts.filter(
      (e) => e.outputSchema.method === "GET",
    );
    expect(getEntries.length).toBeGreaterThan(0);

    for (const entry of getEntries) {
      expect(entry.outputSchema.input.query).toBeDefined();
      expect(Object.keys(entry.outputSchema.input.query!).length).toBeGreaterThan(0);
    }
  });

  it("POST routes have body params in input", () => {
    const postEntries = accepts.filter(
      (e) => e.outputSchema.method === "POST",
    );
    expect(postEntries.length).toBeGreaterThan(0);

    for (const entry of postEntries) {
      expect(entry.outputSchema.input.body).toBeDefined();
      expect(Object.keys(entry.outputSchema.input.body!).length).toBeGreaterThan(0);
    }
  });

  it("output fields have type property", () => {
    for (const entry of accepts) {
      for (const [, field] of Object.entries(entry.outputSchema.output)) {
        expect(field).toHaveProperty("type");
        expect(["string", "number", "boolean", "object", "array"]).toContain(
          field.type,
        );
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Specific route schemas — weather, summarize, echo
// ═══════════════════════════════════════════════════════════════════════════
describe("specific route schemas", () => {
  let accepts: X402AcceptEntry[];

  beforeAll(async () => {
    const res = await fetch(`${baseUrl}/.well-known/x402`);
    const doc = (await res.json()) as X402Discovery;
    accepts = doc.accepts;
  });

  it("weather endpoint schema has city query param", () => {
    const weather = accepts.find((e) => e.resource.includes("/proxy/api/weather"));
    expect(weather).toBeDefined();
    expect(weather!.outputSchema.input.query).toHaveProperty("city");
    expect(weather!.outputSchema.input.query!.city.type).toBe("string");
    expect(weather!.outputSchema.input.query!.city.required).toBe(true);
  });

  it("weather output includes tempC, humidity, conditions", () => {
    const weather = accepts.find((e) => e.resource.includes("/proxy/api/weather"));
    expect(weather!.outputSchema.output).toHaveProperty("tempC");
    expect(weather!.outputSchema.output).toHaveProperty("humidity");
    expect(weather!.outputSchema.output).toHaveProperty("conditions");
  });

  it("summarize endpoint schema has text body param", () => {
    const summarize = accepts.find((e) => e.resource.includes("/proxy/api/summarize"));
    expect(summarize).toBeDefined();
    expect(summarize!.outputSchema.input.body).toHaveProperty("text");
    expect(summarize!.outputSchema.input.body!.text.type).toBe("string");
    expect(summarize!.outputSchema.input.body!.text.required).toBe(true);
  });

  it("summarize output includes summary, wordCount", () => {
    const summarize = accepts.find((e) => e.resource.includes("/proxy/api/summarize"));
    expect(summarize!.outputSchema.output).toHaveProperty("summary");
    expect(summarize!.outputSchema.output).toHaveProperty("wordCount");
  });

  it("echo endpoint schema has msg query param", () => {
    const echo = accepts.find((e) => e.resource.includes("/v1/premium/echo"));
    expect(echo).toBeDefined();
    expect(echo!.outputSchema.input.query).toHaveProperty("msg");
  });

  it("weather resource URL uses PUBLIC_BASE_URL", () => {
    const weather = accepts.find((e) => e.resource.includes("/proxy/api/weather"));
    expect(weather!.resource).toBe("https://gateway.example.com/proxy/api/weather");
  });

  it("weather costs 10 µSTX, summarize costs 50 µSTX", () => {
    const weather = accepts.find((e) => e.resource.includes("/proxy/api/weather"));
    const summarize = accepts.find((e) => e.resource.includes("/proxy/api/summarize"));
    expect(weather!.maxAmountRequired).toBe("10");
    expect(summarize!.maxAmountRequired).toBe("50");
  });
});

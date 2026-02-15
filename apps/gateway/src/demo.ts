#!/usr/bin/env tsx
// ---------------------------------------------------------------------------
// MoltGate Autopay CLI Demo
//
// Self-contained: boots upstream + gateway in-process, then exercises the
// full x402 flow with @moltgate/autopay's wrapFetch.
//
// Run:
//   pnpm demo                        (from repo root)
//   npx tsx src/demo.ts              (from apps/gateway)
// ---------------------------------------------------------------------------

import express from "express";
import type { Server } from "http";
import { wrapFetch, type AutopayHooks, type StacksAccount } from "@moltgate/autopay";
import type { PaymentReceipt } from "@moltgate/policy";

import { paymentRequired } from "./middleware/paymentRequired.js";
import { validateSignature } from "./middleware/validateSignature.js";
import { replayProtection } from "./middleware/replayProtection.js";
import { idempotency } from "./middleware/idempotency.js";
import { proxyHandler } from "./middleware/proxy.js";

// ── Config ────────────────────────────────────────────────────────────────

process.env.MOCK_PAYMENTS = "true";
process.env.NETWORK = "stacks:2147483648";
process.env.PAY_TO = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
process.env.AMOUNT_MICROSTX = "100000";

const account: StacksAccount = {
  address: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  privateKey:
    "753b7cc01a1a2e86221266a154af739463fce51219d97e4f856cd7200c3bd2a601",
};

// ── Colors ────────────────────────────────────────────────────────────────

const c = {
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
  reset: "\x1b[0m",
};

const log = {
  banner(text: string) {
    console.log(`\n${c.bold}${c.cyan}${"═".repeat(64)}${c.reset}`);
    console.log(`${c.bold}${c.cyan}  ${text}${c.reset}`);
    console.log(`${c.cyan}${"═".repeat(64)}${c.reset}\n`);
  },
  step(icon: string, msg: string) {
    console.log(`  ${icon}  ${msg}`);
  },
  json(label: string, obj: unknown) {
    const s = JSON.stringify(obj, null, 2)
      .split("\n")
      .map((l) => `       ${c.dim}${l}${c.reset}`)
      .join("\n");
    console.log(`     ${c.dim}${label}:${c.reset}`);
    console.log(s);
  },
};

// ── Hooks: log the 402→pay→200 lifecycle ──────────────────────────────────

const hooks: AutopayHooks = {
  on402(_url, requirements) {
    const accept = requirements.accepts[0];
    log.step(
      `${c.red}402${c.reset}`,
      `${c.red}Payment Required${c.reset} — ${c.yellow}${accept.maxAmountRequired} µ${accept.asset}${c.reset} on ${accept.network}`,
    );
    log.step(
      `   `,
      `${c.dim}payTo: ${accept.payTo.slice(0, 20)}…  scheme: ${accept.scheme}${c.reset}`,
    );
  },

  onSign(_url, payload) {
    log.step(
      `${c.blue}PAY${c.reset}`,
      `${c.blue}Signing${c.reset} ${payload.amount} µ${payload.asset}  nonce=${c.dim}${payload.nonce.slice(0, 12)}…${c.reset}`,
    );
  },

  onPaid(_url, receipt) {
    log.step(
      `${c.green}200${c.reset}`,
      `${c.green}Settled!${c.reset}  txHash=${c.dim}${receipt.txHash}${c.reset}  settled=${receipt.settled}`,
    );
  },
};

// ── Boot servers in-process ───────────────────────────────────────────────

function buildUpstream(): express.Express {
  const app = express();
  app.use(express.json());

  app.get("/api/weather", (req, res) => {
    const city = (req.query.city as string)?.trim();
    if (!city) {
      res.status(400).json({ error: "Missing city" });
      return;
    }
    const h = [...city.toLowerCase()].reduce((s, ch) => s + ch.charCodeAt(0), 0);
    res.json({
      city,
      tempC: -10 + (h % 45),
      tempF: Math.round((-10 + (h % 45)) * 9 / 5 + 32),
      humidity: 20 + (h % 60),
      conditions: ["sunny", "cloudy", "rainy", "snowy", "windy"][h % 5],
      source: "moltgate-upstream",
    });
  });

  app.post("/api/summarize", (req, res) => {
    const { text } = req.body ?? {};
    if (!text || typeof text !== "string") {
      res.status(400).json({ error: "Missing text" });
      return;
    }
    const words = text.split(/\s+/).filter(Boolean);
    res.json({
      summary: text.slice(0, 80) + (text.length > 80 ? "…" : ""),
      wordCount: words.length,
      charCount: text.length,
      source: "moltgate-upstream",
    });
  });

  return app;
}

function buildGateway(): express.Express {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  // x402 middleware stack
  app.use(idempotency());
  app.use(validateSignature());
  app.use(replayProtection());
  app.use(paymentRequired());

  // Local paid route
  app.get("/v1/premium/echo", (req, res) => {
    const msg = (req.query.msg as string) ?? "";
    res.json({
      success: true,
      data: { echo: msg, ts: new Date().toISOString() },
      ...(res.locals.receipt ? { receipt: res.locals.receipt } : {}),
    });
  });

  // Proxy routes
  app.all("/proxy/*", proxyHandler);

  return app;
}

function listen(app: express.Express): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ server, port });
    });
  });
}

// ── Demo scenarios ────────────────────────────────────────────────────────

async function main() {
  // Boot
  const { server: upSrv, port: upPort } = await listen(buildUpstream());
  process.env.UPSTREAM_URL = `http://127.0.0.1:${upPort}`;

  const { server: gwSrv, port: gwPort } = await listen(buildGateway());
  const gw = `http://127.0.0.1:${gwPort}`;

  const x402 = wrapFetch(globalThis.fetch, account, hooks);

  console.log(`\n${c.bold}${c.cyan}  MoltGate Autopay Demo${c.reset}`);
  console.log(`${c.dim}  Gateway  :${gwPort}  (mock payments)${c.reset}`);
  console.log(`${c.dim}  Upstream :${upPort}${c.reset}`);
  console.log(`${c.dim}  Payer    ${account.address.slice(0, 20)}…${c.reset}`);

  // ── 1. Echo (local route, 100000 µSTX) ──────────────────────────────
  log.banner("1 · GET /v1/premium/echo?msg=hello+moltgate");
  log.step(">>>", `${c.bold}GET${c.reset} ${gw}/v1/premium/echo?msg=hello+moltgate`);
  console.log();

  const echo = await x402<{
    success: boolean;
    data: { echo: string; ts: string };
    receipt?: PaymentReceipt;
  }>(`${gw}/v1/premium/echo?msg=hello+moltgate`);

  console.log();
  log.step(
    `${c.bold}<<<${c.reset}`,
    `paid=${c.green}${echo.paid}${c.reset}  status=${echo.response.status}`,
  );
  log.json("data", echo.data.data);
  if (echo.receipt) log.json("receipt", echo.receipt);

  // ── 2. Weather (proxy route, 10 µSTX) ──────────────────────────────
  log.banner("2 · GET /proxy/api/weather?city=Tokyo");
  log.step(">>>", `${c.bold}GET${c.reset} ${gw}/proxy/api/weather?city=Tokyo`);
  console.log();

  const weather = await x402<{
    success: boolean;
    data: { city: string; tempC: number; conditions: string };
    receipt?: PaymentReceipt;
  }>(`${gw}/proxy/api/weather?city=Tokyo`);

  console.log();
  log.step(
    `${c.bold}<<<${c.reset}`,
    `paid=${c.green}${weather.paid}${c.reset}  status=${weather.response.status}`,
  );
  log.json("data", weather.data.data);
  if (weather.receipt) log.json("receipt", weather.receipt);

  // ── 3. Summarize (proxy POST route, 50 µSTX) ───────────────────────
  const text =
    "MoltGate is an open-source x402 payment gateway. " +
    "It turns any API into a paid API with zero changes to the upstream. " +
    "Built for the Stacks ecosystem using HTTP 402 Payment Required.";

  log.banner("3 · POST /proxy/api/summarize");
  log.step(">>>", `${c.bold}POST${c.reset} ${gw}/proxy/api/summarize`);
  log.step("   ", `${c.dim}body.text = "${text.slice(0, 50)}…"${c.reset}`);
  console.log();

  const summary = await x402<{
    success: boolean;
    data: { summary: string; wordCount: number };
    receipt?: PaymentReceipt;
  }>(`${gw}/proxy/api/summarize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });

  console.log();
  log.step(
    `${c.bold}<<<${c.reset}`,
    `paid=${c.green}${summary.paid}${c.reset}  status=${summary.response.status}`,
  );
  log.json("data", summary.data.data);
  if (summary.receipt) log.json("receipt", summary.receipt);

  // ── Summary ─────────────────────────────────────────────────────────
  log.banner("All 3 endpoints: 402 → pay → 200");
  console.log(`  For each request, ${c.bold}wrapFetch${c.reset} automatically:`);
  console.log(`    ${c.dim}1.${c.reset} Sent request (no payment headers)`);
  console.log(`    ${c.dim}2.${c.reset} Received ${c.red}402${c.reset} + decoded ${c.yellow}PAYMENT-REQUIRED${c.reset} header`);
  console.log(`    ${c.dim}3.${c.reset} Built PaymentPayload matching the offer, signed with account`);
  console.log(`    ${c.dim}4.${c.reset} Retried with ${c.blue}PAYMENT-SIGNATURE${c.reset} header`);
  console.log(`    ${c.dim}5.${c.reset} Received ${c.green}200${c.reset} + decoded ${c.green}PAYMENT-RESPONSE${c.reset} receipt\n`);

  // Cleanup
  gwSrv.close();
  upSrv.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

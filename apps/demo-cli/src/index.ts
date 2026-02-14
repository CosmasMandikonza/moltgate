#!/usr/bin/env tsx
// ---------------------------------------------------------------------------
// MoltGate autopay CLI demo
//
// Usage:
//   1. Start the gateway + upstream:
//        pnpm dev:upstream &
//        pnpm dev:gateway &
//   2. Run this demo:
//        pnpm demo
//
// Demonstrates the full x402 flow:
//   Client → 402 → parse offer → build payment → retry → 200 + receipt
// ---------------------------------------------------------------------------

import { wrapFetch, type StacksAccount, type AutopayHooks } from "@moltgate/autopay";

// ── Configuration ─────────────────────────────────────────────────────────

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:3000";

const account: StacksAccount = {
  address: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  privateKey: "753b7cc01a1a2e86221266a154af739463fce51219d97e4f856cd7200c3bd2a601",
};

// ── Colored output helpers ────────────────────────────────────────────────

const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function banner(text: string) {
  console.log(`\n${BOLD}${CYAN}${"═".repeat(60)}${RESET}`);
  console.log(`${BOLD}${CYAN}  ${text}${RESET}`);
  console.log(`${CYAN}${"═".repeat(60)}${RESET}\n`);
}

function step(icon: string, msg: string) {
  console.log(`  ${icon}  ${msg}`);
}

function json(label: string, obj: unknown) {
  const s = JSON.stringify(obj, null, 2)
    .split("\n")
    .map((l) => `     ${DIM}${l}${RESET}`)
    .join("\n");
  console.log(`     ${DIM}${label}:${RESET}`);
  console.log(s);
}

// ── Hooks — log the 402→pay→200 lifecycle ─────────────────────────────────

const hooks: AutopayHooks = {
  on402(url, requirements) {
    step(`${RED}⛔${RESET}`, `${RED}HTTP 402${RESET} Payment Required`);
    const accept = requirements.accepts[0];
    step(
      `${YELLOW}💰${RESET}`,
      `${YELLOW}Offer:${RESET} ${accept.maxAmountRequired} µ${accept.asset} on ${accept.network}`,
    );
    step(`${DIM}📍${RESET}`, `${DIM}payTo: ${accept.payTo}${RESET}`);
    step(`${DIM}📝${RESET}`, `${DIM}${accept.description}${RESET}`);
  },

  onSign(url, payload) {
    step(
      `${BLUE}✍️${RESET}`,
      `${BLUE}Signing${RESET} payment: ${payload.amount} µ${payload.asset} → ${payload.payTo.slice(0, 12)}…`,
    );
    step(`${DIM}🔑${RESET}`, `${DIM}nonce: ${payload.nonce}${RESET}`);
  },

  onPaid(url, receipt) {
    step(
      `${GREEN}✅${RESET}`,
      `${GREEN}HTTP 200${RESET} — Payment settled!`,
    );
    step(
      `${DIM}🧾${RESET}`,
      `${DIM}txHash: ${receipt.txHash}  settled: ${receipt.settled}${RESET}`,
    );
  },
};

// ── Create the autopay-wrapped fetch ──────────────────────────────────────

const x402fetch = wrapFetch(globalThis.fetch, account, hooks);

// ── Demo scenarios ────────────────────────────────────────────────────────

async function demoEcho() {
  banner("1 · GET /v1/premium/echo?msg=hello+moltgate");

  step("📡", `${BOLD}Request:${RESET} GET ${GATEWAY_URL}/v1/premium/echo?msg=hello+moltgate`);
  console.log();

  const { data, paid, receipt } = await x402fetch(
    `${GATEWAY_URL}/v1/premium/echo?msg=hello+moltgate`,
  );

  console.log();
  step("📦", `${BOLD}Result:${RESET} paid=${paid}`);
  json("Response body", data);

  if (receipt) {
    json("Receipt", receipt);
  }
}

async function demoWeather() {
  banner("2 · GET /proxy/api/weather?city=Tokyo");

  step("📡", `${BOLD}Request:${RESET} GET ${GATEWAY_URL}/proxy/api/weather?city=Tokyo`);
  console.log();

  const { data, paid, receipt } = await x402fetch(
    `${GATEWAY_URL}/proxy/api/weather?city=Tokyo`,
  );

  console.log();
  step("📦", `${BOLD}Result:${RESET} paid=${paid}`);
  json("Response body", data);

  if (receipt) {
    json("Receipt", receipt);
  }
}

async function demoSummarize() {
  banner("3 · POST /proxy/api/summarize");

  const text =
    "MoltGate is an open-source x402 payment gateway. " +
    "It turns any API into a paid API with zero changes to the upstream. " +
    "Built for the Stacks ecosystem using HTTP 402 Payment Required.";

  step("📡", `${BOLD}Request:${RESET} POST ${GATEWAY_URL}/proxy/api/summarize`);
  step(`${DIM}📄${RESET}`, `${DIM}body: { text: "${text.slice(0, 50)}…" }${RESET}`);
  console.log();

  const { data, paid, receipt } = await x402fetch(
    `${GATEWAY_URL}/proxy/api/summarize`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    },
  );

  console.log();
  step("📦", `${BOLD}Result:${RESET} paid=${paid}`);
  json("Response body", data);

  if (receipt) {
    json("Receipt", receipt);
  }
}

// ── Run ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${BOLD}${CYAN}🚀 MoltGate Autopay Demo${RESET}`);
  console.log(`${DIM}   Gateway: ${GATEWAY_URL}${RESET}`);
  console.log(`${DIM}   Account: ${account.address}${RESET}`);

  try {
    const health = await globalThis.fetch(`${GATEWAY_URL}/health`);
    if (!health.ok) throw new Error(`Gateway unhealthy: ${health.status}`);
    step(`${GREEN}✓${RESET}`, `${GREEN}Gateway is up${RESET}`);
  } catch {
    console.error(`\n${RED}✗ Cannot reach gateway at ${GATEWAY_URL}${RESET}`);
    console.error(`${DIM}  Start it first:  pnpm dev:upstream &  pnpm dev:gateway &${RESET}\n`);
    process.exit(1);
  }

  await demoEcho();
  await demoWeather();
  await demoSummarize();

  banner("Done — all 3 endpoints paid and served!");
  console.log(`  The x402 flow for each request was:\n`);
  console.log(`  ${DIM}1.${RESET} Client sends request (no payment)`);
  console.log(`  ${DIM}2.${RESET} Gateway returns ${RED}402${RESET} + ${YELLOW}payment-required${RESET} header`);
  console.log(`  ${DIM}3.${RESET} Client decodes offer, builds ${BLUE}PaymentPayload${RESET}, signs`);
  console.log(`  ${DIM}4.${RESET} Client retries with ${BLUE}payment-signature${RESET} header`);
  console.log(`  ${DIM}5.${RESET} Gateway validates, settles, returns ${GREEN}200${RESET} + ${GREEN}payment-response${RESET}`);
  console.log(`  ${DIM}6.${RESET} Client decodes receipt → done!\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

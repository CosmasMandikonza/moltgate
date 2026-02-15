<div align="center">

# MoltGate

### x402 Payment Gateway for Stacks

**Put it in front of any API. Zero upstream changes. Agents discover, negotiate, and pay automatically.**

[Live Demo](https://moltgate.vercel.app) · [Video Walkthrough](https://youtu.be/XXXXX) · [x402 Protocol](https://www.x402.org)

---

</div>

## The Problem

Every x402 integration today requires **modifying your upstream API code**. Add middleware, handle payment headers, integrate the facilitator, redeploy. For every single API. This doesn't scale.

## The Solution: The Proxy Primitive

MoltGate is a **reverse-proxy payment gateway**. It sits between clients and any HTTP API, enforcing x402 payment on every request. The upstream server has **zero knowledge of payments** — it never sees a payment header, never imports an x402 library, never changes a single line of code.

```
┌──────────┐     ┌──────────────────────────┐     ┌──────────────┐
│  Client   │────▶│     MoltGate Gateway      │────▶│ Upstream API │
│ (browser/ │     │                          │     │  (any HTTP)  │
│  agent)   │◀────│  402 → Pay → Verify → 200│◀────│  Zero x402   │
└──────────┘     └──────────────────────────┘     │  knowledge   │
                          │                       └──────────────┘
                          ▼
                 ┌──────────────────┐
                 │ Stacks Testnet   │
                 │ (Bitcoin-secured) │
                 └──────────────────┘
```

**Like Cloudflare, but for payments.**

## Key Features

### ⚡ Proxy Any API
Point MoltGate at any HTTP API. Define pricing with the policy engine. That API now charges micropayments in STX. The upstream server doesn't know, doesn't care, doesn't change.

### 🤖 Moltbot Agent
AI agents with µSTX budgets that chain multiple paid API calls autonomously. Budget tracking, cost estimation, and multi-step orchestration — the foundation for agent-to-API commerce.

### 📡 x402scan Discovery
Machine-readable endpoint catalogue at `/.well-known/x402`. Agents crawl your gateway to discover every paid endpoint, its pricing, and full I/O schemas (input params + response fields) — without triggering a 402.

### 🛡 5-Layer Middleware Stack
Production-grade request pipeline:
1. **Idempotency** — Return cached receipts for duplicate requests
2. **Signature Validation** — Decode, parse, and cross-reference payment headers against route offers
3. **Replay Protection** — Reject reused nonces
4. **Payment Gate** — Enforce 402 / mock / facilitator verify+settle
5. **Proxy Route** — Forward to upstream with zero modification

### 💼 Stacks Wallet Integration
Connect Leather, Hiro, or Xverse wallet directly in the browser. When connected, MoltGate switches from mock to **live mode** — every API call builds a real unsigned STX token transfer, signs it via your wallet, and the gateway forwards it to the Stacks testnet facilitator for on-chain settlement. **Real STX moves. Real transactions on Bitcoin L2.**

### ⚙️ Policy Engine
Fluent builder API for per-route pricing:

```typescript
engine.add(
  policy("/proxy/api/weather")
    .get()
    .costs("10", "STX")
    .on("stacks:2147483648")
    .payTo(config.payTo)
    .describe("Weather lookup — 10 µSTX per call")
    .ioSchema({
      method: "GET",
      input: { query: { city: { type: "string", required: true } } },
      output: { tempC: { type: "number" }, conditions: { type: "string" } },
    })
    .build()
);
```

## Two Modes, One Env Var

| Mode | Trigger | What Happens |
|------|---------|-------------|
| **Mock** | `MOCK_PAYMENTS=true` (default) | Gateway accepts any signature, no tokens move. For development. |
| **Live** | `MOCK_PAYMENTS=false` + wallet connected | Browser builds real STX transfer → wallet signs → gateway verifies with facilitator → STX settles on-chain |

The demo automatically switches when you connect a Stacks wallet. No config changes needed on the frontend.

## Quick Start

### One-Command Deploy

```bash
git clone https://github.com/YOURUSERNAME/moltgate.git
cd moltgate
docker compose up
```

That's it. Gateway on `:3000`, upstream on `:4000`, demo on `:3001`.

### Development Mode

```bash
pnpm install
pnpm dev:upstream  # Plain weather API (zero x402 code)
pnpm dev:gateway   # MoltGate payment gateway
pnpm dev:demo      # Interactive demo UI
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MOCK_PAYMENTS` | `true` | Skip facilitator for local dev |
| `FACILITATOR_URL` | `https://facilitator.stacksx402.com` | x402 facilitator endpoint |
| `PAY_TO` | testnet default | Stacks address to receive payments |
| `NETWORK` | `stacks:2147483648` | CAIP-2 chain identifier |
| `UPSTREAM_URL` | `http://localhost:4000` | Backend API to proxy |

**To go live on Stacks testnet:**
```bash
MOCK_PAYMENTS=false \
FACILITATOR_URL=https://facilitator.stacksx402.com \
PAY_TO=YOUR_STACKS_ADDRESS \
pnpm dev:gateway
```

One env var flip. That's the entire integration.

## Architecture

```
moltgate/
├── apps/
│   ├── gateway/          # Express x402 payment gateway
│   │   ├── middleware/   # 5-layer middleware stack
│   │   ├── routes/       # Health + premium endpoints
│   │   ├── utils/        # Facilitator client, cache
│   │   └── __tests__/    # 92 tests
│   ├── upstream/         # Plain HTTP API (zero x402 code)
│   ├── demo/             # Next.js interactive demo + landing page
│   │   ├── components/   # GateAnyApi, MoltbotMode, x402scan, WalletButton
│   │   └── context/      # Stacks wallet provider
│   └── demo-cli/         # Terminal autopay client
├── packages/
│   ├── policy/           # Fluent policy engine
│   ├── schema/           # I/O schema generator + discovery middleware
│   └── autopay/          # x402 autopay client library
├── docker/               # Dockerfiles for all services
└── docker-compose.yml    # One-command deploy
```

## The Upstream Has Zero x402 Code

This is the key differentiator. Look at `apps/upstream/src/index.ts`:

```typescript
app.get("/api/weather", (req, res) => {
  const city = String(req.query.city ?? "Unknown");
  res.json({ data: { city, tempC: 22, humidity: 65, conditions: "sunny" } });
});
```

No payment headers. No x402 imports. No facilitator calls. Plain Express returning JSON.

MoltGate sits in front and handles everything:
- Returns 402 with pricing to unpaid requests
- Validates payment signatures against route offers
- Verifies with the facilitator (or mocks for dev)
- Proxies the paid request to upstream
- Returns the response with a settlement receipt

## Interactive Demo

The demo UI includes three tabs:

1. **Gate Any API** — Send a request to the proxied weather API. Watch the full 402 → Pay → 200 flow in an animated HTTP trace. See the weather data returned after payment.

2. **Moltbot Mode** — An AI agent with a 500 µSTX budget executes multi-step scenarios. Watch it chain weather lookups and summarization calls, tracking spend in real time.

3. **x402scan Listing** — Browse the discovery document from `/.well-known/x402`. See every endpoint's pricing, I/O schemas, and metadata that agents use for programmatic discovery.

## Tests

```bash
pnpm test        # Run all 92 tests
pnpm typecheck   # TypeScript strict mode
```

Covers: gateway payment flow, proxy routing, discovery protocol, autopay client, middleware stack, policy engine, and edge cases.

## Why MoltGate Wins

| | Traditional x402 | MoltGate |
|---|---|---|
| Upstream changes | Required | **Zero** |
| Integration time | Hours per API | **Minutes** |
| Agent support | None | **Moltbot with budgets** |
| Discovery | Manual docs | **/.well-known/x402 with schemas** |
| Middleware | DIY | **5-layer production stack** |
| Deploy | Complex | **docker compose up** |

## Tech Stack

- **Gateway**: Express + TypeScript
- **Frontend**: Next.js 15 + React 19 + Framer Motion + Tailwind 4
- **Wallet**: @stacks/connect (Leather, Hiro, Xverse)
- **Blockchain**: Stacks testnet (Bitcoin L2)
- **Protocol**: x402 v2 (HTTP 402 Payment Required)
- **Deploy**: Docker Compose
- **Testing**: Vitest (92 tests)

## License

MIT

---

<div align="center">
  <strong>MoltGate</strong> — x402 Payment Gateway for Stacks<br>
  <sub>Built for the x402 Stacks Challenge</sub>
</div>

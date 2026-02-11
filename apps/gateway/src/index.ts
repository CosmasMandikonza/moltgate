import "dotenv/config";
import express, { type Express } from "express";
import { config } from "./config.js";
import healthRouter from "./routes/health.js";
import premiumRouter from "./routes/premium.js";
import { paymentRequired } from "./middleware/paymentRequired.js";
import { validateSignature } from "./middleware/validateSignature.js";
import { replayProtection } from "./middleware/replayProtection.js";
import { idempotency } from "./middleware/idempotency.js";
import { proxyHandler } from "./middleware/proxy.js";
import { engine } from "./policies.js";
import { x402Discovery } from "@moltgate/schema";

const app: Express = express();

// ---------------------------------------------------------------------------
// Global middleware
// ---------------------------------------------------------------------------
app.use(express.json());

// ---------------------------------------------------------------------------
// Public routes
// ---------------------------------------------------------------------------
app.use(healthRouter);

// x402scan discovery — serves the full endpoint catalogue with I/O schemas
app.get(
  "/.well-known/x402",
  x402Discovery(engine, {
    name: "MoltGate Gateway",
    description: "x402 v2 payment gateway for the Stacks ecosystem",
    publicBaseUrl: config.publicBaseUrl,
  }),
);

// ---------------------------------------------------------------------------
// Protected route middleware stack (order matters):
//
//   1. Idempotency       – return cached receipt if key matches (skip everything)
//   2. Validate sig      – decode base64, parse JSON, assert required fields,
//                          cross-reference against the route's payment offer
//   3. Replay guard      – reject reused nonces from the decoded payload
//   4. Payment gate      – enforce 402 / mock / facilitator verify+settle
// ---------------------------------------------------------------------------
app.use(idempotency());
app.use(validateSignature());
app.use(replayProtection());
app.use(paymentRequired());

// ---------------------------------------------------------------------------
// Protected routes
// ---------------------------------------------------------------------------
app.use(premiumRouter);

// ---------------------------------------------------------------------------
// Proxy: /proxy/* → UPSTREAM_URL/*  (x402 already enforced above)
// ---------------------------------------------------------------------------
app.all("/proxy/*", proxyHandler);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
app.listen(config.port, () => {
  const mode = config.mockPayments ? "mock" : "live";
  console.log(
    `[moltgate] gateway :${config.port}  network=${config.network}  payments=${mode}  payTo=${config.payTo}`,
  );
});

export default app;

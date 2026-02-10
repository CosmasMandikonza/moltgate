import type { Request, Response } from "express";
import type { PolicyEngine } from "@moltgate/policy";
import { generateDiscovery, serializeDiscovery, type DiscoveryOptions } from "./generator.js";

/**
 * Returns an Express route handler that serves the x402scan discovery
 * document at `GET /.well-known/x402`.
 *
 * ```ts
 * import { x402Discovery } from "@moltgate/schema";
 * app.get("/.well-known/x402", x402Discovery(engine, { publicBaseUrl }));
 * ```
 */
export function x402Discovery(
  engine: PolicyEngine,
  opts: DiscoveryOptions,
) {
  return (_req: Request, res: Response) => {
    const doc = generateDiscovery(engine, opts);
    res
      .set("Content-Type", "application/json")
      .set("Cache-Control", "public, max-age=300")
      .send(serializeDiscovery(doc));
  };
}

// Keep backward compat alias
export const x402WellKnown = x402Discovery;

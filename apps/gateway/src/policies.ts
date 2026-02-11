import { PolicyEngine, policy } from "@moltgate/policy";
import { config } from "./config.js";

// ---------------------------------------------------------------------------
// Gateway policy registry
//
// Each paid route is registered with its price AND its I/O schema so that
// x402scan crawlers and AI agents can discover what inputs the endpoint
// expects and what outputs it returns — without triggering a 402 first.
// ---------------------------------------------------------------------------

export const engine = new PolicyEngine();

engine.add(
  // ── Local routes ────────────────────────────────────────────────────

  policy("/v1/premium/echo")
    .get()
    .costs(config.amountMicroStx, "STX")
    .on(config.network)
    .payTo(config.payTo)
    .describe("Premium echo endpoint — returns your message (x402 protected)")
    .ioSchema({
      method: "GET",
      input: {
        query: {
          msg: {
            type: "string",
            required: false,
            description: "Message to echo back",
            example: "hello world",
          },
        },
      },
      output: {
        echo: { type: "string", description: "The echoed message" },
        ts: { type: "string", description: "ISO-8601 timestamp of the response" },
      },
    })
    .build(),

  // ── Proxied routes ──────────────────────────────────────────────────

  policy("/proxy/api/weather")
    .get()
    .costs("10", "STX")
    .on(config.network)
    .payTo(config.payTo)
    .describe("Weather lookup — proxied upstream, 10 µSTX per call")
    .ioSchema({
      method: "GET",
      input: {
        query: {
          city: {
            type: "string",
            required: true,
            description: "City name to look up weather for",
            example: "Tokyo",
          },
        },
      },
      output: {
        city: { type: "string", description: "Resolved city name" },
        tempC: { type: "number", description: "Temperature in Celsius" },
        tempF: { type: "number", description: "Temperature in Fahrenheit" },
        humidity: { type: "number", description: "Humidity percentage" },
        conditions: { type: "string", description: "Weather conditions (sunny, cloudy, rainy, snowy, windy)" },
        source: { type: "string", description: "Data source identifier" },
      },
    })
    .build(),

  policy("/proxy/api/summarize")
    .post()
    .costs("50", "STX")
    .on(config.network)
    .payTo(config.payTo)
    .describe("Text summarization — proxied upstream, 50 µSTX per call")
    .ioSchema({
      method: "POST",
      input: {
        body: {
          text: {
            type: "string",
            required: true,
            description: "Text content to summarize",
            example: "MoltGate is an open-source x402 payment gateway...",
          },
        },
      },
      output: {
        summary: { type: "string", description: "Truncated summary of the input text" },
        wordCount: { type: "number", description: "Number of words in the input" },
        charCount: { type: "number", description: "Number of characters in the input" },
        source: { type: "string", description: "Data source identifier" },
      },
    })
    .build(),
);

// ---------------------------------------------------------------------------
// Convenience accessors used by middleware
// ---------------------------------------------------------------------------

export function findPolicy(path: string, method: string) {
  return engine.match(path, method);
}

export function isProxyRoute(path: string): boolean {
  return engine.isProxy(path);
}

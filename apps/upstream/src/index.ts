import express, { type Express } from "express";

// ---------------------------------------------------------------------------
// Upstream API — a plain Express server with zero knowledge of x402.
//
// MoltGate sits in front and monetises these endpoints.  This server never
// sees payment headers, never returns 402 — it just serves content.
// ---------------------------------------------------------------------------

const app: Express = express();
app.use(express.json());

// ---------------------------------------------------------------------------
// GET /api/weather?city=<name>
//
// Deterministic weather data keyed off the city name so tests can assert
// on stable output without hitting a real weather API.
// ---------------------------------------------------------------------------
app.get("/api/weather", (req, res) => {
  const city = (req.query.city as string)?.trim();

  if (!city) {
    res.status(400).json({ error: "Missing required query parameter: city" });
    return;
  }

  const hash = [...city.toLowerCase()].reduce(
    (sum, ch) => sum + ch.charCodeAt(0),
    0,
  );
  const tempC = -10 + (hash % 45);
  const humidity = 20 + (hash % 60);
  const conditions = ["sunny", "cloudy", "rainy", "snowy", "windy"][hash % 5];

  res.json({
    city,
    tempC,
    tempF: Math.round((tempC * 9) / 5 + 32),
    humidity,
    conditions,
    source: "moltgate-upstream",
  });
});

// ---------------------------------------------------------------------------
// POST /api/summarize   { text: string }
//
// Deterministic "summary" — first 80 chars + word count.
// ---------------------------------------------------------------------------
app.post("/api/summarize", (req, res) => {
  const { text } = req.body ?? {};

  if (!text || typeof text !== "string") {
    res.status(400).json({ error: "Missing required body field: text" });
    return;
  }

  const words = text.split(/\s+/).filter(Boolean);
  const snippet = text.slice(0, 80) + (text.length > 80 ? "\u2026" : "");

  res.json({
    summary: snippet,
    wordCount: words.length,
    charCount: text.length,
    source: "moltgate-upstream",
  });
});

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "moltgate-upstream" });
});

// ---------------------------------------------------------------------------
// Boot (only when run directly, not when imported for tests)
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT ?? "4000", 10);

const isDirectRun =
  process.argv[1]?.endsWith("index.ts") ||
  process.argv[1]?.endsWith("index.js");

if (isDirectRun) {
  app.listen(PORT, () => {
    console.log(`[moltgate] upstream listening on :${PORT}`);
  });
}

export default app;

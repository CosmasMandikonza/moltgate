"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import HttpTrace from "./HttpTrace";
import { autopay, type Trace, type WalletSigner } from "@/lib/autopay";
import { useWallet } from "@/context/WalletContext";

const GW = "/api/gateway";

const CITIES = [
  { name: "Tokyo",     flag: "🇯🇵" },
  { name: "London",    flag: "🇬🇧" },
  { name: "Reykjavik", flag: "🇮🇸" },
  { name: "São Paulo", flag: "🇧🇷" },
  { name: "Nairobi",   flag: "🇰🇪" },
  { name: "Sydney",    flag: "🇦🇺" },
];

interface Weather {
  city: string;
  tempC: number;
  tempF: number;
  humidity: number;
  conditions: string;
  source: string;
}

export default function GateAnyApi() {
  const [city, setCity] = useState("Tokyo");
  const [trace, setTrace] = useState<Trace | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [busy, setBusy] = useState(false);
  const wallet = useWallet();

  const walletSigner: WalletSigner | null =
    wallet.connected && wallet.publicKey
      ? { address: wallet.address!, publicKey: wallet.publicKey }
      : null;

  const isLive = !!walletSigner;

  const run = useCallback(async () => {
    setBusy(true);
    setTrace(null);
    setWeather(null);

    const { data, trace: t } = await autopay(
      `${GW}/proxy/api/weather?city=${encodeURIComponent(city)}`,
      undefined,
      () => setTrace((prev) => (prev ? { ...prev } : null)),
      walletSigner,
    );
    setTrace(t);

    const d = data as { data?: Weather } | null;
    if (d?.data) setWeather(d.data);
    setBusy(false);
  }, [city, walletSigner]);

  return (
    <div className="space-y-5">
      {/* Description */}
      <div className="max-w-2xl">
        <h2 className="font-display text-[22px] font-bold tracking-tight">
          Gate Any API
        </h2>
        <p className="mt-1 text-[13px] text-text-2 leading-relaxed">
          The upstream weather API has{" "}
          <span className="text-teal font-medium">zero x402 knowledge</span>.
          MoltGate proxies it and charges{" "}
          <span className="font-mono text-green text-[12px]">10 µSTX</span>{" "}
          per request — no upstream code changes.
          {isLive && (
            <span className="ml-2 inline-flex items-center gap-1 text-green font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
              Real STX payments via wallet
            </span>
          )}
        </p>
      </div>

      {/* Controls */}
      <div className="glass p-4 space-y-3">
        {/* City chips */}
        <div className="flex flex-wrap gap-1.5">
          {CITIES.map((c) => (
            <button
              key={c.name}
              onClick={() => setCity(c.name)}
              className={`btn text-[12px] px-3 py-1.5 rounded-full border transition-all ${
                city === c.name
                  ? "bg-teal/10 text-teal border-teal/25"
                  : "bg-surface-raised/50 text-text-2 border-border-subtle hover:text-text-1 hover:border-border-medium"
              }`}
            >
              <span className="mr-1">{c.flag}</span>
              {c.name}
            </button>
          ))}
        </div>

        {/* Endpoint + button */}
        <div className="flex items-center gap-2.5">
          <div className="flex-1 font-mono text-[11px] text-text-3 bg-void/50 rounded-lg px-3.5 py-2 border border-border-subtle overflow-hidden">
            <span className="text-text-2">GET</span>{" "}
            /proxy/api/weather?city=<span className="text-teal">{city}</span>
          </div>
          <motion.button
            onClick={run}
            disabled={busy}
            whileHover={{ scale: 1.015 }}
            whileTap={{ scale: 0.985 }}
            className="btn px-5 py-2 rounded-lg text-[12px] bg-teal/[0.08] text-teal border border-teal/20 hover:bg-teal/[0.14] hover:shadow-[0_0_24px_rgba(0,240,255,0.1)] disabled:hover:shadow-none"
          >
            {busy ? (
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 border-[1.5px] border-teal/30 border-t-teal rounded-full animate-spin" />
                Paying…
              </span>
            ) : (
              "Send →"
            )}
          </motion.button>
        </div>
      </div>

      {/* Two-pane: Trace + Result */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Trace (3/5) */}
        <div className="lg:col-span-3">
          <Label>HTTP Trace</Label>
          <HttpTrace trace={trace} />
        </div>

        {/* Weather result (2/5) */}
        <div className="lg:col-span-2">
          <Label>Response</Label>
          {weather ? (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-inner p-4 space-y-4"
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-mono text-[9px] text-text-3 uppercase tracking-[0.2em]">City</p>
                  <p className="font-display text-lg font-bold mt-0.5">{weather.city}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-[9px] text-text-3 uppercase tracking-[0.2em]">Conditions</p>
                  <p className="font-display text-base font-semibold text-teal mt-0.5 capitalize">{weather.conditions}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { k: "°C",       v: weather.tempC,   c: "text-amber" },
                  { k: "°F",       v: weather.tempF,   c: "text-amber" },
                  { k: "Humidity", v: `${weather.humidity}%`, c: "text-teal" },
                ].map((m) => (
                  <div key={m.k} className="bg-void/40 rounded-lg p-2.5 text-center border border-border-subtle">
                    <p className="font-mono text-[8px] text-text-3 uppercase tracking-widest">{m.k}</p>
                    <p className={`font-mono text-base font-semibold mt-0.5 ${m.c}`}>{m.v}</p>
                  </div>
                ))}
              </div>

              <p className="font-mono text-[9px] text-text-3 text-right">
                src: {weather.source}
              </p>
            </motion.div>
          ) : (
            <div className="glass-inner flex items-center justify-center py-14">
              <p className="font-mono text-[10px] text-text-3/50 uppercase tracking-[0.15em]">
                Response data
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[9px] text-text-3 uppercase tracking-[0.2em] mb-2 pl-0.5">
      {children}
    </p>
  );
}

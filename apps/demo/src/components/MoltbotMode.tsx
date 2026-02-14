"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import HttpTrace from "./HttpTrace";
import { autopay, type Trace, type WalletSigner } from "@/lib/autopay";
import { useWallet } from "@/context/WalletContext";

const GW = "/api/gateway";
const BUDGET = 500;

interface Step {
  action: string;
  endpoint: string;
  cost: number;
  body?: Record<string, unknown>;
}

const SCENARIOS: {
  name: string;
  icon: string;
  desc: string;
  steps: Step[];
}[] = [
  {
    name: "Weather Report",
    icon: "☀️",
    desc: "Fetch 3 cities → summarize findings",
    steps: [
      { action: "Lookup Tokyo",     endpoint: "/proxy/api/weather?city=Tokyo",   cost: 10 },
      { action: "Lookup London",    endpoint: "/proxy/api/weather?city=London",  cost: 10 },
      { action: "Lookup Sydney",    endpoint: "/proxy/api/weather?city=Sydney",  cost: 10 },
      {
        action: "Summarize report",
        endpoint: "/proxy/api/summarize",
        cost: 50,
        body: { text: "Weather report: Tokyo has variable conditions typical of a coastal metropolis. London shows maritime climate patterns with moderate temperatures. Sydney experiences southern hemisphere seasonal weather. Recommend travel dates based on optimal conditions across all three destinations." },
      },
    ],
  },
  {
    name: "Research Pipeline",
    icon: "🔬",
    desc: "Gather extremes → digest → confirm",
    steps: [
      { action: "Check Reykjavik", endpoint: "/proxy/api/weather?city=Reykjavik", cost: 10 },
      { action: "Check Nairobi",   endpoint: "/proxy/api/weather?city=Nairobi",   cost: 10 },
      {
        action: "Generate digest",
        endpoint: "/proxy/api/summarize",
        cost: 50,
        body: { text: "Research digest comparing subarctic maritime climate of Reykjavik versus tropical highland climate of Nairobi. Temperature differentials and humidity contrasts provide data points for climate resilience modeling in infrastructure planning." },
      },
      { action: "Confirm pipeline",  endpoint: "/v1/premium/echo?msg=pipeline-complete", cost: 100000 },
    ],
  },
];

interface LogEntry {
  id: string;
  action: string;
  cost: number;
  result: string;
  trace: Trace;
}

export default function MoltbotMode() {
  const [budget, setBudget] = useState(BUDGET);
  const [spent, setSpent] = useState(0);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [activeTrace, setActiveTrace] = useState<Trace | null>(null);
  const [running, setRunning] = useState(false);
  const abortRef = useRef(false);
  const wallet = useWallet();

  const walletSigner: WalletSigner | null =
    wallet.connected && wallet.publicKey
      ? { address: wallet.address!, publicKey: wallet.publicKey }
      : null;

  const reset = useCallback(() => {
    setBudget(BUDGET);
    setSpent(0);
    setLog([]);
    setActiveTrace(null);
    abortRef.current = false;
  }, []);

  const exec = useCallback(async (idx: number) => {
    reset();
    setRunning(true);
    abortRef.current = false;

    let rem = BUDGET;
    let tot = 0;

    for (const step of SCENARIOS[idx].steps) {
      if (abortRef.current) break;

      // budget check
      if (step.cost > rem) {
        const errTrace: Trace = {
          steps: [{ id: `oom-${Date.now()}`, kind: "err", label: `Budget exceeded: need ${step.cost}, have ${rem} µSTX` }],
          t0: Date.now(), t1: Date.now(), paid: false, error: "Insufficient budget",
        };
        setActiveTrace(errTrace);
        setLog((p) => [...p, {
          id: `e-${Date.now()}`, action: step.action, cost: step.cost,
          result: "⚠ Over budget", trace: errTrace,
        }]);
        break;
      }

      const url = `${GW}${step.endpoint}`;
      const init: RequestInit | undefined = step.body
        ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(step.body) }
        : undefined;

      const { data, trace } = await autopay(url, init, undefined, walletSigner);
      setActiveTrace(trace);

      if (trace.paid) {
        rem -= step.cost;
        tot += step.cost;
        setBudget(rem);
        setSpent(tot);
      }

      let result = "—";
      const d = data as Record<string, unknown> | null;
      if (d?.data && typeof d.data === "object") {
        const inner = d.data as Record<string, unknown>;
        if ("city" in inner) result = `${inner.city}: ${inner.tempC}°C ${inner.conditions}`;
        else if ("summary" in inner) result = String(inner.summary).slice(0, 55) + "…";
        else if ("echo" in inner) result = `echo: ${inner.echo}`;
      }

      setLog((p) => [...p, {
        id: `s-${Date.now()}-${Math.random()}`,
        action: step.action, cost: step.cost, result, trace,
      }]);

      await new Promise((r) => setTimeout(r, 350));
    }

    setRunning(false);
  }, [reset, walletSigner]);

  const pct = Math.max(0, (budget / BUDGET) * 100);

  return (
    <div className="space-y-5">
      <div className="max-w-2xl">
        <h2 className="font-display text-[22px] font-bold tracking-tight">Moltbot Mode</h2>
        <p className="mt-1 text-[13px] text-text-2 leading-relaxed">
          An <span className="text-purple font-medium">AI agent</span> with a µSTX budget. It plans a sequence of paid API calls, pays each automatically, and tracks spend in real time.
          {walletSigner && (
            <span className="ml-2 inline-flex items-center gap-1 text-green font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
              Real STX payments via wallet
            </span>
          )}
        </p>
      </div>

      {/* Budget card */}
      <div className="glass p-4">
        <div className="flex items-center justify-between mb-2.5">
          <div>
            <p className="font-mono text-[9px] text-text-3 uppercase tracking-[0.2em]">Agent Budget</p>
            <p className="font-display text-xl font-bold mt-0.5">
              <span className={budget > 0 ? "text-green text-glow-green" : "text-red"}>{budget}</span>
              <span className="text-text-3 text-[13px] ml-1">/ {BUDGET} µSTX</span>
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-[9px] text-text-3 uppercase tracking-[0.2em]">Spent</p>
            <p className="font-mono text-lg text-amber font-semibold mt-0.5 tabular-nums">
              {spent} <span className="text-[10px] text-text-3">µSTX</span>
            </p>
          </div>
        </div>
        <div className="bar-track">
          <motion.div
            className="bar-fill"
            initial={{ width: "100%" }}
            animate={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Scenario buttons */}
      <div className="flex gap-2.5">
        {SCENARIOS.map((s, i) => (
          <motion.button
            key={i}
            onClick={() => !running && exec(i)}
            disabled={running}
            whileHover={running ? {} : { scale: 1.01, y: -1 }}
            whileTap={running ? {} : { scale: 0.99 }}
            className="btn flex-1 glass p-3.5 text-left hover:border-purple/20 disabled:hover:border-border-subtle transition-all"
          >
            <span className="text-base">{s.icon}</span>
            <p className="font-display text-[13px] font-semibold mt-1">{s.name}</p>
            <p className="font-mono text-[10px] text-text-3 mt-0.5 leading-relaxed">{s.desc}</p>
          </motion.button>
        ))}
        <motion.button
          onClick={reset}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          className="btn glass px-4 self-stretch text-red/60 hover:text-red hover:border-red/15 transition-all"
        >
          <span className="font-mono text-[11px]">Reset</span>
        </motion.button>
      </div>

      {/* Two-pane: Log + Trace */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Agent log */}
        <div>
          <Label>Agent Log</Label>
          <div className="glass-inner p-2.5 min-h-[260px] space-y-1">
            <AnimatePresence mode="popLayout">
              {log.length === 0 && !running && (
                <motion.p
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="font-mono text-[10px] text-text-3/40 text-center py-16 uppercase tracking-[0.2em]"
                >
                  Select a scenario
                </motion.p>
              )}
              {log.map((entry, i) => (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.04 }}
                  onClick={() => setActiveTrace(entry.trace)}
                  className={`rounded-lg px-3 py-2 cursor-pointer border transition-all ${
                    activeTrace === entry.trace
                      ? "bg-teal/[0.06] border-teal/15"
                      : "bg-transparent border-transparent hover:bg-surface-raised/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[9px] text-text-3 w-4 tabular-nums">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="font-mono text-[12px] text-text-1">{entry.action}</span>
                    </div>
                    <span className={`font-mono text-[11px] font-semibold tabular-nums ${
                      entry.trace.paid ? "text-green" : "text-red"
                    }`}>
                      {entry.trace.paid ? `−${entry.cost}` : "✕"}
                    </span>
                  </div>
                  <p className="font-mono text-[10px] text-text-3 mt-0.5 ml-6 truncate">{entry.result}</p>
                </motion.div>
              ))}
              {running && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 px-3 py-2">
                  <span className="w-2.5 h-2.5 border-[1.5px] border-purple/30 border-t-purple rounded-full animate-spin" />
                  <span className="font-mono text-[11px] text-purple">Executing…</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Active trace */}
        <div>
          <Label>HTTP Trace</Label>
          <HttpTrace trace={activeTrace} />
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-[9px] text-text-3 uppercase tracking-[0.2em] mb-2 pl-0.5">{children}</p>;
}

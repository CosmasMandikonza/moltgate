"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

const GW = "/api/gateway";
const DIRECT_GW = process.env.NEXT_PUBLIC_GATEWAY_URL || "";

interface Field { type: string; description?: string; required?: boolean; example?: unknown }
interface Schema { method: string; input: { query?: Record<string, Field>; body?: Record<string, Field> }; output: Record<string, Field> }
interface Accept {
  network: string; resource: string; scheme: string; payTo: string;
  maxAmountRequired: string; asset: string; description: string;
  mimeType: string; maxTimeoutSeconds: number; outputSchema: Schema;
}
interface Discovery {
  x402Version: number; name: string; description: string;
  image: string; url: string; accepts: Accept[];
}

const TYPE_CLR: Record<string, string> = {
  string: "text-green", number: "text-amber", boolean: "text-purple", object: "text-teal", array: "text-teal",
};
const METHOD_CLR: Record<string, string> = {
  GET: "bg-green/10 text-green border-green/20",
  POST: "bg-amber/10 text-amber border-amber/20",
  PUT: "bg-teal/10 text-teal border-teal/20",
  DELETE: "bg-red/10 text-red border-red/20",
};

function FieldTable({ fields, direction }: { fields: Record<string, Field>; direction: "in" | "out" }) {
  return (
    <div className="bg-void/40 rounded-lg border border-border-subtle overflow-hidden">
      <div className="schema-row text-[9px] text-text-3 uppercase tracking-[0.15em] border-b border-border-medium!">
        <span>Field</span>
        <span className="text-center">Type</span>
        <span>Description</span>
      </div>
      {Object.entries(fields).map(([name, f]) => (
        <div key={name} className="schema-row hover:bg-surface-raised/30 transition-colors">
          <div className="flex items-center gap-1.5">
            <span className="text-text-1 font-medium">{name}</span>
            {f.required && (
              <span className="text-[7px] text-red font-bold uppercase tracking-widest leading-none mt-px">req</span>
            )}
          </div>
          <span className={`text-center ${TYPE_CLR[f.type] ?? "text-text-3"}`}>{f.type}</span>
          <span className="text-text-3 text-[10px]">{f.description ?? "—"}</span>
        </div>
      ))}
    </div>
  );
}

function EndpointCard({ entry, idx }: { entry: Accept; idx: number }) {
  const [open, setOpen] = useState(idx === 0);
  const s = entry.outputSchema;
  const path = (() => { try { return new URL(entry.resource).pathname; } catch { return entry.resource; } })();
  const hasInput = s.input.query || s.input.body;
  const hasOutput = s.output && Object.keys(s.output).length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.08, ease: [0.22, 1, 0.36, 1] }}
      className={`glass overflow-hidden transition-shadow duration-300 ${open ? "ring-glow-teal" : ""}`}
    >
      {/* Header */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left px-4 py-3.5 flex items-center justify-between cursor-pointer hover:bg-surface-raised/20 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider border ${METHOD_CLR[s.method] ?? ""}`}>
            {s.method}
          </span>
          <span className="font-mono text-[13px] text-text-1">{path}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[12px] text-green font-semibold tabular-nums">
            {entry.maxAmountRequired} <span className="text-[10px] text-text-3">µ{entry.asset}</span>
          </span>
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.15 }}
            className="text-[10px] text-text-3"
          >▼</motion.span>
        </div>
      </button>

      {/* Expanded */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-2 space-y-4 border-t border-border-subtle">
              <p className="text-[13px] text-text-2">{entry.description}</p>

              <div className="flex flex-wrap gap-x-5 gap-y-1 text-[10px] font-mono text-text-3">
                <span>network: <span className="text-teal">{entry.network}</span></span>
                <span>scheme: <span className="text-text-2">{entry.scheme}</span></span>
                <span>payTo: <span className="text-text-2">{entry.payTo.slice(0, 8)}…{entry.payTo.slice(-4)}</span></span>
                <span>timeout: <span className="text-text-2">{entry.maxTimeoutSeconds}s</span></span>
              </div>

              {hasInput && (
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.2em] mb-1.5">
                    <span className="text-amber">▸ Input</span>
                    <span className="text-text-3 ml-2">{s.input.query ? "query params" : "JSON body"}</span>
                  </p>
                  <FieldTable fields={(s.input.query ?? s.input.body)!} direction="in" />
                </div>
              )}

              {hasOutput && (
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.2em] mb-1.5">
                    <span className="text-green">◂ Output</span>
                    <span className="text-text-3 ml-2">response fields</span>
                  </p>
                  <FieldTable fields={s.output} direction="out" />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function X402ScanListing() {
  const [doc, setDoc] = useState<Discovery | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${GW}/.well-known/x402`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      setDoc(await res.json());
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="max-w-xl">
          <h2 className="font-display text-[22px] font-bold tracking-tight">x402scan Listing</h2>
          <p className="mt-1 text-[13px] text-text-2 leading-relaxed">
            Discovery document from{" "}
            <code className="font-mono text-[11px] text-teal">GET /.well-known/x402</code>
            — crawlers and agents use this to discover endpoints, pricing, and I/O schemas without triggering a 402.
          </p>
        </div>
        <div className="flex gap-1.5 flex-shrink-0 mt-1">
          <button
            onClick={() => setRaw(!raw)}
            className={`btn text-[10px] px-2.5 py-1 rounded-md border ${
              raw ? "bg-teal/10 text-teal border-teal/20" : "bg-surface-raised/50 text-text-3 border-border-subtle hover:text-text-2"
            }`}
          >{raw ? "Cards" : "JSON"}</button>
          <button
            onClick={load}
            disabled={loading}
            className="btn text-[10px] px-2.5 py-1 rounded-md border bg-surface-raised/50 text-text-3 border-border-subtle hover:text-text-2"
          >{loading ? "…" : "↻"}</button>
        </div>
      </div>

      {error && (
        <div className="glass-inner ring-glow-red p-3">
          <p className="font-mono text-[11px] text-red">{error}</p>
          <p className="font-mono text-[10px] text-text-3 mt-1">Is the gateway running? Check GATEWAY_URL env.</p>
        </div>
      )}

      {loading && !doc && (
        <div className="glass-inner flex items-center justify-center py-16">
          <span className="w-4 h-4 border-2 border-teal/30 border-t-teal rounded-full animate-spin" />
        </div>
      )}

      {doc && !raw && (
        <div className="space-y-4">
          {/* Service header */}
          <div className="glass p-4 flex items-center justify-between">
            <div>
              <p className="font-display text-base font-bold">{doc.name}</p>
              <p className="text-[12px] text-text-2 mt-0.5">{doc.description}</p>
            </div>
            <div className="flex gap-6">
              <Stat label="Protocol" value={`x402v${doc.x402Version}`} color="text-teal" />
              <Stat label="Endpoints" value={String(doc.accepts.length)} color="text-green" />
            </div>
          </div>

          {/* Endpoint cards */}
          <div className="space-y-2.5">
            {doc.accepts.map((e, i) => <EndpointCard key={i} entry={e} idx={i} />)}
          </div>
        </div>
      )}

      {doc && raw && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-inner overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle">
            <span className="font-mono text-[10px] text-text-3 uppercase tracking-[0.15em]">/.well-known/x402</span>
            <span className="font-mono text-[10px] text-green font-semibold">200 OK</span>
          </div>
          <pre className="p-4 font-mono text-[11px] text-text-2 overflow-auto max-h-[600px] leading-relaxed whitespace-pre-wrap">
            {JSON.stringify(doc, null, 2)}
          </pre>
        </motion.div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-right">
      <p className="font-mono text-[8px] text-text-3 uppercase tracking-[0.2em]">{label}</p>
      <p className={`font-mono text-[13px] font-semibold ${color} mt-0.5`}>{value}</p>
    </div>
  );
}

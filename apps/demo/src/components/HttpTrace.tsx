"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Trace, TraceStep, StepKind } from "@/lib/autopay";

const META: Record<StepKind, { icon: string; color: string; bg: string; border: string }> = {
  req:   { icon: "→", color: "text-text-2",  bg: "bg-surface-raised/60",     border: "border-border-subtle" },
  "402": { icon: "⛔", color: "text-red",     bg: "bg-red/[0.06]",           border: "border-red/20" },
  sign:  { icon: "✎", color: "text-amber",   bg: "bg-amber/[0.06]",         border: "border-amber/20" },
  retry: { icon: "↻", color: "text-teal",    bg: "bg-teal/[0.04]",          border: "border-teal/15" },
  ok:    { icon: "✓", color: "text-green",   bg: "bg-green/[0.06]",         border: "border-green/20" },
  err:   { icon: "✕", color: "text-red",     bg: "bg-red/[0.06]",           border: "border-red/20" },
};

function StepRow({ step, index }: { step: TraceStep; index: number }) {
  const [open, setOpen] = useState(false);
  const m = META[step.kind];

  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.28, delay: index * 0.07, ease: [0.22, 1, 0.36, 1] }}
      className="trace-step pb-2.5 last:pb-0"
    >
      {/* Dot */}
      <div className={`trace-dot ${m.bg} ${m.border} ${m.color}`}>
        <span className="leading-none">{m.icon}</span>
      </div>

      {/* Content */}
      <div
        className={`${m.bg} border ${m.border} rounded-lg px-3.5 py-2.5 cursor-pointer hover:brightness-110 transition-all`}
        onClick={() => step.decoded && setOpen(!open)}
      >
        <div className="flex items-center justify-between gap-3">
          <span className={`font-mono text-[12px] font-semibold ${m.color} leading-tight`}>
            {step.label}
          </span>
          <div className="flex items-center gap-2 flex-shrink-0">
            {step.ms != null && (
              <span className="font-mono text-[10px] text-text-3 tabular-nums">{step.ms}ms</span>
            )}
            {!!step.decoded && (
              <span className="font-mono text-[9px] text-text-3 uppercase tracking-widest">
                {open ? "▾" : "▸"} json
              </span>
            )}
          </div>
        </div>

        {step.detail && (
          <p className="font-mono text-[11px] text-text-3 mt-1 leading-relaxed truncate">
            {step.detail}
          </p>
        )}

        <AnimatePresence>
          {open && !!step.decoded && (
            <motion.pre
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-2 p-3 bg-void/60 rounded-md border border-border-subtle font-mono text-[10.5px] text-text-2 leading-relaxed overflow-auto max-h-[200px] whitespace-pre-wrap break-all"
            >
              {JSON.stringify(step.decoded, null, 2)}
            </motion.pre>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default function HttpTrace({ trace }: { trace: Trace | null }) {
  if (!trace) {
    return (
      <div className="glass-inner flex items-center justify-center py-14 px-6">
        <div className="text-center">
          <p className="font-mono text-[11px] text-text-3 uppercase tracking-[0.2em]">
            Live HTTP Trace
          </p>
          <p className="font-mono text-[10px] text-text-3/50 mt-1.5">
            Run a request to see the protocol flow
          </p>
        </div>
      </div>
    );
  }

  const elapsed = trace.t1 ? trace.t1 - trace.t0 : null;

  return (
    <div className={`glass-inner overflow-hidden ${trace.paid ? "ring-glow-green" : ""}`}>
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle">
        <div className="flex items-center gap-2.5">
          <span
            className={`w-[7px] h-[7px] rounded-full ${
              trace.t1
                ? trace.error ? "bg-red" : "bg-green"
                : "bg-amber dot-pulse"
            }`}
          />
          <span className="font-mono text-[10px] text-text-3 uppercase tracking-[0.18em]">
            HTTP Trace
          </span>
        </div>
        <div className="flex items-center gap-3">
          {trace.paid && (
            <span className="font-mono text-[10px] text-green font-semibold uppercase tracking-wider">
              Paid
            </span>
          )}
          {elapsed != null && (
            <span className="font-mono text-[10px] text-text-3 tabular-nums">
              {elapsed}ms
            </span>
          )}
        </div>
      </div>

      {/* Steps */}
      <div className="p-4">
        <AnimatePresence mode="popLayout">
          {trace.steps.map((step, i) => (
            <StepRow key={step.id} step={step} index={i} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

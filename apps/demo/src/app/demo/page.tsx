"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import NavBar from "@/components/NavBar";
import GateAnyApi from "@/components/GateAnyApi";
import MoltbotMode from "@/components/MoltbotMode";
import X402ScanListing from "@/components/X402ScanListing";
import { useWallet } from "@/context/WalletContext";

const GW = "/api/gateway";

const TABS = [
  { id: "gate",    label: "Gate Any API",      icon: "⚡" },
  { id: "moltbot", label: "Moltbot Mode",      icon: "🤖" },
  { id: "scan",    label: "x402scan Listing",   icon: "📡" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default function DemoPage() {
  const [tab, setTab] = useState<Tab>("gate");
  const [gwOk, setGwOk] = useState<boolean | null>(null);
  const tabEls = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [ind, setInd] = useState({ left: 0, width: 0 });
  const wallet = useWallet();
  const isLive = wallet.connected && !!wallet.publicKey;

  useEffect(() => {
    fetch(`${GW}/health`).then((r) => setGwOk(r.ok)).catch(() => setGwOk(false));
  }, []);

  const sync = useCallback(() => {
    const el = tabEls.current.get(tab);
    const parent = el?.parentElement;
    if (el && parent) {
      const pr = parent.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      setInd({ left: er.left - pr.left, width: er.width });
    }
  }, [tab]);

  useEffect(() => { sync(); window.addEventListener("resize", sync); return () => window.removeEventListener("resize", sync); }, [sync]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* ═══════════════════ NAV ═══════════════════ */}
      <div className="max-w-[1120px] mx-auto w-full px-5 sm:px-8">
        <NavBar gwOk={gwOk} />
      </div>

      {/* ═══════════════════ DEMO HEADER + TABS ═══════════════════ */}
      <section className="border-y border-border-subtle">
        <div className="max-w-[1120px] mx-auto px-5 sm:px-8">
          <div className="flex items-center justify-between py-4">
            <div>
              <h1 className="font-display text-[22px] font-extrabold tracking-tight">
                <span className="logo-gradient">Interactive Demo</span>
              </h1>
              <p className="font-mono text-[9px] text-text-3 tracking-[0.2em] uppercase mt-0.5">
                {isLive ? (
                  <span className="text-green">● Live x402 Payment Flow · Real STX Transactions</span>
                ) : (
                  <span>Mock x402 Payment Flow · Connect wallet for real payments</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="glass-inner px-2.5 py-1 flex items-center gap-1.5 font-mono text-[10px]">
                <span className="text-text-3">Mode</span>
                <span className={isLive ? "text-green" : "text-amber"}>{isLive ? "LIVE" : "MOCK"}</span>
              </div>
            </div>
          </div>

          {/* Tab bar */}
          <nav className="relative flex items-center gap-0.5 -mb-px">
            {TABS.map((t) => (
              <button
                key={t.id}
                ref={(el) => { if (el) tabEls.current.set(t.id, el); }}
                onClick={() => setTab(t.id)}
                className={`relative px-3.5 sm:px-4 py-2.5 font-display text-[13px] font-medium cursor-pointer transition-colors ${
                  tab === t.id ? "text-teal" : "text-text-3 hover:text-text-2"
                }`}
              >
                <span className="mr-1.5 text-[12px]">{t.icon}</span>
                {t.label}
              </button>
            ))}
            <motion.div
              className="tab-line"
              animate={{ left: ind.left, width: ind.width }}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
            />
          </nav>
        </div>
      </section>

      {/* ═══════════════════ DEMO CONTENT ═══════════════════ */}
      <main className="flex-1 max-w-[1120px] mx-auto w-full px-5 sm:px-8 py-7">
        {gwOk === false && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-inner ring-glow-red p-3.5 mb-5"
          >
            <p className="font-mono text-[11px] text-red">⚠ Cannot reach the x402 gateway</p>
            <p className="font-mono text-[10px] text-text-3 mt-0.5">
              Run: <code className="text-text-2">pnpm dev:upstream</code> then{" "}
              <code className="text-text-2">pnpm dev:gateway</code> — or check GATEWAY_URL env
            </p>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            {tab === "gate"    && <GateAnyApi />}
            {tab === "moltbot" && <MoltbotMode />}
            {tab === "scan"    && <X402ScanListing />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* ═══════════════════ FOOTER ═══════════════════ */}
      <footer className="border-t border-border-subtle flex-shrink-0 mt-auto">
        <div className="max-w-[1120px] mx-auto px-5 sm:px-8 py-5 flex items-center justify-between">
          <p className="font-mono text-[10px] text-text-3">
            Built on the <span className="text-text-2">x402 v2</span> protocol · Stacks ecosystem
          </p>
          <p className="font-mono text-[10px] text-text-3">
            gateway proxied via <span className="text-text-2">/api/gateway</span>
          </p>
        </div>
      </footer>
    </div>
  );
}

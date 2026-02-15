"use client";

import { useRef, useEffect, useState } from "react";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import NavBar from "@/components/NavBar";
import { useWallet } from "@/context/WalletContext";

const GW = "/api/gateway";

export default function LandingPage() {
  const [gwOk, setGwOk] = useState<boolean | null>(null);
  const wallet = useWallet();

  useEffect(() => {
    fetch(`${GW}/health`).then((r) => setGwOk(r.ok)).catch(() => setGwOk(false));
  }, []);

  return (
    <div className="min-h-screen flex flex-col">

      {/* ═══════════════════════ HERO ═══════════════════════ */}
      <section className="relative overflow-hidden">
        <div className="hero-orb hero-orb-1" />
        <div className="hero-orb hero-orb-2" />
        <div className="hero-orb hero-orb-3" />
        <div className="hero-grid" />

        <div className="relative z-10 max-w-[1120px] mx-auto px-5 sm:px-8">
          <NavBar gwOk={gwOk} />

          <div className="pt-16 sm:pt-24 pb-20 sm:pb-28 text-center relative">
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <div className="inline-flex items-center gap-2 glass-inner px-3.5 py-1.5 mb-7">
                <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
                <span className="font-mono text-[10px] text-text-2 tracking-wide">x402 v2 Protocol · Stacks · Bitcoin-Secured Micropayments</span>
              </div>
            </motion.div>

            <motion.h1
              className="font-display text-[44px] sm:text-[66px] lg:text-[82px] font-extrabold leading-[0.92] tracking-tight mb-7"
              initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="logo-gradient">Gate Any API.</span><br />
              <span className="text-text-1">Zero Code Changes.</span>
            </motion.h1>

            <motion.p
              className="max-w-[560px] mx-auto text-text-2 text-[15px] sm:text-[17px] leading-relaxed mb-10"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.2 }}
            >
              MoltGate is a <span className="text-teal font-medium">reverse-proxy payment gateway</span> for
              the x402 protocol on Stacks. Put it in front of any API — it handles pricing, payment
              verification, and settlement. The upstream never knows.
            </motion.p>

            <motion.div
              className="flex flex-col sm:flex-row items-center justify-center gap-3"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.35 }}
            >
              <Link href="/demo" className="btn hero-btn-primary">
                <span className="relative z-10 flex items-center gap-2">
                  Launch Demo
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </span>
              </Link>
              {!wallet.connected && (
                <button onClick={wallet.connect} className="btn glass-inner px-6 py-2.5 rounded-xl text-[13px] text-text-2 hover:text-teal hover:border-teal/20 transition-all cursor-pointer">
                  Connect Stacks Wallet →
                </button>
              )}
            </motion.div>

            {/* Wallet connected pill */}
            {wallet.connected && wallet.address && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="mt-6 inline-flex items-center gap-2 glass-inner px-4 py-2 ring-glow-green">
                <span className="w-2 h-2 rounded-full bg-green shadow-[0_0_8px_rgba(0,255,136,0.6)]" />
                <span className="font-mono text-[11px] text-green font-medium">Wallet Connected</span>
                <span className="font-mono text-[11px] text-text-3">{wallet.address.slice(0, 8)}…{wallet.address.slice(-4)}</span>
              </motion.div>
            )}
          </div>
        </div>
      </section>

      {/* ═══════════════════════ PROTOCOL FLOW ═══════════════════════ */}
      <FadeSection>
        <section className="border-y border-border-subtle bg-panel/60 backdrop-blur-sm">
          <div className="max-w-[1120px] mx-auto px-5 sm:px-8 py-10">
            <p className="font-mono text-[9px] text-text-3 uppercase tracking-[0.3em] text-center mb-8">How the x402 Protocol Works</p>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-center">
              <FlowStep n="1" label="Request" desc="Client hits paid endpoint" color="text-text-2" />
              <FlowArrow />
              <FlowStep n="2" label="402 + Price" desc="Gateway returns payment terms" color="text-red" />
              <FlowArrow />
              <FlowStep n="3" label="Pay + Retry" desc="Client signs STX, retries" color="text-green" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-center mt-3">
              <div className="hidden sm:block" />
              <FlowArrow />
              <FlowStep n="4" label="Verify" desc="Facilitator validates on-chain" color="text-teal" />
              <FlowArrow />
              <FlowStep n="5" label="200 + Data" desc="Content served with receipt" color="text-green" />
            </div>
          </div>
        </section>
      </FadeSection>

      {/* ═══════════════════════ FEATURES ═══════════════════════ */}
      <FadeSection>
        <section className="py-20">
          <div className="max-w-[1120px] mx-auto px-5 sm:px-8">
            <div className="text-center mb-14">
              <p className="font-mono text-[10px] text-teal uppercase tracking-[0.3em] mb-3">Why MoltGate</p>
              <h2 className="font-display text-[32px] sm:text-[42px] font-extrabold tracking-tight leading-tight">The Proxy Primitive</h2>
              <p className="text-text-2 text-[15px] mt-3 max-w-lg mx-auto leading-relaxed">
                Every other x402 project requires upstream API changes. MoltGate sits in front — like Cloudflare, but for payments.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FeatureCard icon={<ProxyIcon />} title="Proxy Any API" desc="Put MoltGate in front of any HTTP API. It enforces x402 payment on every request. The upstream server has zero knowledge of payments." tag="Zero upstream changes" glow="teal" />
              <FeatureCard icon={<BotIcon />} title="Moltbot Agent" desc="AI agents with µSTX budgets chain multiple paid API calls autonomously. Budget tracking, cost estimation, and multi-step orchestration built in." tag="Autonomous agents" glow="purple" />
              <FeatureCard icon={<ScanIcon />} title="x402scan Discovery" desc="Machine-readable endpoint catalogue at /.well-known/x402. Agents crawl your gateway to discover endpoints, pricing, and full I/O schemas." tag="Programmatic discovery" glow="green" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
              <MiniFeature icon="🛡" title="5-Layer Middleware" desc="Idempotency → Signature → Replay → Payment → Proxy" />
              <MiniFeature icon="🐳" title="One-Command Deploy" desc="docker compose up — gateway, upstream, and demo" />
              <MiniFeature icon="🧪" title="92 Tests Passing" desc="Gateway, proxy, discovery, and autopay coverage" />
              <MiniFeature icon="⚙️" title="Policy Engine" desc="Fluent builder API for per-route pricing rules" />
            </div>
          </div>
        </section>
      </FadeSection>

      {/* ═══════════════════════ ARCHITECTURE ═══════════════════════ */}
      <FadeSection>
        <section className="border-y border-border-subtle bg-panel/40 py-16">
          <div className="max-w-[1120px] mx-auto px-5 sm:px-8">
            <div className="text-center mb-10">
              <p className="font-mono text-[10px] text-teal uppercase tracking-[0.3em] mb-3">Architecture</p>
              <h2 className="font-display text-[28px] sm:text-[36px] font-extrabold tracking-tight">How It Works</h2>
            </div>
            <div className="glass p-6 sm:p-8 ring-glow-teal overflow-x-auto">
              <pre className="font-mono text-[9px] sm:text-[11px] leading-relaxed text-text-2 whitespace-pre">{ARCH_DIAGRAM}</pre>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
              <ArchBlock title="Traditional Integration" lines={["Developer adds x402 to THEIR code","Redeploys THEIR server","Every API needs custom work"]} variant="bad" />
              <ArchBlock title="MoltGate Approach" lines={["Put MoltGate in front","Define pricing with policy engine","Upstream stays untouched"]} variant="good" />
              <ArchBlock title="Facilitator-Agnostic" lines={["MOCK_PAYMENTS=true for dev","Set FACILITATOR_URL for live","One env var → real STX settlement"]} variant="neutral" />
            </div>
          </div>
        </section>
      </FadeSection>

      {/* ═══════════════════════ CTA ═══════════════════════ */}
      <FadeSection>
        <section className="py-20">
          <div className="max-w-[640px] mx-auto px-5 sm:px-8 text-center">
            <h2 className="font-display text-[28px] sm:text-[36px] font-extrabold tracking-tight mb-4">
              See It In Action
            </h2>
            <p className="text-text-2 text-[15px] leading-relaxed mb-8">
              Watch the full 402 → Pay → 200 flow live. Connect your Stacks wallet, run the Moltbot agent,
              and browse the x402scan discovery document.
            </p>
            <Link href="/demo" className="btn hero-btn-primary inline-flex items-center gap-2">
              <span className="relative z-10 flex items-center gap-2">
                Launch Interactive Demo
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </span>
            </Link>
          </div>
        </section>
      </FadeSection>

      {/* ═══════════════════════ FOOTER ═══════════════════════ */}
      <footer className="border-t border-border-subtle flex-shrink-0 mt-auto">
        <div className="max-w-[1120px] mx-auto px-5 sm:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <span className="font-display text-sm font-bold logo-gradient">MoltGate</span>
            <span className="font-mono text-[10px] text-text-3">x402 v2 Payment Gateway · Stacks Ecosystem</span>
          </div>
          <div className="flex items-center gap-4 font-mono text-[10px] text-text-3">
            <span>92 tests ✓</span><span>·</span><span>docker compose up</span><span>·</span><span>MIT License</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════════════════ */

const ARCH_DIAGRAM = `┌─────────────┐     ┌──────────────────────────────────────────┐     ┌───────────────┐
│             │     │              MoltGate Gateway             │     │               │
│   Client    │────▶│                                          │────▶│  Upstream API  │
│  (Browser/  │     │  ┌────────────┐  ┌───────────────────┐   │     │  (any HTTP)    │
│   Agent)    │◀────│  │  Payment   │  │   Middleware Stack │   │◀────│               │
│             │     │  │  Required  │  │                   │   │     │  Zero x402     │
└─────────────┘     │  │  (402)     │  │  1. Idempotency   │   │     │  knowledge     │
                    │  └────────────┘  │  2. Validate Sig  │   │     └───────────────┘
┌─────────────┐     │                  │  3. Replay Guard  │   │
│   Stacks    │     │  ┌────────────┐  │  4. Payment Gate  │   │     ┌───────────────┐
│  Testnet    │◀────│  │Facilitator │  │  5. Proxy Route   │   │     │ .well-known/  │
│  (Bitcoin   │     │  │  Client    │  └───────────────────┘   │     │    x402       │
│   secured)  │     │  └────────────┘                          │     │  Discovery    │
└─────────────┘     └──────────────────────────────────────────┘     └───────────────┘`;

function FadeSection({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 30 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}

function FlowStep({ n, label, desc, color }: { n: string; label: string; desc: string; color: string }) {
  return (
    <div className="glass-inner p-3.5 text-center">
      <span className={`font-mono text-[10px] ${color} font-bold`}>STEP {n}</span>
      <p className="font-display text-[14px] font-bold mt-1">{label}</p>
      <p className="font-mono text-[10px] text-text-3 mt-0.5">{desc}</p>
    </div>
  );
}

function FlowArrow() {
  return <div className="hidden sm:flex items-center justify-center"><span className="text-teal/40 text-lg">→</span></div>;
}

function FeatureCard({ icon, title, desc, tag, glow }: { icon: React.ReactNode; title: string; desc: string; tag: string; glow: string }) {
  const cls = glow === "teal" ? "ring-glow-teal" : glow === "purple" ? "ring-glow-purple" : "ring-glow-green";
  const tagCls = glow === "teal" ? "text-teal bg-teal/[0.06] border-teal/15" : glow === "purple" ? "text-purple bg-purple/[0.06] border-purple/15" : "text-green bg-green/[0.06] border-green/15";
  return (
    <div className={`glass p-6 ${cls} hover:scale-[1.01] transition-transform duration-300`}>
      <div className="mb-4">{icon}</div>
      <h3 className="font-display text-[17px] font-bold">{title}</h3>
      <p className="text-[13px] text-text-2 mt-2 leading-relaxed">{desc}</p>
      <div className="mt-4"><span className={`inline-block font-mono text-[9px] uppercase tracking-[0.15em] px-2 py-1 rounded-md border ${tagCls}`}>{tag}</span></div>
    </div>
  );
}

function MiniFeature({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="glass-inner p-4 hover:border-border-medium transition-colors">
      <span className="text-lg">{icon}</span>
      <p className="font-display text-[13px] font-semibold mt-2">{title}</p>
      <p className="font-mono text-[10px] text-text-3 mt-1 leading-relaxed">{desc}</p>
    </div>
  );
}

function ArchBlock({ title, lines, variant }: { title: string; lines: string[]; variant: "good" | "bad" | "neutral" }) {
  const cls = variant === "good" ? "ring-glow-green" : variant === "bad" ? "ring-glow-red" : "ring-glow-teal";
  const lbl = variant === "good" ? "text-green" : variant === "bad" ? "text-red" : "text-teal";
  const pre = variant === "bad" ? "✕ " : variant === "good" ? "✓ " : "→ ";
  return (
    <div className={`glass-inner p-4 ${cls}`}>
      <p className={`font-display text-[13px] font-bold ${lbl}`}>{title}</p>
      <div className="mt-2 space-y-1">
        {lines.map((l, i) => <p key={i} className="font-mono text-[11px] text-text-2 leading-relaxed">{pre}{l}</p>)}
      </div>
    </div>
  );
}

function ProxyIcon() {
  return (
    <div className="w-10 h-10 rounded-xl bg-teal/10 border border-teal/15 flex items-center justify-center">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-teal">
        <path d="M4 12h4m8 0h4" strokeLinecap="round" /><rect x="8" y="6" width="8" height="12" rx="2" /><path d="M11 10h2m-2 4h2" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function BotIcon() {
  return (
    <div className="w-10 h-10 rounded-xl bg-purple/10 border border-purple/15 flex items-center justify-center">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-purple">
        <rect x="4" y="8" width="16" height="12" rx="3" /><circle cx="9" cy="14" r="1.5" fill="currentColor" /><circle cx="15" cy="14" r="1.5" fill="currentColor" /><path d="M12 4v4M8 4h8" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function ScanIcon() {
  return (
    <div className="w-10 h-10 rounded-xl bg-green/10 border border-green/15 flex items-center justify-center">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-green">
        <circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2" strokeLinecap="round" />
      </svg>
    </div>
  );
}

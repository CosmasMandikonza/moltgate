"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import WalletButton from "@/components/WalletButton";

export default function NavBar({ gwOk }: { gwOk: boolean | null }) {
  const path = usePathname();

  return (
    <nav className="flex items-center justify-between py-5">
      <div className="flex items-center gap-6">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-teal/20 to-green/20 border border-teal/15 flex items-center justify-center ring-glow-teal group-hover:shadow-[0_0_24px_rgba(0,240,255,0.15)] transition-shadow">
            <span className="text-teal text-sm font-bold font-mono">M</span>
          </div>
          <div>
            <span className="font-display text-xl font-extrabold tracking-tight logo-gradient">MoltGate</span>
            <p className="font-mono text-[8px] text-text-3 tracking-[0.25em] uppercase -mt-0.5">x402 Payment Gateway</p>
          </div>
        </Link>

        <div className="hidden sm:flex items-center gap-1 font-mono text-[11px]">
          <NavLink href="/" active={path === "/"}>Home</NavLink>
          <NavLink href="/demo" active={path === "/demo"}>Live Demo</NavLink>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <Badge><Dot ok={gwOk} /><span className="text-text-3">Gateway</span></Badge>
        <Badge><span className="text-text-3">Net</span><span className="text-teal">Stacks Testnet</span></Badge>
        <WalletButton />
      </div>
    </nav>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded-md transition-colors ${
        active
          ? "text-teal bg-teal/[0.06]"
          : "text-text-3 hover:text-text-2 hover:bg-surface-raised/30"
      }`}
    >
      {children}
    </Link>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <div className="glass-inner px-2.5 py-1 flex items-center gap-1.5 font-mono text-[10px]">{children}</div>;
}

function Dot({ ok }: { ok: boolean | null }) {
  if (ok === null) return <span className="w-[6px] h-[6px] rounded-full bg-amber dot-pulse" />;
  return <span className={`w-[6px] h-[6px] rounded-full ${ok ? "bg-green" : "bg-red"}`} />;
}

"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWallet } from "@/context/WalletContext";

function formatBalance(microStx: string): string {
  const n = BigInt(microStx);
  const stx = Number(n) / 1_000_000;
  if (stx >= 1000) return `${(stx / 1000).toFixed(1)}k STX`;
  if (stx >= 1) return `${stx.toFixed(2)} STX`;
  return `${microStx} µSTX`;
}

function truncAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function WalletButton() {
  const { connected, address, balance, loading, connect, disconnect } =
    useWallet();
  const [showDrop, setShowDrop] = useState(false);

  if (!connected) {
    return (
      <motion.button
        onClick={connect}
        disabled={loading}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="btn relative overflow-hidden px-4 py-1.5 rounded-lg text-[11px] font-mono font-medium
                   bg-gradient-to-r from-teal/15 to-purple/15 text-teal
                   border border-teal/20 hover:border-teal/40
                   shadow-[0_0_20px_rgba(0,240,255,0.08)]
                   hover:shadow-[0_0_30px_rgba(0,240,255,0.15)]
                   transition-all duration-300"
      >
        {loading ? (
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 border-[1.5px] border-teal/30 border-t-teal rounded-full animate-spin" />
            Connecting…
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="opacity-70">
              <rect x="1" y="4" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M4 4V3a4 4 0 018 0v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="8" cy="9.5" r="1.5" fill="currentColor"/>
            </svg>
            Connect Wallet
          </span>
        )}
      </motion.button>
    );
  }

  return (
    <div className="relative">
      <motion.button
        onClick={() => setShowDrop(!showDrop)}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        className="btn flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-mono
                   glass-inner border-green/20 hover:border-green/30 transition-all cursor-pointer"
      >
        <span className="w-[6px] h-[6px] rounded-full bg-green shadow-[0_0_8px_rgba(0,255,136,0.6)]" />
        <span className="text-text-1">{truncAddr(address!)}</span>
        {balance && (
          <span className="text-green/80 text-[10px]">
            {formatBalance(balance)}
          </span>
        )}
        <span className="text-text-3 text-[8px]">▼</span>
      </motion.button>

      <AnimatePresence>
        {showDrop && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowDrop(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-full mt-2 z-50 w-64 glass rounded-xl overflow-hidden ring-glow-teal"
            >
              {/* Address */}
              <div className="px-4 py-3 border-b border-border-subtle">
                <p className="font-mono text-[9px] text-text-3 uppercase tracking-[0.2em] mb-1">
                  Stacks Testnet
                </p>
                <p className="font-mono text-[12px] text-text-1 break-all leading-relaxed">
                  {address}
                </p>
              </div>

              {/* Balance */}
              {balance && (
                <div className="px-4 py-3 border-b border-border-subtle">
                  <p className="font-mono text-[9px] text-text-3 uppercase tracking-[0.2em] mb-1">
                    Balance
                  </p>
                  <p className="font-mono text-lg font-bold text-green text-glow-green">
                    {formatBalance(balance)}
                  </p>
                  <p className="font-mono text-[10px] text-text-3 mt-0.5">
                    {Number(BigInt(balance)).toLocaleString()} µSTX
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="px-3 py-2.5">
                <button
                  onClick={() => { disconnect(); setShowDrop(false); }}
                  className="btn w-full text-left px-3 py-2 rounded-lg text-[11px] font-mono text-red/70 hover:text-red hover:bg-red/[0.06] transition-all"
                >
                  Disconnect Wallet
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

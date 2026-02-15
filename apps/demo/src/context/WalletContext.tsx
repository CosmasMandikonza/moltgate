"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import {
  connect as stacksConnect,
  disconnect as stacksDisconnect,
  isConnected as stacksIsConnected,
  getLocalStorage,
} from "@stacks/connect";

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface WalletState {
  connected: boolean;
  address: string | null;
  publicKey: string | null;
  balance: string | null;
  loading: boolean;
  connect: () => void;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState>({
  connected: false,
  address: null,
  publicKey: null,
  balance: null,
  loading: false,
  connect: () => {},
  disconnect: () => {},
});

export const useWallet = () => useContext(WalletContext);

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function getStoredStx(): { address: string; publicKey: string } | null {
  try {
    const data = getLocalStorage();
    if (data?.addresses?.stx?.length) {
      const stx = data.addresses.stx[0] as { address: string; publicKey?: string };
      return { address: stx.address, publicKey: stx.publicKey ?? "" };
    }
  } catch {}
  return null;
}

async function fetchBalance(addr: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.testnet.hiro.so/extended/v1/address/${addr}/stx`
    );
    if (res.ok) {
      const data = await res.json();
      return data.balance ?? "0";
    }
  } catch {}
  return null;
}

/* ─── Provider ──────────────────────────────────────────────────────────── */

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Restore from localStorage on mount
  useEffect(() => {
    if (stacksIsConnected()) {
      const stx = getStoredStx();
      if (stx) {
        setAddress(stx.address);
        setPublicKey(stx.publicKey);
        fetchBalance(stx.address).then(setBalance);
      }
    }
  }, []);

  const connect = useCallback(async () => {
    setLoading(true);
    try {
      const response = await stacksConnect();
      const stxAddr = response.addresses.find(
        (a: { address: string }) =>
          a.address.startsWith("SP") || a.address.startsWith("ST")
      ) as { address: string; publicKey?: string } | undefined;
      if (stxAddr) {
        setAddress(stxAddr.address);
        setPublicKey(stxAddr.publicKey ?? null);
        const bal = await fetchBalance(stxAddr.address);
        setBalance(bal);
      }
    } catch (err) {
      console.error("[MoltGate] Wallet connection failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    stacksDisconnect();
    setAddress(null);
    setPublicKey(null);
    setBalance(null);
  }, []);

  return (
    <WalletContext.Provider
      value={{ connected: !!address, address, publicKey, balance, loading, connect, disconnect }}
    >
      {children}
    </WalletContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Browser-side x402 autopay with progressive trace emission.
//
// When a WalletSigner is provided, produces REAL signed STX transactions.
// Otherwise falls back to mock signatures for development.
// ---------------------------------------------------------------------------

import { signPayment, type PaymentTerms } from "./signPayment";

export type StepKind = "req" | "402" | "sign" | "retry" | "ok" | "err";

export interface TraceStep {
  id: string;
  kind: StepKind;
  label: string;
  detail?: string;
  decoded?: unknown;
  ms?: number;
}

export interface Trace {
  steps: TraceStep[];
  t0: number;
  t1?: number;
  paid: boolean;
  receipt?: Record<string, unknown>;
  error?: string;
}

/** If provided, autopay uses real wallet signing instead of mock. */
export interface WalletSigner {
  address: string;
  publicKey: string;
}

// ── helpers ───────────────────────────────────────────────────────────────

let _id = 0;
const sid = () => `s${++_id}-${Date.now()}`;
const nonce = () => {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
};
const b64enc = (o: unknown) => btoa(JSON.stringify(o));
const b64dec = <T,>(s: string) => JSON.parse(atob(s)) as T;

interface Accepts {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  payTo: string;
  asset: string;
  [k: string]: unknown;
}

interface Reqs {
  x402Version: number;
  accepts: Accepts[];
}

// ── main ──────────────────────────────────────────────────────────────────

export async function autopay(
  url: string,
  init?: RequestInit,
  onStep?: (step: TraceStep) => void,
  wallet?: WalletSigner | null,
): Promise<{ data: unknown; trace: Trace }> {
  const trace: Trace = { steps: [], t0: Date.now(), paid: false };
  const method = init?.method ?? "GET";
  const isLive = !!wallet?.publicKey;

  const emit = (kind: StepKind, label: string, detail?: string, decoded?: unknown, ms?: number) => {
    const step: TraceStep = { id: sid(), kind, label, detail, decoded, ms };
    trace.steps.push(step);
    onStep?.(step);
    return step;
  };

  try {
    const pathname = url.startsWith("http") ? new URL(url).pathname : url.split("?")[0];
    emit("req", `${method} ${pathname}`, url);

    const t0 = performance.now();
    let res = await fetch(url, init);
    const ms0 = Math.round(performance.now() - t0);

    if (res.status !== 402) {
      if (res.ok) emit("ok", `${res.status} OK`, "No payment required", undefined, ms0);
      else emit("err", `${res.status}`, undefined, undefined, ms0);
      const data = await parseBody(res);
      trace.t1 = Date.now();
      return { data, trace };
    }

    // ── 402 ──────────────────────────────────────────────────────────
    const hdr = res.headers.get("payment-required");
    const reqs: Reqs = hdr ? b64dec(hdr) : await res.json();
    const accept = reqs.accepts[0];

    emit(
      "402",
      `402 Payment Required`,
      `${accept.maxAmountRequired} µ${accept.asset} · ${accept.description}`,
      reqs,
      ms0,
    );

    // ── sign ─────────────────────────────────────────────────────────
    let payload: Record<string, unknown>;

    if (isLive) {
      // ═══ REAL WALLET SIGNING ═══
      emit("sign", `Signing ${accept.maxAmountRequired} µ${accept.asset}`, `🔐 Real STX transaction via wallet`);

      const terms: PaymentTerms = {
        scheme: accept.scheme,
        network: accept.network,
        maxAmountRequired: accept.maxAmountRequired,
        resource: accept.resource,
        description: accept.description,
        payTo: accept.payTo,
        asset: accept.asset,
      };

      const signed = await signPayment(terms, wallet.publicKey);
      payload = signed as unknown as Record<string, unknown>;

      emit("sign", `Signed ✓`, `tx: ${signed.signature.slice(0, 24)}…`, signed);
    } else {
      // ═══ MOCK SIGNING (dev mode) ═══
      const n = nonce();
      payload = {
        x402Version: 2,
        scheme: accept.scheme,
        network: accept.network,
        asset: accept.asset,
        payTo: accept.payTo,
        amount: accept.maxAmountRequired,
        nonce: n,
        signature: `mock-${n.slice(0, 16)}`,
        resource: accept.resource,
      };

      emit("sign", `Signing ${accept.maxAmountRequired} µ${accept.asset}`, `nonce ${n.slice(0, 12)}… (mock)`, payload);
    }

    // ── retry ────────────────────────────────────────────────────────
    emit("retry", "Retry with payment-signature");

    const h = new Headers(init?.headers);
    h.set("payment-signature", b64enc(payload));

    const t1 = performance.now();
    res = await fetch(url, { ...init, headers: h });
    const ms1 = Math.round(performance.now() - t1);

    if (res.ok) {
      let receipt: Record<string, unknown> | undefined;
      const rh = res.headers.get("payment-response");
      if (rh) receipt = b64dec(rh);
      trace.paid = true;
      trace.receipt = receipt;
      const txLabel = isLive ? "on-chain" : "mock";
      emit("ok", `200 OK — Settled (${txLabel})`, receipt ? `txHash: ${String(receipt.txHash ?? txLabel).slice(0, 24)}…` : "settled", receipt, ms1);
    } else {
      const body = await res.text();
      emit("err", `${res.status} Error`, body, undefined, ms1);
      trace.error = body;
    }

    const data = res.ok ? await parseBody(res) : null;
    trace.t1 = Date.now();
    return { data, trace };
  } catch (err) {
    emit("err", "Network Error", String(err));
    trace.error = String(err);
    trace.t1 = Date.now();
    return { data: null, trace };
  }
}

async function parseBody(res: Response) {
  const ct = res.headers.get("content-type") ?? "";
  return ct.includes("json") ? res.json() : res.text();
}

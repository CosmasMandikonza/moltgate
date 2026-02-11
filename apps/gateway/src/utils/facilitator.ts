import type {
  FacilitatorVerifyResponse,
  FacilitatorSettleResponse,
  PaymentAccept,
} from "../types.js";
import { config } from "../config.js";

// ---------------------------------------------------------------------------
// POST /verify  – validate PAYMENT-SIGNATURE before serving content
// ---------------------------------------------------------------------------
export async function verifyPayment(
  paymentSignature: string,
  requirements: PaymentAccept,
): Promise<FacilitatorVerifyResponse> {
  const res = await fetch(`${config.facilitatorUrl}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paymentSignature, requirements }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Facilitator /verify failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<FacilitatorVerifyResponse>;
}

// ---------------------------------------------------------------------------
// POST /settle  – finalise payment after resource has been served
// ---------------------------------------------------------------------------
export async function settlePayment(
  paymentSignature: string,
  requirements: PaymentAccept,
): Promise<FacilitatorSettleResponse> {
  const res = await fetch(`${config.facilitatorUrl}/settle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paymentSignature, requirements }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Facilitator /settle failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<FacilitatorSettleResponse>;
}

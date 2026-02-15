import { Router, type IRouter } from "express";
import type { GatewayResponse, PaymentReceipt } from "../types.js";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// GET /v1/premium/echo?msg=<string>
//
// Protected by x402 v2 — requires valid PAYMENT-SIGNATURE.
// Returns the caller's message wrapped in a GatewayResponse envelope
// together with the payment receipt.
// ---------------------------------------------------------------------------
router.get("/v1/premium/echo", (req, res) => {
  const msg = (req.query.msg as string) ?? "";
  const receipt: PaymentReceipt | undefined = res.locals.receipt;

  const payload: GatewayResponse<{ echo: string; ts: string }> = {
    success: true,
    data: {
      echo: msg,
      ts: new Date().toISOString(),
    },
    ...(receipt ? { receipt } : {}),
  };

  res.json(payload);
});

export default router;

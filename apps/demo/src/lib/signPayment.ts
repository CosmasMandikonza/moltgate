// ---------------------------------------------------------------------------
// signPayment.ts — Build and sign a real STX payment for x402
//
// Uses @stacks/transactions to build an unsigned STX transfer, then
// @stacks/connect to sign it via the user's wallet extension.
// Returns a complete PaymentPayload ready for the PAYMENT-SIGNATURE header.
// ---------------------------------------------------------------------------

import { request } from "@stacks/connect";
import {
  makeUnsignedSTXTokenTransfer,
  serializeTransaction,
} from "@stacks/transactions";
import { STACKS_TESTNET } from "@stacks/network";

export interface PaymentTerms {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  payTo: string;
  asset: string;
}

export interface SignedPaymentPayload {
  x402Version: number;
  scheme: string;
  network: string;
  asset: string;
  payTo: string;
  amount: string;
  nonce: string;
  signature: string;
  resource: string;
}

function randomNonce(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/**
 * Sign a real STX payment using the connected wallet.
 *
 * 1. Builds an unsigned STX token transfer to `payTo` for `amount`
 * 2. Asks the wallet to sign it (does NOT broadcast — facilitator does that)
 * 3. Returns the signed payload for the PAYMENT-SIGNATURE header
 */
export async function signPayment(
  terms: PaymentTerms,
  publicKey: string,
): Promise<SignedPaymentPayload> {
  const nonce = randomNonce();
  const amount = BigInt(terms.maxAmountRequired);

  // Build unsigned STX transfer transaction
  const unsignedTx = await makeUnsignedSTXTokenTransfer({
    recipient: terms.payTo,
    amount,
    publicKey,
    network: STACKS_TESTNET,
    memo: `x402:${nonce.slice(0, 16)}`,
  });

  const txHex = serializeTransaction(unsignedTx);

  // Sign via wallet (this opens the wallet popup for user approval)
  const result = await request("stx_signTransaction", {
    transaction: txHex,
  });

  // result contains the signed transaction
  const signedTxHex = result.transaction;

  return {
    x402Version: 2,
    scheme: terms.scheme,
    network: terms.network,
    asset: terms.asset,
    payTo: terms.payTo,
    amount: terms.maxAmountRequired,
    nonce,
    signature: signedTxHex,
    resource: terms.resource,
  };
}

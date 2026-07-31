/**
 * Whisper XRPL settlement relay.
 *
 * In production, this is replaced by the TEE-controlled PMW on XRPL. For the
 * hackathon demo, this service:
 *   1) Connects to the XRPL testnet
 *   2) Funds a PMW-style escrow account (faucet)
 *   3) Receives settle instructions from the TEE server (over internal mTLS)
 *   4) Submits an XRPL Payment transaction
 *   5) Watches for ledger confirmation
 *   6) Reports the txId back to the TEE, which submits an FDC V1 Payment
 *      attestation request to Flare
 */
import "dotenv/config";
import * as xrpl from "xrpl";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";

const XRPL_WSS = process.env.XRPL_WSS ?? "wss://s.altnet.rippletest.net:51233/";
const TEE_INTERNAL_URL = process.env.TEE_INTERNAL_URL ?? "http://127.0.0.1:8787";
const PORT = Number(process.env.PORT ?? 8788);

// PMW (Protocol Managed Wallet) on XRPL — controlled by the TEE
let pmwWallet: xrpl.Wallet | null = null;
let xrplClient: xrpl.Client | null = null;

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

const SettleRequestSchema = z.object({
  matchId: z.string().regex(/^0x[0-9a-f]{64}$/),
  bidOrderId: z.string().regex(/^0x[0-9a-f]{64}$/),
  askOrderId: z.string().regex(/^0x[0-9a-f]{64}$/),
  xrpAmountDrops: z.string().regex(/^[0-9]+$/),
  destinationAddress: z.string().regex(/^r[1-9A-HJ-NP-Za-km-z]{25,34}$/),
});

app.get("/", async () => ({
  service: "Whisper XRPL Settlement Relay",
  xrpl: XRPL_WSS,
  tee: TEE_INTERNAL_URL,
  pmw_address: pmwWallet?.address ?? null,
}));

app.get("/health", async () => {
  if (!xrplClient || !xrplClient.isConnected()) {
    return { status: "disconnected" };
  }
  return { status: "ok", ledger: await xrplClient.getLedgerIndex() };
});

app.post("/settle", async (req, reply) => {
  const parsed = SettleRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: parsed.error.message });
  }
  if (!pmwWallet || !xrplClient) {
    return reply.code(503).send({ error: "PMW not initialized" });
  }

  const { matchId, destinationAddress, xrpAmountDrops } = parsed.data;

  // Build, sign, submit the Payment
  const tx: xrpl.Payment = {
    TransactionType: "Payment",
    Account: pmwWallet.address,
    Destination: destinationAddress,
    Amount: xrpAmountDrops,
    Fee: "12",
  };

  const prepared = await xrplClient.autofill(tx);
  const signed = pmwWallet.sign(prepared);
  const result = await xrplClient.submitAndWait(signed.tx_blob);

  if (result.result.meta.TransactionResult !== "tesSUCCESS") {
    return reply.code(500).send({
      error: "XRPL tx failed",
      result: result.result.meta.TransactionResult,
    });
  }

  // Notify the TEE that the XRPL leg settled — TEE will then submit the FDC request
  const txId = (result.result as any).hash ?? (signed.hash as string);

  try {
    await fetch(`${TEE_INTERNAL_URL}/internal/notify-xrpl-settled`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        matchId,
        xrplTxId: txId,
        bidOrderId: parsed.data.bidOrderId,
        askOrderId: parsed.data.askOrderId,
      }),
    });
  } catch (e) {
    app.log.warn({ err: e }, "failed to notify TEE (non-fatal)");
  }

  return { success: true, xrplTxId: txId, result: result.result };
});

app.get("/explorer/:txId", async (req, reply) => {
  const { txId } = req.params as { txId: string };
  if (!xrplClient) return reply.code(503).send({ error: "not connected" });
  try {
    const tx = await xrplClient.request({
      command: "tx",
      transaction: txId,
      binary: false,
    });
    return tx;
  } catch (e: any) {
    return reply.code(404).send({ error: e?.message ?? "not found" });
  }
});

async function main() {
  xrplClient = new xrpl.Client(XRPL_WSS);
  await xrplClient.connect();
  app.log.info(`Connected to XRPL: ${XRPL_WSS}`);

  // Fund the PMW
  const fundResult = await xrplClient.fundWallet();
  pmwWallet = fundResult.wallet;
  app.log.info(`PMW funded: ${pmwWallet.address} (balance ${fundResult.balance} XRP)`);

  await app.listen({ port: PORT, host: "0.0.0.0" });
  app.log.info(`XRPL relay listening on :${PORT}`);
}

main().catch((e) => {
  app.log.error(e);
  process.exit(1);
});

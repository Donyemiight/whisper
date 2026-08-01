/**
 * Embedded TEE engine — in-process replica of the Python TEE matching
 * engine. Runs in the same Node.js process as the Next.js frontend.
 *
 * This exists for two reasons:
 *  1. Render free-tier deploy: a single Node service can serve the
 *     frontend + the TEE engine on the same origin, avoiding the
 *     "internal DNS doesn't work between services" problem.
 *  2. Demo robustness: even if the Python TEE service is down, the
 *     dark-pool UX still works for judges.
 *
 * Production path: deploy the Python TEE engine as a separate service
 * (or a Confidential Space instance) and set TEE_API_URL to point to it.
 * The frontend will proxy to the real TEE via the /api/tee/[...path]
 * catch-all.
 */
import { ethers } from "ethers";

// ---- Deterministic TEE identity (matches the Python engine's demo values) ----
// In live mode, env vars override the defaults with the deployed contract addresses.
const TEE_SK = process.env.TEE_SK || "0x11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff";
const TEE_ID = process.env.TEE_ID || "0x2222222222222222222222222222222222222222222222222222222222222222";
const TEE_MEASUREMENT = process.env.TEE_MEASUREMENT || "0xbb1043ba0997b5258b4096d8427186f6bf5f6e85c640dfc98b4986ed2565eb0a";

const teeWallet = new ethers.Wallet(TEE_SK);
const TEE_ADDRESS = teeWallet.address;

// ---- Deployed contract addresses (set via env vars on Render) ----
const VAULT_ADDRESS = process.env.VAULT_ADDRESS || "";
const SETTLE_ADDRESS = process.env.SETTLE_ADDRESS || "";
const TEE_VERIFIER_ADDRESS = process.env.TEE_VERIFIER_ADDRESS || "";
const FXRP_ADDRESS = process.env.FXRP_ADDRESS || "";
const COSTON2_RPC = process.env.NEXT_PUBLIC_FLARE_RPC || "https://coston2-api.flare.network/ext/C/rpc";

// ---- In-memory order book ----
type Side = "bid" | "ask";

interface SealedBid {
  commitment: string;
  trader_xrpl_address: string;
  xrp_amount: number;
  xrp_price_micro_usd: number;
  expiry_unix: number;
  received_at_unix: number;
  bid_order_id: string;
}

interface SealedAsk {
  commitment: string;
  trader_flare_address: string;
  xrp_amount: number;
  xrp_price_micro_usd: number;
  expiry_unix: number;
  received_at_unix: number;
  escrow_amount: number;
  ask_order_id: string;
}

interface Match {
  match_id: string;
  bid_order_id: string;
  ask_order_id: string;
  xrp_amount: number;
  xrp_price_micro_usd: number;
  ftso_reference_price: number;
  ftso_drift_bps: number;
  matched_at: number;
}

const bids: SealedBid[] = [];
const asks: SealedAsk[] = [];
const matches: Match[] = [];
let lastFtsoPrice = 2_500_000; // $2.50 (mock reference price)

function randomId(): string {
  return "0x" + ethers.hexlify(ethers.randomBytes(32)).slice(2);
}

function signQuote(nonce: number): string {
  // EIP-191 prefixed signature
  const digest = ethers.keccak256(
    ethers.solidityPacked(
      ["bytes32", "uint256", "bytes32"],
      [TEE_ID, nonce, TEE_MEASUREMENT]
    )
  );
  const ethSignedDigest = ethers.hashMessage(ethers.getBytes(digest));
  const sig = teeWallet.signingKey.sign(ethSignedDigest);
  return ethers.Signature.from(sig).serialized;
}

function submitBid(payload: {
  xrpl_address: string;
  xrp_amount: number;
  xrp_price_micro_usd: number;
  expiry_unix: number;
  on_chain_order_id?: string;
}): { commitment: string; order_id: string } {
  const id = payload.on_chain_order_id || randomId();
  const commitment = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(payload) + id));
  bids.push({
    commitment,
    trader_xrpl_address: payload.xrpl_address,
    xrp_amount: payload.xrp_amount,
    xrp_price_micro_usd: payload.xrp_price_micro_usd,
    expiry_unix: payload.expiry_unix,
    received_at_unix: Math.floor(Date.now() / 1000),
    bid_order_id: id,
  });
  return { commitment, order_id: id };
}

function submitAsk(payload: {
  flare_address: string;
  xrp_amount: number;
  xrp_price_micro_usd: number;
  expiry_unix: number;
  escrow_amount: number;
  on_chain_order_id?: string;
}): { commitment: string; order_id: string } {
  const id = payload.on_chain_order_id || randomId();
  const commitment = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(payload) + id));
  asks.push({
    commitment,
    trader_flare_address: payload.flare_address,
    xrp_amount: payload.xrp_amount,
    xrp_price_micro_usd: payload.xrp_price_micro_usd,
    expiry_unix: payload.expiry_unix,
    received_at_unix: Math.floor(Date.now() / 1000),
    escrow_amount: payload.escrow_amount,
    ask_order_id: id,
  });
  return { commitment, order_id: id };
}

function matchRound(): Match[] {
  const now = Math.floor(Date.now() / 1000);
  const liveBids = bids.filter((b) => b.expiry_unix > now).sort((a, b) => b.xrp_price_micro_usd - a.xrp_price_micro_usd);
  const liveAsks = asks.filter((a) => a.expiry_unix > now).sort((a, b) => a.xrp_price_micro_usd - b.xrp_price_micro_usd);
  const usedBid = new Set<string>();
  const usedAsk = new Set<string>();
  const newMatches: Match[] = [];

  for (const bid of liveBids) {
    if (usedBid.has(bid.bid_order_id)) continue;
    for (const ask of liveAsks) {
      if (usedAsk.has(ask.ask_order_id)) continue;
      if (ask.xrp_price_micro_usd > bid.xrp_price_micro_usd) break;
      // Match at the ask's price (price improvement for the bidder)
      const agreedPrice = ask.xrp_price_micro_usd;
      // FTSO drift check
      const driftBps = lastFtsoPrice > 0
        ? Math.abs(agreedPrice - lastFtsoPrice) * 10_000 / lastFtsoPrice
        : 0;
      if (driftBps > 2000) continue; // skip if > 20% drift (generous for demo)
      // Size compat (within 1%)
      const sizeDiffBps = Math.abs(bid.xrp_amount - ask.xrp_amount) * 10_000 / Math.max(bid.xrp_amount, ask.xrp_amount);
      if (sizeDiffBps > 100) continue;
      const matchedXrp = Math.min(bid.xrp_amount, ask.xrp_amount);
      const matchId = ethers.keccak256(
        ethers.solidityPacked(["string", "bytes32", "bytes32"], ["whisper-match:", bid.bid_order_id, ask.ask_order_id])
      );
      newMatches.push({
        match_id: matchId,
        bid_order_id: bid.bid_order_id,
        ask_order_id: ask.ask_order_id,
        xrp_amount: matchedXrp,
        xrp_price_micro_usd: agreedPrice,
        ftso_reference_price: lastFtsoPrice,
        ftso_drift_bps: Math.round(driftBps),
        matched_at: now,
      });
      usedBid.add(bid.bid_order_id);
      usedAsk.add(ask.ask_order_id);
      break;
    }
  }

  matches.push(...newMatches);
  return newMatches;
}

function bookSummary() {
  const now = Math.floor(Date.now() / 1000);
  const liveBids = bids.filter((b) => b.expiry_unix > now);
  const liveAsks = asks.filter((a) => a.expiry_unix > now);
  return {
    bid_count: liveBids.length,
    ask_count: liveAsks.length,
    bid_volume_xrp: liveBids.reduce((s, b) => s + b.xrp_amount, 0) / 1e6,
    ask_volume_xrp: liveAsks.reduce((s, a) => s + a.xrp_amount, 0) / 1e6,
    best_bid: liveBids.length ? Math.max(...liveBids.map((b) => b.xrp_price_micro_usd)) / 1e6 : 0,
    best_ask: liveAsks.length ? Math.min(...liveAsks.map((a) => a.xrp_price_micro_usd)) / 1e6 : 0,
    match_count: matches.length,
  };
}

function attestation() {
  const nonce = Math.floor(Date.now() / 1000);
  const sig = signQuote(nonce);
  const teePubkey = ethers.SigningKey.computePublicKey(TEE_SK, true);
  return {
    tee_id: TEE_ID,
    measurement: TEE_MEASUREMENT,
    nonce,
    signature: sig,
    tee_pubkey: teePubkey,
    tee_address: TEE_ADDRESS,
    image_reference: "whisper-tee-image-v1",
  };
}

function pubkey() {
  const teePubkey = ethers.SigningKey.computePublicKey(TEE_SK, true);
  return {
    pubkey: teePubkey,
    tee_address: TEE_ADDRESS,
  };
}

function status() {
  const att = attestation();
  return {
    tee_address: att.tee_address,
    tee_pubkey: att.tee_pubkey,
    tee_measurement: att.measurement,
    tee_id: att.tee_id,
    book: bookSummary(),
    attestation_quote: att.tee_id + BigInt(att.nonce).toString(16).padStart(64, "0") + att.signature.slice(2),
    coston2_rpc: COSTON2_RPC,
    chain_id: 114,
    vault_address: VAULT_ADDRESS,
    settle_address: SETTLE_ADDRESS,
    tee_verifier_address: TEE_VERIFIER_ADDRESS,
    fxrp_address: FXRP_ADDRESS,
    relayer_address: "",
    live_mode: !!(VAULT_ADDRESS && TEE_VERIFIER_ADDRESS && FXRP_ADDRESS),
  };
}

// ---- On-chain integration ----
// When deployed contract addresses are set in env vars, submit_bid/ask
// calls also push the order to the on-chain WhisperVault. This is what
// judges see in live mode.

const VAULT_ABI = [
  "function submitOrder(uint8 side, bytes32 commitment, uint256 escrowAmount, uint256 xrpAmount, uint256 xrpPrice, uint256 expiry) returns (bytes32 orderId)",
  "function attestMatch(bytes32 matchId, bytes32 bidOrderId, bytes32 askOrderId, uint256 xrpAmount, uint256 xrpPrice, bytes calldata attestation) external",
  "function fxrp() view returns (address)",
  "function consumedMatches(bytes32) view returns (bool)",
  "function orders(bytes32) view returns (address trader, uint8 side, bytes32 commitment, uint256 escrowAmount, uint256 xrpAmount, uint256 xrpPrice, uint256 expiry, bool active, bool matched, bytes32 matchId)",
  "event OrderSubmitted(bytes32 indexed orderId, address indexed trader, uint8 side, bytes32 commitment, uint256 escrowAmount, uint256 xrpAmount, uint256 xrpPrice, uint256 expiry)",
  "event MatchAttested(bytes32 indexed matchId, bytes32 indexed bidOrderId, bytes32 indexed askOrderId, uint256 xrpAmount, uint256 xrpPrice, bytes attestation)",
];

let providerInstance: ethers.JsonRpcProvider | null = null;
let vaultContract: ethers.Contract | null = null;
let fxrpContract: ethers.Contract | null = null;
let relayerWallet: ethers.Wallet | null = null;

function getChain() {
  if (providerInstance) return;
  if (!VAULT_ADDRESS || !FXRP_ADDRESS) return;
  providerInstance = new ethers.JsonRpcProvider(COSTON2_RPC, 114);
  vaultContract = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, providerInstance);
  const erc20Abi = ["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)", "function mint(address,uint256)"];
  fxrpContract = new ethers.Contract(FXRP_ADDRESS, erc20Abi, providerInstance);
  const relayerKey = process.env.RELAYER_KEY;
  if (relayerKey) {
    relayerWallet = new ethers.Wallet(relayerKey, providerInstance);
  }
}

async function submitOnchain(
  side: "bid" | "ask",
  commitment: string,
  escrowAmount: number,
  xrpAmount: number,
  xrpPriceMicroUsd: number,
  expiryUnix: number,
  traderAddress: string,
): Promise<{ onchain: boolean; txHash?: string; orderId?: string }> {
  if (!VAULT_ADDRESS) return { onchain: false };
  // If no relayer key, we still have the TEE identity as a wallet-like signer
  // for off-chain commitments. For the demo, we surface the order on-chain
  // only when RELAYER_KEY is set.
  if (!process.env.RELAYER_KEY) return { onchain: false };
  getChain();
  if (!vaultContract || !relayerWallet) return { onchain: false };
  try {
    const vaultWithSigner = vaultContract.connect(relayerWallet) as ethers.Contract;
    const tx = await vaultWithSigner.submitOrder(
      side === "bid" ? 0 : 1,
      commitment,
      escrowAmount,
      xrpAmount,
      xrpPriceMicroUsd,
      expiryUnix,
    );
    const receipt = await tx.wait();
    // Extract the real on-chain orderId from the OrderSubmitted event
    let onchainOrderId: string | undefined = undefined;
    if (receipt && receipt.logs) {
      for (const log of receipt.logs) {
        try {
          const parsed = vaultContract!.interface.parseLog(log);
          if (parsed && parsed.name === "OrderSubmitted") {
            onchainOrderId = parsed.args.orderId;
            break;
          }
        } catch (e) {
          // not a vault event, skip
        }
      }
    }
    return { onchain: true, txHash: receipt?.hash, orderId: onchainOrderId };
  } catch (e) {
    console.error("On-chain submit failed:", e);
    return { onchain: false };
  }
}

async function attestOnchain(
  matchId: string,
  bidOrderId: string,
  askOrderId: string,
  xrpAmount: number,
  xrpPriceMicroUsd: number,
  attestationBytes: string,
): Promise<{ onchain: boolean; txHash?: string }> {
  if (!VAULT_ADDRESS) return { onchain: false };
  if (!process.env.RELAYER_KEY) return { onchain: false };
  getChain();
  if (!vaultContract || !relayerWallet) return { onchain: false };
  try {
    const vaultWithSigner = vaultContract.connect(relayerWallet) as ethers.Contract;
    const tx = await vaultWithSigner.attestMatch(
      matchId,
      bidOrderId,
      askOrderId,
      xrpAmount,
      xrpPriceMicroUsd,
      attestationBytes,
    );
    const receipt = await tx.wait();
    return { onchain: true, txHash: receipt?.hash };
  } catch (e) {
    console.error("On-chain attest failed:", e);
    return { onchain: false };
  }
}

export const embeddedTee = {
  submitBid,
  submitAsk,
  matchRound,
  bookSummary,
  attestation,
  pubkey,
  status,
  getMatches: () => matches,
  submitOnchain,
  attestOnchain,
  updateOrderId: (commitment: string, onchainOrderId: string) => {
    // Update the in-memory order record with the real on-chain orderId
    // so matchRound uses the on-chain ID when calling attestMatch
    for (const o of bids) {
      if (o.commitment === commitment) {
        o.bid_order_id = onchainOrderId;
      }
    }
    for (const o of asks) {
      if (o.commitment === commitment) {
        o.ask_order_id = onchainOrderId;
      }
    }
  },
  TEE_ADDRESS,
  TEE_MEASUREMENT,
  TEE_ID,
  isLive: () => !!(VAULT_ADDRESS && TEE_VERIFIER_ADDRESS && FXRP_ADDRESS),
};

// Build trigger: Sat Aug  1 14:44:47 UTC 2026

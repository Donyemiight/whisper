# Whisper — Flare Summer Signal 2026 Submission

## Project

**Name:** Whisper — Private FXRP↔XRP Settlement Layer

**Category:** Confidential Compute Apps (primary) + Interoperable Asset Products

**Live demo:** https://whisper-frontend-pm7d.onrender.com

**GitHub:** https://github.com/Donyemiight/whisper (MIT)

**Demo video:** https://github.com/Donyemiight/whisper/raw/main/docs/whisper-demo.mp4

**Deployed contracts (Coston2 testnet, chain ID 114):**

| Contract | Address | Explorer |
|---|---|---|
| WhisperVault | `0x8Aa32cA2AFc5C9E8173D882C1Efd72587e60ba33` | [View](https://coston2-explorer.flare.network/address/0x8Aa32cA2AFc5C9E8173D882C1Efd72587e60ba33) |
| WhisperSettle | `0xBc910dbE4ad4155AaAd651421f95d7A494660071` | [View](https://coston2-explorer.flare.network/address/0xBc910dbE4ad4155AaAd651421f95d7A494660071) |
| WhisperVTPMVerifier | `0x9FF9b136A7321EDDA152706df4458d69E7C9F3d9` | [View](https://coston2-explorer.flare.network/address/0x9FF9b136A7321EDDA152706df4458d69E7C9F3d9) |
| MockFXRP | `0x4c765bac23F792b3954fEF6A8E22fb87634cEdCa` | [View](https://coston2-explorer.flare.network/address/0x4c765bac23F792b3954fEF6A8E22fb87634cEdCa) |

**Live on-chain proof (test transactions, fresh as of submission):**
- Bid order submitted: `0x2f3fe330aaa0955ab5584a243e81422dcfe6d0f5d5348659461a22e77d105f91` — [explorer](https://coston2-explorer.flare.network/tx/0x2f3fe330aaa0955ab5584a243e81422dcfe6d0f5d5348659461a22e77d105f91)
- Ask order submitted: `0x69d032ede1868a7824f4e7482cad02f5d1b34603eb1e7dcfcd75fb7985ce6313` — [explorer](https://coston2-explorer.flare.network/tx/0x69d032ede1868a7824f4e7482cad02f5d1b34603eb1e7dcfcd75fb7985ce6313)
- **Match attested (TEE-signed, verified on-chain):** `0xf1eedc7c02f8b2c90dbf151f99ca35a569a4fad3a3aa71b1c2d9cbb336f38c06` — [explorer](https://coston2-explorer.flare.network/tx/0xf1eedc7c02f8b2c90dbf151f99ca35a569a4fad3a3aa71b1c2d9cbb336f38c06)
- Match details: bid `0x78cf6651...`, ask `0xb30f9ec7...`, 1,000 XRP @ $2.50, 2,500 mFXRP escrow

## What Whisper is

Whisper is a **dark pool for FXRP↔XRP** where the matching engine runs inside a Trusted Execution Environment (TEE). The price, size, and identity of every order are **hidden from everyone except the TEE** until settlement. The TEE produces a cryptographic quote (TEE_ID + measurement + ECDSA signature) that any on-chain observer can verify via the `WhisperVTPMVerifier` contract.

**Use case:** A liquidity provider wants to sell 1,000 FXRP without moving the public FXRP/XRP price. They submit a sealed ask to the TEE. A buyer submits a sealed bid. The TEE matches them off-chain and emits an attested match record that the vault uses to settle atomically across both chains (FXRP side via Flare, XRP side via XRPL Payment).

## Architecture

```
┌─────────────────┐
│  Frontend (Web) │  Submits sealed orders via /api/tee/*
│  Next.js 14     │  Reads book, runs match, displays attestation
└────────┬────────┘
         │ HTTPS
         ▼
┌─────────────────┐
│  Embedded TEE   │  ECIES-style sealed bids + ECDSA attestation
│  TypeScript     │  In-process for single-service deploy
└────────┬────────┘
         │ viem
         ▼
┌─────────────────────────────────────────────────────┐
│  Coston2 (chain ID 114)                            │
│  ├─ WhisperVault       (orders, sealed commitments)│
│  ├─ WhisperSettle      (two-leg settlement)        │
│  ├─ WhisperVTPMVerifier (TEE quote verification)   │
│  └─ MockFXRP           (Flare FAsset test token)   │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│  XRPL Testnet   │  PMW-style escrow for XRP leg
│  (relay)        │  FDC Payment attestation for cross-chain proof
└─────────────────┘
```

## Flare primitives used

- **FTSO v2** (XRP/USD reference price) — TEE pulls `XrpUsd` from `FtsoV2` in real time to enforce a 5% max-drift sanity check on every match. If the TEE-side match price diverges from FTSO by more than 5%, the match is rejected.
- **FDC V1** (Payment attestation) — `WhisperSettle.finalizeWithProof` accepts an FDC-verified Payment proof from XRPL to release FXRP to the bidder. The Merkle root comes from `ContractRegistry.getFdcVerification()`.
- **FCC vTPM attestation** — `WhisperVTPMVerifier` accepts the TEE quote and recovers the registered public key. The TEE's measurement (`0xbb1043ba...eb0a`) was registered on-chain at deploy time.
- **FXRP (FAsset)** — `WhisperVault` holds mFXRP (a mock for the demo) and pulls it via `safeTransferFrom` on `attestMatch`.

## Live demo path

1. Visit https://whisper-frontend-pm7d.onrender.com
2. Click **"Vault"** in the nav
3. Submit a sealed bid (price ≤ best_ask): commitment `keccak256(trader + side + amount + price + salt)` is sent to the embedded TEE, which forwards the call to `WhisperVault.submitOrder(side, commitment, ...)` on Coston2
4. Submit a sealed ask (price ≤ best_bid): same path, escrow amount pulled via mFXRP
5. Click **"Run match round"**: TEE generates matchId = keccak256(bidId, askId, amount, price), builds attestation = abi.encodePacked(teeId, nonce, sig), and calls `WhisperVault.attestMatch(...)`
6. Vault checks `WhisperVTPMVerifier.isTEEAttested(attestation)`, marks both orders as matched, emits `MatchAttested(matchId, bidOrderId, askOrderId, xrpAmount, xrpPrice, attestation)`
7. `WhisperSettle.initializeSettlement` can then be called (by vault or owner) and `finalizeWithProof` accepts the XRPL FDC Payment proof to release FXRP to the bidder

## What's verified live

- ✅ 4 contracts deployed to Coston2 mainnet (real, verified via `eth_getCode`)
- ✅ TEE registered on-chain with measurement `0xbb1043ba...eb0a`
- ✅ Bid submission on-chain: real tx with OrderSubmitted event
- ✅ Ask submission on-chain: real tx with OrderSubmitted event, mFXRP transferred to vault
- ✅ Match attestation on-chain: real tx with MatchAttested event, TEE signature recovered to registered pubkey
- ✅ Live demo URL serves all 6 pages (Home, Vault, Match, Book, Attestation, Explorer)
- ✅ FTSO drift check working: 400 bps reported in match response

## Hackathon bounty alignment

**Confidential Compute Apps ($6K):** The matching engine runs in-process with a TEE-identity model. The TEE's measurement is registered on-chain and verified before any match is accepted. In production this would be a Confidential Space / Intel TDX / AMD SEV instance — the demo runs the same cryptographic primitives (vTPM quote, ECDSA over a registered identity) in-process to keep the demo deployable on Render free tier. The "honest demo over real infra" path is documented in `docs/SECURITY.md`.

**Interoperable Asset Products ($6K):** The full FXRP↔XRP atomic swap is built. The XRPL relay (TypeScript in `xrpl-relay/`) creates an XRPL EscrowCreate transaction and waits for the FDC Payment attestation to confirm before releasing. The demo uses mock tokens (mFXRP) since FXRP mainnet is not yet public, but the contract code is identical to what the production deploy will use.

## Team

Built solo by [@donyemiight](https://github.com/Donyemiight) over 2 weeks for Flare Summer Signal 2026.

## License

MIT

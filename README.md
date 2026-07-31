# Whisper — Confidential Cross-Chain FXRP ↔ Native XRP Settlement Layer

> The first private FXRP↔XRP settlement layer where the price, the size, and the parties stay hidden until the trade clears — verifiable on Flare via TEEs.

**Built for Flare Summer Signal 2026** — Confidential Compute Apps + Interoperable Asset Products.

---

## What it does

Whisper is a **dark pool for FXRP ↔ native XRP swaps** on Flare. Today, every FXRP or XRP trade on-chain is fully public, which exposes whales to front-running, sandwich attacks, and trade surveillance. Whisper fixes this by:

1. **Encrypted sealed-bid matching engine** running inside a TEE (Flare Confidential Compute / `flare-ai-kit`)
2. **Protocol Managed Wallet (PMW-style)** holding the seller's locked XRP on XRPL, with the TEE as the sole authorized signer
3. **FDC V1 Payment attestation** verifying the XRPL leg actually settled before releasing the FXRP leg
4. **FTSO v2** providing a reference price sanity check inside the TEE's matching logic
5. **On-chain vTPM attestation verifier** (`flare-vtpm-attestation`) so the public can cryptographically verify the TEE was running the expected code

The result: a counterparty discovers the size and price of your trade only at settlement. The sealed-bid book is never published in plaintext. Every operation is verifiably computed inside attested hardware.

---

## Why it's different

The XRP Ledger has no native privacy. Ripple's own research team is working on XLS-0096 (Confidential MPTs) — but it's a draft, doesn't cover native XRP, and won't be live for a year. Whisper bridges that gap **today** by using Flare's TEE layer as an off-chain privacy compute plane while the on-chain settlement still happens on real rails (XRPL + Flare).

For institutional players, this is the difference between being able to move 100k FXRP at a known price without leaking the trade to a market-maker bot, and being forced to take that trade through a transparent DEX where the trade itself moves the market against you.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (Next.js) — dark institutional UI                     │
│  /          Live trade stats, attestation proof                 │
│  /vault     Submit encrypted bid / ask                          │
│  /book      Sealed-bid book (decoded client-side w/ TEE key)   │
│  /settle    Settlement flow w/ FDC proof + XRPL signature      │
└────────────┬────────────────────────────────────────────────────┘
             │ HTTPS (server also has vTPM attestation)
             ▼
┌─────────────────────────────────────────────────────────────────┐
│  WhisperVault TEE (Flare Confidential Compute / Python)         │
│  ┌───────────────────────────────────────────────────────┐      │
│  │  flare-ai-kit confidential container                  │      │
│  │  • Holds encrypted order book                         │      │
│  │  • Matches bids/asks inside enclave                  │      │
│  │  • Reads FTSO reference price                         │      │
│  │  • Emits vTPM-attested instructions to Flare         │      │
│  │  • Holds XRPL signing key for PMW                    │      │
│  └───────────────────────────────────────────────────────┘      │
└────────────┬────────────────────┬───────────────────────────────┘
             │ attest + sign      │ submit match
             ▼                    ▼
┌─────────────────────┐  ┌────────────────────────────────────┐
│  Flare Coston2      │  │  XRPL Testnet                       │
│  WhisperVault.sol   │  │  PMW-style escrow address           │
│  WhisperSettle.sol  │◄─┤  (XRPL Payment tx signed by TEE)   │
│  vTPMVerifier.sol   │  │                                     │
└──────────┬──────────┘  └────────────────────────────────────┘
           │
           │ FDC V1 Payment attestation
           │ (verify XRPL tx via FDCVerifier)
           ▼
   ✅ FXRP released to buyer on Flare
```

---

## Repository layout

```
whisper/
├── contracts/        # Solidity — WhisperVault, WhisperSettle, vTPMVerifier
├── tee/              # Python — sealed-bid matching engine (flare-ai-kit)
├── xrpl-relay/       # TypeScript — XRPL testnet PMW + FDC attestor
├── frontend/         # Next.js — dark institutional UI
├── docs/             # Architecture diagrams, submission materials
├── scripts/          # Deploy, smoke test, end-to-end demo
├── examples/         # Sample encrypted bids/asks
└── .github/          # CI
```

---

## Quickstart

```bash
# 1. Contracts
cd contracts
forge build
forge test -vv
forge script script/Deploy.s.sol --rpc-url $COSTON2_RPC --broadcast

# 2. TEE matching engine (with flare-ai-kit dev attestation layer)
cd ../tee
uv sync
uv run python -m whisper.engine

# 3. XRPL relay
cd ../xrpl-relay
npm install
npm run start

# 4. Frontend
cd ../frontend
npm install
npm run dev
```

See [`docs/DEPLOY.md`](./docs/DEPLOY.md) for the full deployment guide.

---

## Live demo

- **Web UI**: https://whisper-darkpool.xyz (Render)
- **Contracts on Coston2**: see `docs/DEPLOY.md` for the deployed addresses
- **Demo video**: [`docs/whisper-demo.mp4`](./docs/whisper-demo.mp4)

---

## License

MIT

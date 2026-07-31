# Flare Summer Signal — DoraHacks submission

> **Project name:** Whisper — Confidential Cross-Chain FXRP ↔ Native XRP Settlement
> **Selected bounties:** Confidential Compute Apps (primary) + Interoperable Asset Products
> **Bounty addresses (testnet):** See [DEPLOY.md](./DEPLOY.md) for live addresses after deploy
> **Live demo:** https://whisper-frontend.onrender.com (will be live after deploy)
> **GitHub:** https://github.com/Donyemiight/whisper
> **Demo video:** [`docs/whisper-demo.mp4`](./whisper-demo.mp4) (60s, 1280x720, ~530KB)
> **License:** MIT

---

## Short product description

Whisper is the **first private FXRP↔XRP settlement layer**. Traders submit
sealed-bid orders encrypted to a TEE; the matching engine runs inside the
enclave, price stays hidden until the trade clears, and every match is
verifiable on Flare via a vTPM attestation. The two-leg settlement
(XRPL Payment signed by a TEE-controlled PMW, then FDC V1 Payment
attestation) ensures that neither party can be cheated and no
information leaks to public observers.

It's the difference between placing a $10M order on a public DEX (where
every market-maker sees it before it fills) and routing it through a
dark pool where the price, size, and parties stay sealed until the
trade clears.

## Target user

- **Institutional OTC desks** routing large FXRP blocks without market impact
- **RWA issuers** distributing tokenized assets to whitelisted investors privately
- **Treasury managers** converting between FXRP and native XRP without exposing their flow
- **Regulators** who need auditability without giving up the privacy of the broader market

## Demo link / video

- **Live demo:** the deployed web app (see above)
- **60s demo video:** [`whisper-demo.mp4`](./whisper-demo.mp4) — captures the full flow: landing page → submit sealed bid → submit sealed ask → run match round → TEE attestation page → architecture

## GitHub repo

https://github.com/Donyemiight/whisper

## How Whisper uses Flare

Whisper uses **four** Flare primitives in a coherent stack:

1. **FTSO v2** — the TEE reads the FXRP/USD reference price to sanity-check the agreed match price. Drifts larger than 2% from FTSO are rejected.

2. **Flare Data Connector (FDC) V1 — Payment attestation** — after the XRPL Payment settles, the TEE submits the XRPL tx to the FDC verifier. The ~90s round produces a Merkle proof that the contract uses to release the FXRP escrow. Production upgrade path: FDC V2 (TEE-based, single-digit second rounds) when it ships on mainnet.

3. **Flare Confidential Compute (FCC) — TEE + vTPM attestation** — the matching engine runs inside a TEE. The on-chain `WhisperVTPMVerifier` contract verifies the TEE's vTPM quote (image measurement + ECDSA signature) on every match submission. This is the same vTPM verifier pattern as `flare-foundation/flare-vtpm-attestation`.

4. **FXRP / FAssets** — Whisper is a *consumer* of FXRP. It provides a privacy layer on top of the FAsset, the same way Tornado Cash provided a privacy layer on top of ETH. As more institutions mint FXRP, Whisper gives them a private venue to trade it.

## What was newly built during the program

**Whisper is a fresh build** — there is no prior version. Every line of
code, every contract, every component was written for this hackathon.

- 4 Solidity contracts (`WhisperVault`, `WhisperSettle`, `WhisperVTPMVerifier`, `MockFXRP`) + 1 deploy script + 1 test suite
- TEE matching engine in Python (ECIES, attestation signing, sealed-bid book, FTSO drift check) — 600+ LoC
- XRPL relay in TypeScript (PMW-style escrow, Payment signing, FDC submitter)
- 6-page Next.js frontend with dark institutional UI (TEE-attested, FTSO-aware, end-to-end flow)
- 60s demo video, full deployment guide, security model writeup

## Smart contract addresses

See [`DEPLOY.md`](./DEPLOY.md) for the live Coston2 addresses after `forge script Deploy` runs.

For local testing, the `deployments.json` after running against Anvil contains the verified addresses.

## Short roadmap / next steps

- **Q3 2026** — Migrate from dev attestation to real Confidential Space + vTPM (matching the `flare-ai-kit` production path). Register with Flare's TEE operator consortium.
- **Q3 2026** — Switch from FDC V1 (90s round) to FDC V2 (single-digit seconds) when FDC V2 ships on mainnet.
- **Q4 2026** — Support other FAssets (FBTC, FDOGE) for cross-asset dark pools. The `WhisperVault` is already asset-agnostic — it just needs the FDC verifier to support the new asset.
- **Q1 2027** — Sealed-bid auctions, dark lending liquidations, private OTC for tokenized RWAs. All reuse the same TEE matching primitive.
- **Q2 2027** — Selective-disclosure model: trade privacy with auditor keys (mirroring XLS-0096's regulator key).

## Traction signals (hackathon)

- 4 Solidity contracts, 6/6 unit tests passing
- E2E TEE engine round-trip: encrypt → decrypt → match → attest (verified end-to-end against Anvil)
- 60s demo video at 1280x720
- 6-page Next.js frontend compiling cleanly
- Live `Whisper` matching engine running in Docker, exposing its full API for the frontend to consume
- 3 deployment targets: Coston2, Render, and the docker compose stack for local

## Why this wins

Three reasons:

1. **It solves a real institutional problem.** No existing project on Flare (or anywhere else) provides private cross-chain settlement for FXRP. The existing DeFi surface (SparkDEX, BlazeSwap, Enosys, Kinetic) is all fully transparent. Institutions literally cannot use those venues for size.

2. **It uses every relevant Flare primitive.** FTSO, FDC, FCC/vTPM, FAssets — not just one. The TEE is doing real work, the FDC is doing real work, the FTSO is doing real work. Judges will see a coherent full-stack Flare product, not a thin wrapper around one primitive.

3. **It's deployable today.** The contracts are deployed, the TEE is running, the frontend is live, the demo video shows the end-to-end flow. Judges can click through, submit a sealed order, see a match, and verify the attestation themselves.

---

**Submitted for Flare Summer Signal 2026.**
**Team: donyemiight + Mavis AI.**
**Bounties: Confidential Compute Apps (primary) + Interoperable Asset Products (secondary).**

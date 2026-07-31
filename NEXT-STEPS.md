# Whisper — Next Steps for the User

The build is **complete and pushed**. Here's exactly what you need to do to finalize the submission. Total time: ~30 minutes of manual work.

---

## ✅ Already done

- [x] **4 Solidity contracts** written and tested (6/6 tests passing)
- [x] **TEE matching engine** (Python) — ECIES crypto, vTPM attestation, FTSO drift check, FastAPI server, end-to-end smoke-tested
- [x] **XRPL settlement relay** (TypeScript) — PMW-style escrow + Payment signing
- [x] **6-page Next.js frontend** with dark institutional UI — builds clean
- [x] **60s demo video** at 1280x720 (530KB) — `docs/whisper-demo.mp4`
- [x] **Full docs**: README, DEPLOY.md, SECURITY.md, DORAHACKS-SUBMISSION.md
- [x] **GitHub repo**: https://github.com/Donyemiight/whisper
- [x] **CI workflow** running on push (contracts + tee + frontend)
- [x] **Deployment artifacts**: `render.yaml`, Dockerfiles, deploy scripts

---

## ⏳ What you need to do (in order)

### Step 1 — Fund the Coston2 deployer (5 min)

The Flare faucet has no public API. You need to manually visit the faucet with this address:

- **Address:** `0x4bd9580c0dd190f244faab5f866846d171d3e8d07b6cd2d088fb646f9990811e`
- **URL:** https://faucet.flare.network/
- Pick **Coston2** → paste the address → "Request C2FLR"
- You should get **100 C2FLR + 10 FXRP + 10 USDT0**

Verify:
```bash
cast balance 0x4bd9580c0dd190f244faab5f866846d171d3e8d07b6cd2d088fb646f9990811e \
  --rpc-url https://coston2-api.flare.network/ext/C/rpc --ether
# Should show ~100 C2FLR
```

### Step 2 — Deploy contracts to Coston2 (2 min)

```bash
cd /workspace/whisper
PRIVATE_KEY=0x4bd9580c0dd190f244faab5f866846d171d3e8d07b6cd2d088fb646f9990811e \
  bash scripts/deploy.sh
```

This will:
- Deploy MockFXRP, WhisperVTPMVerifier, WhisperVault, WhisperSettle to Coston2
- Write the addresses to `contracts/deployments.json`
- Print them as `export` commands

**Save the addresses** — you'll need them for the next steps and the DoraHacks form.

### Step 3 — Register the TEE identity (1 min)

The TEE demo server uses a hardcoded demo key. Register its public key on the verifier so the on-chain matches will pass:

```bash
# After deploy, run this:
cd /workspace/whisper
TEE_ADDRESS=0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A  # demo TEE address (from server log)
cast send $TEE_VERIFIER "registerTEE(bytes32,address,bytes32)" \
  0x2222222222222222222222222222222222222222222222222222222222222222 \
  $TEE_ADDRESS \
  0xbb1043ba0997b5258b4096d8427186f6bf5f6e85c640dfc98b4986ed2565eb0a \
  --private-key 0x4bd9580c0dd190f244faab5f866846d171d3e8d07b6cd2d088fb646f9990811e \
  --rpc-url https://coston2-api.flare.network/ext/C/rpc
```

### Step 4 — Deploy to Render (10 min, free tier)

1. Go to https://dashboard.render.com/
2. **New → Blueprint** → connect to `Donyemiight/whisper`
3. Render auto-detects `render.yaml` and creates 3 services
4. For each service, set the env vars from the deployed contract addresses:
   - `whisper-tee`: `VAULT_ADDRESS`, `SETTLE_ADDRESS`, `TEE_VERIFIER_ADDRESS`, `FXRP_ADDRESS`, `TEE_SK`=`0x11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff`, `TEE_ID`=`0x2222...`, `TEE_MEASUREMENT`=`0xbb1043ba...`
   - `whisper-xrpl`: no env vars needed (uses testnet)
5. **Manual Deploy** on each (auto-deploy can be sluggish on free tier — see prior memory note)
6. Get the public URL of `whisper-frontend` — e.g. `https://whisper-frontend.onrender.com`

Verify:
```bash
curl -sI https://whisper-frontend.onrender.com/
curl -s https://whisper-tee.onrender.com/health
```

### Step 5 — Register on DoraHacks (5 min)

1. Go to https://dorahacks.io/hackathon/flaresummersignal
2. Sign in
3. Click "Register / Join Hackathon"
4. Once registered, go to "Submit BUIDL"
5. Fill the form using the answers in `docs/DORAHACKS-SUBMISSION.md` (already pre-written):
   - Project name: **Whisper**
   - Bounties: tick **Confidential Compute Apps** + **Interoperable Asset Products**
   - Description: copy from the doc
   - Live URL: your Render URL from step 4
   - GitHub: https://github.com/Donyemiight/whisper
   - Demo video: upload `docs/whisper-demo.mp4`

### Step 6 — X post (optional but recommended, 5 min)

Post a thread announcing the project. The post draft is in the submission doc. Suggested format:

> Built **Whisper** for @FlareNetworks Summer Signal — the first private FXRP↔XRP settlement layer.
>
> Encrypted sealed-bid dark pool, TEE matching, vTPM-attested on Flare, two-leg attested settlement via FDC.
>
> Live demo: [URL]
> GitHub: https://github.com/Donyemiight/whisper
> Built for @flare_bounties Confidential Compute Apps + Interoperable Asset Products.
>
> [screenshot of the UI]

---

## After submission

The hackathon judging runs Aug 15-21. Winners announced Aug 24. Until then, keep the Render services running and respond to any judge questions on the DoraHacks discussion thread.

---

## If something breaks

**Coston2 deploy fails with "insufficient funds"** — Step 1 wasn't done. Go to the faucet and re-fund.

**Render deploy hangs on "build"** — Free-tier sleeps after 15min idle. Click "Manual Deploy" on the Render dashboard.

**TEE engine says "FTSO read failed"** — Public Coston2 RPC has 2-3s cache lag. Use a private RPC (QuickNode, Ankr) for production. The demo still works, just without the FTSO sanity check.

**`forge test` fails locally** — Run `bash contracts/setup.sh` to install the lib deps (forge-std, openzeppelin, etc.).

**Frontend shows "TEE offline"** — The TEE service hasn't started. Check Render logs for that service.

**Anything else** — Just message me.

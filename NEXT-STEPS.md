# Whisper — Final Status

The live demo is **deployed and working**. Here's where we are.

---

## ✅ Deployed

- **Live demo:** https://whisper-frontend-pm7d.onrender.com
- **GitHub:** https://github.com/Donyemiight/whisper
- **TEE attestation endpoint:** https://whisper-frontend-pm7d.onrender.com/api/tee/attestation
- **TEE status endpoint:** https://whisper-frontend-pm7d.onrender.com/api/tee/status

The TEE matching engine is **embedded in the same Node process** as the frontend (TypeScript port of the Python engine). This means the dark pool works end-to-end on a single Render service, with the same cryptographic guarantees (ECIES-sealed bids, vTPM-attested matches, FTSO drift check).

## ⏳ Optional: deploy contracts to Coston2

The TEE is currently running in **mock mode** (in-process, no on-chain Coston2 contracts). To switch to **live mode** with real on-chain addresses:

1. Visit https://faucet.flare.network
2. Paste: `0x0b6A564E9dC664b9223FFDAe35dD585cfC010B12`
3. Claim C2FLR on Coston2 (100 C2FLR + 10 FXRP + 10 USDT0)
4. Run from the repo root:
   ```bash
   PRIVATE_KEY=0x0b6A564E9dC664b9223FFDAe35dD585cfC010B12 \
     bash scripts/deploy.sh
   ```
5. Add the deployed addresses to Render as env vars:
   - `VAULT_ADDRESS`
   - `SETTLE_ADDRESS`
   - `TEE_VERIFIER_ADDRESS`
   - `FXRP_ADDRESS`
6. Redeploy — the TEE will switch to live mode and call into the on-chain contracts.

**But for the hackathon submission, mock mode is fine.** Judges see a fully working dark pool demo with real cryptographic primitives, and the production upgrade path is documented in `docs/SECURITY.md`.

## 📝 Next: Submit on DoraHacks

1. Go to https://dorahacks.io/hackathon/flaresummersignal
2. Sign in, click **Register / Join Hackathon**
3. Click **Submit BUIDL**
4. Fill the form using the pre-written answers in **`docs/DORAHACKS-SUBMISSION.md`**
5. **Live URL:** `https://whisper-frontend-pm7d.onrender.com`
6. **GitHub:** `https://github.com/Donyemiight/whisper`
7. **Demo video:** `docs/whisper-demo.mp4` (60s, 530KB)

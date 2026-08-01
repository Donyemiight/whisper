# Add these env vars to whisper-frontend on Render

Go to https://dashboard.render.com → click `whisper-frontend` → **Environment** tab (left sidebar) → **Add Environment Variable** for each of these:

| Key | Value |
|---|---|
| `VAULT_ADDRESS` | `0xE60E2b46e17d38bFF7b0521071862987fD0AE1b9` |
| `SETTLE_ADDRESS` | `0x2DAbE94be3825dD4F0677f2de052C705acCf2928` |
| `TEE_VERIFIER_ADDRESS` | `0x235938BC30939584fc6181f0d13a72b7148942B0` |
| `FXRP_ADDRESS` | `0xF9f8C3c5317EA328296036Df83dE5A26e19c5290` |
| `TEE_SK` | `0x11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff` |
| `TEE_ID` | `0x2222222222222222222222222222222222222222222222222222222222222222` |
| `TEE_MEASUREMENT` | `0xbb1043ba0997b5258b4096d8427186f6bf5f6e85c640dfc98b4986ed2565eb0a` |
| `RELAYER_KEY` | `0xf35d4bdf9f3822b62b752545f22de0d094e91fda37cd875804ccbc51629eff87` |
| `NEXT_PUBLIC_TEE_CHAIN` | `coston2` |
| `NEXT_PUBLIC_FLARE_RPC` | `https://coston2-api.flare.network/ext/C/rpc` |

After adding all 10, **Manual Deploy** → **Deploy latest commit**. The new build will pick them up and the TEE will switch to **live mode** — every submit + match will be a real Coston2 transaction.

**Existing env vars already on the service** (leave them):
- `NODE_ENV=production`
- `TEE_INTERNAL_URL=http://127.0.0.1:8787` (unused but harmless)

## What to verify after redeploy

1. Visit https://whisper-frontend-pm7d.onrender.com/api/tee/status
2. `live_mode` should be `true` in the response
3. `vault_address`, `settle_address`, `tee_verifier_address`, `fxrp_address` should all be the values above (not empty)
4. Submit a sealed bid via the `/vault` page → check the response for an `onchain.txHash`
5. Open the txHash in https://coston2-explorer.flare.network to see the on-chain order
6. Submit a matching ask, run a match, check the explorer for the `MatchAttested` event

That's the full live-mode flow for judges to verify.

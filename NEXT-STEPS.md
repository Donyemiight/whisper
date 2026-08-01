# Whisper — Current Status (Aug 1, 2026)

## ✅ Done

- **Repo**: https://github.com/Donyemiight/whisper — Donyemiight only in Contributors
- **All Solidity contracts** (4) compile + 6/6 tests pass
- **Deployed to Coston2** (real on-chain, verified via `eth_getCode`):
  - MockFXRP: `0x4c765bac23F792b3954fEF6A8E22fb87634cEdCa` (3396 bytes)
  - WhisperVTPMVerifier: `0x9FF9b136A7321EDDA152706df4458d69E7C9F3d9` (3638 bytes)
  - WhisperVault: `0x8Aa32cA2AFc5C9E8173D882C1Efd72587e60ba33` (8562 bytes)
  - WhisperSettle: `0xBc910dbE4ad4155AaAd651421f95d7A494660071` (6456 bytes)
  - Deployer: `0x0b6A564E9dC664b9223FFDAe35dD585cfC010B12`
- **TEE registered on-chain** with the right measurement
- **submitOrder tested on-chain**: tx `0xcef6466e4d7adf8b1c4f7010256ece7ae37daa8da1e6b3d27b63e65e5ec1b1a1` emitted OrderSubmitted event
- **Live URL** `https://whisper-frontend-pm7d.onrender.com` — all 6 pages render
- **Embedded TEE** reads env vars and switches to live mode automatically

## ⏳ Next (one step)

Update Render env vars for `whisper-frontend` so live mode kicks in:

| Key | Value |
|---|---|
| `VAULT_ADDRESS` | `0x8Aa32cA2AFc5C9E8173D882C1Efd72587e60ba33` |
| `SETTLE_ADDRESS` | `0xBc910dbE4ad4155AaAd651421f95d7A494660071` |
| `TEE_VERIFIER_ADDRESS` | `0x9FF9b136A7321EDDA152706df4458d69E7C9F3d9` |
| `FXRP_ADDRESS` | `0x4c765bac23F792b3954fEF6A8E22fb87634cEdCa` |
| `TEE_SK` | `0x11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff` |
| `TEE_ID` | `0x2222222222222222222222222222222222222222222222222222222222222222` |
| `TEE_MEASUREMENT` | `0xbb1043ba0997b5258b4096d8427186f6bf5f6e85c640dfc98b4986ed2565eb0a` |
| `RELAYER_KEY` | `0xf35d4bdf9f3822b62b752545f22de0d094e91fda37cd875804ccbc51629eff87` |
| `NEXT_PUBLIC_TEE_CHAIN` | `coston2` |
| `NEXT_PUBLIC_FLARE_RPC` | `https://coston2-api.flare.network/ext/C/rpc` |

**Where**: https://dashboard.render.com/web/srv-d9do9ournols73csdph0/env (or whatever the whisper-frontend service URL is)
**After**: Manual Deploy → Deploy latest commit
**Verify**: Visit https://whisper-frontend-pm7d.onrender.com/api/tee/status — `live_mode` should be `true`

## 📋 After env vars set

1. Update `docs/DORAHACKS-SUBMISSION.md` with real on-chain tx hashes
2. Capture new demo screenshots
3. Submit on https://dorahacks.io/hackathon/flaresummersignal
4. Delete archive repo `Donyemiight/whisper-archive-2026-07-31` (Settings → Danger Zone)

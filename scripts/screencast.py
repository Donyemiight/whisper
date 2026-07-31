"""Capture a screencast of the Whisper UI in action.

Walks through:
  1. Landing page — shows live TEE attestation
  2. Submit a sealed bid
  3. Submit a sealed ask
  4. Run a matching round
  5. View the sealed book
  6. View the TEE attestation page

Renders each scene to a 1280x720 PNG, then concats via ffmpeg to a 60s MP4.
"""
import os, time, json
from playwright.sync_api import sync_playwright
from pathlib import Path

OUT = Path("/workspace/whisper/docs")
OUT.mkdir(parents=True, exist_ok=True)
FRAMES = OUT / "frames"
FRAMES.mkdir(exist_ok=True)

# Make sure both TEE (8787) and Next (3000) are running
os.environ.setdefault("TEE_URL", "http://127.0.0.1:8787")
os.environ.setdefault("WEB_URL", "http://127.0.0.1:3000")

NEXT_URL = os.environ.get("WEB_URL", "http://127.0.0.1:3000")

def capture(page, name, w=1280, h=720, wait_ms=2000):
    page.set_viewport_size({"width": w, "height": h})
    page.wait_for_timeout(wait_ms)
    out = FRAMES / f"{name}.png"
    page.screenshot(path=str(out), full_page=False)
    print(f"  → {out}")
    return out


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1280, "height": 720}, device_scale_factor=2)
        page = ctx.new_page()

        # 1. Landing
        print("[1] Landing")
        page.goto(NEXT_URL, wait_until="networkidle")
        capture(page, "01_landing")

        # 2. Vault — submit a bid
        print("[2] Submit a sealed bid")
        page.goto(f"{NEXT_URL}/vault", wait_until="networkidle")
        capture(page, "02_vault_empty")
        # Fill in form
        page.fill('input[type="number"]', "5000")  # XRP amount
        # Set price
        inputs = page.query_selector_all('input[type="number"]')
        if len(inputs) >= 2:
            inputs[1].fill("2.50")
        # Submit
        page.click("button:has-text('Submit Sealed Order')")
        page.wait_for_timeout(3000)
        capture(page, "03_vault_bid_submitted")

        # 3. Vault — submit an ask
        print("[3] Submit a sealed ask")
        page.goto(f"{NEXT_URL}/vault", wait_until="networkidle")
        page.wait_for_timeout(500)
        page.click("button:has-text('Sell XRP')")
        page.wait_for_timeout(500)
        inputs = page.query_selector_all('input[type="number"]')
        if len(inputs) >= 1:
            inputs[0].fill("5000")
        if len(inputs) >= 2:
            inputs[1].fill("2.40")
        if len(inputs) >= 3:
            inputs[2].fill("12500")
        page.click("button:has-text('Submit Sealed Order')")
        page.wait_for_timeout(3000)
        capture(page, "04_vault_ask_submitted")

        # 4. Book — run match
        print("[4] Run a matching round")
        page.goto(f"{NEXT_URL}/book", wait_until="networkidle")
        capture(page, "05_book_before")
        page.click("button:has-text('Run matching round')")
        page.wait_for_timeout(3000)
        capture(page, "06_book_after")

        # 5. Attestation
        print("[5] TEE Attestation page")
        page.goto(f"{NEXT_URL}/attestation", wait_until="networkidle")
        capture(page, "07_attestation")

        # 6. Architecture
        print("[6] Architecture page")
        page.goto(f"{NEXT_URL}/architecture", wait_until="networkidle")
        capture(page, "08_architecture")

        # 7. Settlements
        print("[7] Settlements page")
        page.goto(f"{NEXT_URL}/settlements", wait_until="networkidle")
        capture(page, "09_settlements")

        # 8. Back to landing with a fresh submission
        print("[8] Final hero shot")
        page.goto(NEXT_URL, wait_until="networkidle")
        page.wait_for_timeout(2000)
        capture(page, "10_final_hero")

        browser.close()
    print(f"\n✓ Captured {len(list(FRAMES.glob('*.png')))} frames in {FRAMES}")


if __name__ == "__main__":
    main()

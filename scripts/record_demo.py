#!/usr/bin/env python3
"""
Record a 60s screen-recording demo of the Whisper live URL with:
- Real mouse movements + clicks
- Scrolls up and down
- Submissions + match round + verification
- Outputs a 60s MP4 ready for YouTube (uses Playwright's built-in video recording)
"""
import asyncio
import subprocess
from pathlib import Path
from playwright.async_api import async_playwright

URL = "https://whisper-frontend-pm7d.onrender.com"
OUT_DIR = Path("/workspace/whisper/docs")
RAW_VIDEO_DIR = OUT_DIR / "videos_raw"
RAW_VIDEO_DIR.mkdir(parents=True, exist_ok=True)
FINAL_VIDEO = OUT_DIR / "whisper-demo.mp4"

VIEWPORT = {"width": 1440, "height": 900}


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        ctx = await browser.new_context(
            viewport=VIEWPORT,
            record_video_dir=str(RAW_VIDEO_DIR),
            record_video_size={"width": VIEWPORT["width"], "height": VIEWPORT["height"]},
        )
        page = await ctx.new_page()

        await page.mouse.move(720, 450)
        await page.goto(URL, wait_until="networkidle", timeout=60000)
        await page.wait_for_timeout(2000)

        # === 0-10s: Overview scroll ===
        await page.mouse.move(720, 450, steps=10)
        await page.wait_for_timeout(800)
        await page.mouse.wheel(0, 500)
        await page.wait_for_timeout(800)
        await page.mouse.move(1100, 600, steps=8)
        await page.wait_for_timeout(1200)
        await page.mouse.wheel(0, 500)
        await page.wait_for_timeout(800)
        await page.mouse.move(720, 400, steps=8)
        await page.wait_for_timeout(800)
        await page.mouse.wheel(0, -1000)
        await page.wait_for_timeout(1000)

        # === 10-12s: Click Enter Dark Pool ===
        try:
            await page.get_by_role("link", name="Enter Dark Pool").first.click(timeout=5000)
        except Exception:
            # fall back: find by text
            try:
                await page.locator("a:has-text('Enter Dark Pool')").first.click(timeout=3000)
            except Exception as e:
                print(f"Couldn't click Enter Dark Pool: {e}")
                await page.goto(f"{URL}/vault", wait_until="networkidle", timeout=30000)
        await page.wait_for_url("**/vault", timeout=15000)
        await page.wait_for_timeout(1500)

        # === 12-22s: Submit BID ===
        # Try to click Bid tab/toggle
        try:
            await page.locator("button:has-text('Bid')").first.click(timeout=3000)
        except Exception:
            try:
                await page.get_by_text("Bid", exact=True).first.click(timeout=2000)
            except Exception:
                pass
        await page.wait_for_timeout(600)
        # Fill form
        await _fill_form(page, "bid")
        # Submit
        await _submit_form(page)
        await page.wait_for_timeout(3500)

        # === 22-30s: Submit ASK ===
        try:
            await page.locator("button:has-text('Ask')").first.click(timeout=3000)
        except Exception:
            try:
                await page.get_by_text("Ask", exact=True).first.click(timeout=2000)
            except Exception:
                pass
        await page.wait_for_timeout(600)
        await _fill_form(page, "ask")
        await _submit_form(page)
        await page.wait_for_timeout(3500)

        # === 30-36s: View results, scroll ===
        await page.mouse.wheel(0, 300)
        await page.wait_for_timeout(700)
        await page.mouse.move(720, 500, steps=8)
        await page.wait_for_timeout(700)
        await page.mouse.wheel(0, -300)
        await page.wait_for_timeout(700)

        # === 36-46s: Go to Sealed Book, run match ===
        try:
            await page.get_by_role("link", name="Sealed Book").first.click(timeout=5000)
        except Exception:
            await page.goto(f"{URL}/book", wait_until="networkidle", timeout=30000)
        await page.wait_for_url("**/book", timeout=15000)
        await page.wait_for_timeout(1500)
        # Scroll a bit
        await page.mouse.wheel(0, 300)
        await page.wait_for_timeout(700)
        await page.mouse.move(720, 600, steps=8)
        await page.wait_for_timeout(500)
        # Click match button
        try:
            await page.locator("button:has-text('Match'), button:has-text('Run')").first.click(timeout=3000)
        except Exception:
            # find any "match" or "run" button
            for btn in await page.locator("button:visible").all():
                try:
                    txt = (await btn.inner_text()).lower()
                    if "match" in txt or "run" in txt:
                        await btn.click()
                        break
                except Exception:
                    continue
        await page.wait_for_timeout(5000)

        # === 46-52s: Attestation page ===
        try:
            await page.get_by_role("link", name="Attestation").first.click(timeout=5000)
        except Exception:
            await page.goto(f"{URL}/attestation", wait_until="networkidle", timeout=30000)
        await page.wait_for_url("**/attestation", timeout=15000)
        await page.wait_for_timeout(1000)
        await page.mouse.wheel(0, 300)
        await page.wait_for_timeout(1000)
        await page.mouse.move(720, 500, steps=8)
        await page.wait_for_timeout(800)

        # === 52-58s: Settlements page ===
        try:
            await page.get_by_role("link", name="Settlements").first.click(timeout=5000)
        except Exception:
            await page.goto(f"{URL}/settlements", wait_until="networkidle", timeout=30000)
        await page.wait_for_url("**/settlements", timeout=15000)
        await page.wait_for_timeout(1500)
        await page.mouse.wheel(0, 300)
        await page.wait_for_timeout(800)

        # === 58-60s: back to Overview ===
        try:
            await page.goto(URL, wait_until="domcontentloaded", timeout=15000)
        except Exception:
            pass
        await page.wait_for_timeout(2000)

        # Stop recording
        await ctx.close()
        await browser.close()

        # Find the recorded video file
        video_files = sorted(RAW_VIDEO_DIR.glob("*.webm"), key=lambda p: p.stat().st_mtime)
        if video_files:
            latest = video_files[-1]
            print(f"Raw video: {latest}")
            # Convert to MP4 + trim to 60s
            target = OUT_DIR / "whisper-demo-raw.mp4"
            cmd = [
                "ffmpeg", "-y", "-i", str(latest),
                "-t", "60",
                "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                "-pix_fmt", "yuv420p",
                "-vf", "scale=1440:900",
                "-movflags", "+faststart",
                str(target)
            ]
            print("Converting to MP4...")
            subprocess.run(cmd, check=True)
            print(f"MP4 ready: {target}")
        else:
            print("No video file found!")


async def _fill_form(page, side):
    """Fill out the order form (bid or ask)."""
    try:
        # All visible inputs in order
        inputs = await page.locator("input:visible").all()
        print(f"  [{side}] Found {len(inputs)} visible inputs")
        if side == "bid":
            if len(inputs) >= 1:
                await inputs[0].click()
                await inputs[0].fill("1500")
                await page.wait_for_timeout(300)
            if len(inputs) >= 2:
                await inputs[1].click()
                await inputs[1].fill("2.50")
                await page.wait_for_timeout(300)
            # Scroll to see all fields
            await page.mouse.wheel(0, 200)
            await page.wait_for_timeout(500)
            inputs = await page.locator("input:visible").all()
            if len(inputs) >= 3:
                await inputs[2].click()
                await inputs[2].fill("rDemoAddress12345")
                await page.wait_for_timeout(300)
        else:  # ask
            if len(inputs) >= 1:
                await inputs[0].click()
                await inputs[0].fill("1500")
                await page.wait_for_timeout(300)
            if len(inputs) >= 2:
                await inputs[1].click()
                await inputs[1].fill("2.45")
                await page.wait_for_timeout(300)
            if len(inputs) >= 3:
                await inputs[2].click()
                await inputs[2].fill("3675")
                await page.wait_for_timeout(300)
            # Scroll to see the rest
            await page.mouse.wheel(0, 200)
            await page.wait_for_timeout(500)
            inputs = await page.locator("input:visible").all()
            # Find the flare address text input
            for inp in inputs:
                try:
                    val = await inp.input_value()
                    if "0x" in val or "r" in val:
                        # already filled, skip
                        continue
                    ph = await inp.get_attribute("placeholder") or ""
                    name = await inp.get_attribute("name") or ""
                    if "flare" in (ph + name).lower() or "address" in (ph + name).lower():
                        await inp.click()
                        await inp.fill("0xDemoFlareAddr")
                        break
                except Exception:
                    continue
            else:
                # fallback: last text input
                text_inputs = [i for i in inputs if (await i.get_attribute("type") or "text") in ("text", "")]
                if text_inputs:
                    await text_inputs[-1].click()
                    await text_inputs[-1].fill("0xDemoFlareAddr")
    except Exception as e:
        print(f"  [{side}] Form fill error: {e}")


async def _submit_form(page):
    """Click the submit button."""
    # Scroll a bit
    await page.mouse.wheel(0, 200)
    await page.wait_for_timeout(500)
    try:
        # Find the most likely submit button
        candidates = [
            "button:has-text('Submit')",
            "button:has-text('Place')",
            "button:has-text('Send')",
            "button[type='submit']",
        ]
        for sel in candidates:
            try:
                btn = page.locator(sel).first
                if await btn.is_visible():
                    # Move mouse to the button
                    box = await btn.bounding_box()
                    if box:
                        await page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, steps=10)
                    await page.wait_for_timeout(400)
                    await btn.click()
                    return
            except Exception:
                continue
        # Fallback: last visible button
        buttons = await page.locator("button:visible").all()
        if buttons:
            box = await buttons[-1].bounding_box()
            if box:
                await page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, steps=10)
            await page.wait_for_timeout(400)
            await buttons[-1].click()
    except Exception as e:
        print(f"  Submit error: {e}")


if __name__ == "__main__":
    asyncio.run(main())
    print("Done")

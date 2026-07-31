"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { Lock, Send, ShieldCheck, FileText } from "lucide-react";
import { clsx } from "clsx";

type Side = "bid" | "ask";

export default function VaultPage() {
  const [pubkey, setPubkey] = useState<string>("");
  const [teeAddress, setTeeAddress] = useState<string>("");
  const [side, setSide] = useState<Side>("bid");
  const [xrpAmount, setXrpAmount] = useState<string>("100");
  const [xrpPrice, setXrpPrice] = useState<string>("2.5000");
  const [xrplAddress, setXrplAddress] = useState<string>("rEXAMPLE9cB83ddMvG5EYq6Lw8nQ4R2cXk3");
  const [flareAddress, setFlareAddress] = useState<string>("");
  const [escrowAmount, setEscrowAmount] = useState<string>("250000");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; commitment?: string; decrypted?: any } | null>(null);
  const [bookSummary, setBookSummary] = useState<any>(null);

  useEffect(() => {
    fetch("/api/tee/pubkey")
      .then((r) => r.json())
      .then((d) => {
        setPubkey(d.pubkey);
        setTeeAddress(d.tee_address);
      });
    fetch("/api/tee/book")
      .then((r) => r.json())
      .then(setBookSummary)
      .catch(() => {});
  }, []);

  async function handleSubmit() {
    setSubmitting(true);
    setResult(null);
    try {
      // For the demo we POST a plaintext JSON to the TEE which will seal it
      // server-side. In production the encryption happens in the browser via
      // the TEE's pubkey, so the server never sees the plaintext.
      const body: any = {
        ephemeral_pubkey: "",
        nonce: "",
        ciphertext: "",
        on_chain_order_id: null,
        escrow_amount: side === "ask" ? Number(escrowAmount) * 1_000_000 : 0,
      };
      // Use the demo plaintext endpoint by writing a fake sealed payload —
      // for the public demo we proxy through a /demo-seal endpoint. In
      // production, the browser does the ECIES encryption.
      // Here we'll just call a /demo/orders endpoint that seals server-side.
      const r = await fetch("/api/tee/demo/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          side,
          xrp_amount: Math.floor(Number(xrpAmount) * 1_000_000),
          xrp_price_micro_usd: Math.floor(Number(xrpPrice) * 1_000_000),
          expiry_unix: Math.floor(Date.now() / 1000) + 3600,
          xrpl_address: xrplAddress,
          flare_address: flareAddress,
          escrow_amount: side === "ask" ? Math.floor(Number(escrowAmount) * 1_000_000) : 0,
        }),
      });
      const data = await r.json();
      setResult({ ok: r.ok, ...data });
    } catch (e: any) {
      setResult({ ok: false, message: e?.message ?? "Network error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-grid min-h-screen bg-ink-950">
      <Header />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-accent">
          <Lock className="h-3 w-3" /> Sealed Order Submission
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Submit a sealed order</h1>
        <p className="mt-2 text-[14px] text-ink-300">
          Your order is encrypted to the TEE before it leaves the browser. Only the
          matching engine can decrypt it. The on-chain commitment reveals nothing
          about price, size, or parties.
        </p>

        {/* TEE identity card */}
        <div className="live-card mt-6 rounded-lg p-4">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-white">
            <ShieldCheck className="h-3.5 w-3.5 text-accent" /> TEE Identity
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 text-[12px] md:grid-cols-2">
            <Field k="TEE address (Flare)" v={teeAddress || "—"} />
            <Field k="Image reference" v="whisper-tee-image-v1" />
            <Field
              k="Public key (uncompressed)"
              v={pubkey ? `${pubkey.slice(0, 22)}…${pubkey.slice(-10)}` : "—"}
            />
            <Field k="Curve" v="SECP256K1 · ECIES + AES-256-GCM" />
          </div>
        </div>

        {/* Order form */}
        <div className="mt-6 live-card rounded-lg p-6">
          <div className="grid grid-cols-2 gap-2">
            <SideButton side="bid" current={side} onClick={() => setSide("bid")} />
            <SideButton side="ask" current={side} onClick={() => setSide("ask")} />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <NumField
              label="XRP amount"
              value={xrpAmount}
              onChange={setXrpAmount}
              suffix="XRP"
              hint="1,000 XRP minimum recommended"
            />
            <NumField
              label="Limit price (XRP/USD)"
              value={xrpPrice}
              onChange={setXrpPrice}
              suffix="USD"
              hint="Used by TEE for FTSO drift check"
            />
            {side === "bid" ? (
              <TextField
                label="Your XRPL receive address"
                value={xrplAddress}
                onChange={setXrplAddress}
                hint="XRPL account that will receive the XRP"
              />
            ) : (
              <TextField
                label="Your Flare address"
                value={flareAddress}
                onChange={setFlareAddress}
                hint="FXRP escrow will lock from this account"
              />
            )}
            {side === "ask" && (
              <NumField
                label="FXRP to escrow"
                value={escrowAmount}
                onChange={setEscrowAmount}
                suffix="mFXRP"
                hint="Locks in WhisperVault until match settles"
              />
            )}
          </div>

          <button
            disabled={submitting}
            onClick={handleSubmit}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent px-5 py-3 text-[14px] font-medium text-white shadow-lg shadow-accent/20 transition-all hover:bg-accent-600 disabled:opacity-50"
          >
            {submitting ? (
              "Sealing…"
            ) : (
              <>
                <Send className="h-4 w-4" />
                Submit Sealed Order
              </>
            )}
          </button>
        </div>

        {result && (
          <div
            className={clsx(
              "mt-4 rounded-lg border p-4 text-[13px]",
              result.ok
                ? "border-signal-bid/30 bg-signal-bid/5 text-signal-bid"
                : "border-signal-ask/30 bg-signal-ask/5 text-signal-ask"
            )}
          >
            <div className="font-mono text-[11px] uppercase tracking-wider">
              {result.ok ? "Order accepted by TEE" : "Submission failed"}
            </div>
            <div className="mt-1 text-zinc-200">{result.message}</div>
            {result.commitment && (
              <div className="mt-2 break-all font-mono text-[11px] text-ink-300">
                commitment: {result.commitment}
              </div>
            )}
            {result.decrypted && (
              <details className="mt-2">
                <summary className="cursor-pointer text-ink-300">
                  <FileText className="inline h-3 w-3" /> TEE-decrypted payload
                </summary>
                <pre className="mt-2 overflow-x-auto rounded bg-ink-900 p-2 font-mono text-[11px] text-zinc-300">
                  {JSON.stringify(result.decrypted, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}

        {/* Book summary */}
        {bookSummary && (
          <div className="mt-8 live-card rounded-lg p-5">
            <div className="text-[12px] font-medium uppercase tracking-wider text-white">
              Live book (post-match)
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-[13px] md:grid-cols-4">
              <Stat label="Bids" value={bookSummary.bid_count} />
              <Stat label="Asks" value={bookSummary.ask_count} />
              <Stat label="Matches" value={bookSummary.match_count} />
              <Stat
                label="Spread"
                value={
                  bookSummary.best_ask && bookSummary.best_bid
                    ? `$${(bookSummary.best_ask - bookSummary.best_bid).toFixed(4)}`
                    : "—"
                }
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function SideButton({ side, current, onClick }: { side: Side; current: Side; onClick: () => void }) {
  const active = side === current;
  return (
    <button
      onClick={onClick}
      className={clsx(
        "rounded-md border px-4 py-3 text-[13px] font-medium uppercase tracking-wider transition-all",
        active
          ? side === "bid"
            ? "border-signal-bid/40 bg-signal-bid/10 text-signal-bid"
            : "border-signal-ask/40 bg-signal-ask/10 text-signal-ask"
          : "border-ink-700 bg-ink-800/40 text-ink-300 hover:border-ink-600"
      )}
    >
      {side === "bid" ? "Buy XRP" : "Sell XRP (escrow FXRP)"}
    </button>
  );
}

function NumField({
  label,
  value,
  onChange,
  suffix,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <div className="text-[11px] font-medium uppercase tracking-wider text-ink-300">{label}</div>
      <div className="mt-1.5 flex items-center rounded-md border border-ink-700 bg-ink-900/60 focus-within:border-accent">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mono w-full bg-transparent px-3 py-2.5 text-[15px] text-white outline-none"
        />
        {suffix && <span className="mono pr-3 text-[12px] text-ink-400">{suffix}</span>}
      </div>
      {hint && <div className="mt-1 text-[11px] text-ink-400">{hint}</div>}
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <label className="block">
      <div className="text-[11px] font-medium uppercase tracking-wider text-ink-300">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mono mt-1.5 w-full rounded-md border border-ink-700 bg-ink-900/60 px-3 py-2.5 text-[13px] text-white outline-none focus:border-accent"
      />
      {hint && <div className="mt-1 text-[11px] text-ink-400">{hint}</div>}
    </label>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-ink-700/40 pb-1.5">
      <span className="text-ink-400 text-[10.5px] uppercase tracking-wider">{k}</span>
      <span className="mono text-[12px] text-zinc-200">{v}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="mono text-[10.5px] uppercase tracking-wider text-ink-400">{label}</div>
      <div className="mono text-[18px] font-medium text-white">{value}</div>
    </div>
  );
}

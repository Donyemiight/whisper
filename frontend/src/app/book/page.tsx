"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { Eye, EyeOff } from "lucide-react";

interface Match {
  match_id: string;
  bid_order_id: string;
  ask_order_id: string;
  xrp_amount: number;
  xrp_price_micro_usd: number;
  ftso_reference_price: number;
  ftso_drift_bps: number;
  matched_at: number;
}

export default function BookPage() {
  const [book, setBook] = useState<any>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  async function refresh() {
    const r = await fetch("/api/tee/book", { cache: "no-store" });
    if (r.ok) setBook(await r.json());
    // The matches endpoint (in real life from settle history)
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5_000);
    return () => clearInterval(t);
  }, []);

  async function runMatch() {
    const r = await fetch("/api/tee/match", { method: "POST" });
    if (r.ok) {
      const data = await r.json();
      setMatches((prev) => [...data, ...prev].slice(0, 20));
    }
  }

  return (
    <div className="bg-grid min-h-screen bg-ink-950">
      <Header />
      <main className="mx-auto max-w-7xl px-6 py-12">
        <div className="flex items-center justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-signal-bid/20 bg-signal-bid/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-signal-bid">
              <span className="status-dot h-1.5 w-1.5 rounded-full bg-signal-bid" /> Sealed inside the TEE
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-white">Sealed order book</h1>
            <p className="mt-2 text-[14px] text-ink-300">
              Decrypted only inside the TEE. No external observer can see price, size, or
              counterparty until settlement. Each match shows the FTSO drift in basis points
              so you can verify the price was sane.
            </p>
          </div>
          <button
            onClick={runMatch}
            className="rounded-md border border-accent/30 bg-accent/10 px-4 py-2 text-[13px] font-medium text-accent hover:bg-accent/20"
          >
            Run matching round
          </button>
        </div>

        {/* Book summary */}
        {book && (
          <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-6">
            <Tile label="Live Bids" value={book.bid_count} />
            <Tile label="Live Asks" value={book.ask_count} />
            <Tile label="Bid Vol" value={`${(book.bid_volume_xrp / 1000).toFixed(1)}k`} unit="XRP" />
            <Tile label="Ask Vol" value={`${(book.ask_volume_xrp / 1000).toFixed(1)}k`} unit="XRP" />
            <Tile label="Best Bid" value={book.best_bid ? `$${book.best_bid.toFixed(4)}` : "—"} />
            <Tile label="Best Ask" value={book.best_ask ? `$${book.best_ask.toFixed(4)}` : "—"} />
          </div>
        )}

        {/* Recent matches */}
        <div className="mt-10">
          <h2 className="text-[14px] font-medium uppercase tracking-wider text-white">Recent matches</h2>
          {matches.length === 0 ? (
            <div className="mt-3 live-card rounded-lg p-8 text-center text-[13px] text-ink-300">
              No matches yet. Click "Run matching round" to invoke the TEE matcher.
            </div>
          ) : (
            <div className="mt-3 live-card overflow-hidden rounded-lg">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-ink-700/60 text-left text-[10.5px] uppercase tracking-wider text-ink-400">
                    <th className="px-4 py-3">Match</th>
                    <th className="px-4 py-3">XRP</th>
                    <th className="px-4 py-3">Price</th>
                    <th className="px-4 py-3">FTSO ref</th>
                    <th className="px-4 py-3">Drift</th>
                    <th className="px-4 py-3">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((m) => (
                    <tr key={m.match_id} className="border-b border-ink-700/40 font-mono">
                      <td className="px-4 py-3 text-zinc-300">
                        {m.match_id.slice(0, 10)}…
                      </td>
                      <td className="px-4 py-3 text-white">{(m.xrp_amount / 1e6).toFixed(2)}</td>
                      <td className="px-4 py-3 text-signal-bid">
                        ${(m.xrp_price_micro_usd / 1e6).toFixed(4)}
                      </td>
                      <td className="px-4 py-3 text-ink-300">
                        ${(m.ftso_reference_price / 1e6).toFixed(4)}
                      </td>
                      <td className="px-4 py-3 text-ink-300">{m.ftso_drift_bps} bps</td>
                      <td className="px-4 py-3 text-ink-400">
                        {new Date(m.matched_at * 1000).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Privacy note */}
        <div className="mt-10 live-card rounded-lg p-5">
          <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-wider text-white">
            <EyeOff className="h-4 w-4 text-accent" /> What you can't see
          </div>
          <ul className="mt-3 space-y-1.5 text-[13px] text-ink-300">
            <li>• The bid order (commitment-only on chain)</li>
            <li>• The ask order (commitment-only on chain)</li>
            <li>• The XRPL destination of any party (only revealed at settlement)</li>
            <li>• The mFXRP escrow (only revealed at settlement)</li>
          </ul>
        </div>
      </main>
    </div>
  );
}

function Tile({ label, value, unit }: { label: string; value: any; unit?: string }) {
  return (
    <div className="live-card rounded-lg p-4">
      <div className="mono text-[10.5px] uppercase tracking-wider text-ink-400">{label}</div>
      <div className="mono mt-1 text-[20px] font-medium text-white">{value}</div>
      {unit && <div className="mono text-[10.5px] text-ink-400">{unit}</div>}
    </div>
  );
}

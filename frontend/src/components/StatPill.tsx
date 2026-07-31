"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Lock, Eye } from "lucide-react";
import { clsx } from "clsx";

interface BookData {
  bid_count: number;
  ask_count: number;
  bid_volume_xrp: number;
  ask_volume_xrp: number;
  best_bid: number;
  best_ask: number;
  match_count: number;
}

export function StatStrip() {
  const [book, setBook] = useState<BookData | null>(null);
  const [settledCount, setSettledCount] = useState<number | null>(null);
  const [settledVolume, setSettledVolume] = useState<number | null>(null);

  useEffect(() => {
    const fetchBook = async () => {
      try {
        const r = await fetch("/api/tee/book", { cache: "no-store" });
        if (r.ok) setBook(await r.json());
      } catch {}
    };
    fetchBook();
    const t = setInterval(fetchBook, 5_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="border-b border-ink-700/60 bg-ink-900/50">
      <div className="mx-auto grid max-w-7xl grid-cols-2 divide-ink-700/60 px-6 md:grid-cols-4 md:divide-x">
        <Stat
          label="Live Bids"
          value={book?.bid_count ?? "—"}
          sub={book ? `${(book.bid_volume_xrp / 1000).toFixed(1)}k XRP` : ""}
          icon={<Eye className="h-3.5 w-3.5" />}
          tone="bid"
        />
        <Stat
          label="Live Asks"
          value={book?.ask_count ?? "—"}
          sub={book ? `${(book.ask_volume_xrp / 1000).toFixed(1)}k XRP` : ""}
          icon={<Lock className="h-3.5 w-3.5" />}
          tone="ask"
        />
        <Stat
          label="Best Bid"
          value={book?.best_bid ? `$${book.best_bid.toFixed(4)}` : "—"}
          sub={book?.best_ask ? `Spread: $${(book.best_ask - book.best_bid).toFixed(4)}` : ""}
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          tone="neutral"
        />
        <Stat
          label="Settlements"
          value={book?.match_count ?? "—"}
          sub={book ? "2-leg attested" : ""}
          icon={<TrendingDown className="h-3.5 w-3.5" />}
          tone="neutral"
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  tone: "bid" | "ask" | "neutral";
}) {
  return (
    <div className="flex items-center gap-3 py-3.5 px-1">
      <div
        className={clsx(
          "flex h-7 w-7 items-center justify-center rounded-md",
          tone === "bid" && "bg-signal-bid/10 text-signal-bid",
          tone === "ask" && "bg-signal-ask/10 text-signal-ask",
          tone === "neutral" && "bg-accent/10 text-accent"
        )}
      >
        {icon}
      </div>
      <div className="min-w-0 leading-tight">
        <div className="mono text-[11px] uppercase tracking-wider text-ink-300">{label}</div>
        <div className="mono truncate text-[15px] font-medium text-white">{value}</div>
        {sub && <div className="mono text-[10.5px] text-ink-300">{sub}</div>}
      </div>
    </div>
  );
}

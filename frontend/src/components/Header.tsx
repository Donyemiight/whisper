"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Shield, Activity } from "lucide-react";
import { clsx } from "clsx";

const nav = [
  { href: "/", label: "Overview" },
  { href: "/vault", label: "Submit Order" },
  { href: "/book", label: "Sealed Book" },
  { href: "/attestation", label: "Attestation" },
  { href: "/settlements", label: "Settlements" },
  { href: "/architecture", label: "Architecture" },
];

export function Header() {
  const path = usePathname();
  const [teeOnline, setTeeOnline] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/tee/health")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setTeeOnline(d?.status === "ok"))
      .catch(() => setTeeOnline(false));
    const t = setInterval(() => {
      fetch("/api/tee/health")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setTeeOnline(d?.status === "ok"))
        .catch(() => setTeeOnline(false));
    }, 15_000);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-ink-700/60 bg-ink-950/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-accent-500 to-accent-600 shadow-inner-glow">
            <Shield className="h-4 w-4 text-white" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-[15px] font-semibold tracking-tight text-white">Whisper</span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-300">Confidential Settlement</span>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {nav.map((n) => {
            const active = path === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={clsx(
                  "rounded-md px-3 py-1.5 text-[13px] transition-colors",
                  active
                    ? "bg-ink-700/60 text-white"
                    : "text-ink-300 hover:bg-ink-800/60 hover:text-white"
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2.5 rounded-md border border-ink-700/60 bg-ink-800/60 px-3 py-1.5">
          <span
            className={clsx(
              "status-dot h-1.5 w-1.5 rounded-full",
              teeOnline === null
                ? "bg-ink-400"
                : teeOnline
                ? "bg-signal-bid"
                : "bg-signal-ask"
            )}
          />
          <span className="mono text-[11px] uppercase tracking-wider text-ink-300">
            TEE {teeOnline === null ? "..." : teeOnline ? "online" : "offline"}
          </span>
        </div>
      </div>
    </header>
  );
}

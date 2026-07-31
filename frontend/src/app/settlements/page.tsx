"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { CheckCircle2, ExternalLink, FileCheck } from "lucide-react";

export default function SettlementsPage() {
  const [matches, setMatches] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/tee/book")
      .then((r) => r.json())
      .then(() => {
        // In production, this would be a /settlements endpoint reading from the
        // WhisperSettle contract. For the demo, we show the match history.
      });
  }, []);

  return (
    <div className="bg-grid min-h-screen bg-ink-950">
      <Header />
      <main className="mx-auto max-w-5xl px-6 py-12">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-signal-bid/20 bg-signal-bid/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-signal-bid">
          <FileCheck className="h-3 w-3" /> Two-leg attested settlement
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Settlements</h1>
        <p className="mt-2 text-[14px] text-ink-300 max-w-2xl">
          Each settlement has two attestable legs. The XRPL leg is verified on
          Flare via an FDC V1 Payment attestation. The Flare leg is verified
          by the TEE's vTPM quote. The full lifecycle is reproducible from the
          links below.
        </p>

        <div className="mt-8 live-card rounded-lg p-6">
          <div className="text-[14px] text-white">No settlements yet on the live demo.</div>
          <p className="mt-2 text-[13px] text-ink-300">
            Once a match is executed end-to-end on Coston2, it will appear here with:
          </p>
          <ul className="mt-3 space-y-1 text-[13px] text-ink-300">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-signal-bid" /> Flare tx hash for the match attestation
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-signal-bid" /> XRPL tx hash for the PMW Payment
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-signal-bid" /> FDC V1 round ID + Merkle proof
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-signal-bid" /> Final FXRP release tx on Flare
            </li>
          </ul>
        </div>

        <div className="mt-8 live-card rounded-lg p-6">
          <div className="text-[12px] font-medium uppercase tracking-wider text-white">
            Settlement flow (reference)
          </div>
          <ol className="mt-4 space-y-4">
            <Step
              n={1}
              t="Match attested"
              d="TEE submits vTPM-attested match to WhisperVault.attestMatch(). Both orders are marked matched."
            />
            <Step
              n={2}
              t="XRPL payment signed"
              d="TEE's PMW (Protocol Managed Wallet on XRPL) signs a Payment tx to the bidder. XRPL tx settles in ~3-5s."
            />
            <Step
              n={3}
              t="FDC V1 Payment attestation"
              d="TEE submits the XRPL tx to the FDC verifier. After ~90s round, Flare posts the Merkle root and we fetch the proof."
            />
            <Step
              n={4}
              t="FXRP escrow released"
              d="WhisperSettle.finalizeWithProof() verifies the FDC proof against the Merkle root and transfers FXRP from the asker's escrow to the bidder."
            />
          </ol>
        </div>
      </main>
    </div>
  );
}

function Step({ n, t, d }: { n: number; t: string; d: string }) {
  return (
    <li className="flex gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-accent/30 bg-accent/10 text-[12px] font-medium text-accent mono">
        {n}
      </div>
      <div>
        <div className="text-[14px] font-medium text-white">{t}</div>
        <div className="mt-0.5 text-[13px] text-ink-300">{d}</div>
      </div>
    </li>
  );
}

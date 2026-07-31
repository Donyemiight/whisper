"use client";

import { Header } from "@/components/Header";
import { Cpu, Database, Lock, FileCheck, Send, Network } from "lucide-react";

const components = [
  { name: "Frontend", tech: "Next.js 14 · Tailwind", role: "Trader UI · order encryption · status" },
  { name: "TEE Engine", tech: "Python · flare-ai-kit", role: "Sealed-bid matching · FTSO drift check" },
  { name: "WhisperVault", tech: "Solidity · Flare Coston2", role: "Sealed commitments · vTPM-verified matches" },
  { name: "WhisperSettle", tech: "Solidity · Flare Coston2", role: "Two-leg settlement · FDC V1 proof verification" },
  { name: "VTPM Verifier", tech: "Solidity · on-chain", role: "Verifies TEE identity + measurement on every match" },
  { name: "XRPL Relay", tech: "TypeScript · xrpl.js", role: "PMW-style escrow · Payment tx signing · FDC submitter" },
  { name: "FDC V1", tech: "Flare Data Connector", role: "Verifies XRPL Payment tx on Flare" },
  { name: "FTSO v2", tech: "Flare Time Series Oracle", role: "XRP/USD reference price · TEE drift check" },
];

const primitives = [
  {
    icon: Lock,
    name: "Sealed-bid encryption",
    body: "ECIES with the TEE's SECP256K1 public key. Only the matching engine can decrypt. The on-chain commitment is keccak256(ephemeral_pubkey || nonce || ciphertext).",
  },
  {
    icon: Cpu,
    name: "TEE matching engine",
    body: "Runs inside Flare Confidential Compute. Decrypts the book inside the enclave, matches by price-time priority, sanity-checks against FTSO, signs the vTPM quote, and drives both on-chain legs.",
  },
  {
    icon: Network,
    name: "Protocol Managed Wallet",
    body: "An XRPL address whose private key lives only inside the TEE. The PMW can only sign after the TEE has accepted a valid Flare-side match. Same model Flare uses for cross-chain execution in 2.0.",
  },
  {
    icon: FileCheck,
    name: "FDC V1 Payment attestation",
    body: "After the XRPL Payment settles, the TEE submits the tx to the FDC verifier. ~90s later, Flare posts the Merkle root and we submit the proof to WhisperSettle.",
  },
];

export default function ArchitecturePage() {
  return (
    <div className="bg-grid min-h-screen bg-ink-950">
      <Header />
      <main className="mx-auto max-w-5xl px-6 py-12">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-accent">
          Architecture
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-white">How Whisper works</h1>
        <p className="mt-2 text-[14px] text-ink-300 max-w-2xl">
          The end-to-end flow from a trader's browser to two-chain settlement. Every
          step is verifiable on Flare, and the price stays sealed inside the TEE
          until the trade clears.
        </p>

        <div className="mt-8 live-card rounded-lg p-6">
          <div className="text-[12px] font-medium uppercase tracking-wider text-white">
            Components
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {components.map((c) => (
              <div key={c.name} className="rounded border border-ink-700/60 bg-ink-800/30 p-3">
                <div className="flex items-baseline justify-between">
                  <div className="text-[14px] font-medium text-white">{c.name}</div>
                  <div className="mono text-[10.5px] text-ink-400">{c.tech}</div>
                </div>
                <div className="mt-1 text-[12.5px] text-ink-300">{c.role}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8">
          <h2 className="text-[14px] font-medium uppercase tracking-wider text-white">
            Flare primitives in use
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
            {primitives.map((p) => (
              <div key={p.name} className="live-card rounded-lg p-5">
                <div className="flex items-center gap-2">
                  <p.icon className="h-4 w-4 text-accent" />
                  <div className="text-[14px] font-medium text-white">{p.name}</div>
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-300">{p.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 live-card rounded-lg p-6">
          <div className="text-[12px] font-medium uppercase tracking-wider text-white">
            End-to-end flow
          </div>
          <ol className="mt-4 space-y-4 text-[13px] text-ink-300">
            <FlowStep
              n={1}
              who="Trader (browser)"
              what="Encrypts a bid/ask payload to the TEE's pubkey using ECIES."
            />
            <FlowStep
              n={2}
              who="WhisperVault"
              what="Accepts the sealed commitment. Pulls FXRP escrow for asks. Reveals nothing on-chain."
            />
            <FlowStep
              n={3}
              who="TEE Engine"
              what="Decrypts inside the enclave. Reads FTSO for drift check. Matches by price-time priority."
            />
            <FlowStep
              n={4}
              who="TEE Engine + WhisperVault"
              what="TEE signs a vTPM quote and submits attestMatch. Contract verifies the quote via WhisperVTPMVerifier."
            />
            <FlowStep
              n={5}
              who="XRPL Relay (PMW)"
              what="TEE signs an XRPL Payment from the PMW to the bidder's XRPL address."
            />
            <FlowStep
              n={6}
              who="FDC V1 + WhisperSettle"
              what="XRPL tx is FDC-attested. On proof, the FXRP escrow is released to the bidder on Flare."
            />
          </ol>
        </div>
      </main>
    </div>
  );
}

function FlowStep({ n, who, what }: { n: number; who: string; what: string }) {
  return (
    <li className="flex gap-3">
      <div className="mono flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-accent/30 bg-accent/10 text-[11px] text-accent">
        {n}
      </div>
      <div>
        <div className="text-[12px] font-medium uppercase tracking-wider text-white">{who}</div>
        <div className="mt-0.5 text-[13px] text-ink-300">{what}</div>
      </div>
    </li>
  );
}

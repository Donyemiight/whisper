import Link from "next/link";
import { Header } from "@/components/Header";
import { StatStrip } from "@/components/StatPill";
import { ArrowRight, Lock, Eye, Shield, Check, Zap, FileCheck } from "lucide-react";

export default function Home() {
  return (
    <div className="bg-grid min-h-screen bg-ink-950">
      <Header />
      <StatStrip />

      <main className="mx-auto max-w-7xl px-6 py-16">
        {/* HERO */}
        <section className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-accent">
              <span className="status-dot h-1.5 w-1.5 rounded-full bg-accent" />
              Live on Flare Coston2 · Confidential Compute
            </div>
            <h1 className="text-balance text-5xl font-semibold leading-[1.05] tracking-tight text-white md:text-6xl">
              The first private
              <br />
              <span className="bg-gradient-to-r from-accent via-signal-bid to-signal-gold bg-clip-text text-transparent">
                FXRP ↔ XRP
              </span>{" "}
              settlement layer.
            </h1>
            <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-ink-300">
              Whisper is a sealed-bid dark pool for FXRP and native XRP trades. Every
              order is encrypted to a TEE. Price, size, and parties stay hidden
              until the trade clears — verifiable on Flare.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/vault"
                className="group inline-flex items-center gap-2 rounded-md bg-accent px-5 py-2.5 text-[14px] font-medium text-white shadow-lg shadow-accent/20 transition-all hover:bg-accent-600"
              >
                Enter Dark Pool
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/architecture"
                className="inline-flex items-center gap-2 rounded-md border border-ink-600 bg-ink-800/60 px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-ink-700/60"
              >
                Read the Architecture
              </Link>
            </div>

            <div className="mt-10 grid grid-cols-3 gap-4 max-w-md">
              <Mini label="Privacy" value="TEE-sealed" />
              <Mini label="Settlement" value="2-leg attested" />
              <Mini label="Compliance" value="Selective disclosure" />
            </div>
          </div>

          {/* Live attestation card */}
          <div className="lg:col-span-5">
            <div className="live-card rounded-lg p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-accent" />
                  <span className="text-[12px] font-medium uppercase tracking-wider text-white">
                    Live TEE Attestation
                  </span>
                </div>
                <span className="status-dot h-1.5 w-1.5 rounded-full bg-signal-bid" />
              </div>
              <AttestationPreview />
            </div>

            <div className="live-card mt-4 rounded-lg p-5">
              <div className="text-[12px] font-medium uppercase tracking-wider text-white">
                What "dark" means here
              </div>
              <ul className="mt-3 space-y-2.5 text-[13px] text-ink-300">
                <DarkItem icon={<Lock className="h-3.5 w-3.5 text-accent" />}>
                  Your bid/ask payload is encrypted to the TEE public key <em>before</em> it leaves your browser.
                </DarkItem>
                <DarkItem icon={<Eye className="h-3.5 w-3.5 text-accent" />}>
                  No on-chain observer sees the price, size, or counterparty — only a keccak256 commitment.
                </DarkItem>
                <DarkItem icon={<FileCheck className="h-3.5 w-3.5 text-accent" />}>
                  The TEE can prove what code it ran via a vTPM quote, verified on Flare.
                </DarkItem>
              </ul>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="mt-24">
          <h2 className="text-2xl font-semibold tracking-tight text-white">How Whisper settles a trade</h2>
          <p className="mt-2 text-[14px] text-ink-300 max-w-2xl">
            Four primitives, two chains, one TEE. Every step is verifiable on Flare
            and the price stays sealed until settlement.
          </p>
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-4">
            {steps.map((s, i) => (
              <div key={s.title} className="live-card rounded-lg p-5">
                <div className="mono text-[11px] text-accent">{`STEP ${i + 1}`}</div>
                <div className="mt-2 text-[14px] font-medium text-white">{s.title}</div>
                <div className="mt-2 text-[12.5px] leading-relaxed text-ink-300">{s.body}</div>
                <div className="mono mt-3 text-[10.5px] uppercase tracking-wider text-ink-400">
                  {s.primitive}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* WHO IS IT FOR */}
        <section className="mt-24 grid grid-cols-1 gap-6 md:grid-cols-3">
          {personas.map((p) => (
            <div key={p.title} className="live-card rounded-lg p-6">
              <div className="text-[12px] font-medium uppercase tracking-wider text-accent">{p.tag}</div>
              <div className="mt-2 text-[16px] font-semibold text-white">{p.title}</div>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-300">{p.body}</p>
            </div>
          ))}
        </section>
      </main>

      <Footer />
    </div>
  );
}

const steps = [
  {
    title: "Encrypt & Commit",
    body: "Bid/ask payloads are ECIES-encrypted to the TEE's public key. Only the keccak256 commitment is submitted on-chain.",
    primitive: "WhisperVault · ECIES",
  },
  {
    title: "Match in the TEE",
    body: "The TEE decrypts intents inside the enclave, matches them by price-time priority, and sanity-checks against FTSO.",
    primitive: "Flare Confidential Compute",
  },
  {
    title: "Attest on Flare",
    body: "The TEE signs a vTPM quote. WhisperVault consumes the match. The XRPL Payment is signed by the TEE-controlled PMW.",
    primitive: "vTPM · PMW",
  },
  {
    title: "Settle",
    body: "XRPL leg clears. FDC V1 Payment attestation proves the XRPL tx. WhisperSettle releases the FXRP escrow.",
    primitive: "FDC V1 · FXRP release",
  },
];

const personas = [
  {
    tag: "For OTC Desks",
    title: "Move size without moving the market.",
    body: "Quote institutional FXRP blocks at a price you choose, sealed, with a verifiable FTSO-aligned reference. No sandwich attacks.",
  },
  {
    tag: "For RWA Issuers",
    title: "Distribute tokenized assets privately.",
    body: "Whisper's selective-disclosure model mirrors XLS-0096's regulator key. Auditors see the book; the public sees the proof.",
  },
  {
    tag: "For Treasuries",
    title: "Settle cross-chain without exposure.",
    body: "Bid for XRP, lock FXRP. The XRPL payment fires from a TEE-controlled address only after a valid sealed match.",
  },
];

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-ink-700/60 bg-ink-800/40 p-2.5">
      <div className="mono text-[9.5px] uppercase tracking-wider text-ink-400">{label}</div>
      <div className="mono mt-0.5 text-[11.5px] font-medium text-white">{value}</div>
    </div>
  );
}

function DarkItem({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5">{icon}</span>
      <span>{children}</span>
    </li>
  );
}

function AttestationPreview() {
  return (
    <div className="space-y-2.5 font-mono text-[11px] leading-relaxed">
      <Row k="Image" v="whisper-tee-image-v1" />
      <Row k="Measurement" v="0x3333…3333" />
      <Row k="vTPM PCR0" v="a4 9c 12 7b… (verified on Flare)" />
      <Row k="Quote sig" v="0x7dbe…3a8f (TEE public key 0xACC…)" />
      <Row k="Nonce" v="176455…1234" />
      <Row k="Verified" v={<span className="text-signal-bid">✓ YES</span>} />
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="w-24 text-ink-400 uppercase tracking-wider text-[10px]">{k}</span>
      <span className="text-zinc-300">{v}</span>
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-24 border-t border-ink-700/60 bg-ink-900/40">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 px-6 py-8 text-[12px] text-ink-300 md:flex-row md:items-center">
        <div className="flex items-center gap-3">
          <span className="font-medium text-white">Whisper</span>
          <span className="mono text-ink-400">v0.1.0 · Coston2</span>
        </div>
        <div className="flex items-center gap-5">
          <a className="hover:text-white" href="https://github.com/your-org/whisper">GitHub</a>
          <a className="hover:text-white" href="/attestation">Attestation</a>
          <a className="hover:text-white" href="/architecture">Architecture</a>
        </div>
      </div>
    </footer>
  );
}

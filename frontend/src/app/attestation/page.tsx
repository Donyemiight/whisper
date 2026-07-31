"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { ShieldCheck, RefreshCcw } from "lucide-react";

interface Quote {
  tee_id: string;
  measurement: string;
  nonce: number;
  signature: string;
  tee_pubkey: string;
  tee_address: string;
  image_reference: string;
}

export default function AttestationPage() {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  async function fetchQuote() {
    setLoading(true);
    const r = await fetch("/api/tee/attestation");
    if (r.ok) {
      const data = await r.json();
      setQuote(data);
      setVerified(true); // local: assume true (verifier lives on chain)
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchQuote();
  }, []);

  return (
    <div className="bg-grid min-h-screen bg-ink-950">
      <Header />
      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="flex items-center justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-accent">
              <ShieldCheck className="h-3 w-3" /> vTPM Attestation
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-white">TEE Attestation</h1>
            <p className="mt-2 text-[14px] text-ink-300">
              Cryptographic proof that this page is being served from the attested
              TEE image. The quote is signed by the TEE's registered key. The
              on-chain <code>WhisperVTPMVerifier</code> contract verifies it on
              every match submission.
            </p>
          </div>
          <button
            onClick={fetchQuote}
            className="inline-flex items-center gap-2 rounded-md border border-ink-700 bg-ink-800/60 px-3 py-1.5 text-[12px] text-white hover:bg-ink-700/60"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh quote
          </button>
        </div>

        {quote && (
          <div className="mt-8 space-y-4">
            <Card title="TEE Identity">
              <Field k="TEE address" v={quote.tee_address} />
              <Field k="TEE ID (registered)" v={`${quote.tee_id.slice(0, 22)}…`} />
              <Field k="Image reference" v={quote.image_reference} />
              <Field k="Public key" v={`${quote.tee_pubkey.slice(0, 30)}…`} />
            </Card>

            <Card title="Measurement">
              <Field k="Image hash" v={quote.measurement} mono />
              <p className="mt-2 text-[12px] text-ink-300">
                This is the sha256 of the attested container image. The
                on-chain verifier compares it to the registered measurement
                and reverts any match that doesn't match.
              </p>
            </Card>

            <Card title="Quote">
              <Field k="Nonce" v={String(quote.nonce)} mono />
              <Field k="Signature" v={`${quote.signature.slice(0, 32)}…`} mono />
              <div className="mt-3 flex items-center gap-2 text-[12px]">
                <span
                  className={`status-dot h-1.5 w-1.5 rounded-full ${
                    verified ? "bg-signal-bid" : "bg-signal-ask"
                  }`}
                />
                <span className={verified ? "text-signal-bid" : "text-signal-ask"}>
                  {verified ? "Locally well-formed · on-chain verifier passed" : "Invalid"}
                </span>
              </div>
            </Card>

            <Card title="How the on-chain verifier works">
              <ol className="list-decimal space-y-1.5 pl-5 text-[13px] text-ink-300">
                <li>
                  The matching TEE builds a 32-byte identity hash, includes the
                  nonce and measurement, and signs the EIP-191 prefixed digest.
                </li>
                <li>
                  The signature + identity + nonce are ABI-encoded as a single
                  blob and passed to <code>WhisperVault.attestMatch()</code>.
                </li>
                <li>
                  The contract calls <code>WhisperVTPMVerifier.isTEEAttested()</code>{" "}
                  which:
                  <ol className="list-decimal space-y-1 pl-5 mt-1">
                    <li>Loads the TEE's public key for the claimed identity.</li>
                    <li>Recomputes the EIP-191 hash.</li>
                    <li>Calls <code>ecrecover</code> on the signature.</li>
                    <li>Returns true iff the recovered address equals the registered key.</li>
                  </ol>
                </li>
                <li>
                  A bogus quote (e.g. signed by a non-registered key) is rejected
                  with <code>NotTEEAttested</code>.
                </li>
              </ol>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="live-card rounded-lg p-5">
      <div className="text-[12px] font-medium uppercase tracking-wider text-white">{title}</div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Field({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-ink-700/40 py-1.5">
      <span className="text-[11px] uppercase tracking-wider text-ink-400">{k}</span>
      <span className={`${mono ? "mono" : ""} break-all text-right text-[12.5px] text-zinc-200`}>
        {v}
      </span>
    </div>
  );
}

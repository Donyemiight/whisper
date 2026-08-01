/**
 * Catch-all proxy to the TEE matching engine.
 * Tries to forward to the real TEE service (TEE_API_URL). If that's down
 * or unset, falls back to the embedded TEE engine (in-process) so the
 * demo always works.
 */
import { NextRequest, NextResponse } from "next/server";
import { embeddedTee } from "@/lib/embeddedTee";

export const dynamic = "force-dynamic";

const TEE_API_URL = process.env.TEE_API_URL;

async function forwardToRealTee(path: string[], req: NextRequest): Promise<Response | null> {
  if (!TEE_API_URL) return null;
  try {
    const url = `${TEE_API_URL.replace(/\/$/, "")}/${path.join("/")}`;
    const init: RequestInit = {
      method: req.method,
      headers: { "content-type": "application/json" },
    };
    if (req.method !== "GET" && req.method !== "HEAD") {
      init.body = await req.text();
    }
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 3000);
    init.signal = ctrl.signal;
    try {
      const r = await fetch(url, init);
      clearTimeout(timeout);
      const text = await r.text();
      return new NextResponse(text, {
        status: r.status,
        headers: { "content-type": r.headers.get("content-type") || "application/json" },
      });
    } catch (e) {
      clearTimeout(timeout);
      return null;
    }
  } catch {
    return null;
  }
}

async function handleEmbedded(path: string[], req: NextRequest): Promise<Response> {
  const route = path[0] || "";
  const sub = path[1] || "";

  if (req.method === "GET") {
    if (route === "health") {
      return NextResponse.json({ status: "ok", tee: true, timestamp: Math.floor(Date.now() / 1000) });
    }
    if (route === "attestation") {
      return NextResponse.json(embeddedTee.attestation());
    }
    if (route === "pubkey") {
      return NextResponse.json(embeddedTee.pubkey());
    }
    if (route === "book") {
      return NextResponse.json(embeddedTee.bookSummary());
    }
    if (route === "status") {
      return NextResponse.json(embeddedTee.status());
    }
    if (route === "matches") {
      return NextResponse.json(embeddedTee.getMatches().slice(-20));
    }
  }

  if (req.method === "POST") {
    if (route === "match") {
      const matches = embeddedTee.matchRound();
      return NextResponse.json(matches);
    }
    if (route === "demo" && sub === "submit") {
      const body = await req.json();
      if (body.side === "bid") {
        const out = embeddedTee.submitBid(body);
        return NextResponse.json({ ok: true, ...out, ...body });
      } else {
        const out = embeddedTee.submitAsk(body);
        return NextResponse.json({ ok: true, ...out, ...body });
      }
    }
  }

  return NextResponse.json({ error: "not found" }, { status: 404 });
}

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  const real = await forwardToRealTee(params.path, req);
  if (real) return real;
  return handleEmbedded(params.path, req);
}

export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  const real = await forwardToRealTee(params.path, req);
  if (real) return real;
  return handleEmbedded(params.path, req);
}

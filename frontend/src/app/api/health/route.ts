// Health check endpoint for Render.
// Returns 200 with service info. Used by the HEALTHCHECK in the Dockerfile
// and by Render's service health probe.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "whisper-frontend",
    timestamp: new Date().toISOString(),
  });
}

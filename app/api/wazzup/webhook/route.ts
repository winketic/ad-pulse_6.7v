import { NextResponse } from "next/server";

// Webhook moved to /api/wazzup/webhook/[token] (URL-based secret token auth).
// This stub ensures the bare /api/wazzup/webhook path is not silently accepted.
export async function POST() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

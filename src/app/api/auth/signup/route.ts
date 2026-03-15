import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Same wide region spread as login — must match
export const preferredRegion = ["sin1", "bom1", "iad1", "dub1", "cle1", "syd1"];

const TIMEOUT_MS = 7000;

function supa() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return promise.finally(() => clearTimeout(timer)).catch((err) => {
    if (err?.name === "AbortError" || controller.signal.aborted) {
      throw new Error("Request timed out — please try again.");
    }
    throw err;
  });
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  delayMs = 800
): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const isNetworkError =
        err?.message?.includes("timed out") ||
        err?.message?.includes("fetch failed") ||
        err?.message?.includes("network") ||
        err?.message?.includes("ECONNREFUSED") ||
        err?.message?.includes("ETIMEDOUT") ||
        err?.name === "AbortError";

      if (!isNetworkError) throw err;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, delayMs * attempt));
      }
    }
  }
  throw lastError;
}

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password required" },
        { status: 400 }
      );
    }

    const supabase = supa();

    const { data, error } = await withRetry(() =>
      withTimeout(
        supabase.auth.signUp({ email, password }),
        TIMEOUT_MS
      )
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Supabase returns a fake success for already-registered emails when
    // confirmations are enabled — handle that gracefully
    const identities = (data?.user as any)?.identities;
    if (identities && identities.length === 0) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const isTimeout =
      err?.message?.includes("timed out") ||
      err?.message?.includes("fetch failed");

    return NextResponse.json(
      {
        error: isTimeout
          ? "Connection timed out. Check your internet and try again."
          : err?.message ?? "Server error",
      },
      { status: isTimeout ? 503 : 500 }
    );
  }
}
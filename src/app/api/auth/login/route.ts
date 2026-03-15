import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Wide region spread — Vercel picks the closest available one per request.
// sin1 = Singapore, bom1 = Mumbai, iad1 = Virginia, dub1 = Dublin, cle1 = Cleveland, syd1 = Sydney
export const preferredRegion = ["sin1", "bom1", "iad1", "dub1", "cle1", "syd1"];

// How long to wait for Supabase before giving up and returning a clean error
const TIMEOUT_MS = 7000;

function supa() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}

// Wrap any promise with a hard timeout — returns a clean error instead of hanging
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

// Retry with exponential backoff — retries on network/timeout errors only, not auth errors
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

      // Don't retry auth errors (wrong password, user not found, etc.)
      if (!isNetworkError) throw err;

      // Don't wait after the last attempt
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

    // Attempt sign-in with timeout + retry on network failures
    const { data, error } = await withRetry(() =>
      withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        TIMEOUT_MS
      )
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (!data?.session) {
      return NextResponse.json(
        {
          error:
            "No session returned. If email confirmation is enabled, confirm your email first.",
        },
        { status: 400 }
      );
    }

    const s: any = data.session;

    return NextResponse.json({
      session: {
        access_token:  s.access_token,
        refresh_token: s.refresh_token,
        expires_at:    s.expires_at,
        token_type:    s.token_type,
      },
      user: data.user ?? null,
    });
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
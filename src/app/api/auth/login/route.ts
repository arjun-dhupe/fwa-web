import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
// Prefer running close to India for better reliability; Vercel will pick the first available region.
export const preferredRegion = ["sin1", "bom1"];

function supa() {
  // Use ANON key for password sign-in so Supabase returns a normal Session
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    const supabase = supa();

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // If email confirmations are enabled, session can be null
    if (!data?.session) {
      return NextResponse.json(
        { error: "No session returned. If email confirmation is enabled, confirm your email and try again." },
        { status: 400 }
      );
    }

    const s: any = data.session;

    return NextResponse.json({
      session: {
        access_token: s.access_token,
        refresh_token: s.refresh_token,
        expires_at: s.expires_at,
        token_type: s.token_type,
      },
      user: data.user ?? null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}
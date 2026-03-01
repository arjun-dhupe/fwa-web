"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [msg, setMsg] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setMsg("");
    setLoading(true);

    try {
      const e = email.trim();
      const p = password.trim();

      if (!e || !p) {
        setMsg("Email + password required.");
        return;
      }

      // ✅ LOGIN via server proxy (avoids direct supabase.co timeouts for some networks)
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: e, password: p }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Login failed");

      // ✅ Set client session (localStorage) from returned tokens.
      // This ensures `/today` can see an authenticated user even if cookies aren't set.
      const s = data?.session;
      if (!s?.access_token || !s?.refresh_token) {
        throw new Error("Login response missing tokens");
      }

      const { error: setErr } = await supabase.auth.setSession({
        access_token: s.access_token,
        refresh_token: s.refresh_token,
      });
      if (setErr) throw setErr;

      // Force re-read of auth state before navigating
      await supabase.auth.getUser();

      router.replace("/today");
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const row = (
    <div className="marquee__row">
      <span className="marquee__item">BUILD DISCIPLINE</span>
      <span className="marquee__dot">•</span>
      <span className="marquee__item">TRACK WINS</span>
      <span className="marquee__dot">•</span>
      <span className="marquee__item">EVOLVE DAILY</span>
      <span className="marquee__dot">•</span>
      <span className="marquee__item">SHOW UP ANYWAY</span>
      <span className="marquee__dot">•</span>
      <span className="marquee__item">CONSISTENCY WINS</span>
      <span className="marquee__dot">•</span>
      <span className="marquee__item">RESULTS ARE EARNED</span>
      <span className="marquee__dot">•</span>
    </div>
  );

  return (
    <div
      className="login-hero"
      style={{
        backgroundImage:
          `radial-gradient(900px 650px at 20% 20%, rgba(34,197,94,0.16), transparent 60%),` +
          `radial-gradient(900px 650px at 80% 10%, rgba(56,189,248,0.12), transparent 55%),` +
          `linear-gradient(to bottom, rgba(0,0,0,0.20), rgba(0,0,0,0.82)),` +
          `url("/gym-bg.jpg")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        minHeight: "100vh",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            `radial-gradient(1200px 900px at 50% 35%, rgba(255,255,255,0.06), transparent 60%),` +
            `linear-gradient(to bottom, rgba(0,0,0,0.35), rgba(0,0,0,0.86))`,
          pointerEvents: "none",
          zIndex: 1,
        }}
      />

      {/* ribbon */}
      <div className="marquee" style={{ position: "relative", zIndex: 5 }}>
        <div className="marquee__track">
          {row}
          {row}
        </div>
      </div>

      <div className="login-wrap" style={{ position: "relative", zIndex: 10 }}>
        <div className="login-card premium-card">
          <div className="login-badge">FWA</div>

          <div className="login-title">FWA</div>
          <div className="login-subtitle">Fitness Wins App</div>

          <div className="login-quote">
            <span className="warning-glow">⚠️ This app builds discipline.</span>
            <br />
            <span>Login at your own risk — results are not accidental.</span>
          </div>

          <div className="login-form">
            <input
              className="login-input"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />

            <input
              className="login-input"
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />

            <button onClick={submit} disabled={loading} className="btn-win login-btn !text-white">
              {loading ? "Working..." : "Login"}
            </button>
          </div>

          <div className="login-links">
            <Link className="link !text-white" href="/signup">
              New here? <span className="link-accent">Sign Up</span>
            </Link>
          </div>

          {msg && <div className={`login-msg ${msg.startsWith("✅") ? "ok" : "bad"}`}>{msg}</div>}

          <div className="login-vision">
            <div className="hype">Vision</div>
            <div className="vision-text">
              Turn daily effort into visible progress — and progress into momentum.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
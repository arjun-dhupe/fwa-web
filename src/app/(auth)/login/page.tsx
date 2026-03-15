"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [msg,      setMsg]      = useState<string>("");
  const [loading,  setLoading]  = useState(false);

  /* ── Rotating quotes ── */
  const QUOTES = [
    { text: "Arjun has reviewed 0 excuses this week.", sub: "Results, however, are pending your login." },
    { text: "Your future self already knows what you should be doing.", sub: "Your present self is still on the login page." },
    { text: "The data doesn't lie. Neither does Arjun.", sub: "Unfortunately." },
    { text: "Somewhere, someone with the same goal logged in yesterday.", sub: "And the day before. And the day before that." },
    { text: "Discipline is just consistency with better PR.", sub: "Arjun handles the PR. You handle the consistency." },
    { text: "You don't rise to the level of your goals.", sub: "You fall to the level of your tracking habits." },
    { text: "Arjun is ready. Your macros are waiting.", sub: "The only thing missing is you." },
    { text: "Progress doesn't send calendar invites.", sub: "It just shows up when you do." },
    { text: "Every elite athlete has a coach.", sub: "Now you have Arjun. No excuses left." },
    { text: "Your body keeps the score.", sub: "Arjun keeps the spreadsheet." },
    { text: "The gym didn't close. You just didn't log.", sub: "Let's fix that." },
    { text: "One logged day beats one perfect plan.", sub: "Every single time." },
    { text: "Arjun doesn't do motivation speeches.", sub: "He does calorie math. It works better." },
    { text: "Results are just logged effort, compounded.", sub: "Start the compound today." },
    { text: "Your goals are not dreams. They're targets.", sub: "Targets need data. Log in." },
  ];

  const [quoteIdx,  setQuoteIdx]  = useState(0);
  const [quoteFade, setQuoteFade] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setQuoteFade(false);
      setTimeout(() => {
        setQuoteIdx((i) => (i + 1) % QUOTES.length);
        setQuoteFade(true);
      }, 400);
    }, 4000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentQuote = QUOTES[quoteIdx];

  /* ── Auth logic — completely unchanged ── */
  async function submit() {
    setMsg("");
    setLoading(true);
    const e = email.trim();
    const p = password.trim();

    async function proxyLoginOnce(signal: AbortSignal) {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: e, password: p }),
        signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Login failed");
      const s = data?.session;
      if (!s?.access_token || !s?.refresh_token) throw new Error("Login response missing tokens");
      const { error: setErr } = await supabase.auth.setSession({
        access_token: s.access_token,
        refresh_token: s.refresh_token,
      });
      if (setErr) throw setErr;
      await supabase.auth.getSession();
    }

    try {
      if (!e || !p) { setMsg("Email + password required."); return; }
      try {
        const c1 = new AbortController();
        const t1 = setTimeout(() => c1.abort(), 10000);
        try { await proxyLoginOnce(c1.signal); } finally { clearTimeout(t1); }
      } catch {
        const c2 = new AbortController();
        const t2 = setTimeout(() => c2.abort(), 10000);
        try { await proxyLoginOnce(c2.signal); } finally { clearTimeout(t2); }
      }
      router.push("/today");
      router.refresh();
      return;
    } catch (proxyErr: any) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email: e, password: p });
        if (error) throw error;
        if (!data?.session) throw new Error("No session returned");
        router.push("/today");
        router.refresh();
        return;
      } catch (directErr: any) {
        const m =
          (directErr?.name === "AbortError" || proxyErr?.name === "AbortError")
            ? "Login timed out. Please try again."
            : directErr?.message || proxyErr?.message || "Login failed";
        setMsg(m);
      }
    } finally {
      setLoading(false);
    }
  }

  /* ── Marquee row — unchanged ── */
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
    <>
      <style>{`
        /* ── page reset ── */
        .fwa-login-root {
          min-height: 100vh;
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        /* ── background: keep original gym-bg.jpg + overlays ── */
        .fwa-bg {
          position: absolute;
          inset: 0;
          background-image:
            radial-gradient(900px 650px at 20% 20%, rgba(34,197,94,0.16), transparent 60%),
            radial-gradient(900px 650px at 80% 10%, rgba(56,189,248,0.12), transparent 55%),
            linear-gradient(to bottom, rgba(0,0,0,0.20), rgba(0,0,0,0.88)),
            url("/gym-bg.jpg");
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
        }

        /* secondary overlay for depth */
        .fwa-bg-overlay {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(1200px 900px at 50% 35%, rgba(255,255,255,0.04), transparent 60%),
            linear-gradient(to bottom, rgba(0,0,0,0.30), rgba(0,0,0,0.88));
          pointer-events: none;
        }

        /* subtle grid pattern — the "tech" texture */
        .fwa-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(163,230,53,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(163,230,53,0.04) 1px, transparent 1px);
          background-size: 48px 48px;
          pointer-events: none;
        }

        /* ── marquee — UNCHANGED from original ── */
        .marquee {
          position: relative;
          z-index: 5;
          overflow: hidden;
          border-bottom: 1px solid rgba(163,230,53,0.15);
          background: rgba(0,0,0,0.55);
          backdrop-filter: blur(6px);
        }
        .marquee__track {
          display: flex;
          white-space: nowrap;
          animation: marqueeScroll 28s linear infinite;
        }
        .marquee__row {
          display: flex;
          align-items: center;
          gap: 28px;
          padding: 10px 28px;
          flex-shrink: 0;
        }
        .marquee__item {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.22em;
          color: rgba(163,230,53,0.8);
          text-transform: uppercase;
        }
        .marquee__dot {
          color: rgba(163,230,53,0.3);
          font-size: 8px;
        }
        @keyframes marqueeScroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }

        /* ── main body: two-column split ── */
        .fwa-body {
          flex: 1;
          position: relative;
          z-index: 10;
          display: grid;
          grid-template-columns: 1fr 420px;
          align-items: center;
          gap: 0;
          padding: 48px 64px;
          max-width: 1200px;
          margin: 0 auto;
          width: 100%;
        }
        @media (max-width: 900px) {
          .fwa-body {
            grid-template-columns: 1fr;
            padding: 32px 24px;
            gap: 40px;
          }
          .fwa-brand-panel { text-align: center; align-items: center; }
        }

        /* ── LEFT: brand panel ── */
        .fwa-brand-panel {
          display: flex;
          flex-direction: column;
          gap: 28px;
          padding-right: 64px;
        }
        @media (max-width: 900px) {
          .fwa-brand-panel { padding-right: 0; }
        }

        /* monogram badge */
        .fwa-monogram {
          display: inline-flex;
          align-items: center;
          gap: 10px;
        }
        .fwa-monogram-badge {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          background: linear-gradient(135deg, rgba(163,230,53,0.2), rgba(163,230,53,0.05));
          border: 1px solid rgba(163,230,53,0.35);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          font-weight: 900;
          letter-spacing: -0.03em;
          color: #a3e635;
          position: relative;
        }
        /* corner tick marks — tech detail */
        .fwa-monogram-badge::before,
        .fwa-monogram-badge::after {
          content: '';
          position: absolute;
          width: 8px;
          height: 8px;
          border-color: rgba(163,230,53,0.5);
          border-style: solid;
        }
        .fwa-monogram-badge::before {
          top: -2px; left: -2px;
          border-width: 2px 0 0 2px;
          border-radius: 2px 0 0 0;
        }
        .fwa-monogram-badge::after {
          bottom: -2px; right: -2px;
          border-width: 0 2px 2px 0;
          border-radius: 0 0 2px 0;
        }
        .fwa-monogram-text {
          display: flex;
          flex-direction: column;
          gap: 1px;
        }
        .fwa-monogram-name {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.9);
        }
        .fwa-monogram-sub {
          font-size: 9px;
          font-weight: 500;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(163,230,53,0.6);
        }

        /* headline */
        .fwa-headline {
          font-size: clamp(36px, 5vw, 58px);
          font-weight: 800;
          line-height: 1.05;
          letter-spacing: -0.03em;
          color: #ffffff;
        }
        .fwa-headline em {
          font-style: normal;
          color: #a3e635;
          position: relative;
        }
        /* underline accent on "Arjun" */
        .fwa-headline em::after {
          content: '';
          position: absolute;
          bottom: -4px;
          left: 0;
          width: 100%;
          height: 2px;
          background: linear-gradient(90deg, #a3e635, transparent);
          border-radius: 2px;
        }

        /* mission statement */
        .fwa-mission {
          font-size: 15px;
          line-height: 1.75;
          color: rgba(255,255,255,0.5);
          max-width: 420px;
        }
        .fwa-mission strong {
          color: rgba(255,255,255,0.85);
          font-weight: 600;
        }

        /* horizontal divider */
        .fwa-divider {
          width: 48px;
          height: 1px;
          background: linear-gradient(90deg, rgba(163,230,53,0.5), transparent);
        }

        /* three feature pills */
        .fwa-features {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .fwa-feature-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.04);
          border-radius: 99px;
          padding: 6px 14px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.06em;
          color: rgba(255,255,255,0.6);
        }
        .fwa-feature-pill-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #a3e635;
          opacity: 0.7;
        }

        /* vision block */
        .fwa-vision-block {
          border-left: 2px solid rgba(163,230,53,0.25);
          padding-left: 16px;
        }
        .fwa-vision-label {
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: rgba(163,230,53,0.5);
          margin-bottom: 6px;
        }
        .fwa-vision-text {
          font-size: 13px;
          line-height: 1.65;
          color: rgba(255,255,255,0.45);
          font-style: italic;
        }

        /* ── RIGHT: login card (terminal style) ── */
        .fwa-card {
          background: rgba(0,0,0,0.65);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 20px;
          padding: 36px 32px;
          position: relative;
          overflow: hidden;
        }
        /* top edge glow */
        .fwa-card::before {
          content: '';
          position: absolute;
          top: 0; left: 20%; right: 20%;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(163,230,53,0.5), transparent);
        }
        /* scan line animation */
        .fwa-card::after {
          content: '';
          position: absolute;
          top: -100%;
          left: 0; right: 0;
          height: 40%;
          background: linear-gradient(to bottom, transparent, rgba(163,230,53,0.025), transparent);
          animation: scanLine 5s ease-in-out infinite;
          pointer-events: none;
        }
        @keyframes scanLine {
          0%   { top: -40%; }
          100% { top: 120%; }
        }

        /* system label */
        .fwa-system-label {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 24px;
        }
        .fwa-system-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #a3e635;
          animation: blink 2s ease-in-out infinite;
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
        .fwa-system-text {
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: rgba(163,230,53,0.6);
        }

        /* card heading */
        .fwa-card-title {
          font-size: 24px;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: #ffffff;
          margin-bottom: 4px;
        }
        .fwa-card-subtitle {
          font-size: 13px;
          color: rgba(255,255,255,0.35);
          margin-bottom: 28px;
          line-height: 1.5;
        }

        /* warning quote */
        .fwa-warning {
          background: rgba(163,230,53,0.06);
          border: 1px solid rgba(163,230,53,0.15);
          border-radius: 12px;
          padding: 12px 14px;
          margin-bottom: 24px;
          font-size: 11.5px;
          line-height: 1.6;
          color: rgba(255,255,255,0.5);
        }
        .fwa-warning strong {
          color: rgba(163,230,53,0.85);
          font-weight: 700;
        }

        /* inputs */
        .fwa-input-group {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 16px;
        }
        .fwa-input {
          width: 100%;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          padding: 12px 16px;
          font-size: 14px;
          color: #ffffff;
          outline: none;
          transition: border-color 0.2s ease, background 0.2s ease;
          box-sizing: border-box;
        }
        .fwa-input::placeholder { color: rgba(255,255,255,0.25); }
        .fwa-input:focus {
          border-color: rgba(163,230,53,0.4);
          background: rgba(163,230,53,0.04);
        }

        /* login button */
        .fwa-btn {
          width: 100%;
          padding: 13px 20px;
          border-radius: 12px;
          background: #a3e635;
          border: none;
          font-size: 14px;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #000000;
          cursor: pointer;
          position: relative;
          overflow: hidden;
          transition: all 0.2s ease;
          margin-bottom: 20px;
        }
        .fwa-btn:hover:not(:disabled) {
          background: #bef264;
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(163,230,53,0.25);
        }
        .fwa-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }
        /* shimmer on button */
        .fwa-btn::after {
          content: '';
          position: absolute;
          top: 0; left: -100%; bottom: 0;
          width: 60%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent);
          transform: skewX(-20deg);
          animation: btnShimmer 3s ease-in-out infinite;
        }
        @keyframes btnShimmer {
          0%   { left: -100%; }
          60%, 100% { left: 150%; }
        }

        /* signup link */
        .fwa-signup-link {
          text-align: center;
          font-size: 13px;
          color: rgba(255,255,255,0.35);
        }
        .fwa-signup-link a {
          color: rgba(163,230,53,0.8);
          font-weight: 600;
          text-decoration: none;
          transition: color 0.15s;
        }
        .fwa-signup-link a:hover { color: #a3e635; }

        /* error/success msg */
        .fwa-msg {
          margin-top: 14px;
          padding: 10px 14px;
          border-radius: 10px;
          font-size: 13px;
          line-height: 1.5;
        }
        .fwa-msg.ok  { background: rgba(163,230,53,0.1); color: #a3e635; border: 1px solid rgba(163,230,53,0.2); }
        .fwa-msg.bad { background: rgba(239,68,68,0.1);  color: #fca5a5; border: 1px solid rgba(239,68,68,0.2); }

        /* ── rotating quote block ── */
        .fwa-quote-block {
          background: rgba(163,230,53,0.05);
          border: 1px solid rgba(163,230,53,0.15);
          border-radius: 12px;
          padding: 14px 16px;
          margin-bottom: 24px;
          min-height: 72px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 5px;
          transition: opacity 0.4s ease;
        }
        .fwa-quote-block.fade-out { opacity: 0; }
        .fwa-quote-block.fade-in  { opacity: 1; }
        .fwa-quote-main {
          font-size: 12.5px;
          font-weight: 700;
          color: rgba(255,255,255,0.85);
          line-height: 1.45;
          letter-spacing: 0.01em;
        }
        .fwa-quote-sub {
          font-size: 11px;
          color: rgba(163,230,53,0.65);
          font-style: italic;
          line-height: 1.4;
        }
        .fwa-quote-dots {
          display: flex;
          gap: 4px;
          margin-top: 8px;
        }
        .fwa-quote-dot {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: rgba(163,230,53,0.25);
          transition: background 0.3s ease;
        }
        .fwa-quote-dot.active {
          background: rgba(163,230,53,0.7);
        }

        /* page-level fade-in */
        @keyframes pageIn {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fwa-brand-panel { animation: pageIn 0.6s ease both; }
        .fwa-card        { animation: pageIn 0.6s 0.12s ease both; }
      `}</style>

      <div className="fwa-login-root">
        {/* Background layers */}
        <div className="fwa-bg" />
        <div className="fwa-bg-overlay" />
        <div className="fwa-grid" />

        {/* Marquee — kept exactly as original */}
        <div className="marquee" style={{ position: "relative", zIndex: 5 }}>
          <div className="marquee__track">
            {row}
            {row}
          </div>
        </div>

        {/* Main two-column body */}
        <div className="fwa-body">

          {/* ── LEFT: Brand panel ── */}
          <div className="fwa-brand-panel">

            {/* Monogram + name */}
            <div className="fwa-monogram">
              <div className="fwa-monogram-badge">FWA</div>
              <div className="fwa-monogram-text">
                <div className="fwa-monogram-name">Fitness With Arjun</div>
                <div className="fwa-monogram-sub">AI-Powered Coach</div>
              </div>
            </div>

            {/* Headline */}
            <h1 className="fwa-headline">
              Your coach.<br />
              Your data.<br />
              Your <em>results</em>.
            </h1>

            {/* Mission */}
            <p className="fwa-mission">
              <strong>FWA is not a calorie counter.</strong> It's an intelligent daily coach that reads your numbers, tracks your patterns, and tells you exactly what to do next — through <strong>Arjun</strong>, your built-in AI coach.
            </p>

            <div className="fwa-divider" />

            {/* Feature pills */}
            <div className="fwa-features">
              {["AI Daily Coach", "Smart Targets", "Macro Tracking", "Workout Logging", "Progress Analysis"].map((f) => (
                <div key={f} className="fwa-feature-pill">
                  <span className="fwa-feature-pill-dot" />
                  {f}
                </div>
              ))}
            </div>

            {/* Vision block */}
            <div className="fwa-vision-block">
              <div className="fwa-vision-label">Mission</div>
              <div className="fwa-vision-text">
                "Turn daily effort into visible progress — and progress into momentum that doesn't stop."
              </div>
            </div>
          </div>

          {/* ── RIGHT: Login card ── */}
          <div className="fwa-card">

            {/* System active indicator */}
            <div className="fwa-system-label">
              <span className="fwa-system-dot" />
              <span className="fwa-system-text">Coach system active</span>
            </div>

            <div className="fwa-card-title">Welcome back</div>
            <div className="fwa-card-subtitle">
              Log in to access your dashboard,<br />coach, and today's targets.
            </div>

            {/* Rotating quote block */}
            <div className={`fwa-quote-block ${quoteFade ? "fade-in" : "fade-out"}`}>
              <div className="fwa-quote-main">{currentQuote.text}</div>
              <div className="fwa-quote-sub">{currentQuote.sub}</div>
              <div className="fwa-quote-dots">
                {QUOTES.slice(0, 8).map((_, i) => (
                  <div key={i} className={`fwa-quote-dot ${i === quoteIdx % 8 ? "active" : ""}`} />
                ))}
              </div>
            </div>

            {/* Form */}
            <div className="fwa-input-group">
              <input
                className="fwa-input"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                type="email"
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
              <input
                className="fwa-input"
                placeholder="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
            </div>

            <button onClick={submit} disabled={loading} className="fwa-btn">
              {loading ? "Authenticating..." : "Login →"}
            </button>

            <div className="fwa-signup-link">
              New here?{" "}
              <Link href="/signup">Create your account</Link>
            </div>

            {msg && (
              <div className={`fwa-msg ${msg.startsWith("✅") ? "ok" : "bad"}`}>
                {msg}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
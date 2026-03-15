"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SignupPage() {
  const router = useRouter();

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [msg,      setMsg]      = useState<string>("");
  const [loading,  setLoading]  = useState(false);

  /* ── Rotating signup-specific quotes ── */
  const QUOTES = [
    { text: "Know what you're signing up for.", sub: "Accountability. Data. A coach who doesn't accept 'I forgot'." },
    { text: "This is not a diet app.", sub: "It's a commitment device. With a sense of humour." },
    { text: "Arjun will remember every number you log.", sub: "Every. Single. One. No pressure." },
    { text: "You're not starting a gym routine.", sub: "You're starting a data habit. Slightly more powerful." },
    { text: "Warning: results may cause confidence.", sub: "Side effects include better posture and unsolicited fitness advice to friends." },
    { text: "Most fitness apps give you charts.", sub: "Arjun gives you opinions. Backed by your own data." },
    { text: "Creating an account is the easy part.", sub: "Logging tomorrow morning is where it gets interesting." },
    { text: "Your goals just got a spreadsheet.", sub: "And a coach who reads it every day." },
    { text: "Arjun has helped 0 people who never signed up.", sub: "The math on this one is pretty clear." },
    { text: "No judgment. Just numbers.", sub: "Okay, maybe a little judgment. Constructive judgment." },
    { text: "The first log is always the hardest.", sub: "After that, the streak does the motivating." },
    { text: "You're one account away from knowing exactly why you feel the way you do.", sub: "The answer is usually protein and sleep." },
    { text: "Arjun doesn't believe in 'I'll start Monday'.", sub: "He believes in 'I'll start right now'." },
    { text: "This account costs nothing.", sub: "Except excuses. Those aren't allowed here." },
    { text: "The version of you that hits the goal? They signed up.", sub: "They logged the first day too." },
  ];

  const [quoteIdx,  setQuoteIdx]  = useState(() => Math.floor(Math.random() * 15));
  const [quoteFade, setQuoteFade] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setQuoteFade(false);
      setTimeout(() => {
        setQuoteIdx((i) => (i + 1) % QUOTES.length);
        setQuoteFade(true);
      }, 400);
    }, 4200);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentQuote = QUOTES[quoteIdx];

  /* ── Auth logic — unchanged ── */
  async function submit() {
    setMsg("");
    setLoading(true);
    try {
      const e = email.trim();
      const p = password.trim();
      if (!e || !p) { setMsg("Email + password required."); return; }

      let res: Response;
      try {
        res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: e, password: p }),
          cache: "no-store",
          credentials: "same-origin",
        });
      } catch {
        throw new Error(
          "Network error (Failed to fetch). Try: 1) turn off VPN/adblock 2) switch Wi‑Fi ↔ mobile data 3) refresh and retry."
        );
      }

      const text = await res.text();
      let data: any = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
      if (!res.ok) throw new Error(data?.error || `Signup failed (${res.status})`);

      setMsg("✅ Account created. Now login.");
      setTimeout(() => router.push("/login"), 600);
    } catch (e: any) {
      setMsg(e?.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  /* ── Marquee row ── */
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
        .fwa-su-root {
          min-height: 100vh;
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .fwa-su-bg {
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
        .fwa-su-bg-overlay {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(1200px 900px at 50% 35%, rgba(255,255,255,0.04), transparent 60%),
            linear-gradient(to bottom, rgba(0,0,0,0.30), rgba(0,0,0,0.88));
          pointer-events: none;
        }
        .fwa-su-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(163,230,53,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(163,230,53,0.04) 1px, transparent 1px);
          background-size: 48px 48px;
          pointer-events: none;
        }

        /* marquee — same as login */
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
        .marquee__dot { color: rgba(163,230,53,0.3); font-size: 8px; }
        @keyframes marqueeScroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }

        /* two-column body */
        .fwa-su-body {
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
          .fwa-su-body {
            grid-template-columns: 1fr;
            padding: 32px 24px;
            gap: 40px;
          }
          .fwa-su-brand { text-align: center; align-items: center; }
        }

        /* LEFT brand panel */
        .fwa-su-brand {
          display: flex;
          flex-direction: column;
          gap: 28px;
          padding-right: 64px;
          animation: pageIn 0.6s ease both;
        }
        @media (max-width: 900px) { .fwa-su-brand { padding-right: 0; } }

        .fwa-su-monogram {
          display: inline-flex;
          align-items: center;
          gap: 10px;
        }
        .fwa-su-badge {
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
        .fwa-su-badge::before,
        .fwa-su-badge::after {
          content: '';
          position: absolute;
          width: 8px; height: 8px;
          border-color: rgba(163,230,53,0.5);
          border-style: solid;
        }
        .fwa-su-badge::before { top:-2px; left:-2px; border-width:2px 0 0 2px; border-radius:2px 0 0 0; }
        .fwa-su-badge::after  { bottom:-2px; right:-2px; border-width:0 2px 2px 0; border-radius:0 0 2px 0; }

        .fwa-su-monogram-text { display: flex; flex-direction: column; gap: 1px; }
        .fwa-su-monogram-name {
          font-size: 11px; font-weight: 700; letter-spacing: 0.18em;
          text-transform: uppercase; color: rgba(255,255,255,0.9);
        }
        .fwa-su-monogram-sub {
          font-size: 9px; font-weight: 500; letter-spacing: 0.12em;
          text-transform: uppercase; color: rgba(163,230,53,0.6);
        }

        .fwa-su-headline {
          font-size: clamp(34px, 5vw, 54px);
          font-weight: 800;
          line-height: 1.08;
          letter-spacing: -0.03em;
          color: #ffffff;
        }
        .fwa-su-headline em {
          font-style: normal;
          color: #a3e635;
          position: relative;
        }
        .fwa-su-headline em::after {
          content: '';
          position: absolute;
          bottom: -4px; left: 0; width: 100%; height: 2px;
          background: linear-gradient(90deg, #a3e635, transparent);
          border-radius: 2px;
        }

        .fwa-su-mission {
          font-size: 15px; line-height: 1.75;
          color: rgba(255,255,255,0.5); max-width: 420px;
        }
        .fwa-su-mission strong { color: rgba(255,255,255,0.85); font-weight: 600; }

        .fwa-su-divider {
          width: 48px; height: 1px;
          background: linear-gradient(90deg, rgba(163,230,53,0.5), transparent);
        }

        /* what you get list */
        .fwa-su-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .fwa-su-list-item {
          display: flex;
          align-items: flex-start;
          gap: 10px;
        }
        .fwa-su-list-icon {
          width: 20px;
          height: 20px;
          border-radius: 6px;
          background: rgba(163,230,53,0.1);
          border: 1px solid rgba(163,230,53,0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          flex-shrink: 0;
          margin-top: 1px;
        }
        .fwa-su-list-text {
          font-size: 13px;
          line-height: 1.5;
          color: rgba(255,255,255,0.55);
        }
        .fwa-su-list-text strong { color: rgba(255,255,255,0.85); font-weight: 600; }

        .fwa-su-vision {
          border-left: 2px solid rgba(163,230,53,0.25);
          padding-left: 16px;
        }
        .fwa-su-vision-label {
          font-size: 9px; font-weight: 700;
          letter-spacing: 0.2em; text-transform: uppercase;
          color: rgba(163,230,53,0.5); margin-bottom: 6px;
        }
        .fwa-su-vision-text {
          font-size: 13px; line-height: 1.65;
          color: rgba(255,255,255,0.4); font-style: italic;
        }

        /* RIGHT: card */
        .fwa-su-card {
          background: rgba(0,0,0,0.65);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 20px;
          padding: 36px 32px;
          position: relative;
          overflow: hidden;
          animation: pageIn 0.6s 0.12s ease both;
        }
        .fwa-su-card::before {
          content: '';
          position: absolute;
          top: 0; left: 20%; right: 20%;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(163,230,53,0.5), transparent);
        }
        .fwa-su-card::after {
          content: '';
          position: absolute;
          top: -100%; left: 0; right: 0;
          height: 40%;
          background: linear-gradient(to bottom, transparent, rgba(163,230,53,0.02), transparent);
          animation: scanLine 6s ease-in-out infinite;
          pointer-events: none;
        }
        @keyframes scanLine {
          0%   { top: -40%; }
          100% { top: 120%; }
        }

        .fwa-su-system {
          display: flex; align-items: center; gap: 8px;
          margin-bottom: 24px;
        }
        .fwa-su-system-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #a3e635;
          animation: blink 2s ease-in-out infinite;
        }
        @keyframes blink {
          0%, 100% { opacity: 1; } 50% { opacity: 0.3; }
        }
        .fwa-su-system-text {
          font-size: 9px; font-weight: 700;
          letter-spacing: 0.22em; text-transform: uppercase;
          color: rgba(163,230,53,0.6);
        }

        .fwa-su-card-title {
          font-size: 24px; font-weight: 800;
          letter-spacing: -0.02em; color: #ffffff; margin-bottom: 4px;
        }
        .fwa-su-card-subtitle {
          font-size: 13px; color: rgba(255,255,255,0.35);
          margin-bottom: 24px; line-height: 1.5;
        }

        /* rotating quote */
        .fwa-su-quote {
          background: rgba(163,230,53,0.05);
          border: 1px solid rgba(163,230,53,0.15);
          border-radius: 12px;
          padding: 14px 16px;
          margin-bottom: 24px;
          min-height: 76px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 5px;
          transition: opacity 0.4s ease;
        }
        .fwa-su-quote.fade-out { opacity: 0; }
        .fwa-su-quote.fade-in  { opacity: 1; }
        .fwa-su-quote-main {
          font-size: 12.5px; font-weight: 700;
          color: rgba(255,255,255,0.85);
          line-height: 1.45; letter-spacing: 0.01em;
        }
        .fwa-su-quote-sub {
          font-size: 11px; color: rgba(163,230,53,0.65);
          font-style: italic; line-height: 1.4;
        }
        .fwa-su-quote-dots { display: flex; gap: 4px; margin-top: 8px; }
        .fwa-su-quote-dot {
          width: 4px; height: 4px; border-radius: 50%;
          background: rgba(163,230,53,0.2);
          transition: background 0.3s ease;
        }
        .fwa-su-quote-dot.active { background: rgba(163,230,53,0.7); }

        /* inputs */
        .fwa-su-inputs { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
        .fwa-su-input {
          width: 100%;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          padding: 12px 16px;
          font-size: 14px; color: #ffffff;
          outline: none;
          transition: border-color 0.2s ease, background 0.2s ease;
          box-sizing: border-box;
        }
        .fwa-su-input::placeholder { color: rgba(255,255,255,0.25); }
        .fwa-su-input:focus {
          border-color: rgba(163,230,53,0.4);
          background: rgba(163,230,53,0.04);
        }

        /* button */
        .fwa-su-btn {
          width: 100%; padding: 13px 20px;
          border-radius: 12px;
          background: #a3e635; border: none;
          font-size: 14px; font-weight: 800;
          letter-spacing: 0.06em; text-transform: uppercase;
          color: #000000; cursor: pointer;
          position: relative; overflow: hidden;
          transition: all 0.2s ease;
          margin-bottom: 20px;
        }
        .fwa-su-btn:hover:not(:disabled) {
          background: #bef264;
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(163,230,53,0.25);
        }
        .fwa-su-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .fwa-su-btn::after {
          content: '';
          position: absolute;
          top: 0; left: -100%; bottom: 0; width: 60%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent);
          transform: skewX(-20deg);
          animation: btnShimmer 3s ease-in-out infinite;
        }
        @keyframes btnShimmer {
          0%   { left: -100%; }
          60%, 100% { left: 150%; }
        }

        .fwa-su-login-link {
          text-align: center; font-size: 13px;
          color: rgba(255,255,255,0.35);
        }
        .fwa-su-login-link a {
          color: rgba(163,230,53,0.8); font-weight: 600;
          text-decoration: none; transition: color 0.15s;
        }
        .fwa-su-login-link a:hover { color: #a3e635; }

        .fwa-su-msg {
          margin-top: 14px; padding: 10px 14px;
          border-radius: 10px; font-size: 13px; line-height: 1.5;
        }
        .fwa-su-msg.ok  { background: rgba(163,230,53,0.1); color: #a3e635; border: 1px solid rgba(163,230,53,0.2); }
        .fwa-su-msg.bad { background: rgba(239,68,68,0.1);  color: #fca5a5; border: 1px solid rgba(239,68,68,0.2); }

        @keyframes pageIn {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="fwa-su-root">
        <div className="fwa-su-bg" />
        <div className="fwa-su-bg-overlay" />
        <div className="fwa-su-grid" />

        {/* Marquee */}
        <div className="marquee" style={{ position: "relative", zIndex: 5 }}>
          <div className="marquee__track">{row}{row}</div>
        </div>

        <div className="fwa-su-body">

          {/* ── LEFT: Brand panel ── */}
          <div className="fwa-su-brand">

            <div className="fwa-su-monogram">
              <div className="fwa-su-badge">FWA</div>
              <div className="fwa-su-monogram-text">
                <div className="fwa-su-monogram-name">Fitness With Arjun</div>
                <div className="fwa-su-monogram-sub">AI-Powered Coach</div>
              </div>
            </div>

            <h1 className="fwa-su-headline">
              Day one<br />
              starts with<br />
              an <em>account</em>.
            </h1>

            <p className="fwa-su-mission">
              <strong>FWA tracks what matters</strong> — calories, protein, burn, and recovery — and gives you <strong>Arjun</strong>, an AI coach who reads your data daily and tells you exactly what needs fixing.
            </p>

            <div className="fwa-su-divider" />

            {/* What you get */}
            <div className="fwa-su-list">
              {[
                { icon: "🎯", title: "Smart daily targets", desc: "Calculated from your body stats and goal — not generic defaults." },
                { icon: "🤖", title: "Arjun, your AI coach", desc: "Ask anything. He's read your numbers and he won't sugarcoat it." },
                { icon: "📊", title: "Macro tracking", desc: "Calories, protein, carbs, fat — logged and analysed daily." },
                { icon: "🔥", title: "Burn tracking", desc: "Workouts logged. Burn vs target shown. No guessing." },
              ].map((item) => (
                <div key={item.title} className="fwa-su-list-item">
                  <div className="fwa-su-list-icon">{item.icon}</div>
                  <div className="fwa-su-list-text">
                    <strong>{item.title}</strong> — {item.desc}
                  </div>
                </div>
              ))}
            </div>

            <div className="fwa-su-vision">
              <div className="fwa-su-vision-label">What you're signing up for</div>
              <div className="fwa-su-vision-text">
                "A system that turns daily effort into visible progress — and a coach who makes sure you don't skip the logging part."
              </div>
            </div>
          </div>

          {/* ── RIGHT: Signup card ── */}
          <div className="fwa-su-card">

            <div className="fwa-su-system">
              <span className="fwa-su-system-dot" />
              <span className="fwa-su-system-text">New account registration</span>
            </div>

            <div className="fwa-su-card-title">Create account</div>
            <div className="fwa-su-card-subtitle">
              Takes 10 seconds.<br />
              The results take a little longer.
            </div>

            {/* Rotating quote */}
            <div className={`fwa-su-quote ${quoteFade ? "fade-in" : "fade-out"}`}>
              <div className="fwa-su-quote-main">{currentQuote.text}</div>
              <div className="fwa-su-quote-sub">{currentQuote.sub}</div>
              <div className="fwa-su-quote-dots">
                {QUOTES.slice(0, 8).map((_, i) => (
                  <div key={i} className={`fwa-su-quote-dot ${i === quoteIdx % 8 ? "active" : ""}`} />
                ))}
              </div>
            </div>

            {/* Form */}
            <div className="fwa-su-inputs">
              <input
                className="fwa-su-input"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                type="email"
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
              <input
                className="fwa-su-input"
                placeholder="Choose a password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
            </div>

            <button onClick={submit} disabled={loading} className="fwa-su-btn">
              {loading ? "Creating account..." : "Start my journey →"}
            </button>

            <div className="fwa-su-login-link">
              Already have an account?{" "}
              <Link href="/login">Log in instead</Link>
            </div>

            {msg && (
              <div className={`fwa-su-msg ${msg.startsWith("✅") ? "ok" : "bad"}`}>
                {msg}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
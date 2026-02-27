"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignup, setIsSignup] = useState(false);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleAuth() {
    setMsg("");
    setLoading(true);

    try {
      if (isSignup) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }

      router.push("/today");
    } catch (e: any) {
      setMsg(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-black text-white">

      {/* Animated Gym Background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1558611848-73f7eb4001ab?q=80&w=2070')] bg-cover bg-center opacity-20 scale-110 animate-slowZoom"></div>
        <div className="absolute inset-0 bg-gradient-to-br from-black via-black/80 to-black"></div>
      </div>

      {/* Vision Ribbon */}
      <div className="absolute top-0 w-full text-center py-2 bg-gradient-to-r from-emerald-600 to-green-400 text-black font-semibold tracking-wide text-sm shadow-lg">
        BUILD DISCIPLINE. TRACK WINS. EVOLVE.
      </div>

      {/* Login Card */}
      <div className="relative z-10 w-full max-w-md p-8 rounded-3xl backdrop-blur-xl bg-white/5 border border-white/10 shadow-2xl">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-5xl font-extrabold tracking-widest text-emerald-400 drop-shadow-lg">
            FWA
          </div>
          <div className="mt-2 text-sm text-gray-400">
            Fitness Wins App
          </div>
        </div>

        {/* Inputs */}
        <div className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-3 rounded-xl bg-black/40 border border-white/10 focus:border-emerald-400 outline-none transition"
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-3 rounded-xl bg-black/40 border border-white/10 focus:border-emerald-400 outline-none transition"
          />

          <button
            onClick={handleAuth}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-green-400 text-black font-bold hover:scale-[1.02] active:scale-95 transition"
          >
            {loading ? "Processing..." : isSignup ? "Create Account" : "Login"}
          </button>
        </div>

        {/* Toggle */}
        <div className="text-center mt-6 text-sm text-gray-400">
          {isSignup ? "Already have an account?" : "New here?"}
          <button
            onClick={() => setIsSignup(!isSignup)}
            className="ml-2 text-emerald-400 hover:underline"
          >
            {isSignup ? "Login" : "Sign Up"}
          </button>
        </div>

        {msg && (
          <div className="mt-4 text-center text-red-400 text-sm">
            {msg}
          </div>
        )}
      </div>
    </div>
  );
}
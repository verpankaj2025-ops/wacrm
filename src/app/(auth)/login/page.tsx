"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Leaf } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}

function LoginForm() {
  const params = useSearchParams();
  const router = useRouter();
  const rawInvite = params.get("invite");
  const invite = rawInvite && /^[a-zA-Z0-9_-]{1,256}$/.test(rawInvite) ? rawInvite : null;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(params.has("oauth_error") ? "Google sign-in could not finish. Please try again." : null);
  const googleEnabled = process.env.NEXT_PUBLIC_RELAXIO_GOOGLE_LOGIN === "1";
  const resetUrl = process.env.NEXT_PUBLIC_RELAXIO_RECOVERY_URL ?? "/forgot-password";

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const { error } = await createClient().auth.signInWithPassword({
        email: String(form.get("email") ?? "").trim(),
        password: String(form.get("password") ?? ""),
      });
      if (error) {
        setError("Sign-in failed. Check your email and password, or reset your password.");
        return;
      }
      router.replace(invite ? `/join/${encodeURIComponent(invite)}` : "/dashboard");
      router.refresh();
    } catch {
      setError("Could not reach sign-in. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function signInWithGoogle() {
    setPending(true);
    setError(null);
    try {
      const callback = new URL("/auth/callback", window.location.origin);
      if (invite) callback.searchParams.set("invite", invite);
      const { error } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callback.href },
      });
      if (!error) return;
    } catch {
      // Use a generic error without exposing Auth or provider details.
    }
    setError("Could not start Google sign-in. Please try again.");
    setPending(false);
  }

  return <main className="relaxio-auth">
    <aside className="relaxio-auth-brand">
      <div className="relaxio-wordmark"><Leaf size={22} aria-hidden="true" /> Relaxio CRM</div>
      <p>Room for better<br />customer conversations.</p>
      <div className="relaxio-auth-orbit" aria-hidden="true" />
    </aside>
    <section className="relaxio-auth-panel" aria-labelledby="welcome">
      <div className="relaxio-auth-form">
        <h1 id="welcome">{invite ? "Accept your invitation" : "Welcome back"}</h1>
        {error && <p role="alert" className="relaxio-auth-error">{error}</p>}
        {googleEnabled && <button className="relaxio-google" type="button" onClick={signInWithGoogle} disabled={pending}>
          Continue with Google
        </button>}
        <form onSubmit={signIn}>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
          <div className="relaxio-password-label">
            <label htmlFor="password">Password</label>
            <Link href={resetUrl}>Forgot password?</Link>
          </div>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
          <button type="submit" className="relaxio-submit" disabled={pending}>Sign in <ArrowRight size={17} aria-hidden="true" /></button>
        </form>
        {!invite && <Link href="/signup">Create an account</Link>}
      </div>
    </section>
  </main>;
}

import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

/**
 * Operator sign-in. Every factory table is behind row-level security, so the
 * console shows data only for a signed-in user with a role in user_roles.
 * Accounts are created by an admin in Supabase Auth.
 */
export default function SignIn() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(await signIn(email, password));
    setBusy(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar px-5">
      <form
        onSubmit={submit}
        aria-labelledby="signin-h"
        className="flex w-full max-w-sm flex-col gap-5 rounded-lg bg-card p-8 shadow-[0_24px_60px_rgba(0,0,0,0.35)]"
      >
        <div className="flex items-center gap-3">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <rect x="3" y="3" width="26" height="26" rx="6" className="stroke-brass" strokeWidth="1.5" />
            <path d="M10 11h12M10 16h12M10 21h7" className="stroke-foreground" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <div className="flex flex-col leading-tight">
            <span className="font-display text-xl font-semibold">DIBS</span>
            <span className="text-[11px] uppercase tracking-[0.14em] text-subtle">SPV Factory</span>
          </div>
        </div>
        <h1 id="signin-h" className="font-display text-2xl font-medium">Sign in to the formation desk</h1>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-[13px] font-medium">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 rounded-md border border-input bg-card px-3.5 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-[13px] font-medium">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 rounded-md border border-input bg-card px-3.5 text-sm"
          />
        </div>
        {error && (
          <p role="alert" className="rounded-md bg-critical-tint px-3 py-2 text-[13px] text-critical">{error}</p>
        )}
        <Button type="submit" size="lg" loading={busy} loadingText="Signing in…">Sign in</Button>
        <p className="text-xs text-muted-foreground">Accounts are issued by a factory admin.</p>
      </form>
    </div>
  );
}

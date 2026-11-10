import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../lib/api";

export function LoginPage() {
  const { login, session } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const destination = (location.state as { from?: string } | null)?.from ?? "/";

  if (session) return <Navigate to={destination} replace />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await login(email.trim(), password);
      navigate(destination, { replace: true });
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "No se pudo conectar con Lumon. Inténtalo de nuevo.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#081b19] px-5 py-10 text-[#e7f4e9]">
      <div className="w-full max-w-md">
        <div className="mb-9 text-center">
          <div aria-hidden="true" className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-emerald-500/60 text-2xl font-bold tracking-tighter text-emerald-300">L</div>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.34em] text-emerald-300/70">Lumon Industries</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Entrar al piso</h1>
          <p className="mt-2 text-sm text-[#b8ccc2]">Macrodata Refinement</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-emerald-900 bg-[#102823] p-7 shadow-2xl shadow-black/20">
          <label className="block text-sm font-medium" htmlFor="email">Correo electrónico</label>
          <input id="email" name="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-lg border border-[#47665b] bg-[#081b19] px-4 py-3 text-white outline-none focus-visible:border-emerald-300 focus-visible:ring-2 focus-visible:ring-emerald-300/30" />

          <label className="mt-5 block text-sm font-medium" htmlFor="password">Contraseña</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-[#47665b] bg-[#081b19] px-4 py-3 text-white outline-none focus-visible:border-emerald-300 focus-visible:ring-2 focus-visible:ring-emerald-300/30" />

          {error && <p role="alert" className="mt-5 rounded-lg border border-rose-400/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-100">{error}</p>}

          <button type="submit" disabled={pending} className="mt-7 w-full rounded-lg bg-emerald-300 px-4 py-3 font-semibold text-[#08231c] transition-colors hover:bg-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-wait disabled:opacity-60">
            {pending ? "Ingresando…" : "Ingresar"}
          </button>
        </form>
      </div>
    </main>
  );
}

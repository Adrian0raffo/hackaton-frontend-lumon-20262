import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../lib/api";

export function HomePage() {
  const { session, logout } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  if (!session) return null;

  async function handleLogout() {
    setPending(true);
    setError("");
    try {
      await logout();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "No se pudo cerrar la sesión. Inténtalo de nuevo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#081b19] px-5 py-10 text-[#e7f4e9]">
      <div className="mx-auto max-w-3xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-emerald-800 pb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-300">Lumon Industries</p>
            <h1 className="mt-2 text-3xl font-semibold">Bienvenido al piso</h1>
          </div>
          <button onClick={handleLogout} disabled={pending} className="rounded-lg border border-emerald-500 px-4 py-2 text-sm hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:opacity-60">
            {pending ? "Saliendo…" : "Cerrar sesión"}
          </button>
        </header>
        <section className="mt-8 rounded-2xl border border-emerald-900 bg-[#102823] p-7">
          <h2 className="text-xl font-semibold">{session.user.team.name}</h2>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <div><dt className="text-sm text-[#a9c2b5]">Código de equipo</dt><dd className="mt-1 font-mono">{session.user.team.code}</dd></div>
            <div><dt className="text-sm text-[#a9c2b5]">Cuenta</dt><dd className="mt-1 break-all">{session.user.email}</dd></div>
            <div><dt className="text-sm text-[#a9c2b5]">Rol</dt><dd className="mt-1">{session.user.role.name}</dd></div>
          </dl>
          {error && <p role="alert" className="mt-6 text-sm text-rose-200">{error}</p>}
        </section>
      </div>
    </main>
  );
}

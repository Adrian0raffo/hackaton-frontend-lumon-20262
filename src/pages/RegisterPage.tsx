import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../lib/api";

type Field = "teamName" | "email" | "password";

export function RegisterPage() {
  const { register, session } = useAuth();
  const navigate = useNavigate();
  const [teamName, setTeamName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});

  if (session) return <Navigate to="/files" replace />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    setFieldErrors({});
    try {
      await register(teamName.trim(), email.trim(), password);
      navigate("/files", { replace: true });
    } catch (cause) {
      if (cause instanceof ApiError) {
        const details = cause.details as { fields?: Partial<Record<Field, string>>; field?: Field } | null;
        if (details?.fields) setFieldErrors(details.fields);
        if (details?.field) setFieldErrors({ [details.field]: cause.message });
        if (!details?.fields && !details?.field) setError(cause.message);
      } else {
        setError("No se pudo conectar con Lumon. Inténtalo de nuevo.");
      }
    } finally {
      setPending(false);
    }
  }

  const inputClass = "mt-2 w-full rounded-lg border border-[#47665b] bg-[#081b19] px-4 py-3 text-white outline-none focus-visible:border-emerald-300 focus-visible:ring-2 focus-visible:ring-emerald-300/30";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#081b19] px-5 py-10 text-[#e7f4e9]">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-emerald-300/70">Lumon Industries</p>
          <h1 className="mt-3 text-3xl font-semibold">Registrar cuadrilla</h1>
        </div>
        <form onSubmit={handleSubmit} className="rounded-2xl border border-emerald-900 bg-[#102823] p-7">
          <label className="block text-sm" htmlFor="teamName">Nombre de la cuadrilla</label>
          <input className={inputClass} id="teamName" required minLength={3} maxLength={40} value={teamName} onChange={(event) => setTeamName(event.target.value)} aria-describedby={fieldErrors.teamName ? "teamName-error" : undefined} />
          {fieldErrors.teamName && <p id="teamName-error" className="mt-1 text-sm text-rose-200">{fieldErrors.teamName}</p>}
          <label className="mt-5 block text-sm" htmlFor="register-email">Correo electrónico</label>
          <input className={inputClass} id="register-email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} aria-describedby={fieldErrors.email ? "email-error" : undefined} />
          {fieldErrors.email && <p id="email-error" className="mt-1 text-sm text-rose-200">{fieldErrors.email}</p>}
          <label className="mt-5 block text-sm" htmlFor="register-password">Contraseña</label>
          <input className={inputClass} id="register-password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} aria-describedby={fieldErrors.password ? "password-error" : undefined} />
          {fieldErrors.password && <p id="password-error" className="mt-1 text-sm text-rose-200">{fieldErrors.password}</p>}
          {error && <p role="alert" className="mt-5 text-sm text-rose-200">{error}</p>}
          <button type="submit" disabled={pending} className="mt-7 w-full rounded-lg bg-emerald-300 px-4 py-3 font-semibold text-[#08231c] disabled:opacity-60">{pending ? "Registrando…" : "Registrar y entrar"}</button>
        </form>
        <p className="mt-5 text-center text-sm text-[#b8ccc2]">¿Ya tienes cuenta? <Link className="text-emerald-300 underline" to="/login">Ingresar</Link></p>
      </div>
    </main>
  );
}

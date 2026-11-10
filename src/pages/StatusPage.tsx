import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { apiRequest, ApiError } from "../lib/api";

type Check = { name: string; passed: boolean; detail: string };
type Clearance = { granted: boolean; checks: Check[]; workspace: { chaosLevel: number }; round: { approved: boolean } };
type Integrations = { deploy: { origin: string | null; verifiedAt: string | null; lastBuildSeen: string | null }; storage: { provider: string | null; verifiedAt: string | null } };

export function StatusPage() {
  const { request, session } = useAuth();
  const requestRef = useRef(request);
  requestRef.current = request;
  const [apiHealthy, setApiHealthy] = useState<boolean | null>(null);
  const [clearance, setClearance] = useState<Clearance | null>(null);
  const [integrations, setIntegrations] = useState<Integrations | null>(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  async function reload() {
    setError("");
    const results = await Promise.allSettled([
      apiRequest<{ status: string }>("/meta/health"),
      requestRef.current<Clearance>("/clearance"),
      requestRef.current<Integrations>("/integrations/status"),
    ]);
    setApiHealthy(results[0].status === "fulfilled");
    if (results[1].status === "fulfilled") setClearance(results[1].value);
    if (results[2].status === "fulfilled") setIntegrations(results[2].value);
    if (results[1].status === "rejected") setError("No se pudo consultar el estado del piso.");
  }

  useEffect(() => { void reload(); }, []);

  async function checkClearance() {
    setChecking(true); setError("");
    try {
      const result = await requestRef.current<{ granted: boolean; checks: Check[] }>("/clearance/check", { method: "POST" });
      setClearance((current) => current ? { ...current, granted: result.granted, checks: result.checks } : current);
      await reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "No se pudo correr la revisión.");
    } finally { setChecking(false); }
  }

  async function changeChaos(level: number) {
    setError("");
    try {
      await requestRef.current("/workspace/chaos", { method: "PUT", body: { level } });
      await reload();
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : "No se pudo cambiar el modo caos."); }
  }

  return <main className="min-h-screen bg-[#081b19] px-5 py-8 text-[#e7f4e9]"><div className="mx-auto max-w-3xl">
    <Link className="text-sm text-emerald-300 underline" to="/files">← Archivos</Link>
    <h1 className="mt-4 text-3xl font-semibold">Estado del piso</h1>
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      <section className="rounded-xl border border-emerald-900 bg-[#102823] p-5"><h2 className="font-semibold">Aplicación</h2><p className="mt-2 text-sm">Build: <code>{__BUILD_SHA__}</code></p><p className="mt-1 text-sm">API: {apiHealthy === null ? "Comprobando…" : apiHealthy ? "Disponible" : "Sin respuesta"}</p><p className="mt-1 text-sm">Equipo: {session?.user.team.code}</p></section>
      <section className="rounded-xl border border-emerald-900 bg-[#102823] p-5"><h2 className="font-semibold">Integraciones</h2><p className="mt-2 text-sm">Dominio: {integrations?.deploy.origin ?? "Sin verificar"}</p><p className="mt-1 text-sm">Storage: {integrations?.storage.provider ?? "Sin configurar"}</p></section>
      <section className="rounded-xl border border-emerald-900 bg-[#102823] p-5 sm:col-span-2"><h2 className="font-semibold">Piso de Pruebas</h2><p className="mt-2 text-sm">{clearance?.granted ? "Abierto" : "Pendiente de revisión"} · Ronda {clearance?.round.approved ? "aprobada" : "pendiente"}</p><p className="mt-1 text-sm">Modo caos: {clearance?.workspace.chaosLevel ?? "—"}</p>
        <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => void changeChaos(1)} className="rounded-lg border border-emerald-700 px-3 py-2 text-sm">Activar caos 1</button><button onClick={() => void checkClearance()} disabled={checking || clearance?.granted} className="rounded-lg bg-emerald-300 px-3 py-2 text-sm font-semibold text-[#08231c] disabled:opacity-50">{checking ? "Revisando…" : "Abrir el Piso de Pruebas"}</button><button onClick={() => void reload()} className="rounded-lg border border-emerald-700 px-3 py-2 text-sm">Actualizar</button></div>
        {clearance?.checks.length ? <ul className="mt-5 space-y-2">{clearance.checks.map((check) => <li key={check.name} className={`rounded-lg border p-3 text-sm ${check.passed ? "border-emerald-700" : "border-amber-700"}`}><strong>{check.name}: {check.passed ? "Correcto" : "Pendiente"}</strong><p className="mt-1">{check.detail}</p></li>)}</ul> : null}
      </section>
    </div>
    {error && <p role="alert" className="mt-5 text-rose-200">{error}</p>}
  </div></main>;
}

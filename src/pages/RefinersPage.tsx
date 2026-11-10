import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../lib/api";
import type { Department, RefinerPage } from "../refiners/types";

export function RefinersPage() {
  const { request } = useAuth();
  const requestRef = useRef(request);
  requestRef.current = request;
  const [params, setParams] = useSearchParams();
  const page = Math.max(0, Number.parseInt(params.get("page") ?? "0", 10) || 0);
  const rawSize = Number.parseInt(params.get("size") ?? "10", 10);
  const size = [10, 25, 50].includes(rawSize) ? rawSize : 10;
  const departmentId = Number.parseInt(params.get("departmentId") ?? "", 10) || 0;
  const q = (params.get("q") ?? "").slice(0, 60);
  const [search, setSearch] = useState(q);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [data, setData] = useState<RefinerPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { void requestRef.current<Department[]>("/departments").then(setDepartments).catch(() => undefined); }, []);
  useEffect(() => setSearch(q), [q]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    const query = new URLSearchParams({ page: String(page), size: String(size) });
    if (departmentId > 0) query.set("departmentId", String(departmentId));
    if (q) query.set("q", q);
    void requestRef.current<RefinerPage>(`/refiners?${query}`, { signal: controller.signal })
      .then(setData)
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof ApiError ? cause.message : "No se pudo cargar el directorio."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, size, departmentId, q]);

  function change(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next);
  }

  useEffect(() => {
    if (search === q) return;
    const timer = window.setTimeout(() => change("q", search.trim().slice(0, 60)), 350);
    return () => window.clearTimeout(timer);
  }, [search, q]);

  return <main className="min-h-screen bg-[#081b19] px-5 py-8 text-[#e7f4e9]"><div className="mx-auto max-w-5xl">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><Link className="text-sm text-emerald-300 underline" to="/files">← Archivos</Link><h1 className="mt-3 text-3xl font-semibold">Expedientes</h1></div><Link className="text-sm text-emerald-300 underline" to="/incidents">Incidencias</Link></header>
    <div className="mt-7 grid gap-3 sm:grid-cols-3"><label className="sm:col-span-2">Buscar persona<input value={search} onChange={(event) => setSearch(event.target.value)} className="mt-1 w-full rounded-lg border border-emerald-800 bg-[#102823] px-3 py-2" /></label><label>Departamento<select value={departmentId} onChange={(event) => change("departmentId", event.target.value === "0" ? "" : event.target.value)} className="mt-1 w-full rounded-lg border border-emerald-800 bg-[#102823] px-3 py-2"><option value="0">Todos</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label></div>
    {loading && <p role="status" className="mt-7">Cargando expedientes…</p>}
    {error && <p role="alert" className="mt-7 text-rose-200">{error}</p>}
    {!loading && !error && <><ul className="mt-6 grid gap-3 sm:grid-cols-2">{data?.content.map((refiner) => <li key={refiner.id} className="flex gap-4 rounded-xl border border-emerald-900 bg-[#102823] p-4"><div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-[#1c4034]">{refiner.badge ? <img src={refiner.badge.url} alt="" width="80" height="80" loading="lazy" className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-2xl text-emerald-200" aria-hidden="true">{refiner.fullName.slice(0, 1)}</span>}</div><div className="min-w-0"><h2 className="break-words font-semibold">{refiner.fullName}</h2><p className="mt-1 break-words text-sm text-[#a9c2b5]">{refiner.title} · {refiner.department.name}</p><Link className="mt-2 inline-block text-sm text-emerald-300 underline" to={`/refiners/${refiner.id}`}>Ver expediente</Link></div></li>)}</ul>{data?.content.length === 0 && <p className="mt-7">No hay expedientes con esos filtros.</p>}<div className="mt-6 flex items-center justify-between"><button disabled={page === 0} onClick={() => change("page", String(page - 1))} className="rounded-lg border border-emerald-700 px-4 py-2 disabled:opacity-40">Anterior</button><span>Página {page + 1} de {Math.max(1, data?.totalPages ?? 1)}</span><button disabled={page + 1 >= (data?.totalPages ?? 1)} onClick={() => change("page", String(page + 1))} className="rounded-lg border border-emerald-700 px-4 py-2 disabled:opacity-40">Siguiente</button></div></>}
  </div></main>;
}

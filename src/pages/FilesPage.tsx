import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../lib/api";
import type { FilePage } from "../files/types";

const validSizes = [10, 25, 50];
const validSorts = ["updatedAt,desc", "name,asc", "progress,desc"];

export function FilesPage() {
  const { request, session } = useAuth();
  const requestRef = useRef(request);
  requestRef.current = request;
  const [params, setParams] = useSearchParams();
  const page = Math.max(0, Number.parseInt(params.get("page") ?? "0", 10) || 0);
  const rawSize = Number.parseInt(params.get("size") ?? "10", 10);
  const size = validSizes.includes(rawSize) ? rawSize : 10;
  const status = ["ACTIVE", "COMPLETE"].includes(params.get("status") ?? "") ? params.get("status")! : "";
  const sort = validSorts.includes(params.get("sort") ?? "") ? params.get("sort")! : "updatedAt,desc";
  const q = (params.get("q") ?? "").slice(0, 60);
  const [search, setSearch] = useState(q);
  const [data, setData] = useState<FilePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => setSearch(q), [q]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const query = new URLSearchParams({ page: String(page), size: String(size), sort });
    if (status) query.set("status", status);
    if (q) query.set("q", q);
    void requestRef.current<FilePage>(`/files?${query}`, { signal: controller.signal })
      .then((result) => setData(result))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof ApiError ? cause.message : "No se pudieron cargar los archivos.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, size, status, sort, q]);

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

  if (!session?.user.permissions.includes("files:read")) {
    return <main className="p-8 text-center">No tienes permiso para ver archivos.</main>;
  }

  return (
    <main className="min-h-screen bg-[#081b19] px-5 py-8 text-[#e7f4e9]">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs uppercase tracking-[0.3em] text-emerald-300">Macrodata Refinement</p><h1 className="mt-2 text-3xl font-semibold">Archivos de datos</h1></div>
          <Link className="text-sm text-emerald-300 underline" to="/estado">Estado del piso</Link>
        </header>
        <div className="mt-8 grid gap-3 sm:grid-cols-4">
          <label className="sm:col-span-2">Buscar archivo<input value={search} onChange={(event) => setSearch(event.target.value)} className="mt-1 w-full rounded-lg border border-emerald-800 bg-[#102823] px-3 py-2" /></label>
          <label>Estado<select value={status} onChange={(event) => change("status", event.target.value)} className="mt-1 w-full rounded-lg border border-emerald-800 bg-[#102823] px-3 py-2"><option value="">Todos</option><option value="ACTIVE">Activos</option><option value="COMPLETE">Completos</option></select></label>
          <label>Orden<select value={sort} onChange={(event) => change("sort", event.target.value)} className="mt-1 w-full rounded-lg border border-emerald-800 bg-[#102823] px-3 py-2"><option value="updatedAt,desc">Recientes</option><option value="name,asc">Nombre</option><option value="progress,desc">Progreso</option></select></label>
        </div>
        {loading && <p role="status" className="mt-8">Cargando archivos…</p>}
        {error && <p role="alert" className="mt-8 rounded-lg border border-rose-500 p-4 text-rose-200">{error}</p>}
        {!loading && !error && <>
          <ul className="mt-6 grid gap-3">
            {data?.content.map((file) => <li key={file.id} className="rounded-xl border border-emerald-900 bg-[#102823] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">{file.name}</h2><p className="mt-1 text-sm text-[#a9c2b5]">{file.rows} × {file.cols} celdas · {file.refinedGroups}/{file.totalGroups} grupos</p></div><Link className="rounded-lg bg-emerald-300 px-4 py-2 font-semibold text-[#08231c]" to={`/files/${file.id}/refine`}>{file.status === "COMPLETE" ? "Ver archivo" : "Abrir archivo"}</Link></div>
              <div className="mt-4 h-2 rounded-full bg-emerald-950"><div className="h-full rounded-full bg-emerald-300" style={{ width: `${file.progress.overall * 100}%` }} /></div>
            </li>)}
          </ul>
          {data?.content.length === 0 && <p className="mt-8 text-center">No hay archivos con esos filtros.</p>}
          <div className="mt-6 flex items-center justify-between gap-4"><button disabled={page === 0} onClick={() => change("page", String(page - 1))} className="rounded-lg border border-emerald-700 px-4 py-2 disabled:opacity-40">Anterior</button><span>Página {page + 1} de {Math.max(1, data?.totalPages ?? 1)}</span><button disabled={page + 1 >= (data?.totalPages ?? 1)} onClick={() => change("page", String(page + 1))} className="rounded-lg border border-emerald-700 px-4 py-2 disabled:opacity-40">Siguiente</button></div>
        </>}
      </div>
    </main>
  );
}

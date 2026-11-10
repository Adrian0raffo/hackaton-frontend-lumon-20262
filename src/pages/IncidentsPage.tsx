import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../lib/api";

export type Incident = {
  id: number;
  title: string;
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  file: { id: number; name: string } | null;
  photos: { mediaId: number; url: string; width: number; height: number }[];
  createdBy: { id: number; displayName: string };
  createdAt: string;
};
type IncidentPage = { content: Incident[]; totalPages: number; page: number };

export function IncidentsPage() {
  const { request, session } = useAuth();
  const requestRef = useRef(request);
  requestRef.current = request;
  const [params, setParams] = useSearchParams();
  const page = Math.max(0, Number.parseInt(params.get("page") ?? "0", 10) || 0);
  const [data, setData] = useState<IncidentPage | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    void requestRef.current<IncidentPage>(`/incidents?page=${page}&size=10`, { signal: controller.signal })
      .then(setData)
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof ApiError ? cause.message : "No se pudieron cargar las incidencias."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page]);

  function go(nextPage: number) {
    const next = new URLSearchParams(params);
    next.set("page", String(nextPage));
    setParams(next);
  }

  return <main className="min-h-screen bg-[#081b19] px-5 py-8 text-[#e7f4e9]"><div className="mx-auto max-w-4xl">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><Link className="text-emerald-300 underline" to="/refiners">← Expedientes</Link><h1 className="mt-4 text-3xl font-semibold">Incidencias</h1></div>{session?.user.permissions.includes("incidents:create") && <Link className="rounded-lg bg-emerald-300 px-4 py-2 font-semibold text-[#08231c]" to="/incidents/new">Nuevo reporte</Link>}</header>
    {loading && <p role="status" className="mt-6">Cargando reportes…</p>}
    {error && <p role="alert" className="mt-6 text-rose-200">{error}</p>}
    {!loading && !error && <><ul className="mt-6 space-y-4">{data?.content.map((incident) => <li key={incident.id} className="rounded-xl border border-emerald-900 bg-[#102823] p-5"><div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="break-words text-xl font-semibold">{incident.title}</h2><span className="text-sm text-emerald-200">{incident.severity}</span></div><p className="mt-2 whitespace-pre-wrap break-words text-[#c4d8cb]">{incident.description}</p><p className="mt-3 text-sm text-[#a9c2b5]">{incident.file?.name ?? "Sin archivo asociado"} · {incident.createdBy.displayName} · {new Date(incident.createdAt).toLocaleString()}</p><div className="mt-4 flex flex-wrap gap-3">{incident.photos.map((photo) => <a key={photo.mediaId} href={photo.url} target="_blank" rel="noopener noreferrer"><img src={photo.url} alt={`Foto de ${incident.title}`} loading="lazy" width="144" height="108" className="h-27 w-36 rounded-lg bg-[#1c4034] object-cover" /></a>)}</div></li>)}</ul>{data?.content.length === 0 && <p className="mt-6">Todavía no hay reportes.</p>}<nav aria-label="Páginas de incidencias" className="mt-6 flex items-center justify-between"><button disabled={page === 0} onClick={() => go(page - 1)} className="rounded-lg border border-emerald-700 px-4 py-2 disabled:opacity-40">Anterior</button><span>Página {page + 1} de {Math.max(1, data?.totalPages ?? 1)}</span><button disabled={page + 1 >= (data?.totalPages ?? 1)} onClick={() => go(page + 1)} className="rounded-lg border border-emerald-700 px-4 py-2 disabled:opacity-40">Siguiente</button></nav></>}
  </div></main>;
}

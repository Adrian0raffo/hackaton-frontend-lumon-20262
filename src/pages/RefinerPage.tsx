import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../lib/api";
import type { Refiner } from "../refiners/types";

export function RefinerPage() {
  const { id } = useParams();
  const { request, session } = useAuth();
  const requestRef = useRef(request);
  requestRef.current = request;
  const [refiner, setRefiner] = useState<Refiner | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void requestRef.current<Refiner>(`/refiners/${id}`, { signal: controller.signal }).then(setRefiner).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof ApiError ? cause.message : "No se pudo abrir el expediente."); });
    return () => controller.abort();
  }, [id]);
  const profileUrl = refiner?.profileUrl && /^https?:\/\//i.test(refiner.profileUrl) ? refiner.profileUrl : null;
  return <main className="min-h-screen bg-[#081b19] px-5 py-8 text-[#e7f4e9]"><div className="mx-auto max-w-3xl"><Link className="text-sm text-emerald-300 underline" to="/refiners">← Directorio</Link>{error && <p role="alert" className="mt-6 text-rose-200">{error}</p>}{!refiner && !error && <p className="mt-6">Cargando expediente…</p>}{refiner && <><div className="mt-7 flex flex-wrap gap-6 rounded-xl border border-emerald-900 bg-[#102823] p-6"><div className="h-40 w-40 shrink-0 overflow-hidden rounded-lg bg-[#1c4034]">{refiner.badge ? <img src={refiner.badge.url} alt={`Fotocheck de ${refiner.fullName}`} width="160" height="160" className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-5xl" aria-hidden="true">{refiner.fullName.slice(0, 1)}</span>}</div><div className="min-w-0 flex-1"><h1 className="break-words text-3xl font-semibold">{refiner.fullName}</h1><p className="mt-2 break-words">{refiner.title} · {refiner.department.name}</p><p className="mt-2">Extensión: {refiner.extension}</p>{profileUrl && <a href={profileUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-emerald-300 underline">Perfil externo</a>}</div></div><section className="mt-5 rounded-xl border border-emerald-900 bg-[#102823] p-6"><h2 className="text-xl font-semibold">Biografía</h2><p className="mt-3 whitespace-pre-wrap break-words text-[#c4d8cb]">{refiner.bio}</p></section>{session?.user.permissions.includes("refiners:write") && <div className="mt-5 flex gap-4"><Link className="text-emerald-300 underline" to={`/refiners/${id}/edit`}>Editar expediente</Link><Link className="text-emerald-300 underline" to={`/refiners/${id}/badge`}>Cambiar fotocheck</Link></div>}</>}</div></main>;
}

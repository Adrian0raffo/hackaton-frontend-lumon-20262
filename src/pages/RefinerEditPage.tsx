import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../lib/api";
import type { Department, Refiner } from "../refiners/types";

type Draft = { title: string; extension: string; bio: string; departmentId: number };
function toDraft(refiner: Refiner): Draft {
  return { title: refiner.title, extension: refiner.extension, bio: refiner.bio, departmentId: refiner.department.id };
}

export function RefinerEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { request } = useAuth();
  const requestRef = useRef(request);
  requestRef.current = request;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [server, setServer] = useState<Refiner | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [etag, setEtag] = useState("");
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let responseEtag = "";
    void Promise.all([
      requestRef.current<Refiner>(`/refiners/${id}`, { onResponse: (response) => { responseEtag = response.headers.get("ETag") ?? ""; } }),
      requestRef.current<Department[]>("/departments"),
    ]).then(([refiner, options]) => {
      if (!active) return;
      setServer(refiner); setDraft(toDraft(refiner)); setEtag(responseEtag); setDepartments(options);
    }).catch((cause: unknown) => { if (active) setError(cause instanceof ApiError ? cause.message : "No se pudo abrir el expediente."); });
    return () => { active = false; };
  }, [id]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !etag || saving) return;
    setSaving(true); setError("");
    try {
      await requestRef.current<Refiner>(`/refiners/${id}`, { method: "PATCH", body: draft, headers: { "If-Match": etag } });
      navigate(`/refiners/${id}`, { replace: true });
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 412) {
        let latestEtag = "";
        try {
          const latest = await requestRef.current<Refiner>(`/refiners/${id}`, { onResponse: (response) => { latestEtag = response.headers.get("ETag") ?? ""; } });
          setServer(latest); setEtag(latestEtag); setConflict(true);
          setError("El expediente cambió mientras editabas. Compara los campos antes de volver a guardar.");
        } catch { setError("No se pudo cargar la versión actual. Inténtalo de nuevo."); }
      } else setError(cause instanceof ApiError ? cause.message : "No se pudo guardar el expediente.");
    } finally { setSaving(false); }
  }

  function useServerValue(field: keyof Draft) {
    if (!server || !draft) return;
    setDraft({ ...draft, [field]: toDraft(server)[field] });
  }

  if (!draft) return <main className="min-h-screen bg-[#081b19] p-8 text-emerald-100">{error || "Cargando expediente…"}</main>;
  const inputClass = "mt-1 w-full rounded-lg border border-emerald-800 bg-[#081b19] px-3 py-2";
  return <main className="min-h-screen bg-[#081b19] px-5 py-8 text-[#e7f4e9]"><div className="mx-auto max-w-2xl"><Link className="text-emerald-300 underline" to={`/refiners/${id}`}>← Expediente</Link><h1 className="mt-4 text-3xl font-semibold">Editar {server?.fullName}</h1>
    {conflict && <div role="alert" className="mt-5 rounded-lg border border-amber-500 bg-amber-950/30 p-4">Hay una versión nueva del expediente. Revisa cada campo. Puedes conservar tu texto o usar el valor actual del servidor antes de guardar.</div>}
    <form onSubmit={save} className="mt-6 space-y-5 rounded-xl border border-emerald-900 bg-[#102823] p-6">
      <label className="block">Cargo<input className={inputClass} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required maxLength={200} />{conflict && <span className="mt-1 block text-sm">En servidor: {server?.title} <button type="button" onClick={() => useServerValue("title")} className="ml-2 text-emerald-300 underline">Usar ese valor</button></span>}</label>
      <label className="block">Extensión<input className={inputClass} value={draft.extension} onChange={(event) => setDraft({ ...draft, extension: event.target.value })} required pattern="[0-9]{3,6}" />{conflict && <span className="mt-1 block text-sm">En servidor: {server?.extension} <button type="button" onClick={() => useServerValue("extension")} className="ml-2 text-emerald-300 underline">Usar ese valor</button></span>}</label>
      <label className="block">Departamento<select className={inputClass} value={draft.departmentId} onChange={(event) => setDraft({ ...draft, departmentId: Number(event.target.value) })}>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select>{conflict && <span className="mt-1 block text-sm">En servidor: {server?.department.name} <button type="button" onClick={() => useServerValue("departmentId")} className="ml-2 text-emerald-300 underline">Usar ese valor</button></span>}</label>
      <label className="block">Biografía<textarea className={inputClass} rows={8} value={draft.bio} onChange={(event) => setDraft({ ...draft, bio: event.target.value })} maxLength={2000} />{conflict && <span className="mt-1 block whitespace-pre-wrap text-sm">En servidor: {server?.bio} <button type="button" onClick={() => useServerValue("bio")} className="ml-2 text-emerald-300 underline">Usar ese valor</button></span>}</label>
      {error && <p role="alert" className="text-rose-200">{error}</p>}
      <button type="submit" disabled={saving || !etag} className="rounded-lg bg-emerald-300 px-5 py-2 font-semibold text-[#08231c] disabled:opacity-50">{saving ? "Guardando…" : conflict ? "Guardar selección" : "Guardar cambios"}</button>
    </form>
  </div></main>;
}

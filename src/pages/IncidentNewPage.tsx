import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import type { FilePage } from "../files/types";
import { ApiError } from "../lib/api";
import { uploadImage, type UploadedMedia } from "../media/upload";
import type { Incident } from "./IncidentsPage";

type Photo = { id: number; file: File; progress: number; status: "uploading" | "confirmed" | "failed" | "cancelled"; media?: UploadedMedia; error?: string };
let nextPhotoId = 1;

export function IncidentNewPage() {
  const navigate = useNavigate();
  const { request } = useAuth();
  const requestRef = useRef(request);
  requestRef.current = request;
  const controllers = useRef(new Map<number, AbortController>());
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [files, setFiles] = useState<FilePage["content"]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<Incident["severity"]>("MEDIUM");
  const [fileId, setFileId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void requestRef.current<FilePage>("/files?page=0&size=50").then((result) => setFiles(result.content)).catch(() => undefined);
    return () => { controllers.current.forEach((controller) => controller.abort()); controllers.current.clear(); };
  }, []);

  function update(id: number, changes: Partial<Photo>) {
    setPhotos((current) => current.map((photo) => photo.id === id ? { ...photo, ...changes } : photo));
  }

  async function start(photo: Photo) {
    const controller = new AbortController();
    controllers.current.set(photo.id, controller);
    update(photo.id, { status: "uploading", progress: 0, error: undefined });
    try {
      const media = await uploadImage(photo.file, "INCIDENT", (path, options) => requestRef.current(path, options), (progress) => update(photo.id, { progress }), controller.signal);
      update(photo.id, { media, status: "confirmed", progress: 1 });
    } catch (cause) {
      if (controller.signal.aborted) update(photo.id, { status: "cancelled", error: "Subida cancelada." });
      else update(photo.id, { status: "failed", error: cause instanceof Error ? cause.message : "No se pudo subir la foto." });
    } finally { controllers.current.delete(photo.id); }
  }

  function add(selected: FileList | null) {
    if (!selected?.length) return;
    const available = Math.max(0, 3 - photos.length);
    const accepted = Array.from(selected).filter((file) => file.type.startsWith("image/")).slice(0, available);
    if (accepted.length < selected.length) setError("Solo se aceptan hasta 3 imágenes.");
    else setError("");
    const added = accepted.map((file) => ({ id: nextPhotoId++, file, progress: 0, status: "uploading" as const }));
    setPhotos((current) => [...current, ...added]);
    added.forEach((photo) => { void start(photo); });
  }

  function remove(id: number) {
    controllers.current.get(id)?.abort();
    setPhotos((current) => current.filter((photo) => photo.id !== id));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || photos.length < 1 || photos.some((photo) => photo.status !== "confirmed" || !photo.media)) return;
    setSaving(true); setError("");
    try {
      await requestRef.current<Incident>("/incidents", { method: "POST", body: { title: title.trim(), description: description.trim(), severity, fileId: fileId ? Number(fileId) : null, mediaIds: photos.map((photo) => photo.media!.mediaId) } });
      navigate("/incidents", { replace: true });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "No se pudo enviar el reporte. Puedes reintentar sin volver a subir las fotos.");
    } finally { setSaving(false); }
  }

  const ready = photos.length >= 1 && photos.length <= 3 && photos.every((photo) => photo.status === "confirmed" && photo.media);
  const inputClass = "mt-1 w-full rounded-lg border border-emerald-800 bg-[#081b19] px-3 py-2";
  return <main className="min-h-screen bg-[#081b19] px-5 py-8 text-[#e7f4e9]"><div className="mx-auto max-w-2xl"><Link className="text-emerald-300 underline" to="/incidents">← Incidencias</Link><h1 className="mt-4 text-3xl font-semibold">Nuevo reporte</h1>
    <form onSubmit={(event) => void submit(event)} className="mt-6 space-y-5 rounded-xl border border-emerald-900 bg-[#102823] p-6">
      <label className="block">Título<input required minLength={3} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} className={inputClass} /></label>
      <label className="block">Descripción<textarea required maxLength={4000} rows={5} value={description} onChange={(event) => setDescription(event.target.value)} className={inputClass} /></label>
      <div className="grid gap-4 sm:grid-cols-2"><label>Gravedad<select value={severity} onChange={(event) => setSeverity(event.target.value as Incident["severity"])} className={inputClass}><option value="LOW">Baja</option><option value="MEDIUM">Media</option><option value="HIGH">Alta</option><option value="CRITICAL">Crítica</option></select></label><label>Archivo relacionado<select value={fileId} onChange={(event) => setFileId(event.target.value)} className={inputClass}><option value="">Ninguno</option>{files.map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}</select></label></div>
      <fieldset><legend className="font-semibold">Fotos (1 a 3)</legend><input aria-label="Elegir fotos" type="file" accept="image/*" multiple disabled={photos.length >= 3} onChange={(event) => { add(event.target.files); event.target.value = ""; }} className="mt-2 block w-full disabled:opacity-50" /><ul className="mt-3 space-y-3">{photos.map((photo) => <li key={photo.id} className="rounded-lg border border-emerald-800 p-3"><div className="flex items-start justify-between gap-3"><span className="min-w-0 break-all text-sm">{photo.file.name}</span><button type="button" onClick={() => remove(photo.id)} className="text-sm text-rose-200 underline">Quitar</button></div><p className="mt-1 text-sm" role="status">{photo.status === "confirmed" ? "Confirmada" : photo.status === "uploading" ? `Subiendo… ${Math.round(photo.progress * 100)} %` : photo.error}</p>{photo.status === "uploading" && <><progress value={photo.progress} max="1" className="mt-2 w-full" /><button type="button" onClick={() => controllers.current.get(photo.id)?.abort()} className="text-sm text-rose-200 underline">Cancelar</button></>}{(photo.status === "failed" || photo.status === "cancelled") && <button type="button" onClick={() => void start(photo)} className="mt-2 text-sm text-emerald-300 underline">Reintentar</button>}</li>)}</ul></fieldset>
      {error && <p role="alert" className="text-rose-200">{error}</p>}
      <button disabled={!ready || saving} type="submit" className="rounded-lg bg-emerald-300 px-5 py-3 font-semibold text-[#08231c] disabled:opacity-50">{saving ? "Enviando…" : "Enviar reporte"}</button>
    </form>
  </div></main>;
}

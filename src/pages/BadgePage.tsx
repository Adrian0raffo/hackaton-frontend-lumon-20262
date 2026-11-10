import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../lib/api";
import { uploadImage, type UploadedMedia } from "../media/upload";
import type { Refiner } from "../refiners/types";

function limit(value: number) { return Math.max(-1, Math.min(1, value)); }

export function BadgePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { request } = useAuth();
  const requestRef = useRef(request);
  requestRef.current = request;
  const [refiner, setRefiner] = useState<Refiner | null>(null);
  const [etag, setEtag] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [previewVersion, setPreviewVersion] = useState(0);
  const [progress, setProgress] = useState(0);
  const [pendingMedia, setPendingMedia] = useState<UploadedMedia | null>(null);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  useEffect(() => {
    let active = true;
    void requestRef.current<Refiner>(`/refiners/${id}`, { onResponse: (response) => { if (active) setEtag(response.headers.get("ETag") ?? ""); } }).then((value) => { if (active) setRefiner(value); }).catch((cause: unknown) => { if (active) setError(cause instanceof ApiError ? cause.message : "No se pudo abrir el expediente."); });
    return () => { active = false; abortRef.current?.abort(); bitmapRef.current?.close(); };
  }, [id]);

  useEffect(() => {
    if (!file) return;
    let active = true;
    void createImageBitmap(file).then((bitmap) => {
      if (!active) { bitmap.close(); return; }
      bitmapRef.current?.close(); bitmapRef.current = bitmap;
      setZoom(1); setPan({ x: 0, y: 0 }); setPreviewVersion((value) => value + 1);
    }).catch(() => setError("No se pudo leer la imagen."));
    return () => { active = false; };
  }, [file]);

  function crop() {
    const bitmap = bitmapRef.current;
    if (!bitmap) return null;
    const size = Math.min(bitmap.width, bitmap.height) / zoom;
    return { x: (bitmap.width - size) * (pan.x + 1) / 2, y: (bitmap.height - size) * (pan.y + 1) / 2, size };
  }

  useEffect(() => {
    const bitmap = bitmapRef.current;
    const canvas = canvasRef.current;
    const square = crop();
    if (!bitmap || !canvas || !square) return;
    canvas.getContext("2d")?.drawImage(bitmap, square.x, square.y, square.size, square.size, 0, 0, 256, 256);
  }, [file, zoom, pan, previewVersion]);

  function choose(next: File | undefined) {
    if (!next) return;
    if (!next.type.startsWith("image/")) { setError("Elige una imagen."); return; }
    setError(""); setPendingMedia(null); setConflict(false); setFile(next);
  }

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const pasted = Array.from(event.clipboardData?.files ?? []).find((item) => item.type.startsWith("image/"));
      if (pasted) choose(pasted);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  async function upload() {
    if (!file || !etag || busy) return;
    const square = crop();
    if (!square) { setError("Espera a que termine de cargar la imagen."); return; }
    const controller = new AbortController();
    abortRef.current = controller; setBusy(true); setProgress(0); setError("");
    try {
      const media = pendingMedia ?? await uploadImage(file, "BADGE", (path, options) => requestRef.current(path, options), setProgress, controller.signal, square);
      setPendingMedia(media);
      await requestRef.current(`/refiners/${id}`, { method: "PATCH", body: { badgeMediaId: media.mediaId }, headers: { "If-Match": etag } });
      navigate(`/refiners/${id}`, { replace: true });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") setError("Subida cancelada. Puedes reintentar.");
      else if (cause instanceof ApiError && cause.status === 412) {
        try {
          let currentEtag = "";
          const current = await requestRef.current<Refiner>(`/refiners/${id}`, { onResponse: (response) => { currentEtag = response.headers.get("ETag") ?? ""; } });
          setRefiner(current); setEtag(currentEtag); setConflict(true);
          setError("Este expediente cambió mientras subías la foto. Revisa la versión actual y vuelve a guardar si quieres reemplazarla.");
        } catch { setError("El expediente cambió. Recarga la página para revisar la versión actual."); }
      } else setError(cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : "No se pudo guardar el fotocheck.");
    } finally { setBusy(false); abortRef.current = null; }
  }

  return <main className="min-h-screen bg-[#081b19] px-5 py-8 text-[#e7f4e9]"><div className="mx-auto max-w-2xl"><Link className="text-emerald-300 underline" to={`/refiners/${id}`}>← Expediente</Link><h1 className="mt-4 text-3xl font-semibold">Fotocheck de {refiner?.fullName ?? "…"}</h1>
    <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); choose(event.dataTransfer.files[0]); }} className="mt-6 rounded-xl border-2 border-dashed border-emerald-700 bg-[#102823] p-6"><label className="block">Seleccionar o soltar imagen<input type="file" accept="image/*" onChange={(event) => choose(event.target.files?.[0])} className="mt-2 block w-full" /></label><p className="mt-2 text-sm text-[#a9c2b5]">También puedes pegar una imagen desde el portapapeles.</p></div>
    {file && <section className="mt-5 rounded-xl border border-emerald-900 bg-[#102823] p-6"><h2 className="font-semibold">Recorte cuadrado</h2><canvas ref={canvasRef} width={256} height={256} role="img" aria-label="Vista previa del fotocheck" tabIndex={0} onPointerDown={(event) => { dragRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (dragRef.current) setPan({ x: limit(dragRef.current.panX - (event.clientX - dragRef.current.x) / 100), y: limit(dragRef.current.panY - (event.clientY - dragRef.current.y) / 100) }); }} onPointerUp={() => { dragRef.current = null; }} onKeyDown={(event) => { if (event.key === "ArrowLeft") setPan((value) => ({ ...value, x: limit(value.x - 0.1) })); if (event.key === "ArrowRight") setPan((value) => ({ ...value, x: limit(value.x + 0.1) })); if (event.key === "ArrowUp") setPan((value) => ({ ...value, y: limit(value.y - 0.1) })); if (event.key === "ArrowDown") setPan((value) => ({ ...value, y: limit(value.y + 0.1) })); }} className="mt-4 aspect-square max-w-full cursor-grab rounded-lg outline-none focus:ring-2 focus:ring-emerald-300" /><label className="mt-4 block">Zoom <input type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} className="block w-64" /></label><p className="mt-2 text-sm text-[#a9c2b5]">Arrastra el recorte o usa las flechas del teclado sobre la imagen.</p></section>}
    {busy && <div className="mt-5"><p role="status">Subiendo… {Math.round(progress * 100)} %</p><progress value={progress} max="1" className="mt-2 w-full" /><button type="button" onClick={() => abortRef.current?.abort()} className="mt-2 text-rose-200 underline">Cancelar</button></div>}
    {error && <p role="alert" className="mt-5 text-rose-200">{error}</p>}
    {conflict && refiner && <p className="mt-3 text-sm">Versión actual: {refiner.version}. Fotocheck actual: {refiner.badge ? <a href={refiner.badge.url} target="_blank" rel="noopener noreferrer" className="text-emerald-300 underline">ver imagen</a> : "sin imagen"}.</p>}
    <button type="button" onClick={() => void upload()} disabled={!file || busy || !etag} className="mt-6 rounded-lg bg-emerald-300 px-5 py-3 font-semibold text-[#08231c] disabled:opacity-50">{pendingMedia ? "Guardar foto confirmada" : "Guardar fotocheck"}</button>
  </div></main>;
}

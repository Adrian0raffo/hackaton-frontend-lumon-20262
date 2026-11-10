import type { RequestOptions } from "../lib/api";

type Request = <T>(path: string, options?: RequestOptions) => Promise<T>;
type Purpose = "BADGE" | "INCIDENT";
type Ticket = { ticketId: string; objectPath: string; bucket: string };
export type UploadedMedia = { mediaId: number; url: string; width: number; height: number; purpose: Purpose };

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => {
    if (blob && blob.type === "image/webp") resolve(blob);
    else reject(new Error("Este navegador no puede generar imágenes WebP."));
  }, "image/webp", quality));
}

export async function prepareImage(file: File, purpose: Purpose, crop?: { x: number; y: number; size: number }): Promise<{ blob: Blob; width: number; height: number; sha256: string }> {
  const bitmap = await createImageBitmap(file);
  const sourceLongSide = Math.max(bitmap.width, bitmap.height);
  const longSide = purpose === "BADGE" ? 512 : Math.min(1600, Math.max(800, sourceLongSide));
  const scale = longSide / sourceLongSide;
  const width = purpose === "BADGE" ? 512 : Math.max(1, Math.round(bitmap.width * scale));
  const height = purpose === "BADGE" ? 512 : Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No se pudo procesar la imagen.");
  if (purpose === "BADGE") {
    const square = crop ?? { x: (bitmap.width - Math.min(bitmap.width, bitmap.height)) / 2, y: (bitmap.height - Math.min(bitmap.width, bitmap.height)) / 2, size: Math.min(bitmap.width, bitmap.height) };
    context.drawImage(bitmap, square.x, square.y, square.size, square.size, 0, 0, 512, 512);
  } else context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const maxBytes = purpose === "BADGE" ? 122_880 : 307_200;
  let blob: Blob | null = null;
  for (const quality of [0.86, 0.75, 0.65, 0.55, 0.45, 0.35]) {
    blob = await toBlob(canvas, quality);
    if (blob.size <= maxBytes) break;
  }
  if (!blob || blob.size > maxBytes) throw new Error("La imagen sigue siendo demasiado grande. Prueba con otra foto.");
  const hash = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  const sha256 = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { blob, width, height, sha256 };
}

function sendToStorage(ticket: Ticket, blob: Blob, onProgress: (fraction: number) => void, signal: AbortSignal): Promise<string> {
  const projectUrl = import.meta.env.VITE_SUPABASE_URL;
  const publicKey = import.meta.env.VITE_SUPABASE_KEY;
  if (!projectUrl || !publicKey) return Promise.reject(new Error("Falta configurar Supabase."));
  const path = ticket.objectPath.split("/").map(encodeURIComponent).join("/");
  const url = `${projectUrl}/storage/v1/object/${encodeURIComponent(ticket.bucket)}/${path}`;
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("apikey", publicKey);
    xhr.setRequestHeader("Content-Type", "image/webp");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(event.loaded / event.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(`${projectUrl}/storage/v1/object/public/${encodeURIComponent(ticket.bucket)}/${path}`);
      else reject(new Error(`Supabase rechazó la imagen (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Se perdió la conexión al subir la imagen."));
    xhr.onabort = () => reject(new DOMException("Subida cancelada", "AbortError"));
    signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(blob);
  });
}

export async function uploadImage(file: File, purpose: Purpose, request: Request, onProgress: (fraction: number) => void, signal: AbortSignal, crop?: { x: number; y: number; size: number }): Promise<UploadedMedia> {
  const prepared = await prepareImage(file, purpose, crop);
  if (signal.aborted) throw signal.reason;
  const ticket = await request<Ticket>("/media/tickets", { method: "POST", body: { purpose, contentType: "image/webp", bytes: prepared.blob.size, sha256: prepared.sha256, width: prepared.width, height: prepared.height }, signal });
  const url = await sendToStorage(ticket, prepared.blob, onProgress, signal);
  if (signal.aborted) throw signal.reason;
  return request<UploadedMedia>(`/media/tickets/${ticket.ticketId}/confirm`, { method: "POST", body: { url }, signal });
}

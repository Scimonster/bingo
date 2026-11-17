/**
 * Client-side image handling: validate, resize to WebP (thumb ≈256 px for screens, print ≈1200 px
 * for printing) and upload both variants to users/{uid}/images/{imageId}/{thumb,print}.webp.
 */
import { ALLOWED_IMAGE_TYPES, LIMITS } from "@bingo/core";
import { ref, uploadBytes } from "firebase/storage";
import { storage } from "./firebase";

export const THUMB_PX = 256;
export const PRINT_PX = 1200;

/** Returns an error message, or null when the file is acceptable. */
export function validateImageFile(file: { type: string; size: number; name?: string }): string | null {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return `${file.name ?? "File"}: only PNG, JPEG, WebP or GIF images are allowed`;
  }
  if (file.size > LIMITS.imageUploadMaxBytes) {
    return `${file.name ?? "File"}: larger than ${Math.round(LIMITS.imageUploadMaxBytes / 1024 / 1024)} MB`;
  }
  if (file.size === 0) return `${file.name ?? "File"}: empty file`;
  return null;
}

/** Scales (w, h) to fit inside a max×max box, keeping the aspect ratio. Never upscales. */
export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  if (w <= 0 || h <= 0) return { w: 0, h: 0 };
  const scale = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

async function toWebp(bitmap: ImageBitmap, max: number): Promise<Blob> {
  const { w, h } = fitWithin(bitmap.width, bitmap.height, max);
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.85 });
    if (blob.type === "image/webp") return blob;
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b && b.type === "image/webp" ? resolve(b) : reject(new Error("This browser cannot encode WebP images"))), "image/webp", 0.85),
  );
}

export function randomImageId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

/** Resizes and uploads an image; returns the storage folder (users/{uid}/images/{imageId}). */
export async function uploadImage(uid: string, file: File): Promise<string> {
  const err = validateImageFile(file);
  if (err) throw new Error(err);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`${file.name}: could not read the image`);
  }
  try {
    const [thumb, print] = await Promise.all([toWebp(bitmap, THUMB_PX), toWebp(bitmap, PRINT_PX)]);
    const folder = `users/${uid}/images/${randomImageId()}`;
    const meta = { contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable" };
    await Promise.all([
      uploadBytes(ref(storage, `${folder}/thumb.webp`), thumb, meta),
      uploadBytes(ref(storage, `${folder}/print.webp`), print, meta),
    ]);
    return folder;
  } finally {
    bitmap.close();
  }
}

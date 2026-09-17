import "server-only";
import sharp from "sharp";
import { planImageUpload, type UploadReject } from "./image";

/** Storage-independent conversion for small images; authorization belongs to the caller. */
export async function normalizeImage(bytes: Uint8Array): Promise<
  { ok: true; bytes: Uint8Array } | { ok: false; reason: UploadReject }
> {
  const plan = planImageUpload(bytes);
  if (!plan.ok) return plan;
  try {
    // Compressed file size alone does not bound decoder memory.
    const output = await sharp(bytes, { limitInputPixels: 40_000_000 })
      .autoOrient()
      .resize({ width: 192, height: 192, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
    // Sharp strips metadata by default; orientation has already been applied.
    return { ok: true, bytes: output };
  } catch {
    return { ok: false, reason: "unsupported-type" };
  }
}

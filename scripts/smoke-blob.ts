/** Real Blob I/O smoke; only its random probe is deleted. Orphan candidates are read-only. */
import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { requireEnv } from "../lib/env";
import { decodeUser, readable } from "../lib/credentials/records";
import { validatePiiReadKeys } from "../lib/credentials/storage";
import { imageObjectKey, planImageDelete } from "../lib/upload/image";
import { deleteImage, listImages, putImage } from "../lib/upload/store";

config({ path: ".env.local", quiet: true });
let stage = "blob-token-configuration";

async function main() {
  requireEnv("BLOB_READ_WRITE_TOKEN");
  stage = "pii-read-key";
  validatePiiReadKeys();
  stage = "database-configuration";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: requireEnv("DATABASE_URL") }) });
  // A complete PNG, not just its signature; the production store receives the actual bytes.
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
  const key = imageObjectKey("smoke", "png", randomBytes(24).toString("base64url"));
  let uploaded = false;
  try {
    stage = "blob-upload";
    const url = await putImage(key, bytes, "png");
    uploaded = true;
    stage = "download-verification";
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!response.ok || !Buffer.from(await response.arrayBuffer()).equals(bytes)) throw new Error("Image download did not match the uploaded bytes");
    stage = "blob-deletion";
    await deleteImage(key);
    uploaded = false;
    stage = "deletion-verification";
    // CDN invalidation is asynchronous; use fresh requests and a bounded deadline.
    let deleted = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      const probe = new URL(url); probe.searchParams.set("smoke", String(attempt));
      const check = await fetch(probe, { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(10_000) });
      if (check.status === 404) { deleted = true; break; }
      await delay(1000);
    }
    if (!deleted) throw new Error("Deleted image did not return 404 within the smoke deadline");
    console.log("Blob upload/download/delete: OK");
    stage = "image-listing";
    const images = await listImages();
    stage = "user-image-query";
    const rows = await prisma.user.findMany({ select: { id: true, image: true } });
    const referenced = new Set<string>();
    let unreadable = 0;
    for (const row of rows) {
      const user = readable(() => decodeUser(row));
      if (user === null) { unreadable++; continue; }
      if (user.image !== null) referenced.add(user.image);
    }
    const candidates = images.filter((blob) => planImageDelete(blob.url) !== null && !referenced.has(blob.url));
    console.log(JSON.stringify({ orphanCandidates: candidates.map((blob) => blob.pathname), unreadableUsers: unreadable, note: "Read-only candidates; concurrent uploads and unreadable rows can cause false positives. Never delete automatically." }, null, 2));
  } finally {
    try {
      if (uploaded) await deleteImage(key);
    } finally { await prisma.$disconnect(); }
  }
}
// SDK and Prisma error messages can contain credentials and private URLs.
main().catch(() => { console.error("Blob smoke failed.", { stage }); process.exitCode = 1; });

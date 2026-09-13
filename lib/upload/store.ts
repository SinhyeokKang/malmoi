// The smoke script uses the react-server condition to exercise this production path.
import "server-only";
import { del, list, put, type ListBlobResultBlob } from "@vercel/blob";
import { requireEnv } from "@/lib/env";
import type { ImageType } from "./image";

export async function putImage(key: string, bytes: Uint8Array, ext: ImageType): Promise<string> {
  const blob = await put(key, Buffer.from(bytes), {
    access: "public", addRandomSuffix: false,
    contentType: ext === "png" ? "image/png" : "image/jpeg",
    token: requireEnv("BLOB_READ_WRITE_TOKEN"),
  });
  return blob.url;
}

export async function deleteImage(key: string): Promise<void> {
  await del(key, { token: requireEnv("BLOB_READ_WRITE_TOKEN") });
}

export async function listImages(): Promise<ListBlobResultBlob[]> {
  const token = requireEnv("BLOB_READ_WRITE_TOKEN");
  const images: ListBlobResultBlob[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: "avatars/", cursor, token });
    images.push(...page.blobs);
    if (!page.hasMore) return images;
    cursor = page.cursor;
  } while (cursor);
  throw new Error("Image listing ended without a cursor");
}

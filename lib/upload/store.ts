// 스모크 스크립트가 react-server 조건으로 이 프로덕션 경로를 그대로 밟는다.
import "server-only";
import { del, list, put, type ListBlobResultBlob } from "@vercel/blob";
import { requireEnv } from "@/lib/env";
import type { StoredImageType } from "./image";

export async function putImage(key: string, bytes: Uint8Array, ext: StoredImageType): Promise<string> {
  const blob = await put(key, Buffer.from(bytes), {
    access: "public", addRandomSuffix: false,
    contentType: `image/${ext}`,
    token: requireEnv("BLOB_READ_WRITE_TOKEN"),
  });
  return blob.url;
}

export async function deleteImage(key: string): Promise<void> {
  await del(key, { token: requireEnv("BLOB_READ_WRITE_TOKEN") });
}

export async function listImages(prefix: "avatars/" | "projects/" = "avatars/"): Promise<ListBlobResultBlob[]> {
  const token = requireEnv("BLOB_READ_WRITE_TOKEN");
  const images: ListBlobResultBlob[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, token });
    images.push(...page.blobs);
    if (!page.hasMore) return images;
    cursor = page.cursor;
  } while (cursor);
  throw new Error("Image listing ended without a cursor");
}

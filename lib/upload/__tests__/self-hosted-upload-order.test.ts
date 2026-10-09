import { chmodSync, existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { decodeUser, encodeUserFields } from "@/lib/credentials/records";

/**
 * **self-hosted 볼륨에서도 쓰기 순서가 그대로다** (self-hosting design §3 · POSTMORTEM 2026-09-13). 실제 Action(`uploadProfileImage`)을
 * 실제 저장 경계(`lib/upload/store.ts` → 파일 볼륨)에 물려 잰다 — mock 저장소로는 "디스크에 바이트가 안 남았다"를 증명할 수 없다.
 *
 * - PII 활성 키가 무효면 **파일을 쓰지 않는다** — 외부 쓰기 뒤에 키 오류를 발견하지 않는다.
 * - 볼륨이 읽기 전용이면 쓰기가 실패하고 **DB는 옛 참조를 유지한다** — 업로드가 DB 갱신보다 먼저다.
 */

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), getPrisma: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ signIn: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/db", () => ({ getPrisma: mocks.getPrisma }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

const { uploadProfileImage } = await import("@/app/(edit)/account/actions");

const asRoot = process.getuid?.() === 0;
const OLD = "/api/images/avatars/owner/old.webp";
let root: string;
let row: { id: string; image?: string | null };
let update: ReturnType<typeof vi.fn>;
let png: Uint8Array<ArrayBuffer>;

function form(): FormData {
  const data = new FormData();
  data.set("image", new File([png], "a.png", { type: "image/png" }));
  return data;
}

function files(): string[] {
  const dir = join(root, "avatars", "owner");
  return existsSync(dir) ? readdirSync(dir) : [];
}

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "upload-order-"));
  png = new Uint8Array(await sharp({ create: { width: 64, height: 64, channels: 4, background: "#ff0000" } }).png().toBuffer());
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("MALMOI_ORIGIN", "https://malmoi.example.com");
  vi.stubEnv("MALMOI_UPLOAD_DIR", root);
  vi.stubEnv("PII_ENCRYPTION_KEYS", JSON.stringify({ k1: Buffer.alloc(32, 1).toString("base64") }));
  vi.stubEnv("PII_ENCRYPTION_ACTIVE_KEY_ID", "k1");
  row = { id: "owner", ...encodeUserFields("owner", { image: OLD }) };
  update = vi.fn(async ({ data }) => { row = { ...row, ...data }; return row; });
  const tx = { $executeRaw: vi.fn(), user: { findUniqueOrThrow: vi.fn(async () => row), update } };
  mocks.requireUser.mockResolvedValue({ userId: "owner" });
  mocks.getPrisma.mockReturnValue({ $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  if (existsSync(root)) chmodSync(root, 0o755);
  rmSync(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

it("정상 경로는 볼륨에 쓰고 DB에 상대 경로를 저장한다", async () => {
  expect(await uploadProfileImage(form())).toEqual({ ok: true });
  const [name] = files();
  expect(name).toMatch(/^[A-Za-z0-9_-]+\.webp$/);
  expect(decodeUser(row).image).toBe(`/api/images/avatars/owner/${name}`);
});

it.each(["", "missing-key"])("PII 쓰기 키 %j가 무효면 파일을 쓰지 않는다", async (kid) => {
  vi.stubEnv("PII_ENCRYPTION_ACTIVE_KEY_ID", kid);
  expect(await uploadProfileImage(form())).toEqual({ ok: false, reason: "unavailable" });
  expect(readdirSync(root)).toEqual([]);
  expect(update).not.toHaveBeenCalled();
});

it.skipIf(asRoot)("볼륨이 읽기 전용이면 실패하고 DB는 옛 참조를 유지한다", async () => {
  chmodSync(root, 0o555);
  expect(await uploadProfileImage(form())).toEqual({ ok: false, reason: "unavailable" });
  expect(update).not.toHaveBeenCalled();
  expect(decodeUser(row).image).toBe(OLD);
  chmodSync(root, 0o755);
  expect(readdirSync(root)).toEqual([]);
});

it("교체는 커밋 뒤 이전 상대 경로 파일을 지운다", async () => {
  expect(await uploadProfileImage(form())).toEqual({ ok: true });
  const first = decodeUser(row).image;
  expect(await uploadProfileImage(form())).toEqual({ ok: true });
  const [current] = files();
  expect(files()).toHaveLength(1);
  expect(decodeUser(row).image).toBe(`/api/images/avatars/owner/${current}`);
  expect(decodeUser(row).image).not.toBe(first);
});

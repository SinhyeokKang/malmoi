import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteFileImage, probeUploadDir, putFileImage, readFileImage } from "../file-store";

/**
 * **self-hosted 파일 볼륨 저장 경계** (self-hosting design §3). 실제 임시 디렉터리에서 잰다 — symlink·rename·권한은 mock으로
 * 판정할 수 없다(`lib/cli/__tests__/walk.test.ts`의 `mkdtempSync`·`symlinkSync` 선례).
 *
 * ⚠️ **root로 돌면 권한 사례가 공허하다** — 0o555 디렉터리에도 쓸 수 있어서다. 그 사례만 건너뛴다.
 */

const asRoot = process.getuid?.() === 0;
let base: string;
let root: string;
let outside: string;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "file-store-"));
  root = join(base, "uploads");
  outside = join(base, "outside");
  mkdirSync(root);
  mkdirSync(outside);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  // 권한 사례가 남긴 0o555·0o000을 풀어야 지워진다.
  for (const dir of [root, join(root, "avatars"), join(root, "avatars", "u1")]) if (existsSync(dir)) chmodSync(dir, 0o755);
  rmSync(base, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const bytes = (...values: number[]) => Uint8Array.of(...values);
const view = (buffer: ArrayBuffer | null) => (buffer === null ? null : [...new Uint8Array(buffer)]);
/** 볼륨 안의 모든 항목(숨김 포함) — 임시 파일이 남았는지 본다. */
function entries(dir: string, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${prefix}${entry.name}`;
    return entry.isDirectory() ? [`${path}/`, ...entries(join(dir, entry.name), `${path}/`)] : [path];
  });
}

describe("put / read / delete", () => {
  it("쓰면 상대 경로 `/api/images/<key>`를 돌려주고 같은 바이트를 읽는다", async () => {
    expect(await putFileImage(root, "avatars/u1/n1.webp", bytes(1, 2, 3))).toBe("/api/images/avatars/u1/n1.webp");
    expect(view(await readFileImage(root, "avatars/u1/n1.webp"))).toEqual([1, 2, 3]);
    expect(entries(root)).toEqual(["avatars/", "avatars/u1/", "avatars/u1/n1.webp"]);
    await putFileImage(root, "projects/p1/n2.webp", bytes(9));
    expect(view(await readFileImage(root, "projects/p1/n2.webp"))).toEqual([9]);
  });

  it("지우면 읽기가 null이다 — 없는 키를 지워도 던지지 않는다", async () => {
    await putFileImage(root, "avatars/u1/n1.webp", bytes(1));
    await deleteFileImage(root, "avatars/u1/n1.webp");
    expect(await readFileImage(root, "avatars/u1/n1.webp")).toBeNull();
    await expect(deleteFileImage(root, "avatars/u1/n1.webp")).resolves.toBeUndefined();
    await expect(deleteFileImage(root, "avatars/nobody/n1.webp")).resolves.toBeUndefined();
  });

  it("없는 키는 null이다", async () => {
    expect(await readFileImage(root, "avatars/u1/missing.webp")).toBeNull();
  });
});

describe("키 문법 밖은 디스크에 닿지 않는다", () => {
  const BAD = ["../outside/x.webp", "avatars/../../outside/x.webp", "avatars/u1/../../x.webp", "/etc/passwd", "avatars/u1/n1.svg", "avatars/u1/.n1.webp", "avatars/u1", "other/u1/n1.webp", "avatars/u1/n1.webp/", "avatars\\u1\\n1.webp", ""];

  it.each(BAD)("put %j는 거절하고 아무것도 만들지 않는다", async (key) => {
    await expect(putFileImage(root, key, bytes(1))).rejects.toThrow();
    expect(entries(root)).toEqual([]);
    expect(entries(outside)).toEqual([]);
  });

  it.each(BAD)("read %j는 null이다", async (key) => {
    writeFileSync(join(outside, "x.webp"), "secret");
    expect(await readFileImage(root, key)).toBeNull();
  });

  it.each(BAD)("delete %j는 거절하고 볼륨 밖 파일을 지우지 않는다", async (key) => {
    writeFileSync(join(outside, "x.webp"), "secret");
    await expect(deleteFileImage(root, key)).rejects.toThrow();
    expect(readFileSync(join(outside, "x.webp"), "utf8")).toBe("secret");
  });
});

describe("symlink 탈출", () => {
  it("볼륨 안의 디렉터리가 밖을 가리키면 읽지도 쓰지도 지우지도 않는다", async () => {
    mkdirSync(join(outside, "u1"));
    writeFileSync(join(outside, "u1", "n1.webp"), "secret");
    mkdirSync(join(root, "avatars"));
    symlinkSync(join(outside, "u1"), join(root, "avatars", "u1"));
    expect(await readFileImage(root, "avatars/u1/n1.webp")).toBeNull();
    await expect(putFileImage(root, "avatars/u1/n2.webp", bytes(1))).rejects.toThrow();
    await expect(deleteFileImage(root, "avatars/u1/n1.webp")).rejects.toThrow();
    expect(readdirSync(join(outside, "u1"))).toEqual(["n1.webp"]);
  });

  it("최상위 접두 디렉터리가 밖을 가리켜도 같다 — 밖에 디렉터리를 만들지 않는다", async () => {
    symlinkSync(outside, join(root, "projects"));
    await expect(putFileImage(root, "projects/p1/n1.webp", bytes(1))).rejects.toThrow();
    expect(entries(outside)).toEqual([]);
  });

  it("파일 자체가 밖을 가리키는 symlink면 읽지 않는다", async () => {
    writeFileSync(join(outside, "secret.webp"), "secret");
    mkdirSync(join(root, "avatars", "u1"), { recursive: true });
    symlinkSync(join(outside, "secret.webp"), join(root, "avatars", "u1", "n1.webp"));
    expect(await readFileImage(root, "avatars/u1/n1.webp")).toBeNull();
  });

  it("업로드 디렉터리 자체가 symlink면 볼륨 밖 탈출로 본다 — 셋 다 거절", async () => {
    const link = join(base, "link");
    symlinkSync(outside, link);
    mkdirSync(join(outside, "avatars", "u1"), { recursive: true });
    writeFileSync(join(outside, "avatars", "u1", "n1.webp"), "secret");
    await expect(putFileImage(link, "avatars/u1/n2.webp", bytes(1))).rejects.toThrow();
    expect(await readFileImage(link, "avatars/u1/n1.webp")).toBeNull();
    await expect(deleteFileImage(link, "avatars/u1/n1.webp")).rejects.toThrow();
    expect(readdirSync(join(outside, "avatars", "u1"))).toEqual(["n1.webp"]);
    // 끝 슬래시를 붙이면 lstat이 링크를 따라간다 — 정규화 뒤에 판정해야 같은 결론이다.
    await expect(putFileImage(`${link}/`, "avatars/u1/n3.webp", bytes(1))).rejects.toThrow();
  });

  it("업로드 디렉터리가 상대 경로·없음·파일이면 거절한다", async () => {
    writeFileSync(join(base, "file"), "");
    for (const bad of ["uploads", join(base, "missing"), join(base, "file")]) {
      await expect(putFileImage(bad, "avatars/u1/n1.webp", bytes(1)), bad).rejects.toThrow();
      expect(await readFileImage(bad, "avatars/u1/n1.webp"), bad).toBeNull();
    }
  });
});

describe("원자적 쓰기", () => {
  it("같은 키를 동시에 바꿔도 임시 파일 이름이 부딪히지 않고, 끝나면 한쪽 바이트만 남는다", async () => {
    const writes = Array.from({ length: 8 }, (_, i) => putFileImage(root, "avatars/u1/n1.webp", new Uint8Array(4096).fill(i)));
    await Promise.all(writes);
    const final = new Uint8Array((await readFileImage(root, "avatars/u1/n1.webp"))!);
    expect(final.length).toBe(4096);
    // 섞인 바이트가 없다 — 부분 기록이 다른 쓰기와 엇갈리지 않았다.
    expect(new Set(final).size).toBe(1);
    expect(entries(root)).toEqual(["avatars/", "avatars/u1/", "avatars/u1/n1.webp"]);
  });

  it("교체는 기존 파일을 rename으로 덮는다 — 읽는 쪽은 옛 바이트 아니면 새 바이트다", async () => {
    await putFileImage(root, "avatars/u1/n1.webp", bytes(1, 1));
    await putFileImage(root, "avatars/u1/n1.webp", bytes(2));
    expect(view(await readFileImage(root, "avatars/u1/n1.webp"))).toEqual([2]);
  });

  it("rename 전에 죽어 남은 임시 파일은 키 문법 밖이라 읽기에 안 보인다", async () => {
    await putFileImage(root, "avatars/u1/n1.webp", bytes(1));
    const leftover = readdirSync(join(root, "avatars", "u1"));
    expect(leftover).toEqual(["n1.webp"]);
    // crash가 남겼을 모양 — 쓰기가 만드는 임시 이름과 같은 꼴(점으로 시작, `.tmp`)을 손으로 둔다.
    writeFileSync(join(root, "avatars", "u1", ".0123456789abcdef01234567.tmp"), "partial");
    for (const key of ["avatars/u1/.0123456789abcdef01234567.tmp", "avatars/u1/.0123456789abcdef01234567", "avatars/u1/0123456789abcdef01234567.tmp"]) {
      expect(await readFileImage(root, key), key).toBeNull();
    }
  });
});

describe.skipIf(asRoot)("쓰기 실패", () => {
  it("읽기 전용 디렉터리면 put이 던지고 기존 파일은 그대로다 — 호출자는 DB 옛 참조를 유지한다", async () => {
    await putFileImage(root, "avatars/u1/old.webp", bytes(7));
    chmodSync(join(root, "avatars", "u1"), 0o555);
    await expect(putFileImage(root, "avatars/u1/new.webp", bytes(8))).rejects.toThrow();
    chmodSync(join(root, "avatars", "u1"), 0o755);
    expect(readdirSync(join(root, "avatars", "u1"))).toEqual(["old.webp"]);
    expect(view(await readFileImage(root, "avatars/u1/old.webp"))).toEqual([7]);
  });

  it("볼륨 루트가 읽기 전용이면 첫 쓰기가 던진다", async () => {
    chmodSync(root, 0o555);
    await expect(putFileImage(root, "avatars/u1/n1.webp", bytes(1))).rejects.toThrow();
  });

  it("읽기 reject(권한 없음)는 catch 안에서 null로 접힌다 — 던지지 않는다", async () => {
    await putFileImage(root, "avatars/u1/n1.webp", bytes(1));
    chmodSync(join(root, "avatars", "u1", "n1.webp"), 0o000);
    await expect(readFileImage(root, "avatars/u1/n1.webp")).resolves.toBeNull();
    chmodSync(join(root, "avatars", "u1", "n1.webp"), 0o644);
  });
});

it("디렉터리를 키 자리에 두면 읽지 않는다 — 일반 파일만 낸다", async () => {
  mkdirSync(join(root, "avatars", "u1", "n1.webp"), { recursive: true });
  expect(await readFileImage(root, "avatars/u1/n1.webp")).toBeNull();
});

it("실패 로그에 경로·키를 싣지 않는다", async () => {
  const error = vi.mocked(console.error);
  await readFileImage(root, "avatars/u1/missing.webp");
  await readFileImage(join(base, "missing"), "avatars/u1/n1.webp");
  const logged = JSON.stringify(error.mock.calls);
  expect(logged).not.toContain(base);
  expect(logged).not.toContain("missing.webp");
});

/** preflight가 넘겨받는 probe — 저장 경계와 같은 규칙(진짜 디렉터리, symlink 아님)으로 기동 전에 거른다. */
describe("probeUploadDir", () => {
  it("쓸 수 있는 진짜 디렉터리면 ok", () => {
    expect(probeUploadDir(root)).toBe("ok");
    expect(probeUploadDir(`${root}/`)).toBe("ok");
  });

  it("없거나 파일이면 missing", () => {
    writeFileSync(join(base, "file"), "");
    expect(probeUploadDir(join(base, "missing"))).toBe("missing");
    expect(probeUploadDir(join(base, "file"))).toBe("missing");
  });

  it("symlink면 missing — 저장 경계가 볼륨 밖 탈출로 거절할 디렉터리로 기동하지 않는다", () => {
    symlinkSync(root, join(base, "link"));
    expect(probeUploadDir(join(base, "link"))).toBe("missing");
    expect(probeUploadDir(join(base, "link") + "/")).toBe("missing");
  });

  it.skipIf(asRoot)("읽기 전용이면 not-writable", () => {
    chmodSync(root, 0o555);
    expect(probeUploadDir(root)).toBe("not-writable");
  });
});

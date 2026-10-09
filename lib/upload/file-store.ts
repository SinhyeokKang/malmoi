import { randomBytes } from "node:crypto";
import { accessSync, constants, lstatSync } from "node:fs";
import { lstat, mkdir, readFile, realpath, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";

import { isStoredImageKey } from "./image";

/**
 * **self-hosted 업로드 볼륨** (self-hosting design §3). hosted의 Blob과 같은 세 동작(put·read·delete)만 든다 — `lib/upload/store.ts`가
 * 배포 모드로 이쪽을 고른다. 볼륨 루트는 호출자가 넘긴다(`MALMOI_UPLOAD_DIR`) — 그래서 env를 읽지 않고 임시 디렉터리로 시험된다.
 *
 * ⚠️ **모든 동작이 `isStoredImageKey`를 먼저 지난다** — 키 문법이 `..`·절대 경로·숨김 파일을 막고, 아래 symlink 검사가 그 다음 축이다.
 * ⚠️ **볼륨 루트 자체가 symlink면 탈출로 본다** — 루트를 realpath로 풀어 버리면 그 링크가 가리키는 아무 디렉터리나 볼륨이 된다.
 * 부모 경로의 symlink(macOS의 `/var` → `/private/var`)는 운영체제 배치라 보지 않는다 — 마지막 성분만 lstat한다.
 * ⚠️ **검사는 정적인 링크에만 성립하고, 검사와 사용 사이의 동시 교체는 막지 않는다** — 업로드 볼륨의 쓰기 주체는 web 하나여야 한다는
 * 운영 계약을 전제한다. 다른 주체(컨테이너·호스트 프로세스)에 쓰기를 주면 그 주체가 경쟁으로 web의 파일시스템(환경변수 포함)을 읽힐 수
 * 있다(ARCHITECTURE §7 "self-hosted 업로드 볼륨" — compose 단언은 `self-hosted-gates.test.ts`).
 */

/** 루트 검사·`resolve`(끝 슬래시 제거 — 붙어 있으면 lstat이 링크를 따라간다) 뒤의 실제 경로. */
async function volumeRoot(root: string): Promise<string> {
  if (!isAbsolute(root)) throw new Error("Upload directory is not absolute");
  const path = resolve(root);
  const entry = await lstat(path);
  if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error("Upload directory is not a real directory");
  return realpath(path);
}

export function inside(path: string, base: string): boolean {
  // 끝 구분자를 확인한다 — 볼륨 루트가 `/`일 때 `base + sep`(`//`)로 비교하면 쓰기는 되고 읽기만 언제나 404가 된다.
  return path.startsWith(base.endsWith(sep) ? base : base + sep);
}

function assertKey(key: string): void {
  if (!isStoredImageKey(key)) throw new Error("Invalid image object key");
}

/**
 * 쓰고 **상대 경로 `/api/images/<key>`**를 돌려준다 — DB에 그대로 저장되고 `imageSrc`가 그대로 렌더한다.
 *
 * ⚠️ **디렉터리를 한 단계씩 만들고 lstat한다** — `mkdir -p`는 중간 symlink를 따라가 볼륨 밖에 디렉터리를 만든 뒤에야 검사에 걸린다.
 * ⚠️ **임시 파일(난수 이름, `wx`) → `rename`이다** — 부분 기록이 키 자리에 보이지 않고, 같은 키의 동시 교체가 이름으로 부딪히지 않는다.
 * 점으로 시작하는 임시 이름은 키 문법 밖이라 crash가 남긴 조각이 읽기 경로에 노출되지 않는다. `wx`는 그 이름의 symlink도 따라가지 않는다.
 */
export async function putFileImage(root: string, key: string, bytes: Uint8Array): Promise<string> {
  assertKey(key);
  let dir = await volumeRoot(root);
  for (const part of dirname(key).split("/")) {
    dir = join(dir, part);
    try {
      await mkdir(dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const entry = await lstat(dir);
    if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error("Upload path escapes the volume");
  }
  const temp = join(dir, `.${randomBytes(12).toString("hex")}.tmp`);
  try {
    await writeFile(temp, bytes, { flag: "wx", mode: 0o644 });
    await rename(temp, join(dir, basename(key)));
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
  return `/api/images/${key}`;
}

/**
 * 읽는다. **실패는 전부 `null`이다** — 없음·권한·symlink 탈출·디렉터리를 가리지 않고 route가 본문 없는 404로 낸다.
 *
 * ⚠️ **reject는 이 catch 안에서 접는다** — route 밖으로 새면 Next가 500 본문을 낸다(POSTMORTEM 2026-10-07 부류).
 * ⚠️ **로그에 경로·키를 싣지 않는다** — 단계 이름만이다(`readImage`의 Blob 갈래와 같은 규칙).
 */
export async function readFileImage(root: string, key: string): Promise<ArrayBuffer | null> {
  if (!isStoredImageKey(key)) return null;
  let stage = "volume";
  try {
    const base = await volumeRoot(root);
    stage = "read";
    const real = await realpath(join(base, key));
    if (!inside(real, base) || !(await stat(real)).isFile()) {
      console.error("Image read failed.", { stage: "escape" });
      return null;
    }
    // 복사해서 `ArrayBuffer`로 낸다 — Node `Buffer`는 공유 풀의 조각이라 `.buffer`를 그대로 넘기면 남의 바이트가 따라간다.
    return new Uint8Array(await readFile(real)).buffer;
  } catch (error) {
    // 없는 키는 정상 경로다(지운 사진의 캐시된 `<img>`) — 단계 로그는 그 밖의 실패에만 남긴다.
    if ((error as NodeJS.ErrnoException).code !== "ENOENT" || stage === "volume") console.error("Image read failed.", { stage });
    return null;
  }
}

/** 지운다. 없는 키는 조용히 끝난다(Blob `del`과 같다). symlink 파일은 링크만 지워진다 — 대상은 건드리지 않는다. */
export async function deleteFileImage(root: string, key: string): Promise<void> {
  assertKey(key);
  const base = await volumeRoot(root);
  let dir: string;
  try {
    dir = await realpath(join(base, dirname(key)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  if (!inside(dir, base)) throw new Error("Upload path escapes the volume");
  try {
    await unlink(join(dir, basename(key)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

/**
 * preflight가 넘겨받는 디렉터리 probe(`lib/deployment/preflight.ts`의 `UploadDirProbe`). **저장 경계와 같은 규칙이다** — 경로가 있어도
 * 진짜 디렉터리가 아니면(파일·symlink) `not-directory`다. 기동 뒤 모든 쓰기가 거절될 디렉터리로 띄우지 않는다.
 */
export function probeUploadDir(path: string): "ok" | "missing" | "not-directory" | "not-writable" {
  try {
    const entry = lstatSync(resolve(path));
    if (entry.isSymbolicLink() || !entry.isDirectory()) return "not-directory";
  } catch {
    return "missing";
  }
  try {
    accessSync(path, constants.W_OK | constants.X_OK);
    return "ok";
  } catch {
    return "not-writable";
  }
}

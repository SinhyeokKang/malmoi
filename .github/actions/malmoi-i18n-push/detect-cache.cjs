// 캐시 준비 스텝의 판정 — pnpm store 캐시를 켜도 되는 대상 리포인가. action의 준비 스텝이 **러너의 시스템 Node**로
// 돈다(말모이 의존성 설치 전이다) — 그래서 의존성 없는 CommonJS 한 파일이다. 판정은 `scripts/__tests__/detect-cache.test.ts`가 본다.
//
// 캐시 복원이 `pnpm store path`를 **대상 리포 워크스페이스에서** 돌아서, 다른 패키지 매니저를 선언한 리포와 store 경로를
// 바꾼 리포에서는 복원·저장이 우리 install과 다른 자리를 본다(action.yml "캐시 준비" 주석). 그 리포는 캐시 없이 간다.
//
// ⚠️ **깨진 `package.json`은 판정하지 않는다** — `pnpm/action-setup`이 v4·v6 모두 그 파일을 캐시 복원 전에 `JSON.parse`해
// 던진다(v1에서도 red였다). 여기서 끄든 켜든 결과가 같다.
"use strict";

const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

const OTHER = "a package manager other than pnpm";
const CUSTOM_STORE = "a custom pnpm store dir";
// ⚠️ **이름을 모양으로 거른다** — `reason`이 `::warning` 줄에 실리므로 대상 리포 문자열의 개행·`::`가 워크플로 명령이 된다.
const NAME = /^[a-z][a-z0-9-]{0,39}$/;
// 인용한 키(`"storeDir":`)도 같은 키다. 주석 줄은 `#`로 시작해 걸리지 않는다.
const STORE_DIR_YAML = /^[ \t]*(["']?)storeDir\1[ \t]*:/m;
const STORE_DIR_NPMRC = /^[ \t]*store-dir[ \t]*=/m;

/**
 * @param {{ packageJson?: string, pnpmWorkspace?: string, npmrc?: string }} files 워크스페이스 루트의 파일 내용. 없으면 undefined.
 * @returns {{ cache: boolean, reason: string }} `reason`은 끌 때만 채운다 — "This repository uses <reason>"에 들어간다.
 */
function detectCache(files) {
  const manager = packageManagerOf(files.packageJson);
  if (manager !== undefined && manager !== "pnpm") {
    return { cache: false, reason: NAME.test(manager) ? manager : OTHER };
  }
  if (STORE_DIR_YAML.test(files.pnpmWorkspace ?? "") || STORE_DIR_NPMRC.test(files.npmrc ?? "")) {
    return { cache: false, reason: CUSTOM_STORE };
  }
  return { cache: true, reason: "" };
}

/**
 * 선언된 패키지 매니저 이름. 선언이 없으면 undefined, 문자열이 아니면 모양 검사에서 떨어질 값(`""`)을 낸다.
 * `devEngines.packageManager`가 `packageManager`보다 앞선다 — pnpm의 판정 순서와 같다. 배열이면 첫 항목이다.
 */
function packageManagerOf(text) {
  if (text === undefined) return undefined;
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) return undefined;
  const engine = [].concat(manifest.devEngines?.packageManager ?? [])[0];
  const engineName = engine !== null && typeof engine === "object" ? engine.name : undefined;
  if (engineName !== undefined) return typeof engineName === "string" ? engineName : "";
  const field = manifest.packageManager;
  if (field === undefined) return undefined;
  return typeof field === "string" ? field.split("@")[0] : "";
}

function readIfPresent(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}

module.exports = { detectCache };

// 준비 스텝: `node detect-cache.cjs <workspace>` → 끌 이유 한 줄(켜면 빈 출력).
if (require.main === module) {
  const workspace = process.argv[2] ?? ".";
  const { reason } = detectCache({
    packageJson: readIfPresent(join(workspace, "package.json")),
    pnpmWorkspace: readIfPresent(join(workspace, "pnpm-workspace.yaml")),
    npmrc: readIfPresent(join(workspace, ".npmrc")),
  });
  process.stdout.write(reason);
}

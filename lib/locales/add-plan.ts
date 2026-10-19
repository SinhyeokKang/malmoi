import { isChromeLocaleCode } from "./chrome-codes";
import { isLocaleShaped, isPathSafeLocale, isPathSafeRepoPath, looksLikeLocale } from "@/lib/locale-code";
import { surfaceOwnership, type SurfacePaths } from "@/lib/surfaces/plan";

/**
 * **언어 추가 판정** — 코드·포맷·충돌·경로를 보고 새로 만들지(create), orphan 행을 되살릴지(revive), 거부할지 정한다
 * (locale-add design §2·§3). 권한·보관·미확정 Publish 같은 공통 장벽은 `planLocaleChange`가 이 함수 앞에서 건다.
 *
 * 경로는 서버가 소스 `pathTemplate`에서 계산한다 — Action·MCP는 파일 경로를 받지 않는다.
 */

/** 로케일별 파일을 생성·삭제할 수 있는 포맷만 — 공유 파일(`ts-dict`)의 언어 구성 변경은 범위 밖이다. */
const SUPPORTED_ADAPTERS: ReadonlySet<string> = new Set(["json-catalog", "chrome-locales", "yaml-catalog", "code-dict", "arb-catalog"]);

export function supportsLocaleChanges(adapterName: string | null): boolean {
  return adapterName !== null && SUPPORTED_ADAPTERS.has(adapterName);
}

/** 대소문자·구분자만 다른 코드는 같은 언어로 본다 — `pt-BR`과 `pt_br`이 두 행·두 파일로 갈리는 것을 막는다. */
export function localeCollisionKey(code: string): string {
  return code.toLowerCase().replace(/[-_]/g, "");
}

/**
 * 템플릿의 `{locale}`을 전부 치환한 리포 경로. 안전하지 않으면 `null`이다.
 *
 * ⚠️ `resolveLocalePaths`(`lib/pull/plan.ts`)와 같은 세 검사다 — 그 모듈은 어댑터 그래프를 끌어서 여기서 다시 건다.
 * `{locale}`이 없는 템플릿은 모든 로케일이 한 경로를 받으므로 거부한다.
 */
export function localeFilePath(pathTemplate: string, code: string): string | null {
  if (!pathTemplate.includes("{locale}")) return null;
  if (!isPathSafeLocale(code) || !isLocaleShaped(code)) return null;
  const path = pathTemplate.replaceAll("{locale}", code);
  return isPathSafeRepoPath(path) ? path : null;
}

export type LocaleAddRefusal =
  | "unsupported-format"
  | "invalid-code"
  | "unsupported-locale"
  | "already-active"
  | "locale-collision"
  | "unsafe-path"
  | "path-conflict";

export type LocaleAddInput = {
  code: string;
  surface: { id: string; adapterName: string | null; pathTemplate: string | null };
  /** 그 소스의 Locale 행 전부(orphan 포함). */
  locales: readonly { code: string; orphaned: boolean }[];
  /** 다른 활성 소스가 쥔 파일 경로 — 경로 소유 판정(`surfaceOwnership`)의 입력이다. */
  otherSurfaces: readonly SurfacePaths[];
};

export type LocaleAddVerdict = { ok: true; action: "create" | "revive"; path: string } | { ok: false; error: LocaleAddRefusal };

export function planLocaleAdd(input: LocaleAddInput): LocaleAddVerdict {
  const { code, surface } = input;
  if (!supportsLocaleChanges(surface.adapterName)) return { ok: false, error: "unsupported-format" };
  // ⚠️ **관측할 수 있는 코드만 받는다** (R-B2 🔴 R2) — 적재·만료의 관측은 어댑터 `read`의 `looksLikeLocale`을 지난다. `es-419`·`zh-Hant-TW`처럼
  // 그 밖의 코드는 파일을 만들어도 머지 뒤 관측되지 않아 만료가 orphan시킨다. 그런 언어는 리포에서 직접 추가하면 기존 적재가 받는다.
  if (!isPathSafeLocale(code) || !isLocaleShaped(code) || !looksLikeLocale(code)) return { ok: false, error: "invalid-code" };
  if (surface.adapterName === "chrome-locales" && !isChromeLocaleCode(code)) return { ok: false, error: "unsupported-locale" };
  const same = input.locales.find(locale => locale.code === code);
  if (same !== undefined && !same.orphaned) return { ok: false, error: "already-active" };
  // 되살릴 행이 있어도 다른 철자의 행(활성·orphan 무관)과 충돌하면 거부한다 — 같은 파일을 두 행이 가리키게 된다.
  const key = localeCollisionKey(code);
  if (input.locales.some(locale => locale.code !== code && localeCollisionKey(locale.code) === key)) return { ok: false, error: "locale-collision" };
  const path = surface.pathTemplate === null ? null : localeFilePath(surface.pathTemplate, code);
  if (path === null) return { ok: false, error: "unsafe-path" };
  const others = input.otherSurfaces.filter(other => other.surfaceId !== surface.id);
  // 이 경로의 충돌만 본다 — 다른 소스끼리의 기존 겹침은 이 추가의 거부 사유가 아니다(그건 `renderProject`가 막는다).
  const ownership = surfaceOwnership([...others, { surfaceId: surface.id, surfaceSlug: surface.id, paths: [path] }]);
  if (!ownership.ok && ownership.conflicts.some(conflict => conflict.path === path)) return { ok: false, error: "path-conflict" };
  return { ok: true, action: same === undefined ? "create" : "revive", path };
}

import { ADAPTERS, detectFormatWith, isAdapterName, matchGlobPaths } from "@/lib/adapters";
import { compareKeys, exceedsGlobBudget, looksLikeLocale } from "@/lib/adapters/shared";
import type { AdapterFile, AdapterName, DetectedFormat } from "@/lib/adapters/types";

import { makeProbe } from "./detect";

/**
 * 확정은 **파일을 다시 읽어 재검증**한다 (ARCHITECTURE §3.1). 탐지 결과를 서버에 저장하지 않으므로 클라이언트가
 * 고른 값을 다시 받는데, 그것을 그대로 저장하면 임의의 `pathTemplate`으로 pull이 리포의 아무 파일이나
 * 덮어쓰는 커밋을 만든다 — ARCHITECTURE §6가 `installationId`에 대해 막은 것과 같은 형태다.
 *
 * 자동 후보와 수동 지정이 **한 경로**다. `ts-dict`는 `detect`가 그 디렉터리 `.ts` 최대 8개를 읽어야 매치하므로
 * 이 경로가 아니면 수동 지정이 항상 거부된다 (ARCHITECTURE §3.1).
 */

/**
 * 템플릿이 가리키는 파일 경로 — 호출부가 이것을 내려받아 `planConfirmedFormat`에 넘긴다.
 * per-locale은 `{locale}`을 트리의 파일명으로 치환한 교집합(로케일로 보이는 이름만 — 탐지와 같은 규칙이라
 * 정당한 파일을 잃지 않으면서 `{locale}` 하나짜리 템플릿이 루트 전부를 끌어오는 것을 막는다),
 * multi-locale은 `matchGlobPaths`다. 0개면 호출부가 `manual-no-match`로 접는다.
 */
export function templatePaths(adapter: AdapterName, pathTemplate: string, paths: readonly string[]): string[] {
  const layout = ADAPTERS.find((a) => a.name === adapter)?.layout;
  // 모르는 어댑터는 어느 파일도 가리키지 못한다 — `planConfirmedFormat`의 `unknown-adapter` 검사에 의존하지 않는다.
  if (layout === undefined) return [];
  // ⚠️ **글롭 예산은 두 갈래 다 지난다** (sec-audit 발견 11). `createProject`가 `planConfirmedFormat`
  // 검증 **전에** 원값으로 이 함수를 부르므로, 여기서 안 막으면 온보딩이 첫 진입점이 된다. per-locale
  // 갈래도 `{locale}` N개를 인접 `([^/]+)`로 이어 붙여 같은 모양을 만든다.
  if (exceedsGlobBudget(pathTemplate)) return [];
  if (layout === "multi-locale") return matchGlobPaths(pathTemplate, paths);

  if (pathTemplate.split("{locale}").length < 2) return [];
  return paths.filter((p) => localeOfTemplatePath(pathTemplate, p) !== undefined).sort(compareKeys);
}

/**
 * per-locale 템플릿 경로 → 로케일. 맞지 않으면 `undefined`. `templatePaths`와 **같은 패턴**이다 — 두 벌로 갈리면 내려받은 파일과
 * 로케일 목록이 서로 다른 경로를 가리킨다(delivery-invariants D6의 입력이다).
 */
export function localeOfTemplatePath(pathTemplate: string, path: string): string | undefined {
  const parts = pathTemplate.split("{locale}");
  if (parts.length < 2) return undefined;
  const m = new RegExp(`^${parts.map(escapeRegExp).join("([A-Za-z_-]{2,8})")}$`).exec(path);
  if (!m) return undefined;
  const captures = m.slice(1);
  // `{locale}`이 여러 번이면 전부 같은 값이어야 한다 (`replaceAll`이 그렇게 만든다).
  const first = captures[0];
  return first !== undefined && captures.every((c) => c === first) && looksLikeLocale(first) ? first : undefined;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type ConfirmedFormat =
  | { status: "ok"; format: DetectedFormat; baseLocale: string }
  | {
      status: "rejected";
      reason: "unknown-adapter" | "manual-no-match" | "single-locale" | "not-detected" | "template-mismatch" | "base-locale-missing";
    };

/**
 * 클라이언트가 보낸 값 ↔ 재탐지 결과 대조.
 *
 * ⚠️ **통과 시 저장하는 것은 `detectFormatWith`의 반환값이다** — 클라이언트 입력이 아니다. 검증한 값을
 * 저장하지 않으면 검증이 장식이다 (POSTMORTEM 2026-09-05). `layout`·`writeStrategy`·`nestedByPath`는 그 반환값과
 * `adapterFor(format)`에서 나온다.
 *
 * @param files `templatePaths`가 가리킨 파일들 — 그 파일만 넘긴다. 트리 전부를 넘기면 다른 후보가 1순위를
 *   차지해 정당한 템플릿이 `template-mismatch`로 거부된다.
 */
export function planConfirmedFormat(
  input: { adapter: string; pathTemplate: string; baseLocale: string },
  files: readonly AdapterFile[],
): ConfirmedFormat {
  if (!isAdapterName(input.adapter)) return { status: "rejected", reason: "unknown-adapter" };
  if (files.length === 0) return { status: "rejected", reason: "manual-no-match" };

  const detected = detectFormatWith(
    input.adapter,
    files.map((f) => f.path),
    makeProbe(new Map(files.map((f) => [f.path, f.content]))),
  );
  if (detected === undefined) {
    // ⚠️ **로케일별 어댑터에서 파일이 하나면 "모양이 아니다"가 아니라 "언어가 하나다"다** (malmoi#99) — 탐지는 로케일 둘
    // 이상을 요구한다(ARCHITECTURE §3.1). `not-detected`로 접으면 호출부가 "그 경로에 파일이 없다"로 말해, 둘째 언어
    // 파일을 만들면 되는 사람이 경로를 계속 고친다. 한 파일이 모든 언어를 드는 어댑터(`multi-locale`)는 해당 없다.
    const layout = ADAPTERS.find((adapter) => adapter.name === input.adapter)?.layout;
    return { status: "rejected", reason: layout === "per-locale" && files.length === 1 ? "single-locale" : "not-detected" };
  }
  if (detected.pathTemplate !== input.pathTemplate) return { status: "rejected", reason: "template-mismatch" };
  // 기준 로케일은 **반환된** locales에 있어야 한다 — 입력이 아니라 재탐지가 본 것이다.
  if (!detected.locales.includes(input.baseLocale)) return { status: "rejected", reason: "base-locale-missing" };

  return { status: "ok", format: detected, baseLocale: input.baseLocale };
}

import { ADAPTERS, detectFormatWith, isAdapterName, matchGlobPaths } from "@/lib/adapters";
import { compareKeys, looksLikeLocale } from "@/lib/adapters/shared";
import type { AdapterFile, AdapterName, DetectedFormat } from "@/lib/adapters/types";

import { makeProbe } from "./detect";

/**
 * 확정은 **파일을 다시 읽어 재검증**한다 (design §3.4). 탐지 결과를 서버에 저장하지 않으므로 클라이언트가
 * 고른 값을 다시 받는데, 그것을 그대로 저장하면 임의의 `pathTemplate`으로 pull이 리포의 아무 파일이나
 * 덮어쓰는 커밋을 만든다 — SAAS §5.4가 `installationId`에 대해 막은 것과 같은 형태다.
 *
 * 자동 후보와 수동 지정이 **한 경로**다. `ts-dict`는 `detect`가 그 디렉터리 `.ts` 최대 4개를 읽어야 매치하므로
 * 이 경로가 아니면 수동 지정이 항상 거부된다 (design §3.5).
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
  if (layout === "multi-locale") return matchGlobPaths(pathTemplate, paths);

  const parts = pathTemplate.split("{locale}");
  if (parts.length < 2) return [];
  const pattern = new RegExp(`^${parts.map(escapeRegExp).join("([^/]+)")}$`);
  return paths
    .filter((p) => {
      const m = pattern.exec(p);
      if (!m) return false;
      const captures = m.slice(1);
      // `{locale}`이 여러 번이면 전부 같은 값이어야 한다 (`replaceAll`이 그렇게 만든다).
      return captures.every((c) => c === captures[0] && looksLikeLocale(c));
    })
    .sort(compareKeys);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type ConfirmedFormat =
  | { status: "ok"; format: DetectedFormat; baseLocale: string }
  | {
      status: "rejected";
      reason: "unknown-adapter" | "manual-no-match" | "not-detected" | "template-mismatch" | "base-locale-missing";
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
  if (detected === undefined) return { status: "rejected", reason: "not-detected" };
  if (detected.pathTemplate !== input.pathTemplate) return { status: "rejected", reason: "template-mismatch" };
  // 기준 로케일은 **반환된** locales에 있어야 한다 — 입력이 아니라 재탐지가 본 것이다.
  if (!detected.locales.includes(input.baseLocale)) return { status: "rejected", reason: "base-locale-missing" };

  return { status: "ok", format: detected, baseLocale: input.baseLocale };
}

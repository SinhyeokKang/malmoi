import { ADAPTERS, isAdapterName } from "@/lib/adapters";
import { compareKeys } from "@/lib/adapters/shared";
import { localeOfTemplatePath, templatePaths } from "@/lib/onboarding/confirm";

/**
 * **base 트리에서 본 소스의 로케일** (locale-add design §1 "만료와 strict 적재"). 같은 SHA라 적재를 건너뛰는 야간 방문이 만료 판정
 * (`expireLocaleChanges`)에 넘기는 관측이다. strict 적재의 `payload.locales`와 같은 뜻이어야 해서 경로 → 로케일 판정은 적재가 쓰는
 * `templatePaths`·`localeOfTemplatePath` 한 벌이다(`localesToKeep`의 트리 갈래). 내용을 읽지 않는다 — 존재는 경로가 정한다.
 *
 * ⚠️ 경로가 로케일을 말하지 않는 소스(다중 로케일 어댑터·모르는 어댑터·포맷 미정)는 `unreadable`이다 — 파일 부재로 읽으면 만료가 orphan을
 * 만든다(POSTMORTEM 2026-09-27). 언어 변경은 개별 파일 어댑터만 받으므로 그런 소스에는 행이 없다.
 */
export function observeSurfaceLocales(
  paths: readonly string[],
  surface: { adapterName: string | null; pathTemplate: string | null },
): { status: "observed"; locales: string[] } | { status: "unreadable" } {
  const { adapterName, pathTemplate } = surface;
  if (adapterName === null || pathTemplate === null || !isAdapterName(adapterName)) return { status: "unreadable" };
  if (ADAPTERS.find(adapter => adapter.name === adapterName)?.layout !== "per-locale") return { status: "unreadable" };
  const locales = templatePaths(adapterName, pathTemplate, paths).flatMap(path => {
    const locale = localeOfTemplatePath(pathTemplate, path);
    return locale === undefined ? [] : [locale];
  });
  return { status: "observed", locales: [...new Set(locales)].sort(compareKeys) };
}

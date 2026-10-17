import { Prisma } from "@/generated/prisma/client";

import { NIGHTLY_SUBTYPES } from "./payload";

/**
 * 행위자 필터 `ci`·`nightly`의 술어 (nightly-sync). `triggerOf`(`./view`)와 **같은 칸**(`actorKind`·`kind`·`subtype` + 언어 만료의 `localeChange.via`)을 본다.
 *
 * ⚠️ **`ci`는 `nightly`의 여집합이다(AUTOMATION 안에서)** — 둘을 따로 적으면 어느 쪽에도 안 드는 자동화 행이 생길 수 있고,
 * 그 행은 옛 `?actor=automation`에서만 보인다. 여집합이면 `ci ∪ nightly = AUTOMATION`이 모양으로 선다.
 *
 * ⚠️ **I/O 없는 모듈이다** — Prisma는 `AnyNull` 표식 하나만 값으로 문다(via 없는 옛 행을 SQL NULL에서 건지는 자리). `query.ts`가 `server-only`라
 * 여기에 두면 단위 테스트가 그 경계를 안 넘는다.
 */
export function triggerWhere(trigger: "ci" | "nightly"): Prisma.ProjectEventWhereInput {
  // 야간 언어 만료는 subtype이 CI 만료와 같다 — 기록한 실행(`localeChange.via`)이 가른다(`triggerOf`와 같은 칸, 시안 P3). 옛 행은 via가 없어 ci다.
  const nightlyLocale: Prisma.ProjectEventWhereInput = { subtype: "surface.localeChangeResolved", payload: { path: ["localeChange", "via"], equals: "nightly" } };
  const nightly: Prisma.ProjectEventWhereInput = { OR: [{ kind: "PUBLISH" }, { subtype: { in: [...NIGHTLY_SUBTYPES] } }, nightlyLocale] };
  if (trigger === "nightly") return { actorKind: "AUTOMATION", ...nightly };
  /*
    ⚠️ **ci는 `NOT nightly` 하나로 적지 않는다** — via가 없는 옛 행에서 JSON 경로 비교가 SQL NULL이라 `NOT (… OR NULL)`도 NULL이 되어 그 행이 어느 쪽에도 안 들었다.
    nightly의 앞 두 갈래(컬럼만 본다)는 그대로 NOT으로 빼고, 언어 만료 갈래는 "언어 만료가 아니거나 · via가 nightly가 아니거나 · via가 없다"로 바로 적는다.
    여집합인지는 `query.integration.ts`가 실제 행(via nightly · ci · 없음)으로 잰다.
  */
  const notNightlyLocale: Prisma.ProjectEventWhereInput = { OR: [{ subtype: { not: "surface.localeChangeResolved" } }, { payload: { path: ["localeChange", "via"], not: "nightly" } }, { payload: { path: ["localeChange", "via"], equals: Prisma.AnyNull } }] };
  return { actorKind: "AUTOMATION", NOT: { OR: [{ kind: "PUBLISH" }, { subtype: { in: [...NIGHTLY_SUBTYPES] } }] }, ...notNightlyLocale };
}

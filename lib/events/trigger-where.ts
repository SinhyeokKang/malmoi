import type { Prisma } from "@/generated/prisma/client";

import { NIGHTLY_SUBTYPES } from "./payload";

/**
 * 행위자 필터 `ci`·`nightly`의 술어 (nightly-sync). `triggerOf`(`./view`)와 **같은 컬럼**(`actorKind`·`kind`·`subtype`)을 본다.
 *
 * ⚠️ **`ci`는 `nightly`의 여집합이다(AUTOMATION 안에서)** — 둘을 따로 적으면 어느 쪽에도 안 드는 자동화 행이 생길 수 있고,
 * 그 행은 옛 `?actor=automation`에서만 보인다. 여집합이면 `ci ∪ nightly = AUTOMATION`이 모양으로 선다.
 *
 * ⚠️ **순수 모듈이다** — Prisma는 타입으로만 문다. `query.ts`가 `server-only`라 여기에 두면 단위 테스트가 그 경계를 안 넘는다.
 */
export function triggerWhere(trigger: "ci" | "nightly"): Prisma.ProjectEventWhereInput {
  const nightly: Prisma.ProjectEventWhereInput = { OR: [{ kind: "PUBLISH" }, { subtype: { in: [...NIGHTLY_SUBTYPES] } }] };
  return trigger === "nightly" ? { actorKind: "AUTOMATION", ...nightly } : { actorKind: "AUTOMATION", NOT: nightly };
}

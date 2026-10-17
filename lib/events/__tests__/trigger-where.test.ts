import { describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";

import { NIGHTLY_SUBTYPES } from "../payload";
import { triggerWhere } from "../trigger-where";

/**
 * 주체 필터의 술어 모양. ⚠️ **`triggerOf`와 같은 행을 고르는지는 여기서 재지 않는다** — 같은 모듈끼리의 비교는
 * 공허하다(POSTMORTEM 2026-09-14). 실제 행으로 재는 자리는 `query.integration.ts`(E2)다.
 */
/** 야간 언어 만료(locale-add 시안 P3) — subtype이 같은 CI 만료와 payload의 `via`가 가른다. */
const NIGHTLY_LOCALE_EXPIRY = { subtype: "surface.localeChangeResolved", payload: { path: ["localeChange", "via"], equals: "nightly" } };

describe("triggerWhere", () => {
  it("nightly = AUTOMATION ∧ (PUBLISH ∨ 야간 subtype ∨ via=nightly인 언어 만료)", () => {
    expect(triggerWhere("nightly")).toEqual({
      actorKind: "AUTOMATION",
      OR: [{ kind: "PUBLISH" }, { subtype: { in: [...NIGHTLY_SUBTYPES] } }, NIGHTLY_LOCALE_EXPIRY],
    });
  });

  it("ci = AUTOMATION ∧ ¬nightly — 언어 만료 갈래는 via 없는 옛 행(SQL NULL)까지 ci로 건진다", () => {
    expect(triggerWhere("ci")).toEqual({
      actorKind: "AUTOMATION",
      NOT: { OR: [{ kind: "PUBLISH" }, { subtype: { in: [...NIGHTLY_SUBTYPES] } }] },
      OR: [
        { subtype: { not: "surface.localeChangeResolved" } },
        { payload: { path: ["localeChange", "via"], not: "nightly" } },
        { payload: { path: ["localeChange", "via"], equals: Prisma.AnyNull } },
      ],
    });
  });
});

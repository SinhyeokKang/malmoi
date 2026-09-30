import { describe, expect, it } from "vitest";

import type { Badge } from "@/components/ui/badge";
import type { EventTone } from "@/lib/events/view";
import { m } from "@/lib/i18n";
import type { SurfaceImportStatus } from "@/lib/import/surface-status";

import { STATE, type StateKey, type StateTone, type StateVariant } from "../canon";

/**
 * **상태 톤·낱말의 코드판 정본** (DESIGN §2.4 · ux-drift-unify §3.6). 화면은 상태 키만 넘기고 톤·variant·낱말을 고르지 않는다.
 * ⚠️ DESIGN 표와의 행 수 대조는 두지 않는다 — 마크다운 형식이 바뀌면 red, 톤이 틀리면 green인 테스트다. 빠진 키는 `Record<StateKey, …>`가 막는다.
 */

/** 사전의 모든 문자열 값 — `label`이 새 문자열을 만들지 않고 사전 값을 가리키는지 센다. */
function dictionaryStrings(node: unknown, out: Set<string> = new Set()): Set<string> {
  if (typeof node === "string") out.add(node);
  else if (node !== null && typeof node === "object") for (const value of Object.values(node)) dictionaryStrings(value, out);
  return out;
}

// 타입 대조 — 어휘가 갈리면 컴파일이 red다.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const toneIsEventTone: Same<StateTone, EventTone> = true;
const variantIsBadgeVariant: StateVariant extends NonNullable<Parameters<typeof Badge>[0]["variant"]> ? true : false = true;
const surfaceKeysAreStates: SurfaceImportStatus["labelKey"] extends StateKey ? true : false = true;

describe("STATE", () => {
  const entries = Object.entries(STATE) as [StateKey, (typeof STATE)[StateKey]][];

  it("타입 어휘가 EventTone·Badge variant·표면 상태 키와 맞는다", () => {
    expect([toneIsEventTone, variantIsBadgeVariant, surfaceKeysAreStates]).toEqual([true, true, true]);
  });

  it.each(entries)("%s의 낱말은 사전 값이다", (_key, row) => {
    expect(dictionaryStrings(m).has(row.label)).toBe(true);
  });

  /** 붉은 면 없는 글자(`danger` variant)는 소비자가 사라진 언어 하나라 지웠다(D3②) — danger 톤은 언제나 `missing` 면이다. */
  it.each(entries.filter(([, row]) => row.tone === "danger"))("danger 톤 %s → missing variant", (_key, row) => {
    expect(row.variant).toBe("missing");
  });

  it.each(entries)("%s의 variant가 톤과 맞는다", (_key, row) => {
    const allowed: Record<StateTone, readonly StateVariant[]> = { success: ["success"], warning: ["warning"], danger: ["missing"], muted: ["neutral", "muted"] };
    expect(allowed[row.tone]).toContain(row.variant);
  });

  /** 무색 배지는 면(`neutral`)이다(Q3) — 글자만(`muted`: Superseded·Unavailable)은 소비자가 이 표를 읽지 않아 행이 없다(T29에서 걷었다). */
  it("무색 상태 배지는 면을 든다", () => {
    expect(STATE.unsent.variant).toBe("neutral");
    expect(entries.filter(([, row]) => row.variant === "muted")).toEqual([]);
  });

  it("같은 상태 낱말이 DESIGN §2.4와 같다", () => {
    expect(STATE.syncFailed.label).toBe("Sync failed");
    expect(STATE.partiallySynced.label).toBe("Partially synced");
    expect(STATE.disconnected.label).toBe("Disconnected");
    expect(STATE.held.label).toBe("Held");
    expect(STATE.unsent.label).toBe("Unsent");
  });
});

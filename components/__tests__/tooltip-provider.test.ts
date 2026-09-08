import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * **`Tooltip`은 Provider 없이도 던지지 않아야 한다.**
 *
 * Radix의 `Tooltip.Root`는 `useTooltipProviderContext`를 부르고, `@radix-ui/react-context`는 provider가
 * 없으면 **예외를 던진다**(``must be used within`` — 실측). 사이드바는 **접힌 상태에서만** 툴팁을
 * 렌더하므로, provider를 안 걸면 "사이드바 접기"를 누르는 순간 셸이 통째로 죽는다. 더 나쁜 것은
 * 접힘이 `localStorage`에 남는다는 것이다 — 다음 방문에도 같은 자리에서 죽어 **사용자가 스스로 빠져나올
 * 수 없다.**
 *
 * 그래서 호출부가 provider를 기억하는 것에 기대지 않고 **프리미티브가 스스로 든다.** 공유 지연이
 * 필요한 자리는 바깥에 `TooltipProvider`를 한 번 더 걸면 되고(Radix는 중첩을 허용한다), 잊어도 죽지 않는다.
 *
 * 렌더 테스트를 두지 않는 리포라(design §4) 소스로 센다.
 */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

const source = readFileSync(join(ROOT, "components/ui/tooltip.tsx"), "utf8");

describe("Tooltip은 자기 provider를 든다", () => {
  it("`Tooltip` 안에서 Provider를 렌더한다", () => {
    const body = source.slice(source.indexOf("export function Tooltip"));
    expect(body).toMatch(/<Primitive\.Provider/);
  });

  it("Provider가 Root를 감싼다 — 순서가 뒤집히면 같은 예외다", () => {
    const body = source.slice(source.indexOf("export function Tooltip"));
    expect(body.indexOf("<Primitive.Provider")).toBeLessThan(body.indexOf("<Primitive.Root"));
  });

  it("공유 지연용 `TooltipProvider`는 그대로 내보낸다 — 셸이 바깥에 한 번 더 걸 수 있다", () => {
    expect(source).toMatch(/export const TooltipProvider/);
  });
});

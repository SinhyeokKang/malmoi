import type { ReactNode } from "react";
import { describe, expectTypeOf, it } from "vitest";

import type { Messages } from "@/lib/i18n";
import { en } from "@/messages/en";

/**
 * `Messages`는 ko·es 사전이 `satisfies`로 맞출 **모양**이다 — en은 `as const`라 값이 리터럴 타입(`"Search"`)이고, 그대로면
 * 번역 사전이 통과할 수 없다. 그래서 문자열·숫자·불리언 리터럴만 넓히고 키·중첩·함수 인자는 그대로 둔다.
 * ⚠️ **이 파일의 단언은 `pnpm typecheck`가 판정한다** — `expectTypeOf`는 런타임에 아무것도 하지 않는다.
 */
describe("Messages", () => {
  it("문자열 리터럴이 string으로 넓어진다", () => {
    expectTypeOf<Messages["search"]["label"]>().toEqualTypeOf<string>();
    expectTypeOf<Messages["search"]["groups"]>().toEqualTypeOf<{ readonly projects: string; readonly pages: string; readonly keys: string; readonly docs: string }>();
  });

  it("튜플은 길이를 지키고 원소만 넓어진다", () => {
    expectTypeOf<Messages["landing"]["hero"]["title"]>().toEqualTypeOf<readonly [string, string]>();
  });

  it("함수 값은 인자를 지키고 문자열 반환만 넓어진다", () => {
    expectTypeOf<Messages["landing"]["hero"]["latest"]>().toEqualTypeOf<(version: string) => string>();
  });

  it("en은 Messages에 대입된다 — 영어 고정 네임스페이스를 더 가질 뿐이다", () => {
    expectTypeOf(en).toExtend<Messages>();
  });

  it("영어 고정 네임스페이스(mcp·seo·crash·publicDocs.privacy)가 빠지고 publicDocs의 나머지는 남는다", () => {
    expectTypeOf<Messages>().not.toHaveProperty("mcp");
    expectTypeOf<Messages>().not.toHaveProperty("seo");
    expectTypeOf<Messages>().not.toHaveProperty("crash");
    expectTypeOf<Messages["publicDocs"]>().not.toHaveProperty("privacy");
    expectTypeOf<Messages["publicDocs"]["effectiveDate"]>().toEqualTypeOf<string>();
    expectTypeOf<Messages>().toHaveProperty("translations");
  });

  it("ReactNode를 돌려주는 함수는 그 반환형을 망가뜨리지 않는다 — ReactElement 구조를 매핑하지 않는다", () => {
    expectTypeOf<Messages["repositorySync"]["body"]>().toEqualTypeOf<(branch: ReactNode) => ReactNode>();
  });
});

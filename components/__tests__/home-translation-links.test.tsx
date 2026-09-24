// @vitest-environment jsdom
import { expect, it } from "vitest";
import { CountCards } from "@/components/home/count-cards";
import type { HomeCard } from "@/lib/home/cards";
import { render } from "./helpers/dom";

/**
 * **Home의 번역 링크가 표면 경로를 직접 가리킨다** (audit-ux #4b). 옛 `routes.translations`는 기본 표면으로 redirect하는
 * 공가 라우트라, 카드를 누를 때마다 서버 왕복이 하나 더 붙고 그 동안 화면에 아무 표시가 없었다.
 *
 * ⚠️ **요청값은 그대로 싣는다** — 카드의 수는 프로젝트 전체라 `scope=project`이고, 미번역은 완성도 축이다
 * (`count-cards.tsx`의 `cardQuery`).
 */
const card = (key: HomeCard["key"]): HomeCard => ({ key, value: 1, unit: "cells", muted: false, tone: null, subline: { kind: "nothingPending" } });
const cards = (["newFromGithub", "toTranslate", "toReview", "toSend"] as const).map(card);

it("카드 넷이 기본 표면의 번역 화면을 요청값과 함께 가리킨다", async () => {
  const { container } = await render(<CountCards cards={cards} slug="acme" surfaceSlug="web" now={new Date()} />);
  expect([...container.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual([
    "/projects/acme/surfaces/web/translations?ns=*&scope=project&state=new",
    "/projects/acme/surfaces/web/translations?ns=*&scope=project&completion=incomplete",
    "/projects/acme/surfaces/web/translations?ns=*&scope=project&state=review",
    "/projects/acme/surfaces/web/translations?ns=*&scope=project&state=unsent",
  ]);
});

it("기본 표면이 없으면 옛 경로로 남는다 — 그 라우트가 없는 표면을 말한다", async () => {
  const { container } = await render(<CountCards cards={[card("toSend")]} slug="acme" surfaceSlug={null} now={new Date()} />);
  expect(container.querySelector("a")?.getAttribute("href")).toMatch(/^\/projects\/acme\/translations\?/);
});

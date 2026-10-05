// @vitest-environment jsdom
import { expect, it } from "vitest";
import { CountCards } from "@/components/home/count-cards";
import type { HomeCard } from "@/lib/home/cards";
import { render } from "./helpers/dom";
import { en } from "@/messages/en";

/**
 * **Home의 번역 링크가 표면 경로를 직접 가리킨다** (audit-ux #4b). 옛 `routes.translations`는 기본 표면으로 redirect하는
 * 공가 라우트라, 카드를 누를 때마다 서버 왕복이 하나 더 붙고 그 동안 화면에 아무 표시가 없었다.
 *
 * ⚠️ **요청값은 그대로 싣는다** — 미번역은 `Incomplete`, 나머지는 그 Status다(`count-cards.tsx`의 `cardQuery`). 착지 소스는 카드마다 그 수가 있는
 * 첫 소스다(`surfaceSlugs` — translation-tree-range §5). ⚠️ `ns=*`는 남는다(POSTMORTEM 2026-09-15).
 */
const card = (key: HomeCard["key"]): HomeCard => ({ key, value: 1, unit: "cells", muted: false, tone: null, subline: { kind: "nothingPending" } });
const cards = (["newFromGithub", "toTranslate", "toReview", "toSend"] as const).map(card);

const web = { newFromGithub: "web", toTranslate: "web", toReview: "web", toSend: "web" } as const;

it("카드 넷이 표면의 번역 화면을 요청값과 함께 가리킨다", async () => {
  const { container } = await render(<CountCards cards={cards} slug="acme" surfaceSlugs={web} now={new Date()} uiLocale="en" m={en} />);
  expect([...container.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual([
    "/projects/acme/surfaces/web/translations?ns=*&state=new",
    "/projects/acme/surfaces/web/translations?ns=*&completion=incomplete",
    "/projects/acme/surfaces/web/translations?ns=*&state=review",
    "/projects/acme/surfaces/web/translations?ns=*&state=unsent",
  ]);
});

it("기본 표면이 없으면 옛 경로로 남는다 — 그 라우트가 없는 표면을 말한다", async () => {
  const { container } = await render(<CountCards cards={[card("toSend")]} slug="acme" surfaceSlugs={{ ...web, toSend: null }} now={new Date()} uiLocale="en" m={en} />);
  expect(container.querySelector("a")?.getAttribute("href")).toMatch(/^\/projects\/acme\/translations\?/);
});

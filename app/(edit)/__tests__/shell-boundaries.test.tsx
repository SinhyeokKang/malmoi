// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { m } from "@/lib/i18n";

import ShellError from "../error";
import ProjectNotFound from "../projects/[slug]/not-found";
import SurfaceNotFound from "../projects/[slug]/surfaces/[surfaceSlug]/not-found";

/**
 * **셸 안 경계는 한 형이다** (malmoi#162) — 본문(`PanelBody`) 안에서 빈 상태가 **세로 중앙**에 선다(`ProjectArchived`와 같은 형 —
 * `EmptyState`는 표 안에서도 쓰여 스스로 중앙을 잡지 않는다). not-found 둘은 맨 `EmptyState`라 패널 맨 위에 붙었다.
 * ⚠️ not-found는 `[slug]/layout`의 `ContentPanel` **안**에서 그려진다 — 여기서 한 겹 더 두면 `<main>`이 둘이다. 셸 오류 경계는
 * 그 레이아웃 밖(`(edit)`)이라 자기 `ContentPanel`을 든다.
 */
const shape = (html: string) => {
  const host = new DOMParser().parseFromString(html, "text/html").body;
  const title = [...host.querySelectorAll("p, h1, h2, h3")].find(node => node.textContent?.length);
  const centre = title?.closest(".flex-1.items-center.justify-center");
  return { mains: host.querySelectorAll("main").length, centred: centre !== null && centre !== undefined, body: centre?.parentElement?.className.includes("min-h-full") ?? false };
};

it.each([
  ["프로젝트 not-found", () => <ProjectNotFound />, m.notFound.title, 0],
  ["표면 not-found", () => <SurfaceNotFound />, m.surfaces.missingTitle, 0],
  ["셸 오류 경계", () => <ShellError error={new Error("x")} retry={() => {}} />, m.crash.title, 1],
] as const)("%s — PanelBody 안에서 세로 중앙이다", (_, view, title, mains) => {
  const html = renderToStaticMarkup(view());
  expect(html).toContain(title);
  expect(shape(html)).toEqual({ mains, centred: true, body: true });
});

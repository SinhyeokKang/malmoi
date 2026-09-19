// @vitest-environment jsdom
import { expect, it } from "vitest";

import { PublicDoc } from "@/components/public-doc";

import { render, find } from "./helpers/dom";

const sections = [
  { id: "what-we-collect", heading: "What we collect", blocks: [{ p: "Your email address." }] },
  {
    id: "workflow",
    heading: "Workflow",
    blocks: [{ p: "Add the step to your workflow file." }, { ul: ["pnpm/action-setup", "actions/checkout"] }],
  },
];

/**
 * ⚠️ **셸 안에서 `/docs`로 들어오는 길이 있다** (사이드바 `CircleHelp`, DESIGN §6.5) — 그 사람에게
 * "Back to sign in"만 주면 나가는 길이 로그아웃처럼 보인다. 짝으로 센다: 비로그인은 `/signin`이다.
 */
it("복귀 링크가 세션으로 갈린다", async () => {
  const signedIn = await render(<PublicDoc title="Docs" sections={sections} signedIn />);
  const signedOut = await render(<PublicDoc title="Docs" sections={sections} signedIn={false} />);

  expect(find<HTMLAnchorElement>(signedIn.container, "main > a").getAttribute("href")).toBe("/projects");
  expect(find<HTMLAnchorElement>(signedOut.container, "main > a").getAttribute("href")).toBe("/signin");
});

/**
 * ⚠️ **`id`가 사전의 데이터다** — 설정 화면이 `/docs#workflow`로 절을 직접 가리킨다
 * (launch-readiness L2.3). 제목에서 파생하면 문구를 고치는 순간 남의 링크가 죽는다.
 */
it("절이 id를 가진 h2로 선다", async () => {
  const { container } = await render(<PublicDoc title="Privacy Policy" sections={sections} signedIn={false} />);

  expect(find(container, "h1").textContent).toBe("Privacy Policy");
  const headings = [...container.querySelectorAll("h2")].map((h) => h.id);
  expect(headings).toEqual(["what-we-collect", "workflow"]);
});

it("블록이 문단과 목록 둘이다", async () => {
  const { container } = await render(<PublicDoc title="Docs" sections={sections} signedIn={false} />);

  const items = [...container.querySelectorAll("ul > li")].map((li) => li.textContent);
  expect(items).toEqual(["pnpm/action-setup", "actions/checkout"]);
  expect(container.querySelectorAll("p").length).toBe(2);
});

/**
 * ⚠️ **`text-muted-foreground`는 라벨의 색이지 본문의 색이 아니다** (DESIGN §6.61) — 화면이 통째로
 * 그 색이면 읽으라고 만든 글이 부차적으로 보인다. placeholder 시절의 색이 그것이었다.
 */
it("본문이 보조 색이 아니고 장문 행간을 쓴다", async () => {
  const { container } = await render(<PublicDoc title="Docs" sections={sections} signedIn={false} />);
  const body = find<HTMLElement>(container, "p");

  expect(body.className).not.toContain("text-muted-foreground");
  expect(body.className).toContain("leading-6");
});

/**
 * ⚠️ **사전은 잎이라 컴포넌트를 import할 수 없다** — `<a>`가 맨몸으로 오므로 래퍼의 `[&_a]:`가
 * 색을 건다. 밑줄은 2026-09-10에 전역으로 걷었다 (DESIGN §6.3).
 */
it("본문 안 링크가 파랑이고 밑줄이 없다", async () => {
  const { container } = await render(
    <PublicDoc
      title="Privacy Policy"
      sections={[{ id: "contact", heading: "Contact", blocks: [{ p: <a href="mailto:x@y.z">Email us</a> }] }]}
      signedIn={false}
    />,
  );
  const section = find<HTMLElement>(container, "section");

  expect(section.className).toContain("[&_a]:text-blue-600");
  expect(container.innerHTML).not.toContain("underline");
});

/**
 * ⚠️ **placeholder는 `justify-center`였다** — 한 문단일 때만 참이고, 절이 여럿이면 첫 화면이 문서
 * 중간부터 시작한다 (DESIGN §6.61).
 */
it("세로 중앙 정렬을 쓰지 않는다", async () => {
  const { container } = await render(<PublicDoc title="Docs" sections={sections} signedIn={false} />);

  expect(find<HTMLElement>(container, "main").className).not.toContain("justify-center");
});

/** 도입 문단은 절 밖에서 제목 바로 아래 선다 — 없으면 아무것도 그리지 않는다. */
it("도입 문단은 선택이다", async () => {
  const withIntro = await render(
    <PublicDoc title="Docs" intro="How malmoi works." sections={sections} signedIn={false} />,
  );
  const without = await render(<PublicDoc title="Docs" sections={sections} signedIn={false} />);

  expect(find(withIntro.container, "h1 + p").textContent).toBe("How malmoi works.");
  expect(without.container.querySelector("h1 + p")).toBeNull();
});

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

/**
 * ⚠️ **법적 문서라 시행일이 제목 바로 아래다** (DESIGN §6.61) — 사전이 든 `"2026-09-19"`를 그대로
 * 보이고 같은 문자열을 `dateTime`에 넣는다. 날짜 포맷터를 새로 만들지 않는 것이 결정 4다.
 */
it("시행일이 라벨과 함께 time으로 선다", async () => {
  const { container } = await render(
    <PublicDoc title="Privacy Policy" effectiveDate="2026-09-19" intro="What malmoi stores." sections={sections} signedIn={false} />,
  );
  const time = find<HTMLTimeElement>(container, "time");

  expect(time.getAttribute("datetime")).toBe("2026-09-19");
  expect(time.textContent).toBe("2026-09-19");
  // 라벨이 없으면 날짜만 떠서 무슨 날짜인지 알 수 없다 — 존재만 보면 그 누락을 못 잡는다.
  expect(find<HTMLElement>(container, "h1 + *").textContent).toBe("Effective date 2026-09-19");
});

/** 짝 — `/docs`는 시행일을 쓰지 않는다 (결정 2). 자리만 있고 아무것도 그리지 않는다. */
it("시행일이 없으면 아무것도 그리지 않는다", async () => {
  const { container } = await render(<PublicDoc title="Docs" intro="How malmoi works." sections={sections} signedIn={false} />);

  expect(container.querySelector("time")).toBeNull();
  expect(container.textContent).not.toContain("Effective date");
  expect(find(container, "h1 + p").textContent).toBe("How malmoi works.");
});

const collected = {
  id: "collected",
  heading: "What we collect",
  blocks: [
    {
      table: {
        label: "What malmoi stores about you",
        head: ["What", "Why", "How long"],
        rows: [
          ["Your email address", "Sign-in", "Until you ask us to delete it"],
          ["Session", "Keeping you signed in", "24 hours"],
        ],
      },
    },
  ],
};

/**
 * ⚠️ **표의 접근 이름이 필수다** — 한 페이지에 표가 둘이라 없으면 스크린리더 목록에 "table"만 둘
 * 뜬다. `TableCaption`이 이 리포에 없어 `aria-label`로 건다 (design §1 b).
 */
it("표가 머리·본문으로 서고 열 머리에 scope가 붙는다", async () => {
  const { container } = await render(<PublicDoc title="Privacy Policy" sections={[collected]} signedIn={false} />);

  const heads = [...container.querySelectorAll("thead th")];
  expect(heads.map((th) => th.textContent)).toEqual(["What", "Why", "How long"]);
  expect(heads.every((th) => th.getAttribute("scope") === "col")).toBe(true);
  expect(container.querySelectorAll("tbody tr").length).toBe(2);
});

it("표 래퍼가 키보드로 가로 스크롤되는 region이다", async () => {
  const { container } = await render(<PublicDoc title="Privacy Policy" sections={[collected]} signedIn={false} />);
  const region = find<HTMLElement>(container, "[role=region]");

  expect(region.getAttribute("aria-label")).toBe("What malmoi stores about you");
  expect(region.tabIndex).toBe(0);
  expect(region.className).toContain("overflow-auto");
});

/**
 * ⚠️ **`Th`가 아니라 `TableHead`다** (design §1 b) — `Th`의 `bg-muted/50` + `text-foreground/60`은
 * DESIGN §2.2·§7에 AA 미달로 이미 등재된 조합이고, sticky는 스크롤 컨테이너가 표 자신뿐이라 무의미하다.
 */
it("헤더가 불투명하고 행에 hover 강조가 없다", async () => {
  const { container } = await render(<PublicDoc title="Privacy Policy" sections={[collected]} signedIn={false} />);

  expect(find<HTMLElement>(container, "thead th").className).not.toContain("/50");
  expect(find<HTMLElement>(container, "thead th").className).not.toContain("sticky");
  // `cn`이 프리미티브의 `hover:bg-muted/50`을 지우고 투명이 남는다 — 지워졌는지를 짝으로 센다.
  expect(find<HTMLElement>(container, "tbody tr").className).toContain("hover:bg-transparent");
  expect(find<HTMLElement>(container, "tbody tr").className).not.toContain("hover:bg-muted");
});

/** 헤더 수와 행의 셀 수가 갈리면 열이 밀린다 — 픽스처로 그 형을 고정한다(실물 대조는 P4.3). */
it("행의 셀 수가 헤더 수와 같다", async () => {
  const { container } = await render(<PublicDoc title="Privacy Policy" sections={[collected]} signedIn={false} />);

  const columns = container.querySelectorAll("thead th").length;
  for (const row of container.querySelectorAll("tbody tr")) expect(row.querySelectorAll("td").length).toBe(columns);
});

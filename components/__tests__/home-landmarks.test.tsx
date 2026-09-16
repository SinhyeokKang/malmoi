// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { AttentionCard } from "@/components/home/attention-card";
import { LogsCard } from "@/components/home/logs-card";
import { MetaColumn } from "@/components/home/meta-column";
import { render } from "./helpers/dom";

/**
 * **접근성 트리에만 나타나는 회귀를 고정한다** (`/design-sync` 6단계 — 2026-09-15 CDP 실측이 잡은 것).
 *
 * ⚠️ **`<section>`은 접근 이름이 있을 때만 `region` 랜드마크다.** 없으면 Chrome이 `generic`으로 접어
 * 그 블록이 접근성 트리에서 통째로 사라지는데, **화면은 똑같고** jsdom의 스냅샷도 똑같다. 2026-09-13에
 * `role="combobox"`의 접근 이름이 빈 문자열이 된 것과 같은 축이고, 그때도 이름을 단언하는 테스트가
 * 하나도 없었다.
 *
 * ⚠️ **jsdom은 accname을 계산하지 않는다** — 그래서 이름 문자열이 아니라 **배선**(`aria-labelledby`가
 * 실재하는 id를 가리키나)을 센다. 실제 이름은 CDP로 쟀고 그 값은 `docs/DESIGN.md`에 있다.
 */

const now = new Date("2026-09-15T12:00:00Z");
const empty = { shown: [], more: [], count: 0 };

/** `aria-labelledby`가 가리키는 id가 그 트리 안에 실재하나 — 끊긴 참조는 이름을 **비운다**. */
function labelledBy(root: HTMLElement, selector: string): string | null {
  const node = root.querySelector(selector);
  const id = node?.getAttribute("aria-labelledby");
  if (id === null || id === undefined) return null;
  return root.querySelector(`#${id}`)?.textContent ?? null;
}

describe("Home의 블록 셋이 이름 있는 랜드마크다", () => {
  it("`Needs your attention`이 자기 제목으로 이름을 든다", async () => {
    const { container } = await render(<AttentionCard items={empty} slug="acme" state="default" now={now} />);
    expect(labelledBy(container, "section")).toContain("Needs your attention");
  });

  it("`Recent logs`가 자기 제목으로 이름을 든다", async () => {
    const { container } = await render(<LogsCard items={[]} slug="acme" now={now} syncedBefore />);
    expect(labelledBy(container, "section")).toContain("Recent logs");
  });

  it("`Project` 메타 열이 `complementary`이고 이름을 든다", async () => {
    const { container } = await render(
      <MetaColumn slug="acme" now={now} canOpenSettings rows={[{ kind: "branch", branch: "main" }]} />,
    );
    expect(container.querySelector("aside")).not.toBeNull();
    expect(labelledBy(container, "aside")).toContain("Project");
  });
});

/**
 * ⚠️ **항목 목록이 `<ul>`이어야 한다** — 2026-09-13에 `asChild`가 list role을 덮어써 `<li>`가 고아가
 * 된 적이 있다. 시각은 같고 접근성 트리에만 나타난다.
 */
describe("목록 시맨틱", () => {
  const item = {
    kind: "review" as const,
    at: new Date("2026-09-15T10:00:00Z"),
    surfaceSlug: "web",
    code: "ja",
    name: "Japanese",
    count: 8,
    who: "Kim",
  };

  it("항목이 `<ul> > <li>`로 선다", async () => {
    const { container } = await render(
      <AttentionCard items={{ shown: [item], more: [], count: 1 }} slug="acme" state="default" now={now} />,
    );
    expect(container.querySelector("section > ul > li > a")).not.toBeNull();
  });

  /** ⚠️ **꼬리 절이 굵은 조각과 갈려야 한다** — 색이 아니라 무게로 가르는 것이 이 행의 규칙이다. */
  it("둘째 줄이 굵은 조각 + 문장으로 갈린다", async () => {
    const { container } = await render(
      <AttentionCard items={{ shown: [item], more: [], count: 1 }} slug="acme" state="default" now={now} />,
    );
    const strong = container.querySelector("a span.font-medium");
    expect(strong?.textContent).toContain("waiting for review");
    expect(container.querySelector("a")?.textContent).toContain("last edited in this locale by Kim");
  });

  it("`+n more`가 `<details>`다 — 클라이언트 상태를 만들지 않는다", async () => {
    const { container } = await render(
      <AttentionCard items={{ shown: [item], more: [{ ...item, code: "fr", name: "French" }], count: 2 }} slug="acme" state="default" now={now} />,
    );
    expect(container.querySelector("details > summary")).not.toBeNull();
    expect(container.querySelector("details > ul > li")).not.toBeNull();
  });
});

/**
 * **외부 링크 글리프는 PR 번호에만 붙는다** (2026-09-16 사용자 판정).
 *
 * ⚠️ **두 정본이 같은 답을 준다.** `design_handoff_project_home`의 lucide 목록에 `external-link`가
 * 없고 `2a`는 *"리포 주소와 PR 번호만 링크"*라고만 적는다. `docs/DESIGN.md` §6.3이 글리프를 다는
 * 외부 링크를 **이름으로 여덟** 열거하는데 거기에 **"Home의 PR 링크"는 있고 리포 링크는 없다** —
 * 리포 행의 글리프는 어느 정본에도 근거가 없이 붙어 있었다.
 *
 * ⚠️ **비대칭을 센다** — "글리프가 없다"만 세면 PR 행에서 글리프가 사라져도 green이고, 그것은
 * §6.3을 깨는 회귀다. 한 검사가 둘을 함께 들어야 다음 사람이 한쪽만 고치지 못한다.
 */
describe("메타 열 — 외부 링크 글리프", () => {
  const at = new Date("2026-09-14T12:00:00Z");

  it("리포 행은 글리프 없이 링크이고 PR 행은 글리프를 든다", async () => {
    const { container } = await render(
      <MetaColumn
        slug="acme"
        now={now}
        canOpenSettings
        rows={[
          { kind: "repository", owner: "acme", name: "web", href: "https://github.com/acme/web", disconnected: false },
          { kind: "lastPublish", at, prUrl: "https://github.com/acme/web/pull/127" },
        ]}
      />,
    );
    const links = [...container.querySelectorAll("a[target=_blank]")];
    const repo = links.find((a) => (a.textContent ?? "").includes("acme/web"));
    const pr = links.find((a) => a.getAttribute("href")?.includes("/pull/"));
    expect(repo).toBeDefined();
    expect(pr).toBeDefined();
    expect(repo?.querySelector("svg")).toBeNull();
    expect(pr?.querySelector("svg")).not.toBeNull();
  });
});

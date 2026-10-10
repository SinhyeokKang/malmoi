// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MemberRow } from "@/components/members/member-row";
import { planMemberIdentity } from "@/lib/auth/member-identity";
import { en } from "@/messages/en";

import { find, render } from "./helpers/dom";

/**
 * **멤버·대기 초대 행의 좁은 폭 적층** (responsive-app A5 · 시안 AT2 "같은 패턴"). 카드 목록(`CardList`의 `@container`)이 640
 * 미만이면 이름 300 고정이 유동이 되고, 날짜·역할·행 동작은 아래 줄로 내려가며 동작은 오른쪽이다 — 숨기지 않는다.
 *
 * ⚠️ **jsdom은 컨테이너 쿼리를 못 잰다** — 클래스 계약과 DOM 순서를 단언한다. 적층은 DOM 순서이고 CSS `order`·두 벌 렌더는 0이다
 * (DESIGN §7 · malmoi#82). 선언(`CardList`)과 질의(행)는 다른 요소다(POSTMORTEM 2026-09-15).
 */
// jsdom 환경에서는 `import.meta.url`이 file 스킴이 아니다 — 리포 루트에서 돈다.
const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const identity = planMemberIdentity(en, { name: "Jane Very-Long-Name", emailLabel: "j***@a-very-long-company-domain.example.com", readable: true });

async function row() {
  const { container } = await render(
    <ul className="@container">
      <li>
        <MemberRow id="u1" identity={identity} meta={<span data-meta>meta</span>} controls={() => <button type="button">Remove</button>} />
      </li>
    </ul>,
  );
  return container;
}

describe("MemberRow — 640 미만 두 줄", () => {
  it("행이 좁은 폭에서 grid가 되고 이름은 유동 폭으로 첫 줄 전체를 쓴다", async () => {
    const container = await row();
    const line = find<HTMLElement>(container, "li > div");
    expect(line.className).toMatch(/@max-form:grid\b/);
    const name = find<HTMLElement>(container, "[data-name]");
    expect(name.className).toMatch(/\bw-\[300px\]/);
    expect(name.className).toMatch(/@max-form:w-auto\b/);
    expect(name.className).toMatch(/@max-form:col-span-2\b/);
  });

  it("메타·동작은 한 묶음으로 이름 아래 줄에 서고 넓은 폭에서는 `contents`라 기존 한 줄 배치 그대로다", async () => {
    const container = await row();
    const aside = find<HTMLElement>(container, "[data-row-aside]");
    expect(aside.className).toMatch(/(^|\s)contents\b/);
    expect(aside.className).toMatch(/@max-form:col-start-2\b/);
    expect(aside.className).toMatch(/@max-form:flex\b/);
    expect(aside.querySelector("[data-meta]")).not.toBeNull();
    expect(aside.querySelector("button")?.textContent).toBe("Remove");
  });

  it("DOM 순서가 글리프 → 이름 → 메타 → 동작이고 `order`가 없다", async () => {
    const container = await row();
    const line = find<HTMLElement>(container, "li > div");
    const order = [...line.querySelectorAll("[data-avatar], [data-name], [data-meta], button")].map((node) =>
      node.matches("[data-avatar]") ? "glyph" : node.matches("[data-name]") ? "name" : node.matches("[data-meta]") ? "meta" : "action",
    );
    expect(order).toEqual(["glyph", "name", "meta", "action"]);
    expect(line.outerHTML).not.toMatch(/\border-/);
  });

  it("잘리는 이름·주소는 좁은 폭에서 감긴다 — `title` 없이 전문이 보인다", async () => {
    const container = await row();
    for (const selector of ["[data-primary]", "[data-secondary]"]) {
      const node = find<HTMLElement>(container, selector);
      expect(node.className).toMatch(/@max-form:whitespace-normal\b/);
      expect(node.className).toMatch(/@max-form:wrap-anywhere/);
    }
  });
});

describe("소비자 — 고정 열이 좁은 폭에서 풀린다", () => {
  it("가입일·만료 150은 좁은 폭에서 내용 폭이다", () => {
    for (const file of ["components/members/member-list.tsx", "components/members/pending-invitations.tsx"]) {
      expect(read(file)).toMatch(/w-\[150px\] shrink-0 @max-form:w-auto/);
    }
  });

  it("초대한 사람 칸은 `title`만으로 전문을 주지 않는다 — 좁은 폭에서 감긴다", () => {
    const pending = read("components/members/pending-invitations.tsx");
    expect(pending).toMatch(/min-w-0 truncate text-xs @max-form:whitespace-normal @max-form:wrap-anywhere/);
  });
});

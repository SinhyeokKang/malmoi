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
    expect(line.className).toMatch(/@max-4xl:grid\b/);
    const name = find<HTMLElement>(container, "[data-name]");
    expect(name.className).toMatch(/\bw-\[300px\]/);
    expect(name.className).toMatch(/@max-4xl:w-auto\b/);
    expect(name.className).toMatch(/@max-4xl:col-span-2\b/);
  });

  it("메타·동작은 한 묶음으로 이름 아래 줄에 서고 넓은 폭에서는 `contents`라 기존 한 줄 배치 그대로다", async () => {
    const container = await row();
    const aside = find<HTMLElement>(container, "[data-row-aside]");
    expect(aside.className).toMatch(/(^|\s)contents\b/);
    expect(aside.className).toMatch(/@max-4xl:col-start-2\b/);
    expect(aside.className).toMatch(/@max-4xl:flex\b/);
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
      expect(node.className).toMatch(/@max-4xl:whitespace-normal\b/);
      expect(node.className).toMatch(/@max-4xl:wrap-anywhere/);
      // 카드 640 이상이어도 터치 포인터면 감긴다(orch O18 · spec A-06 "터치에서도") — 마우스 배치는 그대로 말줄임 + `title`이다.
      expect(node.className).toMatch(/\bpointer-coarse:whitespace-normal\b/);
      expect(node.className).toMatch(/\bpointer-coarse:wrap-anywhere\b/);
    }
  });
});

describe("소비자 — 고정 열이 좁은 폭에서 풀린다", () => {
  it("가입일·만료 150은 좁은 폭에서 내용 폭이다", () => {
    for (const file of ["components/members/member-list.tsx", "components/members/pending-invitations.tsx"]) {
      expect(read(file)).toMatch(/w-\[150px\] shrink-0 @max-4xl:w-auto/);
    }
  });

  it("초대한 사람 칸은 `title`만으로 전문을 주지 않는다 — 좁은 폭에서 감긴다", () => {
    const pending = read("components/members/pending-invitations.tsx");
    expect(pending).toMatch(/min-w-0 truncate text-xs @max-4xl:whitespace-normal @max-4xl:wrap-anywhere pointer-coarse:whitespace-normal pointer-coarse:wrap-anywhere/);
  });
});

/**
 * **640~760 구간 — 한 줄 배치가 카드를 넘지 않는다** (malmoi#233). 넓은 한 줄은 이름 300 `shrink-0`이라 약 761을 요구해 1024 + LNB 240(카드 ≈724)에서
 * 역할 Select·Remove가 카드 밖으로 잘렸다. 이름 칸이 300을 상한으로 **줄어든다**(`shrink` + `min-w-0`, 말줄임) — 1280은 300 그대로다.
 * 메타·동작은 줄지 않는다(가입일·만료 150, 동작 묶음). 골격도 같다(A-09). jsdom은 폭을 못 재 클래스 계약이다.
 */
describe("640 이상 한 줄 — 이름 칸만 줄어든다", () => {
  const tokens = (node: Element) => node.className.split(/\s+/);

  it("이름 칸은 300 상한으로 줄고, 동작 묶음은 줄지 않는다", async () => {
    const container = await row();
    const name = tokens(find(container, "[data-name]"));
    for (const cls of ["w-[300px]", "min-w-0", "shrink"]) expect(name, cls).toContain(cls);
    expect(name).not.toContain("shrink-0");
    const actions = find(container, "[data-row-aside] > span:last-child");
    expect(tokens(actions)).toContain("shrink-0");
  });

  it("멤버 골격의 이름 칸도 같은 규칙이다", () => {
    const loading = read("app/(edit)/projects/[slug]/members/loading.tsx");
    expect(loading).toMatch(/flex w-\[300px\] min-w-0 shrink flex-col gap-0\.5/);
    expect(loading).not.toMatch(/w-\[300px\] min-w-0 shrink-0/);
  });
});

/**
 * **좁은 폭 — 동작 묶음이 그릇을 넘지 않고 감긴다** (malmoi#237). 대기 초대의 동작 묶음(잠긴 역할 칩 132 + Resend + Revoke ≈299)은 `flex-wrap`을
 * 가졌지만 `shrink-0`이라 375 카드(323)에서 감기지 않고 Revoke가 잘렸다. 640 미만에서만 줄어들 수 있고(`shrink` · `min-w-0` · `max-w-full`)
 * 그 안에서 오른쪽 정렬로 감긴다 — DOM 순서 그대로, 넓은 폭(`shrink-0`)은 불변. 골격도 같다(A-09).
 */
describe("640 미만 — 동작 묶음 감김", () => {
  const tokens = (node: Element) => node.className.split(/\s+/);

  it("동작 묶음이 좁은 폭에서 줄어들 수 있고 감긴다", async () => {
    const container = await row();
    const actions = tokens(find(container, "[data-row-aside] > span:last-child"));
    for (const cls of ["shrink-0", "@max-4xl:shrink", "@max-4xl:min-w-0", "@max-4xl:max-w-full", "@max-4xl:flex-wrap", "@max-4xl:justify-end"]) {
      expect(actions, cls).toContain(cls);
    }
  });

  it("멤버 골격의 동작 묶음도 같은 규칙이다", () => {
    const loading = read("app/(edit)/projects/[slug]/members/loading.tsx");
    expect(loading).toMatch(/ml-auto flex shrink-0 items-center gap-2 @max-4xl:shrink @max-4xl:min-w-0 @max-4xl:max-w-full @max-4xl:flex-wrap @max-4xl:justify-end/);
  });
});

/**
 * **적층 경계는 카드 896(`@max-4xl`)이다** (malmoi#238). 640 경계에서는 대기 초대 한 줄(패딩 26 + 칩 32 + 간격 64 + 이메일 ≈178 + 만료 150 +
 * 초대자 + 칩 132·Resend·Revoke ≈313 ≈ 863)이 모자라 이메일이 's***@day1c…'로 잘렸다 — 날짜·칩은 폭을 지키고 식별자만 내줬다.
 * 그보다 좁은 카드(1024 + LNB 240 ≈ 724 · 768 ≈ 716)는 두 줄 형이라 이메일이 감기며 전문이 보인다. 1280(≈982)은 한 줄 그대로다.
 * 멤버 카드도 같은 경계라 두 카드의 행이 같은 폭에서 같은 형이다. 카드 머리(`Card`)는 `@max-form` 그대로다.
 */
describe("적층 경계 — 카드 896", () => {
  it("행 껍데기·소비자·골격에 옛 640 경계가 남지 않는다", () => {
    expect(read("components/members/member-row.tsx")).not.toMatch(/@max-form:/);
    expect(read("components/members/member-list.tsx")).not.toMatch(/@max-form:/);
    expect(read("components/members/pending-invitations.tsx")).not.toMatch(/@max-form:/);
    const loading = read("app/(edit)/projects/[slug]/members/loading.tsx");
    // 카드 머리 설명 골격 하나만 `Card`의 640 규칙이다.
    expect(loading.match(/@max-form:/g)).toHaveLength(2);
    expect(loading).toMatch(/ml-auto w-72 max-w-full @max-form:ml-0 @max-form:w-full/);
  });
});

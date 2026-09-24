// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, it } from "vitest";

import { PublicDoc } from "@/components/public-doc";
import { CiCard } from "@/components/settings/ci-card";
import { MEMBER_LIMIT } from "@/lib/auth/invitation";
import { m } from "@/lib/i18n";
import { INVITATION_HOURLY_LIMIT } from "@/lib/invitation-email/limits";
import { PROJECT_LIMIT } from "@/lib/onboarding/create-plan";
import { PROJECT_SLUG_MAX } from "@/lib/onboarding/slug";
import { renderProjectWorkflowYaml } from "@/lib/onboarding/workflow";
import { SKIP_MARKER } from "@/lib/pull/payload";

import { render } from "./helpers/dom";

/**
 * **`/docs` 본문** (launch-readiness L2.3 · L2.5). 도움말이 코드와 다른 수를 말하면 그 문서는 없는 것보다
 * 나쁘다 — 상한·포맷·action 목록·마커를 **정본 상수와 대조한다**. 문구 자체는 판정하지 않는다.
 */

async function sectionText(id: string): Promise<string> {
  const { container } = await render(<PublicDoc title={m.publicDocs.docs.title} sections={m.publicDocs.docs.sections} signedIn={false} />);
  const heading = container.querySelector(`h2#${id}`);
  expect(heading, `section #${id}`).not.toBeNull();
  // 절은 `<section>` 하나다 — 제목과 본문 블록을 함께 읽는다.
  return heading!.closest("section")?.textContent ?? "";
}

it("placeholder가 아니다", () => {
  expect(m.publicDocs.docs.intro).not.toMatch(/still writing/i);
  expect(m.publicDocs.docs.sections.length).toBeGreaterThan(0);
});

it("설정 화면이 가리키는 `#workflow` 절이 있고 토큰 secret 이름과 wrapper를 말한다", async () => {
  const text = await sectionText("workflow");
  expect(text).toContain("PUSH_TOKEN");
  expect(text).toContain(".github/workflows/malmoi-i18n.yml");
  expect(text).toContain("wrapper");
});

/**
 * ⚠️ **허용 목록은 넷이다** (audit #5) — 워크플로의 두 줄(`checkout`·malmoi action)과 malmoi action **안의**
 * 두 줄. 안쪽 둘은 대상 리포 파일에 안 보여서 빠뜨리기 쉽다. 목록은 실제 `uses:`에서 읽는다.
 */
it("`#allowed-actions`가 실행에 쓰이는 action 넷을 전부 적는다", async () => {
  const text = await sectionText("allowed-actions");
  const yaml = renderProjectWorkflowYaml({ slug: "acme", baseBranch: "main", surfaces: [{ surfaceSlug: "default", adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en" }] });
  const action = readFileSync(join(process.cwd(), ".github/actions/malmoi-i18n-push/action.yml"), "utf8");
  const uses = [...`${yaml}\n${action}`.matchAll(/uses:\s*([^@\s]+)@/g)].map((match) => match[1]!);
  expect(new Set(uses).size).toBe(4);
  for (const name of uses) expect(text).toContain(name);
});

it("`#formats`가 어댑터 다섯의 이름을 전부 적는다", async () => {
  const text = await sectionText("formats");
  for (const { label } of Object.values(m.newProject.formats)) expect(text).toContain(label);
});

it("`#limits`의 수가 정본 상수와 같다", async () => {
  const text = await sectionText("limits");
  for (const n of [PROJECT_LIMIT, MEMBER_LIMIT, INVITATION_HOURLY_LIMIT, PROJECT_SLUG_MAX]) {
    expect(text).toMatch(new RegExp(`\\b${n}\\b`));
  }
});

it("`#merging`이 어느 머지 방식이든 된다고 말하고 제목 마커를 지키라고 한다", async () => {
  const text = await sectionText("merging");
  expect(text).toMatch(/merge commit/i);
  expect(text).toContain(SKIP_MARKER);
});

it("`#nightly`가 있다", async () => {
  expect(await sectionText("nightly")).toMatch(/night/i);
});

/**
 * 설정 화면 워크플로 모달의 hook 안내가 누를 수 없는 `docs/ACTIONS.md` 글자였다 — 운영 문서 경로라 제3자에게
 * 의미가 없다. 셸 안 링크 규칙(밑줄·아이콘 없음, DESIGN §6.3)으로 `/docs#workflow`를 가리킨다.
 */
it("설정 화면의 hook 안내가 `/docs#workflow`로 이어진다", async () => {
  await render(<CiCard slug="acme" archived={false} stale={[]}><p>yaml</p></CiCard>);
  const trigger = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(m.settings.ci.workflow))!;
  trigger.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const link = document.querySelector<HTMLAnchorElement>('a[href="/docs#workflow"]');
  expect(link).not.toBeNull();
  expect(document.body.textContent).not.toContain("docs/ACTIONS.md");
});

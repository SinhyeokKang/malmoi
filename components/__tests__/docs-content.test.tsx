// @vitest-environment jsdom
import { expect, it } from "vitest";

import { CiCard } from "@/components/settings/ci-card";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";

import { render } from "./helpers/dom";

/**
 * **앱 안에서 `/docs`로 가는 링크** (launch-readiness L2.3). ⚠️ **본문의 정본 상수 대조는 여기 없다** — 2026-09-26에
 * 본문이 `guide/**.md`로 옮겨 사전 본문과 그 대조가 함께 걷혔고, 같은 강도의 대조는
 * 원고 게이트(`lib/guide/__tests__/`)가 든다. 링크 대상의 실재는 `lib/guide/__tests__/docs-links.test.ts`가 본다.
 */

/**
 * 설정 화면 워크플로 모달의 hook 안내가 누를 수 없는 `docs/ACTIONS.md` 글자였다 — 운영 문서 경로라 제3자에게
 * 의미가 없다. 셸 안 링크 규칙(밑줄·아이콘 없음, DESIGN §6.3)으로 원고의 워크플로 절을 가리킨다 — 경로는 생성기가 든다.
 */
it("설정 화면의 hook 안내가 `setup/workflow#workflow`로 이어진다", async () => {
  await render(<CiCard slug="acme" archived={false} stale={[]}><p>yaml</p></CiCard>);
  const trigger = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(m.settings.ci.workflow))!;
  trigger.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const link = document.querySelector<HTMLAnchorElement>(`a[href="${routes.docs("setup/workflow", "workflow")}"]`);
  expect(link).not.toBeNull();
  expect(document.body.textContent).not.toContain("docs/ACTIONS.md");
});

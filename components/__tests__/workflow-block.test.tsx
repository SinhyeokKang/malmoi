// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { WorkflowBlock } from "@/components/onboarding/workflow-block";
import { en } from "@/messages/en";

import { render } from "./helpers/dom";

/**
 * **워크플로 YAML은 `/docs`의 코드 블록과 같은 형이다** (2026-10-01 사용자 — 앱 쪽이 docs 형으로 맞춘다). 경로는 블록 머리의
 * 파일명 바가 들고, 블록 위 문장은 경로 없이 할 일만 말한다 — 경로가 두 번 서지 않는다. Copy는 바 안 하나다.
 */
const PATH = ".github/workflows/malmoi-i18n.yml";

describe("WorkflowBlock — docs 코드 블록 형", () => {
  it("파일명 바에 경로, 그 옆에 Copy 하나 — 블록 위 Copy는 없다", async () => {
    const { container } = await render(<WorkflowBlock m={en} yaml="on: push" />);
    const buttons = [...container.querySelectorAll("button")];
    expect(buttons.map((b) => b.textContent)).toEqual([en.common.copy]);
    expect(container.querySelector("pre")?.getAttribute("aria-label")).toBe(PATH);
    expect(container.textContent?.split(PATH).length).toBe(2);
  });

  it("블록 위 문장은 사전의 한 문장이고 경로를 싣지 않는다", async () => {
    const { container } = await render(<WorkflowBlock m={en} yaml="on: push" />);
    expect(typeof en.settings.workflow.saveAs).toBe("string");
    expect(container.textContent).toContain(en.settings.workflow.saveAs);
    expect(en.settings.workflow.saveAs).not.toContain(PATH);
  });

  it("블록이 남은 높이를 먹는다(`fill`) — 온보딩 ④·설정 모달이 본문 대신 블록을 스크롤한다", async () => {
    const { container } = await render(<WorkflowBlock m={en} yaml="on: push" />);
    expect(container.querySelector("pre")?.className).toMatch(/\boverflow-auto\b/);
  });
});

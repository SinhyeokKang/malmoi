// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

import { FieldError, FormGroup } from "@/components/ui/form-group";

import { render } from "./helpers/dom";

/**
 * **필드 오류 줄은 한 형이다** (ux-drift-unify 5-W1) — `FormGroup`의 줄(`leading-prose` · `CircleAlert` `mt-1`)을 떼어 손 사본 넷이 같이 쓴다.
 * 전엔 기준 언어 `leading-translation`·`mt-px`, 초대 행 `CircleX`·`leading-body`, 설정 캡션 둘 `inline mr-1`로 넷이 갈렸다.
 */
it("FormGroup의 오류 줄이 FieldError다 — 같은 id·role·글리프", async () => {
  const { container } = await render(<FormGroup label="Path" htmlFor="path" error="Enter a path.">{() => null}</FormGroup>);
  const line = container.querySelector("#path-error")!;
  expect(line.getAttribute("role")).toBe("alert");
  expect(line.getAttribute("data-field-error")).toBe("");
  expect(line.textContent).toBe("Enter a path.");
});

it("FieldError는 호출부의 배치 클래스·속성을 받고 형은 그대로다", async () => {
  const { container } = await render(<FieldError id="x" className="pr-11" data-row-reason="">Bad address</FieldError>);
  const line = container.querySelector("#x")!;
  expect(line.className).toContain("pr-11");
  expect(line.className).toContain("leading-prose");
  expect(line.hasAttribute("data-row-reason")).toBe(true);
  expect(line.querySelector("svg.lucide-circle-alert")).not.toBeNull();
});

it("FieldError의 행간 override가 기존 임의값처럼 기본을 대체한다", async () => {
  const { container } = await render(<FieldError className="leading-normal">Bad address</FieldError>);
  const line = container.querySelector("[data-field-error]")!;
  expect(line.classList.contains("leading-normal")).toBe(true);
  expect(line.classList.contains("leading-prose")).toBe(false);
});

it.each([
  "components/sources/base-language-form.tsx",
  "components/members/invite-modal.tsx",
  "components/settings/repository-form.tsx",
  "components/settings/general-card.tsx",
])("%s가 오류 줄을 손으로 그리지 않는다", (file) => {
  const src = readFileSync(file, "utf8");
  expect(src).toContain("<FieldError");
  expect(src).not.toMatch(/<CircleAlert|<CircleX/);
});

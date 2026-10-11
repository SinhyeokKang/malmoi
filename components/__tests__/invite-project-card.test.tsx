// @vitest-environment jsdom
import { expect, it } from "vitest";

import { render } from "@/components/__tests__/helpers/dom";
import { InviteProjectCard } from "@/components/invite/project-card";

/** 375에서 컬럼이 293으로 줄어도 프로젝트 이름(식별자)이 잘리지 않는다 — 이름은 줄바꿈, 역할 줄은 고정 문구라 truncate. */
it("프로젝트 이름은 `wrap-anywhere`, 역할 줄은 truncate", async () => {
  const { container } = await render(<InviteProjectCard name="a-very-long-project-name-for-translators" role="Translator" locales={["ko"]} image={null} />);
  const spans = [...container.querySelectorAll<HTMLElement>("div.min-w-0 > span")];
  expect(spans[0]?.className.split(" ")).toContain("wrap-anywhere");
  expect(spans[0]?.className.split(" ")).not.toContain("truncate");
  expect(spans[1]?.className.split(" ")).toContain("truncate");
});

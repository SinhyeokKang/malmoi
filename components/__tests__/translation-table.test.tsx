// @vitest-environment jsdom
import { act } from "react";
import { expect, it, vi } from "vitest";
import { Table } from "@/components/ui/table";
import { KeyGroup } from "@/components/translations/key-group";
import type { ProjectContext } from "@/lib/keys/query";
import type { KeyRow } from "@/lib/keys/view";
import { find, input, render } from "./helpers/dom";

const save = vi.hoisted(() => vi.fn());
vi.mock("@/app/(edit)/actions", () => ({ saveTranslation: save }));
const project: ProjectContext = {
  surfaceId: "s1", surfaceSlug: "default", surfaces: [], id: "p", slug: "demo", name: "Demo", repoOwner: "owner", repoName: "repo",
  installationId: "1", lastCommitSha: "sha", baseLocale: "en", declaredBaseLocale: "en",
  lastPulledAt: null, lastPublishedAt: null, lastPrUrl: null, locales: [],
};
const row: KeyRow = {
  id: "key-one", key: "common.title", namespace: "common", description: "Description", refs: [], orphaned: false, createdAt: new Date(0),
  cells: { en: { value: "First line\nSecond line", needsReview: false, updatedBy: null, updatedAt: new Date(0) } },
};
const locales = [{ code: "en", orphaned: false }, { code: "ko", orphaned: false }, { code: "fr", orphaned: true }];
function View({ rows = [row], visible = locales }: { rows?: KeyRow[]; visible?: typeof locales }) {
  return <Table scrollable={false} aria-label="Common translations" className="table-fixed">
    <colgroup><col className="w-80" /><col className="w-17" /><col /></colgroup>
    {rows.map((item) => <KeyGroup surfaceSlug="default" key={item.id} slug="demo" row={item} locales={visible} project={project} actors={new Map()} lastPulledAt={null} />)}
  </Table>;
}

it("키별 tbody와 로케일별 행을 만들고 키 헤더가 해당 행만 걸친다", async () => {
  const { container } = await render(<View rows={[row, { ...row, id: "key-two", key: "common.other" }]} />);
  expect(container.querySelectorAll("table > tbody")).toHaveLength(2);
  for (const body of container.querySelectorAll("tbody")) {
    expect(body.querySelectorAll(":scope > tr")).toHaveLength(3);
    const header = find<HTMLTableCellElement>(body, 'th[scope="rowgroup"]');
    expect(header.rowSpan).toBe(3);
    expect(body.querySelectorAll("textarea")).toHaveLength(3);
  }
  expect(container.querySelectorAll("table table")).toHaveLength(0);
  expect(find<HTMLTextAreaElement>(container, "textarea").value).toContain("\n");
  expect(find<HTMLTextAreaElement>(container, 'textarea[aria-label="common.title · fr"]').disabled).toBe(true);
  expect(container.querySelector('[data-slot="table-container"]')).toBeNull();
});

it("로케일 필터에 맞춰 rowspan을 줄이고 보존되는 셀의 draft와 저장을 유지한다", async () => {
  const { container, rerender } = await render(<View />);
  const area = find<HTMLTextAreaElement>(container, 'textarea[aria-label="common.title · ko"]');
  await input(area, "작성 중");
  await rerender(<View visible={locales.filter((locale) => locale.code !== "en")} />);
  expect(find<HTMLTableCellElement>(container, "th").rowSpan).toBe(2);
  expect(find(container, 'textarea[aria-label="common.title · ko"]')).toBe(area);
  expect(area.value).toBe("작성 중");
  save.mockResolvedValueOnce({ ok: true, value: "작성 중" });
  await act(async () => area.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
  expect(save).toHaveBeenLastCalledWith({ surfaceSlug: "default", slug: "demo", keyId: "key-one", localeCode: "ko", value: "작성 중" });
});

it("키 설명이 행 높이를 늘려도 값 열의 경계선은 전체 td 높이를 따른다", async () => {
  const { container } = await render(<View rows={[{ ...row, description: "Long description ".repeat(120) }]} />);
  for (const area of container.querySelectorAll("textarea")) {
    expect(area.closest("td")?.classList.contains("border-l")).toBe(true);
  }
});

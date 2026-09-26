import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { collectLinks, collectUiLabels, resolveDocLink } from "../collect";
import { parseMd } from "../parse";

const fixture = (name: string) => parseMd(readFileSync(new URL(`./fixtures/collect/${name}`, import.meta.url), "utf8"));

describe("collectLinks — 링크와 참조 정의를 문서 순으로", () => {
  it("인라인 링크·굵게 안 링크·참조 정의를 모은다", () => {
    const tree = parseMd("See [a](one.md) and **[b](two.md#x)**.\n\n[ref]: https://example.com\n\nAlso `[not](code.md)`.\n");
    expect(collectLinks(tree).map(({ url, text }) => ({ url, text }))).toEqual([
      { url: "one.md", text: "a" },
      { url: "two.md#x", text: "b" },
      { url: "https://example.com", text: "ref" },
    ]);
  });

  it("줄 번호를 든다 — 게이트 메시지가 자리를 가리킨다", () => {
    expect(collectLinks(parseMd("x\n\n[a](one.md)"))[0]?.line).toBe(3);
  });
});

describe("resolveDocLink — 상대 `.md` 링크 → `/docs/<slug>#anchor`", () => {
  it("상대 경로와 앵커를 해소한다", () => {
    expect(resolveDocLink("translate/publish.md", "../setup/workflow.md#workflow")).toEqual({
      kind: "doc",
      file: "setup/workflow.md",
      anchor: "workflow",
      href: "/docs/setup/workflow#workflow",
    });
  });

  it("README는 장 slug로, 루트 README는 `/docs`로", () => {
    expect(resolveDocLink("setup/workflow.md", "README.md")).toMatchObject({ file: "setup/README.md", href: "/docs/setup" });
    expect(resolveDocLink("setup/workflow.md", "../README.md")).toMatchObject({ file: "README.md", href: "/docs" });
    expect(resolveDocLink("README.md", "account.md")).toMatchObject({ href: "/docs/account" });
  });

  it("같은 페이지 앵커만 있으면 자기 파일이다", () => {
    expect(resolveDocLink("reference/limits.md", "#projects")).toEqual({ kind: "doc", file: "reference/limits.md", anchor: "projects", href: "/docs/reference/limits#projects" });
  });

  it.each(["https://github.com/settings", "http://x", "mailto:a@b.c", "//cdn.example.com/x"])("외부 URL은 무시한다 — %s", (href) => {
    expect(resolveDocLink("README.md", href)).toEqual({ kind: "external" });
  });

  it.each([
    ["/docs/setup", "absolute"],
    ["../../outside.md", "outside"],
    ["../outside.md", "outside"],
    ["image.png", "not-markdown"],
    ["setup/work%20flow.md", "bad-path"],
    ["AUTHORING.md", "bad-path"],
    ["x.md#Bad_Anchor", "bad-anchor"],
  ])("해소할 수 없는 내부 링크는 사유를 든다 — %s", (href, reason) => {
    expect(resolveDocLink("README.md", href)).toEqual({ kind: "invalid", reason });
  });

  it("`#` 뒤가 비면 앵커가 없다", () => {
    expect(resolveDocLink("README.md", "account.md#")).toMatchObject({ kind: "doc", anchor: null, href: "/docs/account" });
  });
});

describe("collectUiLabels — 굵게 = UI 라벨", () => {
  it("strong 노드만 — `**`·`__` · 링크 안팎 · 표 셀. 코드 스팬·펜스·기울임은 아니다", () => {
    expect(collectUiLabels(fixture("labels.md")).map(({ text }) => text)).toEqual(["Publish", "Sources", "Settings", "Members", "Sync"]);
  });

  it("줄 번호를 든다 — 게이트 메시지가 자리를 가리킨다", () => {
    expect(collectUiLabels(parseMd("a\n\nPress **Save** now"))).toEqual([{ text: "Save", line: 3 }]);
  });

  it("안쪽에 공백이 붙은 `** x **`는 CommonMark상 굵게가 아니다 — 라벨로 세지 않는다", () => {
    expect(collectUiLabels(parseMd("Press ** Save ** now"))).toEqual([]);
  });

  it("라벨 안의 인라인 코드도 텍스트다 — 정확 일치 대조가 그 값을 본다", () => {
    expect(collectUiLabels(parseMd("**Copy `PUSH_TOKEN`**"))[0]?.text).toBe("Copy PUSH_TOKEN");
  });
});

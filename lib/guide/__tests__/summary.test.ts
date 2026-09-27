import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { GuideError, parseMd } from "../parse";
import { flattenNav, parseSummary, pathToSlug, slugToFile } from "../summary";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/summary/${name}`, import.meta.url), "utf8");
const summaryOf = (text: string) => parseSummary(parseMd(text));

function codeOf(run: () => unknown): string | null {
  try {
    run();
    return null;
  } catch (error) {
    return error instanceof GuideError ? error.code : "not-a-guide-error";
  }
}

describe("pathToSlug — `setup/README.md` ↔ `[\"setup\"]`", () => {
  it.each([
    ["README.md", []],
    ["account.md", ["account"]],
    ["setup/README.md", ["setup"]],
    ["setup/workflow.md", ["setup", "workflow"]],
  ])("%s", (path, slug) => {
    expect(pathToSlug(path)).toEqual(slug);
  });

  it.each(["AUTHORING.md", "SHOOTING.md", "SUMMARY.md", "setup/work flow.md", "setup/워크플로.md", "../x.md", "/x.md", "setup/x.txt", "__proto__.md", "./x.md", "a//b.md"])(
    "해소되지 않는다 — %s",
    (path) => {
      expect(pathToSlug(path)).toBeNull();
    },
  );
});

describe("slugToFile — 등재된 파일만, 충돌은 null", () => {
  const files = ["README.md", "setup/README.md", "setup/workflow.md", "account.md"];

  it.each([
    [[], "README.md"],
    [["setup"], "setup/README.md"],
    [["setup", "workflow"], "setup/workflow.md"],
    [["account"], "account.md"],
  ])("%j → %s", (slug, file) => {
    expect(slugToFile(slug, files)).toBe(file);
  });

  it("README 자체의 slug는 없다 — `/docs/setup/README`는 404", () => {
    expect(slugToFile(["setup", "README"], files)).toBeNull();
  });

  it("미등재 slug는 null — AUTHORING·SHOOTING은 파일이 있어도 해소되지 않는다", () => {
    expect(slugToFile(["missing"], files)).toBeNull();
    expect(slugToFile(["AUTHORING"], [...files, "AUTHORING.md"])).toBeNull();
    expect(slugToFile(["SHOOTING"], [...files, "SHOOTING.md"])).toBeNull();
  });

  it("`x.md`와 `x/README.md`가 둘 다 있으면 그 slug는 null이다", () => {
    expect(slugToFile(["setup"], ["setup.md", "setup/README.md"])).toBeNull();
  });

  it("프로토타입 키가 찾아지지 않는다", () => {
    expect(slugToFile(["__proto__"], files)).toBeNull();
    expect(slugToFile(["constructor"], files)).toBeNull();
    expect(slugToFile(["toString"], files)).toBeNull();
  });

  it("빈 세그먼트·경로 탈출은 null이다", () => {
    expect(slugToFile(["", "setup"], files)).toBeNull();
    expect(slugToFile(["..", "account"], files)).toBeNull();
  });
});

describe("parseSummary — SUMMARY가 IA 정본이다", () => {
  it("들여쓰기가 계층이 된다", () => {
    const nav = summaryOf(fixture("nested.md"));
    expect(nav.map(({ title, file, slug }) => ({ title, file, slug }))).toEqual([
      { title: "Malmoi", file: "README.md", slug: [] },
      { title: "Set up a project", file: "setup/README.md", slug: ["setup"] },
      { title: "Translate", file: "translate/README.md", slug: ["translate"] },
      { title: "Your account", file: "account.md", slug: ["account"] },
    ]);
    expect(nav[1]?.children.map(({ file }) => file)).toEqual(["setup/workflow.md", "setup/allowed-actions.md"]);
    expect(nav[2]?.children[0]).toMatchObject({ title: "Publish", slug: ["translate", "publish"], children: [] });
  });

  it("빈 SUMMARY는 빈 트리다", () => {
    expect(summaryOf(fixture("empty.md"))).toEqual([]);
    expect(summaryOf("")).toEqual([]);
  });

  it("`x.md`와 `x/README.md`를 둘 다 올리면 오류다 — 같은 slug", () => {
    expect(codeOf(() => summaryOf(fixture("collision.md")))).toBe("summary-duplicate-slug");
  });

  it("같은 경로를 두 번 올리면 오류다", () => {
    expect(codeOf(() => summaryOf(fixture("duplicate-path.md")))).toBe("summary-duplicate-path");
  });

  it("AUTHORING·SHOOTING을 올리면 오류다 — 서빙하지 않는 문서다", () => {
    expect(codeOf(() => summaryOf(fixture("reserved.md")))).toBe("summary-reserved");
    expect(codeOf(() => summaryOf("- [Shots](SHOOTING.md)"))).toBe("summary-reserved");
  });

  it.each(["../outside.md", "/abs.md", "https://example.com/x.md", "setup/work%20flow.md", "setup/워크플로.md", "setup/x.txt", "./x.md"])(
    "`guide/` 밖·공백·비ASCII·비md 경로는 오류다 — %s",
    (path) => {
      expect(codeOf(() => summaryOf(`- [X](${path})`))).toBe("summary-path");
    },
  );

  it("공백이 든 경로를 `<…>`로 감싸도 오류다", () => {
    expect(codeOf(() => summaryOf("- [X](<setup/work flow.md>)"))).toBe("summary-path");
  });

  it("링크가 없는 항목은 오류다", () => {
    expect(codeOf(() => summaryOf("- Just text"))).toBe("summary-item");
  });
});

describe("flattenNav — 선위 순회가 이전/다음 순서다", () => {
  it("장 경계를 넘어 한 줄이 되고 각 항목이 부모 장 이름을 든다", () => {
    const flat = flattenNav(summaryOf(fixture("nested.md")));
    expect(flat.map(({ file, parent }) => [file, parent])).toEqual([
      ["README.md", null],
      ["setup/README.md", null],
      ["setup/workflow.md", "Set up a project"],
      ["setup/allowed-actions.md", "Set up a project"],
      ["translate/README.md", null],
      ["translate/publish.md", "Translate"],
      ["account.md", null],
    ]);
  });

  it("빈 트리는 빈 목록이다", () => {
    expect(flattenNav([])).toEqual([]);
  });
});

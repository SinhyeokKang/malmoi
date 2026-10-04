import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buttonClass } from "@/components/ui/button";

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const constant = (source: string, name: string) => new RegExp(`const ${name} =\\s*\\n?\\s*"([^"]+)"`).exec(source)?.[1] ?? "";

/**
 * **누르는 것의 라벨은 500(medium)이다** (2026-09-30 사용자 — 버튼 400에서 올렸다). 헤더 내비·링크도 같은 무게다(LNB 내비는 제외) —
 * 버튼 모양이 아니어도 누르는 것이므로 한 벌로 읽혀야 한다.
 */
describe("누르는 것의 라벨 weight", () => {
  it("Button은 variant와 무관하게 font-medium이다", () => {
    for (const variant of ["primary", "default", "danger", "ghost", "link"] as const) {
      const classes = buttonClass({ variant }).split(/\s+/);
      expect(classes, variant).toContain("font-medium");
      expect(classes, variant).not.toContain("font-normal");
    }
  });

  it("헤더 내비(Docs·Changelog)와 헤더 링크(GitHub·New project)도 font-medium이다", () => {
    const source = read("components/public-shell/header.tsx");
    for (const name of ["NAV_LINK", "PUBLIC_HEADER_LINK"]) {
      expect(constant(source, name).split(/\s+/), name).toContain("font-medium");
    }
  });

  /**
   * `TextTrigger`는 `Button` 계열이 아니다 — 400 예외가 아니라 애초에 푸터 링크(13/400)와 같은 줄에 서는 누르는 글자다(ui-locales design §5.1).
   * `Button`을 빌리면 이 규칙이 500을 강제해 이웃 링크와 무게가 갈린다. 굵기 클래스를 들지 않는 것으로 고정한다.
   */
  it("TextTrigger는 Button을 빌리지 않고 굵기 클래스를 들지 않는다", () => {
    const source = read("components/ui/text-trigger.tsx");
    expect(source).not.toMatch(/buttonClass|<Button\b/);
    expect(source).not.toMatch(/\bfont-(medium|semibold|bold)\b/);
  });

  // LNB 내비는 이 규칙 밖이다(2026-09-30 사용자) — Button을 빌린 접기 토글·레일 프로젝트 트리거도 옆 항목과 같은 400이다.
  it("LNB의 아이콘 버튼(`ICON_BUTTON`)은 font-normal로 되누른다", () => {
    const source = read("components/shell/sidebar.tsx");
    const classes = /const ICON_BUTTON = cn\(ROW, "([^"]+)"\)/.exec(source)?.[1] ?? "";
    expect(classes.split(/\s+/)).toContain("font-normal");
    // 소비자 둘(접기 토글 · 레일 트리거)이 그 상수를 쓴다.
    expect(source.match(/className=\{ICON_BUTTON\}/g)).toHaveLength(2);
  });
});

/**
 * **ListRow의 무게는 제목 span이 든다 — 행 루트에 `font-medium`을 주지 않는다** (2026-10-04 사용자 — "모두 통일").
 * 루트에 주면 설명 줄(경로·파일 이름)까지 상속해 500이 된다. Sources 행과 Settings CI 행이 그랬다.
 */
describe("ListRow 루트 weight", () => {
  const FILES = execSync("git ls-files components app", { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter(path => /\.tsx$/.test(path) && !path.includes("__tests__") && path !== "components/ui/list-row.tsx");

  it("소비자의 `<ListRow className>`에 굵기 클래스가 없다", () => {
    const offenders: string[] = [];
    let opened = 0;
    for (const path of FILES) {
      const source = read(path);
      // 여는 태그에서 첫 className만 본다 — 루트의 className은 그 태그의 것이다. 화살표 함수의 `>` 때문에 태그 끝을 파싱하지 않는다.
      for (const match of source.matchAll(/<ListRow\b[\s\S]{0,400}?className=(?:"([^"]*)"|\{cn\(\s*"([^"]*)")/g)) {
        opened += 1;
        const classes = (match[1] ?? match[2] ?? "").split(/\s+/);
        if (classes.some(name => /^font-(medium|semibold|bold)$/.test(name))) offenders.push(path);
      }
    }
    expect(opened).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});

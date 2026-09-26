import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { visit } from "unist-util-visit";

import { describe, expect, it } from "vitest";

import { parseMd, stripHeadingMarker, toText } from "@/lib/guide/parse";
import { servedGuideFiles } from "@/lib/guide/__tests__/helpers/served";
import { m } from "@/lib/i18n";

/**
 * **화면 용어 표** (DESIGN §10.1 — audit #29). 사전 전체를 걸어 **보이는 문장**만 센다.
 *
 * ⚠️ **소스를 정규식으로 훑지 않는다** — 함수 값(`(n) => \`${n} surfaces\``)과 JSX 조각이 문장의 절반이라
 * 리터럴만 보면 그 절반이 방어선 밖이다. 함수는 자리표시 인자로 **호출해** 나온 문장을 본다.
 *
 * ⚠️ **키 이름·주석은 대상이 아니다** — 코드 식별자(`surface`·`locale`·`import`)는 그대로 두기로 했다.
 */
type Found = { path: string; text: string };

const ARG = "X";

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (isValidElement(node)) return renderToStaticMarkup(node).replace(/<[^>]+>/g, "");
  return "";
}

function walk(value: unknown, path: string, out: Found[]): void {
  if (typeof value === "string") out.push({ path, text: value });
  else if (typeof value === "function") {
    const args = Array.from({ length: value.length }, () => ARG);
    walk((value as (...a: unknown[]) => unknown)(...args), path, out);
  } else if (isValidElement(value)) out.push({ path, text: textOf(value) });
  else if (Array.isArray(value)) value.forEach((item, i) => walk(item, `${path}[${i}]`, out));
  else if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) walk(child, path === "" ? key : `${path}.${key}`, out);
  }
}

const strings = (): Found[] => {
  const out: Found[] = [];
  walk(m, "", out);
  return out;
};

/**
 * **서빙되는 원고**의 문장 — 문단·헤딩·표 셀 하나가 한 문장이다. 경로는 `guide/<file>`이라 `ALLOWED`는
 * 파일 단위로 건다.
 *
 * ⚠️ **코드는 뺀다**(`toText(…, false)`) — action 이름(`…/malmoi-i18n-push`)·파일 경로는 사용자가 옮겨 적는
 * 식별자라 코드로 쓰고, 그러면 표의 개념이 아니다. 헤딩의 `{#id}` 표식도 뗀다(`{#push}` 같은 id가 걸리지 않게).
 */
function guideStrings(root: string): Found[] {
  const dir = join(root, "guide");
  return servedGuideFiles(dir).flatMap((file) => {
    const out: Found[] = [];
    visit(parseMd(readFileSync(join(dir, file), "utf8")), (node) => {
      if (node.type === "paragraph" || node.type === "heading" || node.type === "tableCell") {
        // 코드를 뺀 텍스트라 헤딩 끝에 남은 `{#…}`는 표식뿐이다
        const text = toText(node, false);
        out.push({ path: `guide/${file}`, text: node.type === "heading" ? stripHeadingMarker(text) : text });
      }
    });
    return out;
  });
}

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));

/**
 * 표의 "쓰지 않는 말" + git 어휘. **대소문자를 가리지 않는다** — 문장 첫 자리에서 대문자가 된다.
 *
 * ⚠️ `pull request`는 고유명사라 뺀 뒤에 센다. `push token`·`PUSH_TOKEN`도 토큰의 이름이다.
 * ⚠️ `{locale}`이 든 토막은 경로 예시다 — 사용자가 칠 값이라 통째로 뺀다.
 */
const BANNED: readonly [string, RegExp][] = [
  ["surface", /\bsurfaces?\b/i],
  ["import", /\bimport(s|ed|ing)?\b/i],
  ["send changes", /\bsend changes\b/i],
  ["pull", /\bpull(s|ed|ing)?\b/i],
  ["push", /\bpush(es|ed|ing)?\b/i],
  ["locale", /\blocales?\b/i],
  ["source language", /\bsource language\b/i],
  ["the project owner", /\bthe project owner\b/i],
  ["an owner", /\ban owner\b/i],
  ["owner of this project", /\bowners? of this project\b/i],
  ["only owners", /\bonly owners\b/i],
  // 주어 자리는 복수형이다(표: "Only project owners") — 문장 중간의 "only a project owner can give that back"은 통과한다.
  ["only a project owner", /(^|[.!?]\s+)only a project owner\b/i],
  ["owners can", /(^|[^t] )owners can\b/i],
  ["retry", /\bretry(ing)?\b/i],
  ["check again", /\bcheck again\b/i],
];

const scrub = (text: string): string =>
  text
    .replace(/pull requests?/gi, "")
    .replace(/push tokens?/gi, "")
    .replace(/PUSH_TOKEN/g, "")
    .replace(/\S*\{locale\}\S*/g, "");

/**
 * **이유가 있는 예외만** — 경로마다 그 낱말이 표의 개념이 아닌 까닭이 있다.
 */
const ALLOWED: Readonly<Record<string, string>> = {
  // 코드의 `import` 문을 말한다 — Sync가 아니다.
  "adapterErrors.shorthand-property": "import",
  // ①은 개발자가 고르는 화면이고 GitHub이 보여 주는 값이다 (DESIGN §10.1).
  "newProject.repo.pushedAt": "push",
  // 설정의 CI 카드 — 워크플로가 실제로 하는 일을 개발자에게 말한다 (DESIGN §10.1).
  "settings.ci.description": "push",
  // 개인정보 방침 — 문구를 고치면 개정 이력이 따라간다(policy-gate). 개발자가 하는 일을 말하는 문장이다.
  "publicDocs.privacy.intro": "push",
  // 도움말의 허용 목록 — action의 **이름**(`…/malmoi-i18n-push`)이라 조직 관리자가 그대로 옮겨 적는 값이다 (launch-readiness L2.5).
  "publicDocs.docs.sections[2].blocks[1].ul[0]": "push",
  // 역할 이름(Owner)이다 — "누가 할 수 있나"를 가리키는 호칭이 아니다. 핸드오프가 고정한 문장이다(members 결정 6).
  "errors.access.last-owner": "an owner",
};

function violations(found: readonly Found[]): string[] {
  return found.flatMap(({ path, text }) =>
    BANNED.filter(([name, pattern]) => ALLOWED[path] !== name && pattern.test(scrub(text))).map(([name]) => `${path} — "${name}" in: ${text}`),
  );
}

describe("화면 용어 — DESIGN §10.1의 표를 사전 전체가 따른다 (audit #29)", () => {
  it("사전을 실제로 걸었다 — 0건 스캐너는 방어선이 아니다", () => {
    const found = strings();
    expect(found.length).toBeGreaterThan(1000);
    // 함수 값·JSX도 문장으로 풀렸다
    expect(found.some(({ path }) => path === "repositorySync.body")).toBe(true);
    expect(found.find(({ path }) => path === "repositorySync.title")?.text).toBe("Sync X from the repository?");
  });

  it("쓰지 않는 말이 화면 문장에 없다", () => {
    expect(violations(strings())).toEqual([]);
  });

  it("쓰지 않는 말이 서빙되는 원고에 없다", () => {
    const found = guideStrings(ROOT);
    expect(new Set(found.filter(({ path }) => path.startsWith("guide/") && path.endsWith(".md")).map(({ path }) => path)).size).toBeGreaterThanOrEqual(1);
    expect(violations(found)).toEqual([]);
  });

  it("원고 스캔은 SUMMARY에 오른 md의 문장을 보고 코드는 뺀다 (픽스처)", () => {
    const found = guideStrings(fileURLToPath(new URL("../../guide/__tests__/fixtures/scan", import.meta.url)));
    expect(new Set(found.map(({ path }) => path))).toEqual(new Set(["guide/SUMMARY.md", "guide/formats.md"]));
    expect(violations(found)).toEqual(["guide/formats.md — \"push\" in: Every push runs the workflow."]);
  });

  it("같은 규칙이 금지된 문장을 잡고 예외는 통과시킨다", () => {
    const sample = (text: string, path = "x") => violations([{ path, text }]);
    const caught = (text: string) => expect(sample(text).length).toBeGreaterThan(0);
    caught("Add surface");
    caught("The first import failed.");
    caught("Send changes first");
    caught("Changing it takes effect on the next CI push.");
    caught("Where are your locale files?");
    caught("Source language");
    caught("Ask the project owner.");
    caught("Ask an owner of this project to restore it.");
    caught("Only owners can invite or change roles");
    caught("Owners can manage members");
    caught("Only a project owner can add sources.");
    caught("Retry");
    caught("Check again");
    // 표가 고른 말과 고유명사는 통과한다
    expect(sample("Only project owners can sync. Project owners can restore it.")).toEqual([]);
    expect(sample("View pull request")).toEqual([]);
    expect(sample("You'll stop managing, and only a project owner can give that back.")).toEqual([]);
    expect(sample("Rotate the push token for PUSH_TOKEN")).toEqual([]);
    expect(sample("_locales/{locale}/messages.json · src/locales/{locale}.json")).toEqual([]);
    expect(sample("Ask the repository owner for access. An organization owner has to approve.")).toEqual([]);
  });
});

/**
 * DESIGN §10 — **Alert 제목은 구두점 없는 문장 조각**이다 (audit #30). 번역 화면 저장줄의 제목 자리를 센다.
 */
describe("Alert 제목에 마침표가 없다 (audit #30)", () => {
  const w = m.translations.workspace;
  it.each([
    ["footer.saveFailed.title", w.footer.saveFailed.title],
    ["footer.saveUnknown.title", w.footer.saveUnknown.title],
    ["footer.archived", w.footer.archived],
    ["footer.lostAccess", w.footer.lostAccess],
    ["revert.failed.title", w.revert.failed.title],
    ["revert.unknown.title", w.revert.unknown.title],
    ["revert.changed.title", w.revert.changed.title],
  ])("%s", (_, title) => {
    expect(title).not.toMatch(/[.!]$/);
  });
});

/**
 * audit #28 · #31 — **남을 가리키는 문구는 도착한 화면에 실제로 있는 컨트롤을 부른다** (POSTMORTEM 2026-09-14).
 * 번역 화면의 버튼은 `Publish`다 — 그리로 데려가는 링크 둘이 `Send changes`라고 말했다.
 */
describe("링크 라벨이 도착 화면의 버튼 이름을 든다 (audit #28)", () => {
  it.each([
    ["repositorySync.sendFirst", m.repositorySync.sendFirst],
    ["projects.banner.action.send", m.projects.banner.action.send],
  ])("%s", (_, label) => {
    expect(label).toContain(m.translations.publish.button);
  });
});

/** audit #31 — 프로젝트가 0개인 사람은 초대받은 번역자일 수도 있다. 리포 연결만 권하면 그 사람의 길이 없다. */
it("프로젝트 0건 문장이 초대받은 사람의 길도 말한다 (audit #31)", () => {
  expect(m.projects.empty.description).toMatch(/invit/i);
});

/**
 * coordinator review r1 — **문장이 단언하는 사실이 코드와 맞는다.** 값을 통째로 박는 이유: 여기 문장들은 각각
 * 거짓이던 단언을 걷어낸 결과라, 한 절이라도 돌아오면 다시 거짓이 된다.
 */
describe("사실을 단언하는 문장 (B4 r1)", () => {
  it("기준 언어 교체 배너는 덮어쓰기를 예고하지 않는다 — 미전달 편집이 있으면 Sync가 기다린다 (ARCHITECTURE §0-1)", () => {
    const text = m.translations.banner.basePending("ja");
    expect(text).toBe("The base language is changing to ja. It switches on the next sync from the repository — syncs wait while changes are unpublished, so publish them first.");
    expect(text).not.toMatch(/overwrite/i);
  });
  it("프로젝트 0건은 '발행 전엔 안 쓴다'고 하지 않는다 — 야간 cron이 발행한다 (PRODUCT)", () => {
    expect(m.projects.empty.description).not.toMatch(/until you publish/i);
    expect(m.projects.empty.description).toContain("it only writes back by opening a pull request");
  });
  it("Sync 권유 링크는 번역 화면을 연다고만 말한다 — Publish는 Home에도 있다", () => {
    expect(textOf(m.repositorySync.sendHint("LINK"))).toBe("To keep them, LINK — it opens the translation screen.");
  });
  it("Publish 거부 폴백은 같은 모달의 'Trying again won't help'과 모순되지 않는다", () => {
    expect(m.translations.publish.refused).not.toMatch(/try again/i);
    expect(m.translations.publish.refused).toBe("Publishing couldn't start. Open this project again from your project list.");
  });
  it("lease-lost는 확인 안 된 원인(다른 Sync)을 단언하지 않는다", () => {
    const text = m.repositorySync.errors["lease-lost"];
    expect(text).not.toMatch(/another sync/i);
    expect(text).toBe("This sync stopped before it could replace this source. Refresh to see the current state before trying again.");
  });
  it("Sources 추가 권한 문장은 주어 자리 복수형이다", () => {
    expect(m.sources.ownerOnly).toBe("Only project owners can add sources.");
  });
});

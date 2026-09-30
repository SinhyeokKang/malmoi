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
 * 셋째 칸이 있으면 **그 경로에서만** 센다 — §5의 "partial 문맥의 failed"·"이미지의 Delete"처럼 낱말이 아니라 자리가 금지인 칸이다.
 */
type Ban = readonly [name: string, text: RegExp, where?: RegExp];

/**
 * 표의 "쓰지 않는 말" + git 어휘. **대소문자를 가리지 않는다** — 문장 첫 자리에서 대문자가 된다.
 *
 * ⚠️ `pull request`는 고유명사라 뺀 뒤에 센다. `push token`·`PUSH_TOKEN`도 토큰의 이름이다.
 * ⚠️ `{locale}`이 든 토막은 경로 예시다 — 사용자가 칠 값이라 통째로 뺀다.
 */
const BANNED: readonly Ban[] = [
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
 * **상태 낱말 개념 색인** (DESIGN §2.4 · §10.1 — ux-drift-unify T15·T16). 한 개념에 낱말 하나 — 같은 상태를 화면마다
 * 다른 말로 부르면 읽는 사람은 "다른 일이 생겼다"로 읽는다.
 *
 * ⚠️ **지금은 사전만 센다** — 가이드 산문의 같은 동의어는 T26이 이 목록을 원고 스캔에도 건다(산문 교정이 T25라 순서가 그렇다).
 * ⚠️ **라벨 자리 금지어는 `^…$`로 문장 전체를 본다** — "Couldn't load"·"Couldn't be read"는 **이름**으로 금지이고,
 * "We couldn't load your repositories." 같은 오류 문장은 개념이 다르다.
 */
const CONCEPT_BANNED: readonly Ban[] = [
  // 동기화 실패 — 문장은 "The last sync couldn't finish" 하나
  ["Sync could not finish", /^sync could(?: not|n['’]t) finish/i],
  ["did not finish", /\bdid(?: not|n['’]t) finish\b/i],
  ["failed on its first sync", /\bfailed on its first sync\b/i],
  // 일부 반영은 실패가 아니다 — 데이터는 들어갔다
  ["did not come in", /\bdid(?: not|n['’]t) come in\b/i],
  // 일부 반영 키(경로에 partial)는 실패·불가 동사를 쓰지 않는다 — 데이터는 들어갔다
  ["partial: failed", /\bfail|\bcould(?:n['’]t| not)\b/i, /partial/i],
  // 복호화 실패의 이름은 Unavailable 하나
  ["Couldn't be read", /^could(?: not|n['’]t) be read[.!]?$/i],
  // 진행 중은 종류가 낱말을 정한다(Syncing… · Publishing…)
  ["Running…", /\brunning(?:…|\.\.\.)/i],
  // 연결 끊김의 결과는 "stop"이다 — paused는 표에 없는 상태어, held는 보류 전용
  ["paused", /\bpaused\b/i],
  ["held", /\bheld\b(?! back)/i],
  // Publish 일부 보류 전용
  ["held back", /\bheld back\b/i],
  ["on hold", /\bon hold\b/i],
  ["deferred", /\bdeferred\b/i],
  // 미전달 — 상태 Unsent, 명사 unsent edit(s)
  ["unpublished", /\bunpublished\b/i],
  ["unsent change", /\bunsent (?:translation )?changes?\b/i],
  ["not sent yet", /(?:\bnot|n['’]t) (?:been )?sent (?:to GitHub )?yet\b/i],
  ["Missing only", /\bmissing only\b/i],
  ["Couldn't load", /^could(?: not|n['’]t) load[.!]?$/i],
  ["Authorization expired", /^authorization expired[.!]?$/i],
  ["cancelled an invitation", /\bcancell?ed (?:an |the )?invitation\b|\binvitation was cancell?ed\b/i],
  ["Malmoi app", /\bMalmoi app\b/i],
  ["account settings", /\baccount settings\b/i],
  ["Image upload", /\bimage upload\b/i],
  // 이미지(프로필 사진·프로젝트 썸네일)를 걷는 동작은 Remove다
  ["image Delete", /^delete\b/i, /picture|image|avatar|thumbnail/i],
  // 목적지 라벨 하나 — /projects는 "Go to your projects", GitHub은 "Open on GitHub"
  ["Open projects", /\bopen projects\b/i],
  ["View on GitHub", /\bview on GitHub\b/i],
  ["Open repository", /^open repository[.!]?$/i],
  // 축약형 (DESIGN §10) — 강조가 필요한 부정만 ALLOWED가 든다
  ["could not", /\bcould not\b/i],
  ["did not", /\bdid not\b/i],
  ["cannot", /\bcannot\b/i],
  ["is not", /\bis not\b/i],
  ["was not", /\bwas not\b/i],
  ["were not", /\bwere not\b/i],
  ["are not", /\bare not\b/i],
  ["does not", /\bdoes not\b/i],
  ["do not", /\bdo not\b/i],
  ["has not", /\bha(?:s|ve) not\b/i],
];

/** 개인정보 방침 본문 — 문구를 고치면 개정 이력·시행일이 따라가는 문서라(policy-gate) 화면 문체 규칙을 소급하지 않는다. */
const CONTRACTIONS = ["could not", "did not", "cannot", "is not", "was not", "were not", "are not", "does not", "do not", "has not"] as const;

/**
 * **원고용 개념 색인** — 사전 색인에서 둘을 빼고 하나를 더한다.
 * - `held`를 뺀다 — 사전에서는 자리(보류 키)가 금지를 가르지만 원고에서는 held가 보류의 산문 낱말 그 자체다(AUTHORING #labels).
 * - 축약형을 뺀다 — 화면 문장의 문체 규칙(DESIGN §10)이지 개념 동의어가 아니고, 원고는 설명문이라 "does not"이 오독되지 않는다.
 * - 보류 문맥의 wait를 더한다 — 주어가 갱신·키·실행·편집일 때만. "the pull request waits for review"는 보류가 아니다.
 */
const GUIDE_CONCEPT_BANNED: readonly Ban[] = [
  ...CONCEPT_BANNED.filter(([name]) => name !== "held" && !(CONTRACTIONS as readonly string[]).includes(name)),
  ["waits (hold)", /\b(?:updates?|keys|syncs?|runs?|edits)\b(?:\s+\w+){0,2}\s+(?:wait|waits|waiting)\b/i],
];

/** 원고는 파일 단위로 건다 — `guide/<file>`. */
const GUIDE_ALLOWED: Readonly<Record<string, readonly string[]>> = {
  // Publish 결과 라벨 **Held back**을 인용한다.
  "guide/translate/publish.md": ["held back"],
};

/**
 * **이유가 있는 예외만** — 경로마다 그 낱말이 표의 개념이 아닌 까닭이 있다.
 *
 * 키가 `.*`로 끝나면 **접두 허용**이다 — `a.b.*`는 `a.b.x`·`a.b[0]`을 덮고 형제 `a.bc`나 부모 `a.b` 자신은 덮지 않는다.
 * 한 경로가 금지어 여럿을 가질 수 있다(보류 키의 held + 축약형 등).
 */
const ALLOWED: Readonly<Record<string, readonly string[]>> = {
  // 코드의 `import` 문을 말한다 — Sync가 아니다.
  "adapterErrors.shorthand-property": ["import"],
  // ①은 개발자가 고르는 화면이고 GitHub이 보여 주는 값이다 (DESIGN §10.1).
  "newProject.repo.pushedAt": ["push"],
  // 설정의 CI 카드 — 워크플로가 실제로 하는 일을 개발자에게 말한다 (DESIGN §10.1).
  "settings.ci.description": ["push"],
  // 개인정보 방침 — 문구를 고치면 개정 이력이 따라간다(policy-gate). 개발자가 하는 일을 말하는 문장이고, "held"는 키 보관 장소다.
  "publicDocs.privacy.intro": ["push"],
  "publicDocs.privacy.*": ["held", ...CONTRACTIONS],
  // 역할 이름(Owner)이다 — "누가 할 수 있나"를 가리키는 호칭이 아니다. 핸드오프가 고정한 문장이다(members 결정 6).
  "errors.access.last-owner": ["an owner"],
  // 워크플로 입력 이름(`base-locale:`)을 그대로 댄다 — OWNER가 YAML에서 고칠 글자라 표의 개념이 아니다 (malmoi#127 r4).
  "locales.field.help": ["locale"],
  // OG 이미지에 그려진 파일 경로(`src/i18n/locales.json`)를 그대로 묘사한다 — 화면 용어가 아니라 그림 속 글자다.
  "seo.ogImageAlt": ["locale"],

  // ── 보류(Held) — 미전달 편집·열린 PR·PR 조회 실패·너무 큼 (DESIGN §2.4). held는 이 키들 아래만 선다.
  "logs.status.deferred": ["held"],
  "logs.deferredReason": ["held"],
  "logs.detail.labels.heldBecause": ["held"],
  "logs.sentence.import.*": ["held"],
  "translations.banner.paused": ["held"],
  "home.cards.held.*": ["held"],
  "repositorySync.kept": ["held"],
  "mcp.summary.synced": ["held"],
  // ── Publish 일부 보류(Held back) — 결과 모달·Logs의 Publish 결과만.
  "translations.publish.*": ["held back"],
  "logs.status.notSent": ["held back"],
  "logs.detail.labels.withheld": ["held back"],
  "logs.sentence.publish.notSent": ["held back"],
  // ── 강조 부정 (DESIGN §10 "강조가 필요한 부정만 예외") — 실패가 "아무것도 안 갔다"를 증명하지 않는다는 것이 문장의 요지다.
  "logs.detail.notes.publish": ["does not"],
};

/** 접두(`.*`)면 그 아래 자식만, 아니면 정확히 그 경로만. */
function allows(path: string, name: string, allowed: Readonly<Record<string, readonly string[]>> = ALLOWED): boolean {
  return Object.entries(allowed).some(([key, names]) => {
    if (!names.includes(name)) return false;
    if (!key.endsWith(".*")) return path === key;
    const base = key.slice(0, -2);
    return path.startsWith(`${base}.`) || path.startsWith(`${base}[`);
  });
}

function violations(found: readonly Found[], banned: readonly Ban[] = BANNED, allowed: Readonly<Record<string, readonly string[]>> = ALLOWED): string[] {
  return found.flatMap(({ path, text }) =>
    banned
      .filter(([name, pattern, where]) => (where === undefined || where.test(path)) && !allows(path, name, allowed) && pattern.test(scrub(text)))
      .map(([name]) => `${path} — "${name}" in: ${text}`),
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

  it("상태 낱말 개념 색인의 금지어가 사전에 없다 (DESIGN §2.4 · ux-drift-unify)", () => {
    expect(violations(strings(), CONCEPT_BANNED)).toEqual([]);
  });

  it("ALLOWED의 경로가 사전에 실재한다 — 키 이름이 바뀌면 예외가 조용히 죽는다", () => {
    const paths = strings().map(({ path }) => path);
    for (const key of Object.keys(ALLOWED)) {
      const hit = key.endsWith(".*") ? paths.some((path) => allows(path, ALLOWED[key]![0]!, { [key]: ALLOWED[key]! })) : paths.includes(key);
      expect(hit, key).toBe(true);
    }
  });

  it("접두 허용은 자식만 덮고 형제·부모로 새지 않는다 (판정식 메타)", () => {
    const table = { "a.b.*": ["held"], "a.c": ["held", "could not"] } as const;
    expect(allows("a.b.x", "held", table)).toBe(true);
    expect(allows("a.b.x.y", "held", table)).toBe(true);
    expect(allows("a.b[0]", "held", table)).toBe(true);
    // 형제 · 부모 자신 · 다른 금지어
    expect(allows("a.bc.x", "held", table)).toBe(false);
    expect(allows("a.bc", "held", table)).toBe(false);
    expect(allows("a.b", "held", table)).toBe(false);
    expect(allows("a.b.x", "could not", table)).toBe(false);
    // 정확한 키는 자식을 덮지 않고, 한 키가 금지어 여럿을 든다
    expect(allows("a.c", "held", table)).toBe(true);
    expect(allows("a.c", "could not", table)).toBe(true);
    expect(allows("a.c.d", "held", table)).toBe(false);
    expect(allows("a.cd", "held", table)).toBe(false);
  });

  it("개념 색인이 옛 동의어를 잡고 정본 낱말은 통과시킨다", () => {
    const sample = (text: string, path = "x") => violations([{ path, text }], CONCEPT_BANNED);
    const caught = (text: string) => expect(sample(text), text).not.toEqual([]);
    for (const text of [
      "Sync could not finish", "The last sync did not finish.", "failed on its first sync", " — its keys did not come in.",
      "Couldn't be read", "Running…", "Syncs and publishes are paused.", "so syncs and publishes are held.", "X sync was held back on Y",
      "keep automatic syncing on hold", "deferred", "while changes are unpublished", "3 unsent changes", "2 unsent translation changes",
      "Saved · not sent yet", "3 edits have not been sent to GitHub yet.", "Missing only", "Couldn't load", "Authorization expired",
      "X cancelled an invitation", "or the invitation was cancelled.", "The Malmoi app is installed", "in account settings",
      "Image upload", "Open projects", "View on GitHub", "Open repository", "We could not sign you out", "cannot be sent",
      "Malmoi is not connected", "This source was not replaced.",
      // 우회형(fix1 🟡3) — 라벨 끝 마침표 · 축약형 · 마침표 셋
      "Couldn't be read.", "Couldn't load.", "Authorization expired.", "Open repository.", "Saved · hasn't been sent yet",
      "3 edits haven't been sent to GitHub yet.", "Running...",
    ]) caught(text);
    for (const text of [
      "The last sync couldn't finish", "Unavailable", "Syncing…", "Publishing…", "Syncs and publishes stop until it's reconnected.",
      "3 unsent edits", "Saved · unsent", "Untranslated only", "Couldn't check", "Expired", "X revoked an invitation",
      "Malmoi GitHub App", "the app", "Account", "Upload", "Remove", "Go to your projects", "Open on GitHub",
      "We couldn't load your repositories.", "X sources couldn't be read", "Your GitHub App authorization expired.",
    ]) expect(sample(text), text).toEqual([]);
    // 보류 키 아래의 held · Publish 결과의 held back은 통과한다
    expect(sample("Held", "logs.status.deferred")).toEqual([]);
    expect(sample("Held back", "translations.publish.notSent")).toEqual([]);
    expect(sample("Held", "home.banner.disconnected.body")).not.toEqual([]);
    // 자리 금지(§5) — partial 키의 실패 동사 · 이미지 키의 Delete. 다른 자리에서는 같은 낱말이 통과한다.
    expect(sample("The sync failed", "home.banner.partial.title")).not.toEqual([]);
    expect(sample("Some files couldn't be read", "repositorySync.partial")).not.toEqual([]);
    expect(sample("Partially synced", "logs.status.partial")).toEqual([]);
    expect(sample("The sync failed", "logs.sentence.import.failed")).toEqual([]);
    expect(sample("Delete", "account.picture.delete")).not.toEqual([]);
    expect(sample("Delete", "settings.general.thumbnailRemove")).not.toEqual([]);
    expect(sample("Remove", "account.picture.delete")).toEqual([]);
    expect(sample("Delete", "x")).toEqual([]);
  });

  it("쓰지 않는 말이 서빙되는 원고에 없다", () => {
    const found = guideStrings(ROOT);
    expect(new Set(found.filter(({ path }) => path.startsWith("guide/") && path.endsWith(".md")).map(({ path }) => path)).size).toBeGreaterThanOrEqual(1);
    expect(violations(found)).toEqual([]);
  });

  it("상태 낱말 개념 색인의 금지어가 서빙되는 원고에도 없다 (ux-drift-unify T26)", () => {
    expect(violations(guideStrings(ROOT), GUIDE_CONCEPT_BANNED, GUIDE_ALLOWED)).toEqual([]);
  });

  it("원고용 색인은 보류 산문의 wait를 잡고 PR 검토의 wait는 통과시킨다 (판정식 메타)", () => {
    const sample = (text: string) => violations([{ path: "guide/x.md", text }], GUIDE_CONCEPT_BANNED, GUIDE_ALLOWED);
    for (const text of ["Automatic updates wait while edits exist.", "New and removed keys wait too.", "In each case the whole update waits.",
      "New keys may be waiting because saved edits are unsent.", "If unsent edits are waiting, run it again.", "keep automatic syncing on hold", "the run is deferred",
      "Publish includes all saved unpublished edits"]) expect(sample(text), text).not.toEqual([]);
    for (const text of ["Your published values are safe while the pull request waits for review.", "Wait for an ongoing sync to finish.",
      "some projects may wait until another night", "If nothing is waiting to be published", "Repository updates are held until they are published.",
      "The last method cannot be removed."]) expect(sample(text), text).toEqual([]);
    // Held back은 Publish 결과 페이지만
    expect(violations([{ path: "guide/translate/publish.md", text: "Held back — some values can't be written" }], GUIDE_CONCEPT_BANNED, GUIDE_ALLOWED)).toEqual([]);
    expect(sample("The sync was held back")).not.toEqual([]);
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
    // malmoi#127 — 트리거를 댄다: 앱의 [Sync]는 선언을 적용하지 않고, 워크플로의 Sync는 미전달 편집이 있으면 기다린다.
    expect(text).toBe("The base language is changing to ja. It switches on the next sync from your repository's GitHub Actions workflow — the Sync button doesn't apply it. That sync waits while there are unsent edits, so publish them first.");
    expect(text).not.toMatch(/overwrite/i);
  });
  it("프로젝트 0건은 '발행 전엔 안 쓴다'고 하지 않는다 — 야간 cron이 발행한다 (PRODUCT)", () => {
    expect(m.projects.empty.description).not.toMatch(/until you publish/i);
    expect(m.projects.empty.description).toContain("it only writes back by opening a pull request");
  });
  it("Sync 권유 링크는 번역 화면을 연다고만 말한다 — Publish는 Home에도 있다", () => {
    expect(textOf(m.repositorySync.sendHint(2, "LINK"))).toBe("To keep them, LINK — it opens the translation screen.");
    expect(textOf(m.repositorySync.sendHint(1, "LINK"))).toBe("To keep it, LINK — it opens the translation screen.");
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

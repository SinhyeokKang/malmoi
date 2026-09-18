import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { SYNC_ERROR_CODES } from "@/lib/sync/plan";

/**
 * **던지는 자리가 코드를 든다** (ARCHITECTURE §5.6).
 *
 * pull 실패는 전부 메시지만 다른 `AppError`라, 잡는 쪽에서 문자열을 매칭하면 문장 하나가 바뀔 때
 * `SyncRun.errorCode`가 조용히 `unknown`으로 무너진다. 그래서 코드는 **던지는 자리**가 든다.
 *
 * ⚠️ **그렇다고 모든 `fail(`이 코드를 들지는 않는다** — "생산자 없는 코드는 두지 않는다"(ARCHITECTURE §5.6.3)가
 * union을 일곱으로 묶었고, 나머지 자리는 **불변식 위반**(`unreachable:`)이거나 **첫 적재 전에 이미
 * readiness가 막는 설정 부재**라 sync 층에서 가를 이름이 없다. 그래서 이 스캔은 둘을 **양쪽으로**
 * 고정한다: 코드를 들어야 하는 자리 다섯과, 안 드는 자리 전부의 이름. 새 `fail(`이 생기면 어느
 * 목록에도 없어 red가 된다 — `app/__tests__/entry-points.test.ts`가 예외를 이름으로 고정하는 것과 같은 형이다.
 */

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));

/** 스캔 대상 — sync가 감싸는 실행 경로 셋이다. `load`·`payload`·`render`는 이 셋이 부른다. */
const FILES = ["lib/pull/run.ts", "lib/pull/plan.ts", "lib/pull/trigger.ts"] as const;

/** 코드를 **들어야** 하는 자리. 키는 메시지의 고유 조각이다. */
const CODED: ReadonlyArray<readonly [needle: string, code: string]> = [
  ["Project.installationId is empty", "not-installed"],
  ["installationId is missing", "not-installed"],
  ["repository identity is not pinned", "not-installed"],
  ["cannot read the base branch", "base-unreadable"],
  ["the glob matched no files", "glob-matched-nothing"],
];

/**
 * 코드를 **안 드는** 자리. 각자 왜 없는지가 이유다.
 *
 * - `unreachable:` — 불변식 위반이라 사용자에게 보일 원인이 없다. `unknown`이 정직하다.
 * - `Project.*은 비어 있다`·`unknown adapter`·`no locales` — 첫 적재 전 상태이고 readiness 게이트가
 *   이미 막는다(`planProjectReadiness`). 여기 닿으면 그것 자체가 결함이다.
 * - 경로 안전 셋 — `lib/locale-code.ts`가 경계에서 이미 거른 값이 DB에 있다는 뜻이라 같은 부류다.
 * - `git branch name` — slug는 프로젝트 생성 때 `isRefSafeSlug`를 지난다.
 */
const UNCODED: readonly string[] = [
  "unreachable: passed the layer-1 check",
  "surface base locale is empty", "Surface path conflict:",
  "Project.adapterName is empty",
  "Project.pathTemplate is empty",
  "Project.baseLocale is empty",
  "unknown adapter:",
  "no locales (there are no files to write)",
  "per-locale layout but pathTemplate has no",
  "unsafe locale code for a repo path",
  "the resolved path leaves the repository",
  "project slug is not usable as a git branch name",
];

type Site = { file: string; args: string; hasCode: boolean };

/**
 * 주석을 공백으로 지운다 — **이 리포의 소스 스캐너 관용구다**(`focus-ring`·`no-korean-ui`).
 * 안 벗기면 `// fail(...)`을 언급한 주석 한 줄이 호출 자리로 세어져 거짓 red가 되고, 그러면
 * 이 방어선을 통째로 버리게 된다. 길이를 보존해 오프셋이 안 흔들리게 같은 수의 공백으로 바꾼다.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));
}

/**
 * `fail(` 호출의 인자 텍스트를 통째로 꺼낸다.
 *
 * ⚠️ **정규식으로는 못 센다** — 인자가 여러 줄이고 템플릿 리터럴 안에 `(`·`,`가 들어 있다.
 * 문자열·템플릿 안을 건너뛰며 괄호 깊이를 세는 것이 이 스캔이 거짓 red/green을 안 내는 조건이다.
 */
function callSites(file: string, source: string): Site[] {
  const sites: Site[] = [];
  const re = /\bfail\(/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const open = match.index + match[0].length - 1;
    let depth = 0;
    let quote: string | null = null;
    let topLevelComma = false;
    let i = open;
    for (; i < source.length; i += 1) {
      const c = source[i];
      if (quote !== null) {
        if (c === "\\") i += 1;
        else if (c === quote) quote = null;
        continue;
      }
      if (c === "'" || c === '"' || c === "`") quote = c;
      else if (c === "(") depth += 1;
      else if (c === ")") {
        depth -= 1;
        if (depth === 0) break;
      } else if (c === "," && depth === 1) topLevelComma = true;
    }
    sites.push({ file, args: source.slice(open + 1, i), hasCode: topLevelComma });
  }
  return sites;
}

const SITES = FILES.flatMap((f) => callSites(f, stripComments(readFileSync(`${ROOT}${f}`, "utf8"))));

describe("lib/pull의 fail( 자리 — 코드를 드는 것과 안 드는 것이 둘 다 고정돼 있다", () => {
  it("스캐너가 실제로 자리를 찾는다 — 0건이면 이 파일 전체가 공허하다", () => {
    expect(SITES.length).toBeGreaterThanOrEqual(CODED.length + UNCODED.length);
  });

  it("코드를 들어야 하는 자리가 전부 있고, 실제로 코드를 든다", () => {
    for (const [needle, code] of CODED) {
      const found = SITES.filter((s) => s.args.includes(needle));
      // 목록이 실재하는지도 함께 본다 — 메시지가 바뀌면 검사가 조용히 0건이 된다.
      expect(found.length, `no fail( site for ${needle}`).toBeGreaterThan(0);
      for (const site of found) {
        expect(site.hasCode, `${site.file}: ${needle} carries no code`).toBe(true);
        expect(site.args, `${site.file}: ${needle}`).toContain(`"${code}"`);
      }
    }
  });

  it("⚠️ 목록에 없는 fail(이 하나도 없다 — 새 자리는 둘 중 하나를 골라야 red를 벗는다", () => {
    const known = [...CODED.map(([needle]) => needle), ...UNCODED];
    const orphans = SITES.filter((s) => !known.some((needle) => s.args.includes(needle))).map(
      (s) => `${s.file}: ${s.args.slice(0, 60)}`,
    );
    expect(orphans).toEqual([]);
  });

  it("코드를 안 드는 자리는 정말로 안 든다 — 목록이 낡으면 여기서 걸린다", () => {
    for (const needle of UNCODED) {
      const found = SITES.filter((s) => s.args.includes(needle));
      expect(found.length, `no fail( site for ${needle}`).toBeGreaterThan(0);
      for (const site of found) expect(site.hasCode, `${site.file}: ${needle}`).toBe(false);
    }
  });

  it("소스에 박힌 코드가 전부 SyncErrorCode다 — 오타가 unknown으로 조용히 접히지 않는다", () => {
    // ⚠️ 끝의 쉼표를 먼저 벗긴다 — 여러 줄 호출은 trailing comma를 달고 있어 그냥 자르면 빈 문자열이 나온다.
    const codes = SITES.filter((s) => s.hasCode).map((s) => {
      const args = s.args.replace(/,\s*$/, "");
      return args.slice(args.lastIndexOf(",") + 1).trim();
    });
    expect(codes.length).toBe(CODED.length);
    for (const raw of codes) {
      expect(SYNC_ERROR_CODES as readonly string[]).toContain(raw.replace(/^["']|["']$/g, ""));
    }
  });
});

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { en } from "@/messages/en";
import { koPrivacy } from "@/messages/ko-privacy";

import { CLASSIFIED, DISCLOSURE_SECTIONS, NOT_PERSONAL } from "../collected";
import { sectionGaps } from "../disclosure";
import { docDigest, docText } from "../doc-text";

/**
 * **방침 실물의 게이트** (privacy design §2.2 (B)(C)).
 *
 * (B) 등재(`collected.ts`) ↔ 본문의 절 — 양방향이고 **대조 단위는 절 id다**.
 * (C) 본문 ↔ 개정 이력 — 본문을 바꾸면 아래 `REVISIONS`에 행을 하나 더 써야 green이고, 그 행에 날짜를
 *     타이핑하는 것이 곧 시행일 갱신이다. **"해시만 갱신하고 날짜는 두는" 탈출구가 닫힌다.**
 *
 * ⚠️ **git log로 대신하지 않는다** — CI 체크아웃이 깊이 1이라 파일 이력이 없어 조용히 통과하거나 깨진다.
 * ⚠️ 첫 판(2026-09-19)은 이 게이트 전이라 해시가 없다 — 이력의 날짜만 든다.
 *
 * 본문을 고쳤으면: 새 행 `{ effectiveDate: "<오늘>", digest: "<실패 메시지의 값>", koDigest: "<실패 메시지의 값>" }`를 끝에 붙이고,
 * `publicDocs.privacy.effectiveDate`와 `changes` 절의 목록에 같은 날짜를 적는다 — en 본과 ko 본(`messages/ko-privacy.tsx`) **둘 다**다.
 *
 * ⚠️ **ko 본은 2026-10-05부터다**(ui-locales design §8) — 그 전 행에는 `koDigest`가 없다. ko 본만 고쳐도 새 행이 필요하다(법적 문서다).
 */
const REVISIONS: readonly { effectiveDate: string; digest?: string; koDigest?: string }[] = [
  { effectiveDate: "2026-09-19" },
  { effectiveDate: "2026-09-24", digest: "4343d4fa724798db81c134a167f85b963f598199bb1fab0569d9dda6794b6963" },
  { effectiveDate: "2026-09-26", digest: "440e6802bea1828929a8f70aa81d2aed8e0a0a73f063ecdc95265e0671edb097" },
  { effectiveDate: "2026-09-27", digest: "d84367948c5659f424ca71196fde9be6762eeb6f235943e58429bb800930d008" },
  { effectiveDate: "2026-09-28", digest: "d793dcdfd5b28f80eb91bbf582665e411c02ca251514407398b84485d6d128be" },
  // mcp-connector — AI 에이전트 개인 토큰(해시·허용 동작·범위·사용 시각) · 에이전트가 읽는 것의 행방. 2026-09-28 초안이 v1.1.0 머지일로 옮겨졌다.
  { effectiveDate: "2026-09-29", digest: "e6c29b97727ea713450110a19f52138eb28b9f23fa2ad6b8bfd5d7954f1a9473" },
  // mcp-oauth — 브라우저 로그인으로 붙는 앱 연결(이름·주소·콜백·해시·허용 동작·범위·사용 시각) · 보존 · CIMD 문서 읽기. 같은 날 두 번째 개정이다 — 머지일이 바뀌면 날짜를 옮긴다.
  { effectiveDate: "2026-09-29", digest: "e335ec7a17858075cedf5f04e94f3fdbb25b93172d64d380f68516d74e6f8d61" },
  // ui-locales — 화면 언어(`User.uiLocale` · 쿠키 `malmoi-ui-locale`)와 ko 본 게시. 머지일이 바뀌면 날짜를 옮긴다.
  { effectiveDate: "2026-10-05", digest: "dbc15a7e6caa185de6b2d2a80f873d5eb7bbabfa9ab7886deaa7dd0167960ab0", koDigest: "5a47d4988e7046a3dcb898a8948d329e8d56ae88f89c011a1bf477885cc3dcdd" },
  // user-timezone — 고른 시간대(`User.timeZone`, 계정에만 — 쿠키 없음). ui-locales와 같은 날 두 번째 개정이다 — 머지일이 바뀌면 두 행의 날짜를 같이 옮긴다.
  // ko 해시는 같은 미배포 개정 안에서 ko 본 용어를 사전에 맞춘 뒤(풀 리퀘스트→PR · 저장소→리포지토리 · 초대 이메일→초대 메일, 의미 불변)의 값이다.
  { effectiveDate: "2026-10-05", digest: "8bc00b1d413c224be7b57680504093a73aebf6d2f3dee999666081ce45ccbb0d", koDigest: "c31e3f378a394b7846fe9e4aaeb722a33a54ea9a12d4d4f3c6ed5b64bf481f98" },
  // color-scheme — 고른 화면 테마(`User.colorScheme` · 쿠키 `malmoi-color-scheme`). 같은 날 세 번째 개정이다 — 머지일이 바뀌면 세 행의 날짜를 같이 옮긴다.
  { effectiveDate: "2026-10-05", digest: "c67d2592808e700f35af74f4670d58190a6718747175c0278f9629072ac8c8e8", koDigest: "d0f5f45fbe9eeb157f02b91a1fec22e5c516225024e0a920c34896979efc4b25" },
  // attention-inbox — 헤더 목록을 마지막으로 연 시각(`User.attentionSeenAt`, 계정마다 하나 · 쿠키 없음). 같은 날 네 번째 개정이다 — 머지일이 바뀌면 네 행의 날짜를 같이 옮긴다.
  { effectiveDate: "2026-10-05", digest: "ae54e321d19e81af1b68c449cd719ec9fb9b32c4dd5e2cc077c921e9674dba6c", koDigest: "c1a050ddb5ae6334e184f3da1b14705a07e35b052ba0000c9a90aacad289b279" },
  // color-scheme fix1 — 로그인하면 계정 테마를 기기 쿠키로 복사한다(쿠키 보존 기산점이 로그인으로 늘었다). 같은 날 다섯 번째 개정이다 — 머지일이 바뀌면 다섯 행의 날짜를 같이 옮긴다.
  { effectiveDate: "2026-10-05", digest: "c8e9666b274772c3cee471f8c9d54a7d74d1c89ae6b615000fa1c92536d361fe", koDigest: "965ae2d11b73741007da9ceee441db17b69018f97ccf000151e4d7ff953f8402" },
  // device-cookies fix3 — 로그인하면 계정 화면 언어도 기기 쿠키로 복사한다. 같은 날 여섯 번째 개정이다 — 머지일이 바뀌면 여섯 행의 날짜를 같이 옮긴다.
  { effectiveDate: "2026-10-05", digest: "be9870931ac97177a830f8b4ce239e01aa4550281259b8ddca69b351d92aacd4", koDigest: "771e1396a905de08acba4b70d59e13734985e5f908253242305bb88306bfd749" },
  // sidebar-cookie — LNB 접힘 여부 기기 쿠키(`malmoi-sidebar-collapsed`, 스크립트가 쓰는 유일한 쿠키 · 1년). 머지일이 바뀌면 날짜를 옮긴다.
  { effectiveDate: "2026-10-07", digest: "9e7a7fe3769cc6e6e848c9ee84d909ecdcb9c64eba364cbf48242090cad57d83", koDigest: "fde6d9f89ade893e75810be5389923e7d99f88d43c46d29484cdb8f932a0388d" },
  // inbox-page — 헤더 목록 이름이 Inbox가 되고 `/inbox` 페이지를 보는 것도 열람으로 기록한다(같은 `User.attentionSeenAt` · 새 필드·쿠키 없음). 머지일이 바뀌면 날짜를 옮긴다.
  { effectiveDate: "2026-10-09", digest: "3646c19d963317f2923dae95f23aebf915d6c13f97bb24e9bd7995736b71bdea", koDigest: "06a2ac5969136c23ef2a273fa35ff739018648852136d8df86c8bb866c90585e" },
];

const privacy = en.publicDocs.privacy;
const text = docText(privacy.sections);

describe("방침 게이트 (B) — 등재 ↔ 본문의 절", () => {
  it("등재가 가리키는 절이 전부 있고, 대상 절이 전부 쓰이고, 절 id가 겹치지 않는다", () => {
    const disclosed = Object.values(CLASSIFIED).filter((c) => c !== NOT_PERSONAL);
    expect(sectionGaps(disclosed, privacy.sections, DISCLOSURE_SECTIONS)).toEqual({
      missingSections: [],
      unusedSections: [],
      duplicateIds: [],
    });
  });

  it("절 일곱이 전부 있다 — 다른 화면이 앵커로 가리킨다", () => {
    expect(privacy.sections.map((s) => s.id)).toEqual(["collected", "purposes", "retention", "third-parties", "deletion", "cookies", "changes"]);
  });

  it("모든 표의 행이 머리와 셀 수가 같다 — 실물의 셀 누락은 픽스처 단언이 못 본다", () => {
    for (const section of privacy.sections) {
      for (const block of section.blocks) {
        if (!("table" in block)) continue;
        for (const row of block.table.rows) expect(row.length, `${section.id}: ${block.table.label}`).toBe(block.table.head.length);
      }
    }
  });
});

/**
 * **스크립트가 쓰는 쿠키는 하나다** (2026-10-07 사이드바 접힘 — `lib/shell/sidebar-cookie.ts`). 나머지는 전부 http-only라 본문이 "모두 http-only"라고
 * 말해 왔다 — 클라이언트가 쓰는 쿠키가 생기면 그 문장이 거짓이 된다. 표에 행이 있고, 본문이 그것을 예외로 밝히는지 두 본 모두에서 센다.
 */
describe("방침 — 스크립트가 쓰는 사이드바 쿠키", () => {
  const cookies = (body: typeof privacy | typeof koPrivacy) => body.sections.find((s) => s.id === "cookies");
  it("en 본 쿠키 표에 Sidebar 행이 있고, 본문이 그것만 http-only가 아니라고 밝힌다", () => {
    const section = cookies(privacy);
    const table = section?.blocks.find((b) => "table" in b);
    expect(table !== undefined && "table" in table ? table.table.rows.map((r) => r[0]) : []).toContain("Sidebar");
    expect(docText(section === undefined ? [] : [section])).toMatch(/Sidebar[^.]*not http-only|except the sidebar/i);
  });
  it("ko 본 쿠키 표에 사이드바 행이 있다", () => {
    const table = cookies(koPrivacy)?.blocks.find((b) => "table" in b);
    expect(table !== undefined && "table" in table ? table.table.rows.map((r) => r[0]) : []).toContain("사이드바");
  });
});

/**
 * 위 문장("스크립트가 읽을 수 있는 유일한 쿠키")을 **세는 검사** — 표와 문구만 보면 다음에 `document.cookie` 쓰기나 `httpOnly: false`가
 * 하나 더 생겨도 green이다(POSTMORTEM 2026-09-19 — 방침이 X를 말하려면 X를 세는 검사가 먼저 있어야 한다).
 */
describe("방침 — 스크립트가 쓰는 쿠키는 소스에서도 하나다", () => {
  const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
  const sources = (dir: string): string[] =>
    readdirSync(join(ROOT, dir)).flatMap((name) => {
      const rel = join(dir, name);
      if (name === "__tests__" || name === "node_modules") return [];
      if (statSync(join(ROOT, rel)).isDirectory()) return sources(rel);
      return /\.(ts|tsx)$/.test(name) ? [rel] : [];
    });
  const files = [...["app", "components", "lib"].flatMap(sources), "auth.ts", "middleware.ts"];
  const hits = (pattern: RegExp) => files.filter((rel) => pattern.test(readFileSync(join(ROOT, rel), "utf8")));

  it("`document.cookie` 대입은 셸 패널 하나다", () => {
    expect(hits(/document\.cookie\s*=(?!=)/)).toEqual(["components/shell/shell-panels.tsx"]);
  });
  it("`httpOnly: false`는 0곳이다", () => {
    expect(hits(/httpOnly:\s*false/)).toEqual([]);
  });
});

describe("방침 게이트 (C) — 본문 ↔ 개정 이력", () => {
  it("본문이 비지 않았다 — 빈 본문을 해시해도 green이 되면 게이트가 아니다", () => {
    expect(text.length).toBeGreaterThan(3000);
  });

  it("현재 본문의 해시가 마지막 개정의 것과 같다 — 다르면 본문이 바뀐 것이고 새 개정 행이 필요하다", () => {
    expect(docDigest(text)).toBe(REVISIONS.at(-1)?.digest);
  });

  it("시행일이 마지막 개정의 날짜다", () => {
    expect(privacy.effectiveDate).toBe(REVISIONS.at(-1)?.effectiveDate);
  });

  it("개정마다 changes 절에 그 날짜가 적혀 있다 — 배열만 갱신하면 화면의 이력에 개정이 없다", () => {
    const changes = privacy.sections.find((s) => s.id === "changes");
    const changesText = docText(changes === undefined ? [] : [changes]);
    for (const revision of REVISIONS) expect(changesText).toContain(revision.effectiveDate);
  });
});

/**
 * **두 본의 동형** (ui-locales design §8) — ko 화면은 ko 본, en·es 화면은 en 본을 본다. 두 본이 다른 사실을 말하면 어느 쪽이 맞는지
 * 정하는 조항이 없으므로(spec 비목표) 같은 사실을 말하는 것을 게이트가 든다. 문장 대조는 사람(검수)의 몫이고, 여기는 구조를 센다.
 * `PrivacyBody` 타입이 표의 행 수·목록 항목 수를 이미 묶는다 — 아래는 그 위에 **값**이 같아야 하는 자리(id·날짜)를 잰다.
 */
describe("방침 두 본(en·ko) — 동형", () => {
  const ko = koPrivacy;
  const dates = (body: typeof ko | typeof privacy) => {
    const changes = body.sections.find((s) => s.id === "changes");
    const list = changes?.blocks.find((b) => "ul" in b);
    return list !== undefined && "ul" in list ? list.ul.map((item) => (typeof item === "string" ? /^\d{4}-\d{2}-\d{2}/.exec(item)?.[0] : undefined)) : [];
  };
  const table = (body: typeof ko | typeof privacy, id: string) => {
    const block = body.sections.find((s) => s.id === id)?.blocks.find((b) => "table" in b);
    return block !== undefined && "table" in block ? block.table : undefined;
  };

  it("절 id와 순서가 같다", () => {
    expect(ko.sections.map((s) => s.id)).toEqual(privacy.sections.map((s) => s.id));
  });

  it("시행일이 같다", () => {
    expect(ko.effectiveDate).toBe(privacy.effectiveDate);
  });

  it("개정 이력 항목 수와 날짜가 같다", () => {
    expect(dates(ko)).toEqual(dates(privacy));
    expect(dates(ko).every((date) => date !== undefined)).toBe(true);
  });

  it("수집 항목 표와 쿠키 표의 행·열 수가 같다", () => {
    for (const id of ["collected", "cookies"]) {
      const [a, b] = [table(ko, id), table(privacy, id)];
      expect(a?.rows.length, id).toBe(b?.rows.length);
      expect(a?.head.length, id).toBe(b?.head.length);
      for (const row of a?.rows ?? []) expect(row.length, id).toBe(a?.head.length);
    }
  });

  it("목차 짧은 라벨의 키(절 id)가 같다", () => {
    expect(Object.keys(ko.tocLabels)).toEqual(Object.keys(privacy.tocLabels));
  });

  it("등재(`collected.ts`) ↔ ko 본의 절도 맞는다", () => {
    const disclosed = Object.values(CLASSIFIED).filter((c) => c !== NOT_PERSONAL);
    expect(sectionGaps(disclosed, ko.sections, DISCLOSURE_SECTIONS)).toEqual({ missingSections: [], unusedSections: [], duplicateIds: [] });
  });

  it("ko 본이 비지 않았고, 해시가 마지막 개정의 ko 값과 같다 — ko 본만 고쳐도 새 개정 행이 필요하다", () => {
    const koText = docText(ko.sections);
    expect(koText.length).toBeGreaterThan(1500);
    expect(docDigest(koText)).toBe(REVISIONS.at(-1)?.koDigest);
  });
});

/**
 * **두 본의 사실 대조** (R10 🟡3) — 위 동형 검사는 구조만 센다. 해시(`koDigest`)는 "ko 본이 바뀌었다"만 알리므로, 해시만 갱신하면 ko의 보존 기간
 * `30일`이 `3일`이 되거나 전송처 하나가 빠져도 green이었다. 모양이 튜플로 정렬돼 있으니 **문단·목록 항목·표 셀 단위로 짝을 맞춰** 사실 토큰
 * (숫자 · 고정 고유명 · `href`)을 견준다. 문장 자체의 대조는 사람(검수)의 몫이다.
 *
 * ⚠️ **정규화 표는 수사만 바꾼다** — en이 낱말로 쓴 수(`one minute`·`a year`·`five`)와 ko의 고유어 수·지명 표기를 숫자·en 표기로 맞춘다. 사실을
 * 맞추려고 이 표를 늘리지 않는다(그러면 게이트가 빈다). 새 문장이 이 표 밖의 수사를 쓰면 red이고, 그때 표에 한 줄을 더한다.
 */
describe("방침 두 본(en·ko) — 사실 대조", () => {
  type Unit = { path: string; node: ReactNode };
  const units = (body: typeof koPrivacy | typeof privacy): Unit[] => [
    { path: "intro", node: body.intro },
    ...body.sections.flatMap((section) =>
      section.blocks.flatMap((block, b): Unit[] => {
        const at = `${section.id}.blocks[${b}]`;
        if ("p" in block) return [{ path: at, node: block.p }];
        if ("ul" in block) return block.ul.map((node, i) => ({ path: `${at}.ul[${i}]`, node }));
        return [
          ...block.table.head.map((node, i) => ({ path: `${at}.head[${i}]`, node })),
          ...block.table.rows.flatMap((row, r) => row.map((node, c) => ({ path: `${at}.rows[${r}][${c}]`, node }))),
        ];
      }),
    ),
  ];

  const NORMALIZE: Readonly<Record<"en" | "ko", readonly (readonly [RegExp, string])[]>> = {
    en: [[/\bone minute\b/g, "1 minute"], [/\ba year\b/g, "1 year"], [/\bfive\b/g, "5"]],
    ko: [[/다섯/g, "5"], [/도쿄/g, "Tokyo"]],
  };
  /** 수 바로 뒤의 시간 단위 — 같은 수라도 `1 year`와 `1개월`은 다른 사실이다. en `30, 90 or 365 days`처럼 단위를 끝에 한 번 쓰는 열거도 있어 수와 단위를 따로 센다. */
  const UNITS: Readonly<Record<"en" | "ko", readonly (readonly [RegExp, string])[]>> = {
    en: [[/\d+\s*minutes?\b/g, "unit:minute"], [/\d+\s*hours?\b/g, "unit:hour"], [/\d+\s*days?\b/g, "unit:day"], [/\d+\s*months?\b/g, "unit:month"], [/\d+\s*years?\b/g, "unit:year"]],
    ko: [[/\d+\s*분/g, "unit:minute"], [/\d+\s*시간/g, "unit:hour"], [/\d+\s*일/g, "unit:day"], [/\d+\s*개월/g, "unit:month"], [/\d+\s*년/g, "unit:year"]],
  };
  const NAMES = ["GitHub", "Google", "Supabase", "Vercel", "Web Analytics", "Resend", "Claude Code", "Codex", "MCP", "Tokyo", "mal-moi.com", "http-only"];

  /**
   * 한 단위의 사실 토큰 — **집합**이다. 다중집합이면 번역이 주어를 한 번 생략한 것(`Vercel … Vercel uses` ↔ `Vercel이 … 쓰며`)까지 red가 된다 —
   * 사실이 아니라 문체를 재게 된다.
   */
  function facts(node: ReactNode, lang: "en" | "ko"): string[] {
    const markup = renderToStaticMarkup(createElement(Fragment, null, node));
    const hrefs = [...markup.matchAll(/href="([^"]*)"/g)].map((match) => `href:${match[1]}`);
    // 문자 참조를 먼저 지운다 — `&#x27;`(아포스트로피)의 `27`이 수로 세어진다.
    let text = markup.replace(/<[^>]*>/g, " ").replace(/&[#\w]+;/g, " ");
    for (const [pattern, to] of NORMALIZE[lang]) text = text.replace(pattern, to);
    const names = NAMES.flatMap((name) => Array.from({ length: text.split(name).length - 1 }, () => name));
    // 고유명 안의 수(`mal-moi.com`에는 없다)·이메일 주소 안의 숫자도 수로 센다 — 두 본이 같은 주소를 쓰면 같은 수가 나온다.
    const numbers = [...text.matchAll(/\d+/g)].map((match) => String(Number(match[0])));
    const units = UNITS[lang].filter(([pattern]) => text.search(pattern) !== -1).map(([, unit]) => unit);
    return [...new Set([...hrefs, ...names, ...numbers, ...units])].sort();
  }

  it("짝 맞춘 단위마다 숫자·고유명·href가 같다", () => {
    const [enUnits, koUnits] = [units(privacy), units(koPrivacy)];
    expect(koUnits.map((u) => u.path)).toEqual(enUnits.map((u) => u.path));
    const diffs = enUnits.flatMap((unit, i) => {
      const [a, b] = [facts(unit.node, "en"), facts(koUnits[i]?.node, "ko")];
      return JSON.stringify(a) === JSON.stringify(b) ? [] : [{ path: unit.path, en: a, ko: b }];
    });
    expect(diffs).toEqual([]);
  });

  it("검사가 실제로 가른다 — 기간·전송처·연락처·쿠키 기간 하나를 바꾸면 그 단위가 걸린다", () => {
    expect(facts("Resend keeps it for 30 days.", "en")).not.toEqual(facts("Resend가 3일간 보관합니다.", "ko"));
    expect(facts("GitHub, Google and Resend", "en")).not.toEqual(facts("GitHub, Google", "ko"));
    expect(facts(<a href="mailto:a@x.dev">a@x.dev</a>, "en")).not.toEqual(facts(<a href="mailto:b@x.dev">b@x.dev</a>, "ko"));
    expect(facts("1 year from your last choice", "en")).not.toEqual(facts("마지막으로 고른 때부터 1개월", "ko"));
    // 정규화는 수사만 맞춘다.
    expect(facts("lasts one minute, in Tokyo, to five services", "en")).toEqual(facts("1분간, 도쿄에서, 다섯 서비스로", "ko"));
  });

  it("단위가 충분히 많고 사실 토큰이 실제로 나온다 — 0건은 방어선이 아니다", () => {
    const all = units(privacy).flatMap((unit) => facts(unit.node, "en"));
    expect(units(privacy).length).toBeGreaterThan(60);
    for (const token of ["Resend", "Tokyo", "href:mailto:ox501501@gmail.com", "30", "365"]) expect(all, token).toContain(token);
  });
});

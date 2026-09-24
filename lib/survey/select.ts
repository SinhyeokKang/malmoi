import { LOCALES_PATH } from "../adapters/chrome-locales";
import { CODE_FILE } from "../adapters/code-dict";
import { JSON_FILE, LOCALE_DIR_FILE } from "../adapters/json-catalog";
import { I18N_HINT, compareKeys, looksLikeLocale, pathSignals, splitLocaleSuffix } from "../adapters/shared";
import { NEVER, YAML_FILE } from "../adapters/yaml-catalog";

/**
 * **어떤 파일을 물리화할지 고르는 것 자체가 로직이다.**
 *
 * 리포 전체 내용을 메모리에 올릴 수 없다(immich·mastodon 급이면 수백 MB). 껍데기는 경로 목록을
 * 먼저 받고 여기서 고른 것만 읽는다 — GitHub API의 `probe` 콜백이 "블롭 읽기가 비싸서 후보만
 * 확인"하는 것과 같은 구조이고, blobless partial clone이 git 수준에서 그 두 단계를 그대로 준다.
 *
 * 껍데기에 두면 테스트가 안 되므로 순수 함수로 뺐다 (design.md).
 */

/*
 * ⚠️ **경로 규칙은 어댑터의 것을 import한다 — 사본을 두지 않는다** (audit #73). 사본이던 동안 `yaml-catalog`의 그룹 수가
 * 갈려 `y[3]`이 항상 `undefined`였고(2026-09-04 audit #11), 어댑터가 새 모양을 받을 때마다 "같은 커밋에서 고친다"는
 * 규율에 기댔다(POSTMORTEM 2026-09-02). `__tests__/select-patterns.test.ts`가 사본 0과 import를 함께 센다.
 */

/**
 * 설정 파일 — 이 실험은 **구현하지 않고 빈도만 센다**. 있으면 다음 기능(설정 기반 탐지)의
 * 우선순위가 확정된다.
 */
const CONFIG = [
  /(^|\/)i18next-parser\.config\.[cm]?[jt]s$/,
  /(^|\/)lingui\.config\.[cm]?[jt]s$/,
  /(^|\/)crowdin\.ya?ml$/,
  /(^|\/)\.i18nrc(\.json|\.ya?ml)?$/,
  /(^|\/)\.tolgeerc$/,
  /(^|\/)weblate\.ya?ml$/,
  /(^|\/)transifex\.ya?ml$/,
  /(^|\/)\.tx\/config$/,
];

/** 읽을 파일 수 상한. 넘으면 잘라내고 `truncated`로 알린다. */
const FILE_BUDGET = 1200;
/**
 * 접두사·로케일 디렉터리 후보는 **그룹 수를 먼저 자른다.**
 *
 * ⚠️ 맨 로케일 파일 그룹과 달리 이쪽은 그룹이 폭발한다 — discourse 하나가 플러그인마다
 * `config/locales/{client,server}.{locale}.yml`을 들어 그룹 500개·파일 25,000개다. 전부 담으면
 * `FILE_BUDGET`이 경로 사전순으로 잘려 **정작 후보가 될 그룹의 내용이 안 온다.**
 * `rankTemplateCandidates`와 같은 축으로 그룹을 먼저 고른다.
 */
const MAX_SHAPE_GROUPS = 8;
/** 그룹당 읽을 파일 수. probe는 3개만 보고, 왕복 측정도 로케일 몇 개면 판정이 선다. */
const MAX_PER_SHAPE_GROUP = 12;
/**
 * ts-dict `detect`가 디렉터리당 `SEED_FILES`(8)개를 probe한다. read까지 감안해 같은 수를 준다.
 *
 * ⚠️ **이 층은 프로덕션보다 넓다** (2026-09-14). 프로덕션 씨앗(`tsDictProbePaths`)은 **디렉터리 2개**만
 * 고르고 `aside`를 걷어내는데 여기는 i18n 신호가 있는 디렉터리를 전부 담는다 — 그래서 실측의
 * ts-dict 후보 수는 **상한**이고 프로덕션이 그보다 적게 본다. 지표를 읽을 때 그 방향을 전제한다.
 */
const TS_PER_DIR = 8;
/** 로케일 이름 소스 파일이 모인 디렉터리(= `code-dict` 후보)는 조금 더 본다 — 로케일 수가 지표다. */
const LOCALE_CODE_PER_DIR = 12;

export type FileSelection = {
  /** 물리화할 경로. 정렬돼 있다 — 입력 순서에 의존하지 않는다. */
  paths: string[];
  configFiles: string[];
  truncated: boolean;
};

export function selectSurveyFiles(allPaths: readonly string[]): FileSelection {
  const wanted = new Set<string>();

  // ── chrome `_locales` — 로케일이 2개 이상인 root의 파일 전부 ──────────
  const chromeByRoot = new Map<string, string[]>();
  for (const p of allPaths) {
    const m = LOCALES_PATH.exec(p);
    if (!m || !looksLikeLocale(m[2] ?? "")) continue;
    const root = m[1] ?? "";
    (chromeByRoot.get(root) ?? chromeByRoot.set(root, []).get(root)!).push(p);
  }
  for (const [, files] of chromeByRoot) {
    if (files.length >= 2) for (const f of files) wanted.add(f);
  }

  // ── json 카탈로그 — 로케일 이름 파일이 2개 이상인 디렉터리 ────────────
  const jsonByDir = new Map<string, string[]>();
  for (const p of allPaths) {
    const m = JSON_FILE.exec(p);
    if (!m || !looksLikeLocale(m[2] ?? "")) continue;
    const dir = m[1] ?? "";
    (jsonByDir.get(dir) ?? jsonByDir.set(dir, []).get(dir)!).push(p);
  }
  for (const [, files] of jsonByDir) {
    if (files.length >= 2) for (const f of files) wanted.add(f);
  }

  // ── YAML 카탈로그 ────────────────────────────────────────────────────
  //
  // ⚠️ **이걸 빼먹으면 `yaml-catalog`는 존재하지 않는 어댑터가 된다.** 실측 3회차에서 YAML이
  // 1순위로 잡힌 리포가 0개였는데 원인이 어댑터가 아니라 여기였다 — probe에 내용이 오지 않았다.
  const yamlByDir = new Map<string, string[]>();
  for (const p of allPaths) {
    if (NEVER.test(p)) continue;
    const m = YAML_FILE.exec(p);
    if (!m || !looksLikeLocale(m[2] ?? "")) continue;
    const dir = m[1] ?? "";
    (yamlByDir.get(dir) ?? yamlByDir.set(dir, []).get(dir)!).push(p);
  }
  for (const [, files] of yamlByDir) {
    if (files.length >= 2) for (const f of files) wanted.add(f);
  }

  // ── 접두사 붙은 파일명 · 로케일 디렉터리 ─────────────────────────────
  //
  // ⚠️ **어댑터가 새 경로 모양을 받으면 이 층도 같은 커밋에서 고친다.** `yaml-catalog`을
  // 만들고 여기에 `.yml`을 안 넣어 어댑터가 3회차 내내 1순위 0개였다 (POSTMORTEM 2026-09-02).
  const shaped = new Map<string, Array<{ locale: string; path: string }>>();
  const push = (key: string, locale: string, path: string): void => {
    (shaped.get(key) ?? shaped.set(key, []).get(key)!).push({ locale, path });
  };
  for (const p of allPaths) {
    const j = JSON_FILE.exec(p);
    if (j && !looksLikeLocale(j[2] ?? "")) {
      const split = splitLocaleSuffix(j[2] ?? "");
      if (split) push(`${j[1] ?? ""}${split.prefix}.json`, split.locale, p);
    }
    const y = YAML_FILE.exec(p);
    if (y && !NEVER.test(p) && !looksLikeLocale(y[2] ?? "")) {
      const split = splitLocaleSuffix(y[2] ?? "");
      if (split) push(`${y[1] ?? ""}${split.prefix}.${y[3] ?? "yml"}`, split.locale, p);
    }
    const d = LOCALE_DIR_FILE.exec(p);
    if (d && looksLikeLocale(d[2] ?? "")) {
      // 크롬 `_locales`는 위에서 이미 전부 담았다.
      const isChrome = d[3] === "messages" && (d[1] ?? "").endsWith("_locales/");
      if (!isChrome) push(`${d[1] ?? ""}{}/${d[3] ?? ""}.json`, d[2] ?? "", p);
    }
  }
  for (const [, files] of rankShapeGroups(shaped)) {
    for (const f of enFirst(files).slice(0, MAX_PER_SHAPE_GROUP)) wanted.add(f.path);
  }

  // ── 코드 딕셔너리 — 디렉터리를 좁히지 않으면 리포 전체 소스를 읽게 된다 ──
  //
  // ⚠️ **이 좁힘이 측정의 한계다.** i18n 신호가 없는 디렉터리에 로케일 딕셔너리를 둔 리포는
  // 탐지되지 않는다. 다만 이 편향은 **한 방향뿐**이다 — ts-dict 탐지를 과소 보고할 뿐
  // 없는 오탐을 만들어내지 않는다. 좁히지 않으면 리포당 수천 파일을 ts-morph로 파싱한다.
  const codeByDir = new Map<string, string[]>();
  for (const p of allPaths) {
    const m = CODE_FILE.exec(p);
    if (!m) continue;
    const dir = m[1] ?? "";
    (codeByDir.get(dir) ?? codeByDir.set(dir, []).get(dir)!).push(p);
  }
  for (const [dir, files] of codeByDir) {
    const localeNamed = files.filter((f) => looksLikeLocale(f.replace(/^.*\//, "").replace(/\.(tsx?|mjs|js)$/, "")));
    const worthReading = I18N_HINT.test(dir) || localeNamed.length >= 2;
    if (!worthReading) continue;
    // 로케일 이름 파일이 모인 디렉터리는 `code-dict` 후보다 — 그쪽을 우선해서 담는다.
    // 나머지(ts-dict 형태 probe)는 디렉터리당 소수만 본다: ts-morph 파싱이 비싸다.
    const ordered = [...localeNamed.slice().sort(compareKeys), ...files.filter((f) => !localeNamed.includes(f)).sort(compareKeys)];
    for (const f of ordered.slice(0, localeNamed.length >= 2 ? LOCALE_CODE_PER_DIR : TS_PER_DIR)) wanted.add(f);
  }

  // 존재 여부만 세므로 내용을 읽지 않는다 — 물리화 목록에는 넣지 않는다.
  const configFiles = allPaths.filter((p) => CONFIG.some((re) => re.test(p))).sort(compareKeys);

  const sorted = [...wanted].sort(compareKeys);
  return {
    paths: sorted.slice(0, FILE_BUDGET),
    configFiles,
    truncated: sorted.length > FILE_BUDGET,
  };
}

/** 후보가 될 만한 그룹부터 — i18n 신호 → 예제 감점 → 로케일 수 → 얕은 경로 → 키순. */
function rankShapeGroups(
  groups: ReadonlyMap<string, Array<{ locale: string; path: string }>>,
): Array<[string, Array<{ locale: string; path: string }>]> {
  return [...groups.entries()]
    .filter(([, files]) => files.length >= 2)
    .sort(([ka, fa], [kb, fb]) => {
      const sa = pathSignals(ka);
      const sb = pathSignals(kb);
      if (sa.hint !== sb.hint) return sa.hint ? -1 : 1;
      if (sa.aside !== sb.aside) return sa.aside ? 1 : -1;
      if (fa.length !== fb.length) return fb.length - fa.length;
      if (sa.depth !== sb.depth) return sa.depth - sb.depth;
      return compareKeys(ka, kb);
    })
    .slice(0, MAX_SHAPE_GROUPS);
}

/**
 * `en`을 앞에 두고 나머지는 경로순.
 *
 * ⚠️ **상한으로 자를 때 `en`이 밀려나면 probe가 실패한다** — `verifySamples`가 `en`을 먼저 보는데
 * 경로 사전순으로 자르면 `ar`·`bg` 같은 스텁만 남는다 (ARCHITECTURE §1.3과 같은 함정).
 */
function enFirst(files: readonly { locale: string; path: string }[]): Array<{ locale: string; path: string }> {
  const rest = files.filter((f) => f.locale !== "en").sort((a, b) => compareKeys(a.path, b.path));
  return [...files.filter((f) => f.locale === "en"), ...rest];
}

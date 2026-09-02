import { compareKeys, looksLikeLocale } from "../adapters/shared";

/**
 * **어떤 파일을 물리화할지 고르는 것 자체가 로직이다.**
 *
 * 리포 전체 내용을 메모리에 올릴 수 없다(immich·mastodon 급이면 수백 MB). 껍데기는 경로 목록을
 * 먼저 받고 여기서 고른 것만 읽는다 — GitHub API의 `probe` 콜백이 "블롭 읽기가 비싸서 후보만
 * 확인"하는 것과 같은 구조이고, blobless partial clone이 git 수준에서 그 두 단계를 그대로 준다.
 *
 * 껍데기에 두면 테스트가 안 되므로 순수 함수로 뺐다 (design.md).
 */

/** `lib/adapters/shared.ts`의 것과 같은 신호. i18n 계열 디렉터리 이름. */
const I18N_HINT = /(^|\/)(i18n|locale|locales|lang|langs|messages|translation|translations)(\/|$)/i;

const CHROME = /^(.*)_locales\/([^/]+)\/messages\.json$/;
const JSON_FILE = /^(.*\/)([^/]+)\.json$/;
const TS_FILE = /^(.*\/)[^/]+\.tsx?$/;

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
/** ts-dict `detect`가 디렉터리당 최대 4개를 probe한다. read까지 감안해 조금 더 준다. */
const TS_PER_DIR = 8;

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
    const m = CHROME.exec(p);
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

  // ── ts 딕셔너리 — 디렉터리를 좁히지 않으면 리포 전체 .ts를 읽게 된다 ──
  //
  // ⚠️ **이 좁힘이 측정의 한계다.** i18n 신호가 없는 디렉터리에 로케일 딕셔너리를 둔 리포는
  // 탐지되지 않는다. 다만 이 편향은 **한 방향뿐**이다 — ts-dict 탐지를 과소 보고할 뿐
  // 없는 오탐을 만들어내지 않는다. 좁히지 않으면 리포당 수천 파일을 ts-morph로 파싱한다.
  const tsByDir = new Map<string, string[]>();
  for (const p of allPaths) {
    const m = TS_FILE.exec(p);
    if (!m) continue;
    const dir = m[1] ?? "";
    (tsByDir.get(dir) ?? tsByDir.set(dir, []).get(dir)!).push(p);
  }
  for (const [dir, files] of tsByDir) {
    const localeNamed = files.filter((f) => looksLikeLocale(f.replace(/^.*\//, "").replace(/\.tsx?$/, "")));
    const worthReading = I18N_HINT.test(dir) || localeNamed.length >= 2;
    if (!worthReading) continue;
    for (const f of files.slice().sort(compareKeys).slice(0, TS_PER_DIR)) wanted.add(f);
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

import { ADAPTERS, matchGlobPaths } from "@/lib/adapters";
import type { AdapterName } from "@/lib/adapters/types";
import { templatePaths } from "@/lib/onboarding/confirm";

/**
 * **"base가 앞섰다"의 숫자** (projects-list design §3.4 C′).
 *
 * compare가 주는 것은 경로뿐이라 세는 단위도 **로케일 파일**이다. 시안의 `12 keys`가 여기서
 * `3 locale files`가 된 이유가 그것이고, **키 수를 지어내지 않는다** — 서버는 그 커밋을 체크아웃하지
 * 않으므로 셀 수가 없다.
 *
 * ⚠️ **`resolveLocalePaths`를 필터로 쓰지 않는다.** 그 함수는 per-locale에서 입력 경로를 무시하고
 * multi-locale에서 일치 0개를 오류로 보는 **export 계약**이다. 여기서 묻는 것은 "이 변경이 로케일
 * 파일을 건드렸나"이고 일치 0은 정상 0이다.
 *
 * ⚠️ **`lib/projects/list.ts`에서 이 모듈을 읽지 않는다** — 저쪽은 잎이어야 하고(클라이언트 그래프),
 * 여기는 어댑터 그래프를 문다. 읽는 것은 서버의 `remote.ts`와 테스트뿐이다.
 */
export function changedLocaleFileCount(
  format: { adapter: AdapterName; pathTemplate: string; storedLocales: readonly string[] },
  files: readonly { filename: string; previous_filename?: string }[],
): number {
  const layout = ADAPTERS.find((a) => a.name === format.adapter)?.layout;
  // 모르는 어댑터는 어느 파일도 가리키지 못한다 — `templatePaths`와 같은 판정이다.
  if (layout === undefined) return 0;

  // rename의 **양쪽**을 후보에 넣는다 — 로케일 자리로 들어온 것도, 나간 것도 변경이다.
  const paths = files.flatMap((f) => (f.previous_filename === undefined ? [f.filename] : [f.filename, f.previous_filename]));
  const matched = new Set(templatePaths(format.adapter, format.pathTemplate, paths));

  /**
   * ⚠️ **저장 로케일의 정확한 경로를 합친다** (design §3.4). `templatePaths`의 per-locale 갈래는
   * `looksLikeLocale`로 거르는데 그 규칙이 `es-419`의 숫자와 `zh-Hant-TW`의 길이를 떨어뜨린다 —
   * 실제로 그 코드로 적재된 프로젝트의 파일이 통째로 안 보이게 된다.
   *
   * multi-locale은 하지 않는다 — 파일 하나에 전 로케일이 들어 있어 코드별 경로라는 것이 없다.
   */
  if (layout === "per-locale") {
    for (const code of format.storedLocales) matched.add(format.pathTemplate.replaceAll("{locale}", code));
  } else {
    // 글롭 갈래는 `matchGlobPaths`가 정본이다 — `templatePaths`가 이미 그것을 지나지만, 예산 초과로
    // 빈 배열이 된 경우와 "일치 0"을 가르지 않으므로 같은 규칙을 다시 적지 않고 결과만 쓴다.
    for (const path of matchGlobPaths(format.pathTemplate, paths)) matched.add(path);
  }

  // **파일 레코드당 한 번**이다 — rename의 두 경로가 다 맞아도 하나로 센다.
  return files.filter((f) => matched.has(f.filename) || (f.previous_filename !== undefined && matched.has(f.previous_filename))).length;
}

/**
 * `Project.lastPrUrl`에서 PR 번호를 뽑는다.
 *
 * ⚠️ **URL을 믿되 형태만 믿는다** — 이 값은 우리가 `createPr`에서 받아 저장한 것이지만, 옛 행에는
 * 다른 모양이 있을 수 있고 번호가 없으면 **PR 조회를 건너뛴다**(요청 0). 추측한 번호로 남의 PR을
 * 조회하지 않는다.
 */
export function pullNumberFrom(url: string | null): number | null {
  if (url === null) return null;
  const matched = /\/pull\/(\d+)(?:[/?#]|$)/.exec(url);
  if (matched === null) return null;
  const parsed = Number(matched[1]);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

import { fail } from "@/lib/failure";
import { SKIP_MARKER } from "@/lib/pull/payload";

import type { WorkflowSurface } from "./workflow";

/**
 * **GitLab CI 원본의 릴리스 축** (gitlab-repositories D5). 앱 태그 `v<x.y.z>`·GitHub action 태그 `malmoi-i18n-push-vN`과 별개다.
 * 생성 job이 이 태그로 말모이 리포를 shallow clone하고 `HEAD`를 `sha`와 대조한다 — 태그가 옮겨져도 박힌 SHA 밖의 코드는
 * `PUSH_TOKEN`을 든 남의 러너에서 돌지 않는다.
 *
 * ⚠️ **`sha: null` = 발행 전이다**(v1은 2026-10-13 `v1.4.0` squash 커밋에 발행). 태그를 처음 만드는 것은 action 릴리스와 같은 절차이고(`docs/ACTIONS.md` GitLab 절), 그때 이
 * 값을 태그 커밋의 40자 SHA로 채운다. 채우기 전의 생성 job은 `MALMOI_I18N_PUSH_SHA: "unreleased"`를 박아 **대조에서 실패한다**
 * (fail-closed — 박힌 SHA 없이 태그 코드를 돌리는 길을 만들지 않는다).
 */
export const GITLAB_CI_RELEASE: { readonly tag: string; readonly sha: string | null } = {
  tag: "malmoi-i18n-push-gitlab-v1",
  sha: "456e0e1f25514cf7ed7357958b4d0b2dd6723fd8",
};

/**
 * 생성 job의 이미지 — Node 24 공식 이미지를 버전 태그 + **인덱스 digest**로 고정한다(2026-10-12 registry 실측). 태그만 두면 같은 이름의
 * 재빌드가 들어오고, digest만 두면 사람이 판을 읽을 수 없다. `bookworm`(slim 아님)인 것은 clone에 `git`이 필요해서다.
 * ⚠️ 판을 올리면 `.nvmrc`의 major와 맞춘다 — `push.sh`가 다르면 경고한다.
 */
export const GITLAB_CI_IMAGE = "node:24.20.0-bookworm@sha256:be23f54a88d34e8824c741b19b91064094f92c1c97b194144bfc8b50d67258e2";

/**
 * **프로젝트의 `.gitlab-ci.yml` job — 활성 표면마다 job 하나다.** `renderProjectWorkflowYaml`(GitHub)의 짝이고, 같은 `WorkflowSurface`
 * (`workflowSurfaceOf`의 결과)와 같은 `apiUrl`(`workflowApiUrl`의 결과 — 셀프 호스팅이면 항상 있다)을 받는다.
 *
 * ⚠️ **`docs/ACTIONS.md` GitLab 절의 예시가 정본이다** — `__tests__/gitlab-ci.test.ts`가 줄 단위로 대조한다.
 *
 * 모양: 숨은 기반 job(`.malmoi-i18n-<slug>`)이 이미지·rules·clone 스크립트·프로젝트 변수를 들고, 표면 job이 `extends`로 표면 변수만
 * 더한다. GitHub처럼 한 job에 step을 잇지 않는 것은 **표면 값을 셸 인자가 아니라 `variables`로만 넘기려는 것이다** — `variables` 값은
 * 셸이 해석하지 않는다. job 이름에 프로젝트 slug가 드는 것은 한 리포의 두 프로젝트가 같은 이름의 job으로 서로를 덮지 않게 하려는 것이다
 * (GitHub `concurrency.group`의 slug와 같은 이유).
 */
export function renderProjectGitlabCiYaml(input: {
  slug: string;
  /** `Project.baseBranch` — rules가 이 값과 정확히 같은 브랜치의 push에서만 돈다. */
  baseBranch: string;
  surfaces: readonly WorkflowSurface[];
  apiUrl?: string;
}): string {
  const { slug, baseBranch, surfaces, apiUrl } = input;
  if (surfaces.length === 0) fail("a GitLab CI file needs at least one surface");
  const baseJob = `.malmoi-i18n-${slug}`;
  const lines = [
    // ⚠️ 사용자 리포에 복사되는 줄이라 영어다.
    `${baseJob}:`,
    `  image: ${GITLAB_CI_IMAGE}`,
    "  # Runs only for pushes to the base branch, and not for commits Malmoi made — without the marker check, push and Publish call each other.",
    "  rules:",
    `    - if: '$CI_PIPELINE_SOURCE == "push" && $CI_COMMIT_BRANCH == $MALMOI_I18N_BASE_BRANCH && $CI_COMMIT_MESSAGE !~ /${markerPattern()}/'`,
    "  interruptible: true",
    "  variables:",
    `    MALMOI_I18N_PUSH_TAG: ${GITLAB_CI_RELEASE.tag}`,
    `    MALMOI_I18N_PUSH_SHA: ${quote(GITLAB_CI_RELEASE.sha ?? "unreleased")}`,
    // ⚠️ **base 브랜치는 변수로 비교한다** — 사용자가 고른 이름(`release/"2.0"`)을 rules 식에 직접 넣으면 식의 따옴표가 깨진다.
    `    MALMOI_I18N_BASE_BRANCH: ${quote(baseBranch)}`,
    `    MALMOI_I18N_PROJECT: ${quote(slug)}`,
    ...(apiUrl === undefined ? [] : [`    MALMOI_I18N_API_URL: ${quote(apiUrl)}`]),
    "  script:",
    "    - rm -rf .malmoi",
    // ⚠️ **바뀌는 참조로 받지 않는다** — `include: remote`·브랜치 ref면 말모이 커밋 하나가 `PUSH_TOKEN`을 든 남의 러너에서 즉시 돈다.
    '    - git clone --quiet --depth 1 --branch "$MALMOI_I18N_PUSH_TAG" https://github.com/SinhyeokKang/malmoi.git .malmoi',
    "    # Refuses to run anything the pinned commit didn't contain, even if the tag moves.",
    `    - '[ "$(git -C .malmoi rev-parse HEAD)" = "$MALMOI_I18N_PUSH_SHA" ] || { echo "Malmoi push script does not match the pinned commit"; exit 1; }'`,
    "    - .malmoi/.gitlab/malmoi-i18n-push/push.sh",
  ];
  for (const surface of surfaces) {
    lines.push(
      "",
      `malmoi-i18n-${slug}-${surface.surfaceSlug}:`,
      `  extends: ${baseJob}`,
      "  variables:",
      `    MALMOI_I18N_SURFACE: ${quote(surface.surfaceSlug)}`,
      `    MALMOI_I18N_PATH_TEMPLATE: ${quote(surface.pathTemplate)}`,
      ...(surface.adapter === undefined ? [] : [`    MALMOI_I18N_ADAPTER: ${quote(surface.adapter)}`]),
      ...(surface.baseLocale === undefined ? [] : [`    MALMOI_I18N_BASE: ${quote(surface.baseLocale)}`]),
      // action v3 `wrapper` 입력의 짝 — 빈 값이면 플래그가 없다(`lib/cli/gitlab-ci-input.ts`). 사용자 리포에 복사되는 주석이라 영어다.
      "    # Repositories that read translations through a hook: list wrapper specs (module#export), one per line.",
      '    MALMOI_I18N_WRAPPER: ""',
    );
  }
  return `${lines.join("\n")}\n`;
}

/** rules 정규식 안의 마커 — 리터럴은 `SKIP_MARKER` 하나에서 만든다(`skip-marker.test.ts`가 소비자를 센다). */
function markerPattern(): string {
  return SKIP_MARKER.replace(/[[\]]/g, "\\$&");
}

/**
 * `variables` 값. `JSON.stringify`가 YAML 이중 인용과 같은 이스케이프 규칙이고, ⚠️ **`$`는 `$$`로 적는다** — GitLab은 변수 값을
 * 다시 전개하므로 `rel$HOME` 같은 이름이 다른 값으로 바뀐다.
 */
function quote(value: string): string {
  return JSON.stringify(value.replaceAll("$", () => "$$"));
}

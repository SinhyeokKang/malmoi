import type { AdapterName } from "@/lib/adapters/types";
import { isAdapterName } from "@/lib/adapters";
import { fail } from "@/lib/failure";
import { basePending } from "./base-pending";

/**
 * push step 하나 — **워크플로 파일의 유일한 step 생산자다**. Add surface 결과 화면은 이것만 보이고
 * (기존 파일에 덧붙인다), 파일 전체는 `renderProjectWorkflowYaml`이 이것을 표면 수만큼 잇는다.
 *
 * ⚠️ **불변 태그다** (2026-09-09, sec-audit 발견 3). 이 스텝에 대상 리포의 `secrets.PUSH_TOKEN`이
 * 들어가므로 `@main`이면 말모이 `main`의 커밋 하나가 **남의 러너에서 즉시** 돈다 — 소비자 측 리뷰도
 * 롤백 창도 없다. ⚠️ `workflow-pins.test.ts`는 `.github/`만 훑어 **이 줄을 못 본다**
 * (`docs/ACTIONS.md`의 핀 문단이 그 구멍을 적는다).
 *
 * ⚠️ **`docs/ACTIONS.md`의 예시가 정본이다** — 두 벌이 갈리면 문서를 보고 붙인 리포와 화면을 보고
 * 붙인 리포가 다르게 동작한다. `__tests__/workflow.test.ts`가 주석·빈 줄을 뺀 채 줄 단위로 대조한다.
 *
 * `wrapper`는 넣지 않는다 — 훅 기반 리포는 `docs/ACTIONS.md`를 보라고 화면이 따로 말한다.
 */
export function renderSurfaceWorkflowStep(input: {
  slug: string; surfaceSlug: string; pathTemplate: string; adapter?: AdapterName; baseLocale?: string;
}): string {
  return [
    "      - uses: SinhyeokKang/malmoi/.github/actions/malmoi-i18n-push@malmoi-i18n-push-v1",
    "        with:",
    "          push-token: ${{ secrets.PUSH_TOKEN }}",
    `          project: ${input.slug}`,
    `          surface: ${input.surfaceSlug}`,
    `          path-template: ${JSON.stringify(input.pathTemplate)}`,
    ...(input.adapter === undefined ? [] : [`          adapter: ${input.adapter}`]),
    ...(input.baseLocale === undefined ? [] : [baseLocaleLine(input.baseLocale)]),
    "          github-token: ${{ secrets.GITHUB_TOKEN }}   # for the open-PR warning (read only)",
    "",
  ].join("\n");
}

/** 워크플로 step 하나가 필요로 하는 전부. 표면 행에서 만드는 것은 `workflowSurfaceOf`다. */
export type WorkflowSurface = {
  surfaceSlug: string;
  pathTemplate: string;
  /** 확정한 어댑터 — 생성 경로와 무관하게 CI가 같은 포맷을 사용한다. */
  adapter?: AdapterName;
  /** 확정한 기준 언어. **생산자 둘 다 언제나 넣는다** — 생략하면 CI가 탐지 1순위를 보낸다. */
  baseLocale?: string;
};

/**
 * 표면 하나짜리 워크플로 파일. 온보딩 ④는 표면이 **항상 하나**라 이 모양으로 부른다 —
 * 아래 `renderProjectWorkflowYaml`의 얇은 래퍼이고 구현은 한 벌이다.
 */
export function renderWorkflowYaml(input: { slug: string; baseBranch: string } & WorkflowSurface): string {
  const { slug, baseBranch, ...surface } = input;
  return renderProjectWorkflowYaml({ slug, baseBranch, surfaces: [surface] });
}

/**
 * **프로젝트의 워크플로 파일 — 활성 표면마다 step 하나다** (ARCHITECTURE §3.1 · 대상 리포 계약).
 *
 * 복사용 `.github/workflows/malmoi-i18n.yml`이다 (PRODUCT §7.4). App 권한(`workflows: write`)을 늘리지
 * 않고 사용자가 붙인다 — 설치 화면의 "워크플로 파일을 수정합니다"가 비개발자에게 가장 무거운
 * 문장이고, 로케일 파일 하나 쓰려고 CI 정의를 통째로 바꿀 권한을 드는 것이 면적에 맞지 않는다.
 *
 * ⚠️ **Add surface 결과 화면을 벗어나면 두 번째 표면의 step을 다시 볼 자리가 설정 화면뿐이다.**
 * 그 화면이 기본 표면 하나만 렌더하면 사람이 `surface:`·`path-template:`을 손으로 조립하는데,
 * push 토큰은 **프로젝트 단위**라 틀린 `surface:`는 401도 409도 아니고 **다른 표면을 덮어쓴다.**
 *
 * ⚠️ **정렬을 여기서 하지 않는다** — 호출부가 표면 순서를 소유한다(설정 화면은 slug asc). 여기서
 * 다시 정렬하면 두 벌이 갈리고, 화면의 목록 순서와 YAML의 step 순서가 어긋난다.
 */
export function renderProjectWorkflowYaml(input: {
  slug: string;
  /** `Project.baseBranch` — `main`으로 고정하면 base가 `develop`인 리포에서 CI가 영영 안 돈다. */
  baseBranch: string;
  surfaces: readonly WorkflowSurface[];
}): string {
  const { slug, baseBranch, surfaces } = input;
  // step이 없는 워크플로는 red 없이 **조용히 아무것도 안 한다** — 화면이 붙여넣기를 권한 파일이라
  // 그 침묵의 비용이 크다. 활성 표면이 0인 프로젝트는 마이그레이션 precondition이 이미 막는다.
  if (surfaces.length === 0) fail("a workflow needs at least one surface");

  // ⚠️ **`""` 둘이 빈 줄 하나다.** 앞의 하나가 checkout 줄을 끝내고 뒤의 하나가 빈 줄을 만든다 —
  // step 사이의 `join("\n")`과 같은 간격이라 표면 수와 무관하게 모양이 같다.
  return [...header(slug, baseBranch), "", ""].join("\n")
    + surfaces.map((surface) => renderSurfaceWorkflowStep({ slug, ...surface })).join("\n");
}

/**
 * 표면 행 → step 입력. **6b-3의 대기 규칙이 여기 산다** — 선언이 대기 중이면 어댑터와 무관하게
 * `base-locale:`을 박는다. 그 줄이 없으면 CI가 탐지 1순위(= 옛 base)를 보내고 `checkFormat`이
 * 통과시켜, 사용자가 요청한 base 변경이 **영영 일어나지 않는다.** 조용하다.
 *
 * ⚠️ **선언이 없어도 저장된 base를 박는다** (2026-09-14 실물 검증). "자동 후보는 탐지가 같은 답을
 * 낸다"는 전제가 **온보딩 ③에서 사용자가 기준 언어를 고르기 시작한 순간 거짓이 됐다** — 1순위가
 * 아닌 base를 확정한 표면의 CI는 탐지 1순위를 보내고 `checkFormat`이 409를 낸다. ④는 그 값을
 * 박는데 이 함수가 생략하면 **같은 프로젝트의 두 화면이 다른 워크플로를 권한다.**
 */
export function workflowSurfaceOf(surface: {
  slug: string;
  pathTemplate: string | null;
  adapterName: string | null;
  baseLocale: string | null;
  declaredBaseLocale: string | null;
}): WorkflowSurface {
  const pending = basePending({ baseLocale: surface.baseLocale, declaredBaseLocale: surface.declaredBaseLocale });
  const baseLocale = pending ? surface.declaredBaseLocale : surface.baseLocale;
  const adapter = surface.adapterName;
  if (adapter !== null && !isAdapterName(adapter)) fail("unknown workflow adapter");
  return {
    surfaceSlug: surface.slug,
    // 첫 push 전이면 비어 있다 — 그 프로젝트는 아직 CI를 붙이기 전이고 화면이 그렇게 말한다.
    pathTemplate: surface.pathTemplate ?? "",
    ...(baseLocale === null ? {} : { baseLocale }),
    // 수동 지정 이력은 필요 없다 — 저장된 포맷을 재현하고 탐지 순위에 맡기지 않는다.
    ...(adapter === null ? {} : { adapter }),
  };
}

function header(slug: string, baseBranch: string): string[] {
  return [
    "name: malmoi-i18n",
    "",
    "on:",
    "  push:",
    // ⚠️ **인용한다.** 브랜치 이름이 사용자 선택이 된 뒤로(new-project-modal T5) `a,b`·`a"b`가 올 수
    // 있고, 맨값이면 flow sequence가 쉼표에서 **조용히 둘로 갈린다**. `JSON.stringify`가 YAML 이중
    // 인용과 같은 이스케이프 규칙이다.
    `    branches: [${JSON.stringify(baseBranch)}]`,
    "  workflow_dispatch:",
    "",
    "concurrency:",
    // ⚠️ slug가 들어가는 것이 요지다 — 한 리포에 프로젝트가 둘이면 같은 그룹에서 서로를 취소한다.
    `  group: malmoi-i18n-${slug}-\${{ github.ref }}`,
    "  cancel-in-progress: true",
    "",
    "permissions:",
    "  contents: read",
    "  pull-requests: read",
    "",
    "jobs:",
    "  push:",
    // ⚠️ 사용자 리포에 복사되는 줄이라 영어다 — 이 파일의 주석(한국어)과 성격이 다르다.
    "    # Keeps the workflow from re-running when a translation PR is merged — without it, push and pull call each other.",
    "    if: \"!contains(github.event.head_commit.message, '[skip-malmoi-i18n]')\"",
    "    runs-on: ubuntu-latest",
    "    steps:",
    // ⚠️ **가변 태그를 쓰지 않는다** — 이 스텝은 대상 리포에서 `secrets.PUSH_TOKEN`을 든 job 안에
    // 돌므로 태그가 옮겨지면 남의 커밋이 그 토큰 옆에서 즉시 실행된다. `workflow-pins.test.ts`는
    // `.github/`만 훑어 **이 줄을 못 본다**(docs/ACTIONS.md의 핀 문단이 그 구멍을 적는다).
    "      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4",
  ];
}

/**
 * 워크플로의 `base-locale:` 한 줄 — **들여쓰기까지 포함해 붙여넣을 수 있는 형태다**.
 *
 * ⚠️ **리터럴을 두 벌 두지 않으려고 함수로 뺐다** (6b-3). 기준 로케일 변경 대기 Alert가 "이 줄을
 * 고쳐라"로 같은 줄을 보이는데, 그때 들여쓰기나 키 이름이 갈리면 사용자가 붙여넣은 YAML이
 * action의 input과 어긋나 CI가 조용히 옛 base를 계속 보낸다.
 */
export function baseLocaleLine(baseLocale: string): string {
  return `          base-locale: ${baseLocale}`;
}

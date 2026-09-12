import type { AdapterName } from "@/lib/adapters/types";

/**
 * 결과 화면의 복사용 `.github/workflows/l10n.yml` (design §7). App 권한(`workflows: write`)을 늘리지 않고
 * 사용자가 붙인다 — 설치 화면의 "워크플로 파일을 수정합니다"가 비개발자에게 가장 무거운 문장이고, 로케일 파일
 * 하나 쓰려고 CI 정의를 통째로 바꿀 수 있는 권한을 드는 것이 면적에 맞지 않는다.
 *
 * ⚠️ **`docs/ACTIONS.md`의 예시가 정본이다.** 이 함수는 그것을 slug만 바꿔 낸다 — 두 벌이 갈리면 문서를 보고
 * 붙인 리포와 화면을 보고 붙인 리포가 다르게 동작한다. `__tests__/workflow.test.ts`가 주석·빈 줄을 뺀 채
 * 줄 단위로 대조한다. 문서의 예시를 고치면 여기도 고친다.
 *
 * `wrapper`는 넣지 않는다 — 훅 기반 리포는 `docs/ACTIONS.md`를 보라고 화면이 따로 말한다.
 */
export function renderWorkflowYaml(input: {
  slug: string;
  /** `Project.baseBranch` — `main`으로 고정하면 base가 `develop`인 리포에서 CI가 영영 안 돈다. */
  baseBranch: string;
  /** 수동 지정한 경우에만 — 자동 후보면 탐지가 같은 답을 내므로 고정할 이유가 없다. */
  adapter?: AdapterName;
  baseLocale?: string;
}): string {
  const { slug, baseBranch, adapter, baseLocale } = input;
  const extra = [
    adapter === undefined ? [] : [`          adapter: ${adapter}`],
    baseLocale === undefined ? [] : [baseLocaleLine(baseLocale)],
  ].flat();

  return [
    "name: l10n",
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
    `  group: l10n-${slug}-\${{ github.ref }}`,
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
    "    if: \"!contains(github.event.head_commit.message, '[skip-l10n]')\"",
    "    runs-on: ubuntu-latest",
    "    steps:",
    // ⚠️ **가변 태그를 쓰지 않는다** — 이 스텝은 대상 리포에서 `secrets.PUSH_TOKEN`을 든 job 안에
    // 돌므로 태그가 옮겨지면 남의 커밋이 그 토큰 옆에서 즉시 실행된다. `workflow-pins.test.ts`는
    // `.github/`만 훑어 **이 줄을 못 본다**(docs/ACTIONS.md의 핀 문단이 그 구멍을 적는다).
    "      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4",
    "",
    // ⚠️ **불변 태그다** (2026-09-09, sec-audit 발견 3). 이 스텝에 `secrets.PUSH_TOKEN`이 들어가므로
    // `@main`이면 말모이 `main`의 커밋 하나가 **대상 리포 러너에서 즉시** 돈다 — 소비자 측 리뷰도
    // 롤백 창도 없다. `docs/ACTIONS.md`의 예시와 줄 단위로 대조되므로 둘이 함께 움직인다.
    "      - uses: SinhyeokKang/malmoi/.github/actions/l10n-push@l10n-push-v1",
    "        with:",
    "          push-token: ${{ secrets.PUSH_TOKEN }}",
    `          project: ${slug}`,
    ...extra,
    "          github-token: ${{ secrets.GITHUB_TOKEN }}   # for the open-PR warning (read only)",
    "",
  ].join("\n");
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

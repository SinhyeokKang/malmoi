# github-connect — GitHub 설치 연결

> **SaaS 4단계** (`docs/SAAS.md` §8). 앞 단계는 `features/tenant-auth/`(2단계·3단계), 뒤는
> `features/project-onboarding/`(5단계 — **예정**, 디렉터리 아직 없음)다. **이 문서는 스펙이 아니라
> 근거다** — 결론은 SAAS.md로 올라간다.
>
> 2026-09-06 `/feature-review`(CPO·CDO·CTO·QA + Codex 리포트) 반영. 가장 큰 변화는 **리포 교체를
> 지원하지 않는다**는 결정이다 — 그 결정이 화면에서 셀렉트를 전부 지웠다 (§3, design §3.2).

## 0. 범위 게이트

**SAAS §8 4단계가 이 기능을 이름으로 지정했다** (`features/github-connect/`). SaaS 비범위(§4.2)에
걸리는 항목이 없다.

⚠️ **단 `docs/MVP.md` §7 끝의 "여전히 비범위" 문장(`docs/MVP.md:391`)이 거짓이 된다.** 거기엔 이렇게
적혀 있다:

> **여전히 비범위**(SaaS 단계에서도 안 한다): 과금, 온보딩, **테넌트별 GitHub App 설치 플로**.

셋 중 둘이 이미 뒤집혔다 — "온보딩"은 SAAS §8 5단계이고, "테넌트별 GitHub App 설치 플로"에 해당하는
것이 이 기능이다. ⚠️ **정확히는 "설치 플로"가 아니라 "연결(connect)"이다** — 설치 자체는 GitHub이
하고, 우리는 설치 링크를 보여주고 돌아온 결과를 읽어 Project에 묶을 뿐이다(§4 마지막 행). T9의 MVP §7
개정 문구도 그 구별로 쓴다.

**정본 둘(MVP §7 · SAAS §4.2)이 어긋나는 것은 사용자 결정 지점이다** — CLAUDE.md "비범위 항목은
요청받아도 먼저 되묻는다". 2026-09-06 검수에서 확인했고 **SAAS 우선으로 진행**하기로 했다. MVP.md는
닫힌 문서이므로 그 줄을 고치는 것을 태스크에 넣는다(`tasks.md` T9). 코드가 스펙을 앞서면 스펙이
거짓이 된다.

**코어 원칙(MVP §2)과 충돌하지 않는다.** 이 기능은 값을 병합하지 않고, 키를 삭제하지 않고,
export 결정성에 닿지 않는다. 건드리는 것은 **누가 어느 리포에 쓸 자격이 있는가**의 판정뿐이다.

## 1. 사용자

**개발자(나 또는 리포 소유자)다.** 비개발자 동료는 이 화면을 보지 않는다 —
`project:settings` permission이 OWNER 전용이고(SAAS §3, `lib/auth/permission.ts:22-31`), EDITOR에게는
링크조차 보이지 않는다.

그래서 화면 밀도와 용어의 기준이 앞뒤 단계와 다르다: 여기서는 `installation`·`owner/repo` 같은
GitHub 용어를 **그대로 쓴다**. 사용자 언어로 번역해야 하는 것은 5단계의 탐지 결과(§3 "내부 이름은
숨긴다")이고, 이 화면은 GitHub 설정 화면의 연장이다.

⚠️ **`/projects/:slug/settings` 라우트는 이 단계가 만든다.** `tenant-auth/spec.md`는 "멤버 관리·설정
**화면**은 6단계"라 적었는데, 6단계(SAAS §8)가 실제로 드는 것은 멤버 관리 화면이다. 여기서 라우트와
"리포 연결" 섹션을 만들고 6단계가 같은 페이지에 멤버 관리 섹션을 얹는다 — T7이 tenant-auth spec을
그렇게 좁힌다. 안 적으면 6단계 착수 때 라우트가 두 번 태어난다.

## 2. 문제

**지금 `Project` 행을 사람이 손으로 만든다.** 관측된 사실 셋:

1. `Project.installationId`를 채우려면 `GET /app/installations`를 스크립트로 찔러 숫자를 눈으로 읽고
   DB에 넣어야 한다 (SAAS §8 0단계가 `158107153`을 그렇게 넣었다).
2. **`applyPush`는 `project.update`만 한다** (`lib/push/apply.ts:229`) — Project 생성 경로가 리포 어디에도
   없다 (SAAS §8 0단계).
3. **App을 제거하거나 리포 접근을 철회해도 그 상태가 어디에도 지속되지 않는다.** 실패는
   `lib/pull/run.ts:90`의 `fail("base 브랜치를 읽을 수 없다 …")`로 나타난다 — 편집 UI의 Publish 버튼은
   그것을 `pullMessage`로 보여주지만(`app/(edit)/actions.ts`), **야간 cron의 실패는 Vercel 로그에만
   남고** 다음 날 화면에 신호가 없다. 원인(제거·철회·리네임·재설치)을 가르는 곳도 없다.
   *(2026-09-06 정정: 이전 서술 "createGitClient에서 던진다"는 부정확했다 — 토큰 발급은 지연이라
   실패 지점은 첫 API 호출이다.)*

그리고 **아직 존재하지 않아서 못 막고 있는 것**이 둘 있다. SAAS §5.7의 공격 시나리오 중 둘이
"공격 표면 자체가 없다"는 이유로 4단계로 넘어와 있다:

- 설치되지 않은 리포를 Project로 등록
- 설치에 접근할 수 없는 사용자의 프로젝트 생성

⚠️ **이 둘은 "브라우저가 보낸 `installationId`를 그대로 저장하면" 즉시 성립한다** (SAAS §5.4).
이 기능은 **클라이언트에서 `installationId`를 받지 않는다** — 리포는 Project에 고정돼 있고 설치 id는
서버가 GitHub에 물어 얻는다(design §3.2). 그래도 판정 함수(`planRepoConnect`)는 5단계 생성 경로가
그대로 재사용하도록 만든다. **두 시나리오의 문구가 "등록"·"생성"이므로 종결은 생성 표면이 생기는
5단계다** — 4단계는 방어선을 만들고, 5단계가 표면과 함께 닫는다. T7이 SAAS §5.7을 그렇게 고친다.

## 3. 완료 조건

검증 가능한 문장으로 쓴다. 괄호 안이 판정 수단이다.

1. **Google로만 로그인한 사용자가 GitHub 계정을 명시적으로 연결할 수 있다** — 연결 뒤
   `Account(provider: "github-app")` 행이 그 `User.id`로 하나 생긴다. (`pnpm test` + preview 실물)
2. **이미 다른 User가 연결한 GitHub 계정은 연결되지 않는다** — 자동 병합이 아니라 거부이고,
   **화면에 사유가 보인다**. 동시에 연결해도 둘째가 첫째의 행을 덮지 않는다(`create` + P2002).
   유일성의 범위는 **`provider: "github-app"` 안**이다 — 로그인용 `github` 행과는 무관하다(의미가 다른
   인가). 한 User는 App 연결을 **하나만** 갖고, 다른 GitHub 계정으로 다시 인가하면 교체된다.
   (`planAccountLink` 단위 테스트 + 동시 callback 테스트 + preview 실물)
3. **자기가 접근할 수 없는 설치의 리포를 가진 프로젝트에서 "다시 연결"을 눌러도 저장되지 않는다** —
   결과가 `installation-forbidden`이고 `Project.update`가 **0회** 호출된다. (`pnpm test`)
4. **설치는 접근 가능하지만 그 안에서 자기가 볼 수 없는 리포면 저장되지 않는다** — `repo-forbidden`,
   update 0회. (`pnpm test`)
5. **정상 OWNER의 재연결은 인가된 `projectId` 하나에만 저장된다** — update 1회, 인자는 서버가 GitHub에서
   얻은 `installationId`(+ `repo-moved`면 새 owner/name). 다른 Project는 불변. (`pnpm test` — 거부만
   검증하면 "항상 거부하는 Action"도 통과한다, POSTMORTEM 2026-09-06)
6. **OAuth 사용자 토큰이 커밋 경로에 들어가지 않는다** — 소스 스캔 테스트가 `lib/github.ts`(App)와
   `lib/github-connect/user.ts`(사용자 토큰)의 자격증명 교차 import를 0으로 고정한다. (`pnpm test`)
7. **리포 접근이 철회돼도 번역 데이터가 남고, 설정 화면이 `app-uninstalled`를 사유와 함께 보인다** —
   접근을 복구한 뒤 같은 화면에서 "다시 연결"하면 `ok`로 돌아오고, **편집 1건 → Publish → 원래 리포에
   PR**이 난다. 재설치는 새 `installationId`를 발급하므로 `installation-changed`가 보이고 재연결이 그
   값을 저장한다. (폐기용 리포 실물 — tasks T5)
8. **리포 이름이 바뀌면 `repo-moved`가 새 이름을 보이고, 자동으로 따라가지 않는다** — 재연결을 눌러야
   `repoOwner`·`repoName`이 갱신된다. (`planConnectionHealth` 단위 테스트 + 실물 — SAAS §8 4단계 세 번째 항목)
9. **조회 실패(네트워크·5xx)가 "제거됨"으로 보이지 않는다** — `unknown`의 문구가 다르다.
   (`planConnectionHealth`·`probeFromError` 단위 테스트)
10. **연결 해제가 가능하다** — 자기 `github-app` 행을 지우고, Project와 번역 데이터는 건드리지 않는다.
    (`pnpm test`)
11. **설정 화면의 모든 진입점이 인가를 지난다** — `app/__tests__/entry-points.test.ts`가 예외 목록을
    늘리지 않고 green이다. (`pnpm test`)
12. **모든 거부 사유가 화면에 닿는다** — callback 실패는 `/projects/<slug>/settings?e=`로, state를 믿을 수
    없는 실패는 `/projects?e=`로 가고 **두 페이지 모두 그 사유를 읽어 한 줄 보인다**. (`connectErrorMessage`
    union 전수 테스트 + 두 페이지의 소스 스캔 + 실물)

## 4. 비목표

**이번에 안 하는 것.** 대부분 다음 단계에 배정돼 있다.

| 항목 | 어디로 |
|---|---|
| **리포 교체** (Project의 `repoOwner/repoName`을 다른 리포로) | **안 한다 — 다른 리포는 다른 프로젝트다** (2026-09-06 결정). 교체를 허용하면 다음 Publish가 옛 DB 번역을 새 리포 PR로 내고 다음 push에서 키 전부가 `orphaned`가 된다(`lib/pull/run.ts`는 포맷·브랜치·번역을 그대로 쓴다). 새 리포는 5단계 생성 경로로. 예외는 **`repo-moved`(리네임·이전)** — 같은 리포의 새 이름만 갱신 |
| **프로젝트 생성 화면**(`/projects/new`) | **5단계.** 여기서는 *기존* Project의 설치 연결·재연결만 만든다. 생성은 탐지 온보딩과 한 몸이다 (SAAS §8 5단계) |
| 로케일 포맷 탐지·후보 확정·첫 적재 | 5단계 (§7.3·§7.4) |
| `Project.pushTokenHash` 발급 | 5단계 (§7.8) — 발급 자리는 생성 화면이다 |
| `ready`/`setup` 상태 머신 | 5단계 (§7.5). 여기서는 **연결 건강성만** 계산하고 컬럼을 만들지 않는다 |
| 프로젝트 목록에 연결 배지 | **안 한다.** 목록 N행에 GitHub API N번이다. 설정 화면에서만 조회한다 |
| 프로젝트 보관(archive) | 미배정 (§7.9). 상태 축이 5단계에서 선 다음이다 |
| `baseBranch` 편집 | **안 한다.** 리포가 고정이라 브랜치가 사라질 경로가 없다. 브랜치 존재 확인은 5단계가 base head를 읽을 때 붙는다 |
| Workflows 권한 요구 판정 | 5단계 (§5.4·§10) — 연동 PR을 낼 때 정한다 |
| 로그인 provider를 GitHub App으로 교체 | **안 한다** — `design.md` §2.2가 기각 근거를 든다. 2차 후보로 남긴다 |
| 멤버 관리 섹션 | 6단계 — 같은 `/settings` 페이지에 얹는다 (§1) |
| GitHub App 설치 자체(설치 화면) | GitHub이 한다. 우리는 **설치 링크를 보여주고 돌아온 결과를 읽을** 뿐이다 |

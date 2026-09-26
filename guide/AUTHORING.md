# 가이드 작성 규약

공개 가이드의 구성·표기·사실 대조·검증은 이 문서를 따른다. 독자에게 보이는 원고는 영어로 쓰고, 이 매뉴얼과 촬영 매뉴얼은 한국어로 관리한다.

## 운영 방식 {#workflow}

- `guide/SUMMARY.md`가 페이지·순서·계층의 정본이다. 페이지를 추가하거나 옮기면 SUMMARY와 내부 링크를 함께 고친다.
- `guide/README.md`는 개요이고 `<chapter>/README.md`는 장 개요다. 각 페이지는 H1 하나와 바로 다음 독립 도입 문단(1–2문장)으로 시작한다. 도입에는 굵은 글씨나 링크를 넣지 않으며 카드 설명으로도 쓴다. 작업 페이지에는 필요한 사전 조건, 사용자가 고르는 것과 화면에 보이는 것을 함께 쓰는 번호 단계, `What happens next` 절을 둔다. 설명·참조 페이지에는 번호 단계가 없어도 된다.
- 개요의 두 갈래 카드와 나머지 장 목록, 장 개요의 하위 목록은 SUMMARY와 각 페이지의 도입 문단에서 생성한다. 원고에 카드·목록을 중복 작성하지 않는다. 개요는 H1과 도입만, 장 개요는 H1과 도입에 필요한 본문만 둔다.
- 두 갈래의 선택은 `lib/guide/overview.ts`가 소유한다(렌더링 단계에서 추가). 제목은 SUMMARY, 설명은 도입 문단에서 가져온다.
- `AUTHORING.md`와 `SHOOTING.md`는 SUMMARY에 올리지 않고 공개 페이지로 제공하지 않는다. SUMMARY 자신도 페이지가 아니라 내비 데이터다.
- 실제 화면은 스크린샷으로 기록하며 촬영 규약은 `SHOOTING.md`가 소유한다. 이미지 게이트와 촬영 매뉴얼이 서기 전에는 이미지 참조를 넣지 않는다.

## 페이지별 독자 {#audiences}

개발자는 프로젝트 OWNER, 편집자는 EDITOR를 뜻한다. 공통 페이지는 두 역할이 함께 읽는다.

| 페이지 | 제목 | 독자 |
| --- | --- | --- |
| `README.md` | Malmoi | 공통 |
| `setup/README.md` | Set up a project | 개발자 |
| `setup/create-project.md` | Create a project | 개발자 |
| `setup/workflow.md` | Add the workflow | 개발자 |
| `setup/allowed-actions.md` | Allow the actions | 개발자 |
| `setup/members.md` | Invite translators | 개발자 |
| `setup/sources.md` | Add sources | 개발자 |
| `setup/archive.md` | Archive a project | 개발자 |
| `translate/README.md` | Translate | 편집자 |
| `translate/join.md` | Join a project | 편집자 |
| `translate/edit.md` | Edit translations | 편집자 |
| `translate/publish.md` | Publish your changes | 편집자 |
| `sync/README.md` | How syncing works | 공통 |
| `sync/push.md` | When code changes | 개발자 |
| `sync/merging.md` | Merging the pull request | 개발자 |
| `sync/nightly.md` | Every night | 공통 |
| `sync/revert.md` | Undo and resync | 개발자 |
| `sync/logs.md` | Check activity in Logs | 공통 |
| `account.md` | Your account | 공통 |
| `reference/README.md` | Reference | 공통 |
| `reference/formats.md` | Supported file formats | 개발자 |
| `reference/limits.md` | Limits | 공통 |
| `reference/troubleshooting.md` | Troubleshooting | 개발자 |

## 라벨과 화면 문구 {#labels}

- 굵게는 UI 라벨에만, 기울임은 강조에 쓴다. 각 절에서 화면 라벨을 처음 언급할 때 사전의 문자열을 대소문자·구두점·말줄임표까지 정확히 굵게 쓴다.
- 사전 대조 통과만으로 충분하지 않다. 그 라벨이 해당 절에서 안내하는 실제 화면의 문구인지도 확인하고 검증 결과를 기록한다.
- 라벨은 `dictionaryStrings(m)`에 포함된 문자열 또는 아래 외부 라벨 표에 있어야 한다. 옛 `publicDocs.docs.sections` 본문은 제거됐고, 라벨 게이트는 전체 사전을 대상으로 한다. 함수·JSX 값은 제외한다.
- `Publish 3 changes` 같은 보간 라벨과 `hookHint` 같은 함수형 문구는 굵게 쓰지 않는다. 숫자 예시를 사전에 있는 고정 라벨처럼 취급하지 않는다.
- GitHub 등 외부 화면의 라벨도 굵게 쓰되 아래 표에 정확한 문구·화면·근거를 먼저 기록한다. 사전에 이미 있는 라벨이라도 그 화면에 실제로 있는지는 원고 검토에서 확인한다.
- 사용자가 보는 이름으로 쓴다. 아래 표의 내부 단어는 오른쪽 표현으로 바꾼다. 화면 문구를 그대로 인용할 때는 `Not sent` 같은 라벨을 예외로 쓸 수 있다.

| 내부 단어 | 가이드 표현 |
| --- | --- |
| surface | Sources |
| locale | language |
| repository → Malmoi | update |
| owner control | Sync |
| Malmoi → GitHub | Publish |
| sent / delivered / delivery-confirmed | published |
| project role | Owner / Editor; first mention: translators (Editor role) |
| address | the name in the project URL |

코드를 설명할 때만 식별자를 인라인 코드로 쓴다. `__x__`도 Markdown에서 굵게이므로 식별자라면 반드시 코드로 감싼다.
- 제품 이름은 문장에서 `Malmoi`다. 리포 경로·브랜치·action 이름 같은 식별자는 원래 철자를 보존한다. 소문자 제품 이름을 코드로 감싸는 것으로 브랜드 검사를 피할 수 없다.
- 번역 편집자 장은 EDITOR가 보는 화면만 안내한다. GitHub PR 조회나 OWNER 전용 동작을 편집자의 다음 단계로 약속하지 않는다. `Revert to last sent`는 EDITOR에게 비활성 버튼과 사유가 보일 수 있으나 실행은 OWNER 전용이다.
- `Needs review`는 원문 변경에 따른 플래그 하나다. 승인 워크플로·검토 단계·승인권으로 설명하지 않는다. 저장·복원 시 플래그 동작은 코드와 대조한다.

## 외부 라벨 허용 목록 {#external-labels}

외부 화면의 문구는 실제 현재 라벨을 확인한 뒤 행을 추가한다. 이 표는 외부 화면 전용이다. Malmoi 라벨은 사전을 근거로 삼고 여기에 중복 등록하지 않는다.

| 라벨 | 화면 | 근거 |
| --- | --- | --- |
| Settings | GitHub repository settings | GitHub Actions documentation and current repository UI |
| Secrets and variables | GitHub repository settings | GitHub Actions documentation and current repository UI |
| Actions | GitHub repository settings | GitHub Actions documentation and current repository UI |
| General | GitHub repository or organization Actions settings | [GitHub Actions policy documentation](https://docs.github.com/en/organizations/managing-organization-settings/disabling-or-limiting-github-actions-for-your-organization) |
| New repository secret | GitHub repository Actions secrets | GitHub Actions documentation and current repository UI |
| Set up job | GitHub Actions run summary | GitHub Actions run summary wording |
| Repository access | GitHub App installation | GitHub App installation settings |
| Only select repositories | GitHub App installation | GitHub App installation settings |
| Run workflow | GitHub Actions workflow page | GitHub Actions workflow page |
| Allow *OWNER*, and select non-*OWNER*, actions and reusable workflows | GitHub Actions policy | [GitHub Actions policy documentation](https://docs.github.com/en/organizations/managing-organization-settings/disabling-or-limiting-github-actions-for-your-organization); 문서 대조 2026-09-26, G5 촬영에서 계정별 실물 문구 확인 |

## 앵커와 링크 {#anchors}

- 모든 H2 끝에 ` {#id}`를 붙인다. 예시는 `## Add the workflow {#workflow}`다. H3의 앵커는 선택이다.
- id는 `[a-z0-9-]+`이고 페이지 안에서 중복되지 않는다. 제목을 바꿔도 공개된 id는 유지한다. 앵커 문법 자체를 설명할 때는 반드시 인라인 코드 안에 둔다.
- 페이지 링크는 `../setup/workflow.md#workflow`처럼 상대 `.md` 경로로 쓴다. `/docs/...` 절대경로를 원고에 넣지 않는다. 같은 페이지의 앵커 링크는 `#workflow`처럼 쓸 수 있다.
- 옛 해시 일곱은 `lib/guide/legacy-anchors.ts`가 정본이다. 개요에 본문을 중복하지 않도록 `how-it-works`는 `sync/README.md`의 같은 id로 옮긴다. 나머지 절도 매핑된 페이지에 같은 id를 보존한다.

## 표 이름 {#tables}

표의 접근 이름은 가장 가까운 상위 헤딩의 텍스트다. 한 페이지 안에서 표 이름이 겹치지 않게 표마다 구별되는 헤딩을 둔다. 작성·촬영 매뉴얼의 기계 판독 표에도 앵커를 둔다. 외부 라벨 표는 `external-labels`, 촬영 매핑 표는 `shots`, 마스킹 표는 `masking`을 유지한다.

## 영어 원고의 톤 {#tone}

- 짧은 문장으로 지금 할 일과 그 결과를 설명한다. 절차는 사용자가 실행하는 순서로 쓴다.
- 독자를 `you`로 부르고, 역할을 제한할 때는 `project owners`라고 쓴다. 편집자에게 내부 DB·어댑터·토큰 구조를 설명하지 않는다. 화면에 없는 pull request, transaction, token, namespace, cron, OAuth, challenge, database는 같은 문장에서 뜻을 풀지 않으면 쓰지 않는다. Editor 원고의 key도 처음 뜻을 풀지 않으면 쓰지 않으며, base branch, payload, request도 내부 용어로 쓰지 않는다. 자동 검사는 금지어 전체를 보장하지 않는다.
- 성공·실패·확인 불가를 구별한다. 확인하지 못한 PR을 없다고 쓰거나, 저장만 된 변경을 전달됐다고 쓰지 않는다.
- `TODO`·`TBD`·`lorem` 같은 자리표시자를 원고에 남기지 않는다. 검증하지 않은 동작을 약속하지 않는다.
- 독자가 파일로 저장할 코드 블록에는 `title=".github/workflows/malmoi-i18n.yml"`처럼 파일명 메타를 붙인다. 설정 필드에 붙이는 목록이나 코드 조각은 파일명이 없어도 된다.
- 이미지 alt는 보이는 상태, Markdown 이미지 title 캡션은 할 일을 설명한다. 이미지 경로는 `/guide/<kebab-name>.webp`이고 하위 디렉터리를 만들지 않는다. authoring 규약이나 예시 placeholder를 guide 페이지에 넣지 않는다.

## 사실 대조 소스 {#fact-sources}

경로는 저장소 루트 기준이다. 제품 범위·독자·권한은 PRODUCT와, 실제 동작은 코드와 함께 대조한다. 불일치하면 원고에 추측을 넣지 말고 차이를 보고한다. 파일명만 맞추는 것이 아니라 사용자가 만나는 화면 분기와 실패 상태까지 읽는다.

| 페이지 | 확인할 사실 | 대조 소스 |
| --- | --- | --- |
| `README.md`, `setup/README.md`, `translate/README.md`, `reference/README.md` | 독자별 진입·장 구성·도입 설명 | `guide/SUMMARY.md`, 각 하위 페이지 도입, `docs/PRODUCT.md` §3·§7.7 |
| `setup/create-project.md` | GitHub 연결·설치, 생성 ①–④, 첫 적재 | `components/onboarding/`, `lib/onboarding/`, `lib/github-connect/`, `app/(edit)/projects/actions.ts`, `docs/PRODUCT.md` §7.1–§7.5 |
| `setup/sources.md` | 소스 추가, 상태·기준 언어 선언, OWNER 제한 | `app/(edit)/projects/[slug]/sources/page.tsx`, 같은 디렉터리 `actions.ts`, `components/sources/`, `lib/sources/`, `lib/surfaces/`, `docs/PRODUCT.md` §7.1 |
| `setup/workflow.md` | 생성 YAML, 파일 경로, `PUSH_TOKEN`, 첫 실행 | `lib/onboarding/workflow.ts`, `components/settings/ci-card.tsx`, `.github/actions/malmoi-i18n-push/action.yml`, `docs/ACTIONS.md` |
| `setup/allowed-actions.md` | 실행 action 넷과 제한된 GitHub Actions 설정 | `lib/guide/__tests__/helpers/allowed-actions.ts`, `lib/onboarding/workflow.ts`, `.github/actions/malmoi-i18n-push/action.yml`, `docs/ACTIONS.md`; 외부 화면의 현재 라벨은 별도 확인 |
| `setup/members.md` | 역할, 초대 메일·재발급·멤버 관리 | `lib/auth/permission.ts`, `lib/auth/invitation.ts`, `lib/invitation-email/`, `app/(edit)/projects/actions.ts`, `components/members/`, `docs/PRODUCT.md` §3·§4.1 |
| `setup/archive.md` | 보관·복원, 열린 PR 유지, 이력 읽기 | `components/settings/archive-card.tsx`, `app/(edit)/projects/actions.ts`, `lib/auth/permission.ts`, `docs/PRODUCT.md` §7.9 |
| `translate/join.md` | 초대 주소·로그인·수락·거부 | `app/invite/`, `lib/auth/invitation.ts`, `lib/login-link/`, `docs/PRODUCT.md` §3 |
| `translate/edit.md` | EDITOR의 검색·필터·저장·미저장 확인·플래그 | `components/translations/workspace/`, `app/(edit)/actions.ts`, `lib/keys/save-key.ts`, `lib/keys/save.ts`, `lib/keys/translation-list.ts`, `docs/PRODUCT.md` §3·§4.2 |
| `translate/publish.md` | EDITOR의 미리보기·실행·결과, PR 표시 범위 | `components/translations/`, `app/(edit)/publish-actions.ts`, `lib/publish/`, `lib/pull/`, `docs/PRODUCT.md` §3·§7.6 |
| `sync/README.md` | 코드와 DB의 경계, 병합 없음 | `docs/ARCHITECTURE.md` §0, `lib/push/apply.ts`, `lib/pull/run.ts` |
| `sync/push.md` | strict 적재, 미전달 보류, 사라진 키 보존 | `app/api/push/route.ts`, `lib/push/apply.ts`, `lib/protection/where.ts`, `docs/ARCHITECTURE.md` §5.5.2 |
| `sync/merging.md` | 고정 PR·브랜치, 머지 방식, `SKIP_MARKER` | `lib/pull/payload.ts`의 `withSkipMarker`, `docs/ARCHITECTURE.md:733`, `lib/pull/run.ts`, `lib/onboarding/workflow.ts`, `.github/actions/malmoi-i18n-push/action.yml`, `docs/ACTIONS.md` |
| `sync/nightly.md` | 하루 한 번 자동 Publish·대상·거부 조건 | `vercel.json`, `app/api/pull/route.ts`, `lib/pull/`, `docs/PRODUCT.md` §7.6 |
| `sync/revert.md` | OWNER 전용 복원·수동 Sync, 지문 확인·미전달 처리 | `lib/keys/revert.ts`, `lib/protection/`, `lib/sync/`, `app/(edit)/actions.ts`, `docs/ARCHITECTURE.md` §5.8 |
| `sync/logs.md` | 필터·상세·수동 갱신·보관 이력 | `app/(edit)/projects/[slug]/logs/page.tsx`, `components/logs/`, `lib/events/`, `docs/ARCHITECTURE.md` §5.7 |
| `account.md` | 프로필·로그인 수단·GitHub 연결·전체 로그아웃 | `app/(edit)/account/`, `components/account/`, `lib/account-connect/`, `lib/login-link/`, `lib/session-revocation/`, `docs/PRODUCT.md` §4.1·§7.7 |
| `reference/formats.md` | 지원 포맷 다섯·경로·보존 특성 | `lib/adapters/index.ts`, `lib/adapters/`, `lib/onboarding/detect.ts`, `docs/ARCHITECTURE.md` §1 |
| `reference/limits.md` | 프로젝트·멤버·slug·초대 상한, 파일·적재 예산 | `lib/onboarding/create-plan.ts` (`PROJECT_LIMIT`), `lib/auth/invitation.ts` (`MEMBER_LIMIT`), `lib/onboarding/slug.ts` (`PROJECT_SLUG_MAX`), `lib/invitation-email/limits.ts` (`INVITATION_HOURLY_LIMIT`), `lib/onboarding/budget.ts`, `lib/push/plan.ts` |
| `reference/troubleshooting.md` | 설치 누락·stale commit 409·payload 400·사용자 복구 경로 | `app/api/push/route.ts`, `lib/push/guard.ts`, `lib/push/plan.ts`, `docs/ACTIONS.md` §3, `lib/github-connect/message.ts`, `lib/onboarding/message.ts`, `messages/en.tsx` |
| 모든 페이지 | 정확한 UI 라벨·화면 용어 | `messages/en.tsx`, `lib/guide/dictionary.ts`, 실제 컴포넌트의 역할별 분기, `docs/DESIGN.md` §10 |

## 사전 본문 이관과 동결 {#dictionary-freeze}

옛 `m.publicDocs.docs.sections` 본문은 제거됐다. Markdown이 정본이고 라벨 게이트는 전체 사전 문자열을 대상으로 한다. 사전 본문에 새 기능 설명을 추가하지 않는다.

## 검증 {#verification}

검증 명령은 `pnpm test`다. 실물 원고에 거는 게이트는 그 원고와 같은 커밋에서 green이어야 한다.

- 구성 단계: SUMMARY와 파일 트리 일치, H1 하나, H2 앵커 필수·중복 없음, 모든 페이지 도입 문단, 옛 해시 일곱의 대상 존재를 검사한다. 문자열 스캐너 셋은 실제 guide Markdown을 적어도 하나 읽어야 한다.
- 본문 단계: 내부 링크·앵커, 자리표시자, 사전·허용 목록 라벨, 표 이름 중복, 정본 상수를 추가 검사한다. 정본 상수는 `sectionByAnchor`로 해당 절만 잘라 대조한다. action 목록은 공유 헬퍼를 사용하고 고유 action 수가 4인지 유지한다.
- 이미지 단계: 참조·파일 양방향 일치, alt·치수·매핑 소스 경로·마스킹을 검사한다. 이미지 0개일 때만 촬영 매뉴얼 부재를 허용한다.
- 스크린샷 최신성은 `pnpm guide:check`가 도입된 뒤 그 결과를 인용한다. stale 여부는 테스트의 차단 조건이 아니다.
- 자동 검사가 라벨의 실제 위치, EDITOR 화면 범위, 문장의 정확성까지 보장하지 않는다. 사용자 원고 검토와 실제 화면 대조 결과를 별도로 기록한다.

# 가이드 작성 규약

공개 가이드의 구성·표기·사실 대조·검증은 이 문서를 따른다. 독자에게 보이는 원고는 화면 언어마다 한 벌씩 `guide/en/`·`guide/ko/`·`guide/es/`에 두고(en이 원문, ko·es는 번역 — [언어](#languages)), 이 매뉴얼과 촬영 매뉴얼은 한국어로 `guide/` 루트에 관리한다.

## 운영 방식 {#workflow}

- 이 문서의 원고 경로(`README.md`·`setup/workflow.md` …)는 언어 트리 기준이다 — `guide/<언어>/` 아래 같은 경로가 세 벌 있다.
- `guide/<언어>/SUMMARY.md`가 페이지·순서·계층의 정본이다. 페이지를 추가하거나 옮기면 세 언어의 SUMMARY와 내부 링크를 함께 고친다.
- `README.md`는 개요이고 `<chapter>/README.md`는 장 개요다. 각 페이지는 H1 하나와 바로 다음 독립 도입 문단(1–2문장)으로 시작한다. 도입에는 굵은 글씨나 링크를 넣지 않으며 카드 설명으로도 쓴다. 작업 페이지에는 필요한 사전 조건, 사용자가 고르는 것과 화면에 보이는 것을 함께 쓰는 번호 단계, `What happens next` 절을 둔다. 설명·참조 페이지에는 번호 단계가 없어도 된다.
- 개요의 두 갈래 카드와 나머지 장 목록, 장 개요의 하위 목록은 SUMMARY와 각 페이지의 도입 문단에서 생성한다. 원고에 카드·목록을 중복 작성하지 않는다. 개요는 H1과 도입, 그리고 대표 화면 스크린샷 한 장만 둔다(카드보다 위에 선다). 장 개요는 H1과 도입에 필요한 본문만 둔다.
- 두 갈래의 선택은 `lib/guide/overview.ts`가 소유한다(렌더링 단계에서 추가). 제목은 SUMMARY, 설명은 도입 문단에서 가져온다.
- `AUTHORING.md`와 `SHOOTING.md`는 SUMMARY에 올리지 않고 공개 페이지로 제공하지 않는다. SUMMARY 자신도 페이지가 아니라 내비 데이터다.
- 실제 화면은 스크린샷으로 기록하며 촬영 규약은 `SHOOTING.md`가 소유한다. 화면을 안내하는 작업 페이지는 적어도 한 장을 둔다 — 화면이 없는 참조 페이지(`faq.md`·`reference/formats.md`·`reference/limits.md` 등)와 GitHub 쪽 동작만 설명하는 페이지(`sync/merging.md`·`sync/nightly.md`)는 예외다. 이미지는 절의 단계 목록 뒤(또는 그 화면을 여는 단계 앞)에 둔다.

## 언어 {#languages}

2026-10-05(ui-locales)부터 원고는 화면 언어 셋(`en`·`ko`·`es`)마다 한 벌이다. `/docs`는 화면 언어(계정 > 기기 쿠키 > en)의 트리를 보여 주고, URL은 언어와 무관하다. **없는 언어를 en으로 메우지 않는다** — 트리나 페이지가 빠지면 던지거나 404다.

- **en이 원문이고 ko·es는 같은 구조의 번역이다.** 원고를 고치면 **세 언어를 같은 커밋에서** 고친다 — 문장 내용의 드리프트는 게이트가 보지 않으므로(구조만 본다) 이 규칙이 유일한 장치다.
- **구조 동형**: 세 트리의 파일 집합 · SUMMARY 순서 · 페이지마다 앵커(`{#id}`) · 이미지 참조 · 링크 대상 · 번호 단계 수가 같아야 한다(`lib/guide/__tests__/locales.test.ts`). **앵커 id는 번역하지 않는다** — 앱 안 가이드 링크와 옛 해시 매핑이 언어와 무관하게 성립해야 한다.
- **스크린샷은 en 화면 한 벌(`public/guide/*.webp`)을 세 언어가 공유한다.** 이미지 경로는 세 언어가 같고 alt·title만 그 언어로 쓴다. ko 원고는 `게시`라고 부르는데 그림 속 버튼이 `Publish`인 것은 **수용한 대가다**(2026-10-04 사용자).
- **라벨은 그 언어 사전의 값이다** — ko 원고의 굵은 라벨은 `messages/ko.tsx`, es는 `messages/es.tsx`에 있어야 한다(아래 [라벨](#labels)). 낱말은 `docs/DESIGN.md` §10.1 개념 표의 ko·es 열이 정본이고, 그 표의 "쓰지 않는 말"(`lib/i18n/__tests__/helpers/banned-terms.ts`)이 ko·es 산문에서 0건이어야 한다.
- **한글은 ko 트리에만 둔다** — en·es 원고는 `no-korean-ui.test.ts`가 훑는다. 언어 이름 `한국어` 같은 endonym도 en·es 원고에서는 쓰지 않고 표기를 피한다.
- **톤**: en은 아래 [영어 원고의 톤](#tone). ko는 **합니다체**(아래 [한국어 원고의 톤](#tone-ko)), es는 **tú**이고 화면 문체(`docs/DESIGN.md` §10.0)를 따른다. **ko는 ko-first다** — "처음부터 한국어로 만든 서비스라면 이 말을 썼을까?"를 기준으로 쓰고, en의 문장 길이·어순·단계 나눔을 따라갈 의무가 없다(의미·정보만 지킨다). 단 **구조 동형은 그대로다** — 헤딩·앵커·이미지·링크·코드 블록·번호 단계 수는 게이트가 보므로 en과 같아야 한다. es는 문장 길이·단계 나눔을 en과 같게 두고 언어에 맞지 않는 직역만 고친다.
- **검수**: ko는 사용자가 검수하고 es는 에이전트 초안 그대로 낸다(화면 사전과 같다). 용어 검수·일괄 검수 절차는 `/translate`가 든다.
- 크롤러 표면(`llms.txt`·`llms-full.txt`·sitemap·SEO 메타)과 `pnpm guide:check`·촬영 매핑은 en 트리만 본다.

## 페이지별 독자 {#audiences}

개발자는 프로젝트 OWNER, 편집자는 EDITOR를 뜻한다. 공통 페이지는 두 역할이 함께 읽는다. 경로는 언어 트리 기준이고 제목은 en 원고의 것이다.

| 페이지 | 제목 | 독자 |
| --- | --- | --- |
| `README.md` | Malmoi | 공통 |
| `faq.md` | FAQ | 공통 |
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
| `account/README.md` | Account and preferences | 공통 |
| `account/profile.md` | Account | 공통 |
| `account/preferences.md` | Preferences | 공통 |
| `ai-agents/README.md` | Connect an AI agent | 공통 |
| `ai-agents/browser.md` | Sign in through your browser | 공통 |
| `ai-agents/token.md` | Use a personal token | 공통 |
| `ai-agents/permissions.md` | What the agent can do | 공통 |
| `ai-agents/prompts.md` | Example prompts | 공통 |
| `reference/README.md` | Reference | 공통 |
| `reference/formats.md` | Supported file formats | 개발자 |
| `reference/limits.md` | Limits | 공통 |
| `reference/troubleshooting.md` | Troubleshooting | 개발자 |
| `self-hosting/README.md` | Self-hosting | 운영자(셀프 호스팅 설치를 운영하는 개발자) |
| `self-hosting/install.md` | Install | 운영자 |
| `self-hosting/operate.md` | Update, back up, and restore | 운영자 |
| `self-hosting/troubleshooting.md` | Troubleshooting and privacy | 운영자 |

## 라벨과 화면 문구 {#labels}

- 굵게는 UI 라벨에만, 기울임은 강조에 쓴다. 각 절에서 화면 라벨을 처음 언급할 때 사전의 문자열을 대소문자·구두점·말줄임표까지 정확히 굵게 쓴다.
- 사전 대조 통과만으로 충분하지 않다. 그 라벨이 해당 절에서 안내하는 실제 화면의 문구인지도 확인하고 검증 결과를 기록한다.
- 라벨은 **그 원고 언어의 사전**(`dictionaryStrings(<언어 사전>, ARIA_ONLY)` — en 원고는 `messages/en.tsx`, ko는 `ko.tsx`, es는 `es.tsx`)에 포함된 보이는 문자열 또는 아래 외부 라벨 표에 있어야 한다. 외부 화면(GitHub·claude.ai) 라벨은 세 언어 원고 모두 영어 그대로 쓴다. 옛 `publicDocs.docs.sections` 본문은 제거됐고, 라벨 게이트는 전체 사전을 대상으로 한다. 함수·JSX 값은 제외한다.
- **보이는 글자만 굵게 쓴다.** 필터 축 이름(`Status`·`Kind`처럼 `aria-label`에만 붙는 값)은 화면에 없다 — 트리거가 보이는 현재 값(번역 화면의 Status 메뉴는 **All keys**, Logs는 **All activity**)을 쓴다. 라벨 게이트가 그 경로를 `ARIA_ONLY`(`lib/guide/__tests__/content.test.ts`)로 빼고 세며, 새 aria 전용 키를 만들면 거기에 더한다.
- **단축키는 산문으로 쓴다** — `Cmd+K` on macOS / `Ctrl+K` on other platforms, `Ctrl+Enter or Cmd+Enter` 꼴(키 이름 + `+`, 굵게·코드 없음). 화면 칩의 `⌘K`·`Ctrl K`·`↵`(`m.common.keys`)는 장식(`aria-hidden`)이라 라벨이 아니므로 원고에 옮기지 않는다(2026-10-03, search-ux-unify).
- 상태 낱말의 금지 동의어(`unpublished`·`on hold`·`deferred`(코드 밖)·보류 문맥의 `wait` 등)는 `lib/i18n/__tests__/terminology.test.ts`의 원고용 색인이 원고 문장에서 센다.
- `Publish 3 changes` 같은 보간 라벨과 `hookHint` 같은 함수형 문구는 굵게 쓰지 않는다. 숫자 예시를 사전에 있는 고정 라벨처럼 취급하지 않는다.
- GitHub 등 외부 화면의 라벨도 굵게 쓰되 아래 표에 정확한 문구·화면·근거를 먼저 기록한다. 사전에 이미 있는 라벨이라도 그 화면에 실제로 있는지는 원고 검토에서 확인한다.
- 사용자가 보는 이름으로 쓴다. 아래 표의 내부 단어는 오른쪽 표현으로 바꾼다. 화면 문구를 그대로 인용할 때는 `Revert to last sent` 같은 라벨을 예외로 쓸 수 있다.
- **상태 낱말은 `docs/DESIGN.md` §2.4가 정본이다.** 표의 상태 행은 그 표의 낱말을 가이드 산문으로 옮긴 것이고, 둘이 갈리면 §2.4를 따르고 이 표를 고친다.

| 내부 단어 | 가이드 표현 |
| --- | --- |
| surface | Sources |
| locale | language |
| repository → Malmoi | update |
| owner control | Sync |
| Malmoi → GitHub | Publish |
| sent / delivered / delivery-confirmed | published (동작을 설명할 때) |
| unsent / pending / unpublished (미전달 편집) | 화면 상태 낱말 **Unsent**, 산문 "unsent edits" — "unpublished edits"를 쓰지 않는다 |
| hold / defer / pause / wait (리포 갱신 보류) | 화면 라벨 **Held**, 산문 "held"("Repository updates are held until …") — "on hold"·"paused"·"waits"를 쓰지 않는다. CI 로그의 `deferred`를 인용할 때만 예외이고, 한 번은 "Logs shows it as **Held**"로 잇는다 |
| partial import (일부 반영) | **Partially synced** — "failed"·"couldn't finish"로 쓰지 않는다(데이터는 들어갔다) |
| import failed (동기화 실패) | **Sync failed**, 문장은 "the last sync couldn't finish" (Logs 결과 칸만 **Failed**) |
| Publish withheld (일부 보류) | **Held back** — Sync 문장에는 쓰지 않는다 |
| disconnected / unpinned (연결 끊김) | **Disconnected** → **Reconnect**. 결과는 "syncs and publishes stop until it's reconnected" — "paused"를 쓰지 않는다 |
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
| Customize | claude.ai connector settings | 2026-09-29 T1 실측(개인 Free 계정, `claude.ai/customize/connectors` — mcp-oauth design §0.1) |
| Connectors | claude.ai connector settings | 2026-09-29 T1 실측(개인 Free 계정, `claude.ai/customize/connectors` — mcp-oauth design §0.1) |
| Add | claude.ai connector settings | 2026-09-29 T1 실측(개인 Free 계정, `claude.ai/customize/connectors` — mcp-oauth design §0.1) |
| Add custom connector | claude.ai connector settings | 2026-09-29 T1 실측(개인 Free 계정, `claude.ai/customize/connectors` — mcp-oauth design §0.1) |
| Connect | claude.ai connector settings | 2026-09-29 T1 실측(개인 Free 계정, `claude.ai/customize/connectors` — mcp-oauth design §0.1) |
| Allow *OWNER*, and select non-*OWNER*, actions and reusable workflows | GitHub Actions policy | [GitHub Actions policy documentation](https://docs.github.com/en/organizations/managing-organization-settings/disabling-or-limiting-github-actions-for-your-organization); 문서 대조 2026-09-26, 실물 대조 2026-09-27(조직 소유 리포 설정 화면 — 문구 일치) |

## 앵커와 링크 {#anchors}

- 모든 H2 끝에 ` {#id}`를 붙인다. 예시는 `## Add the workflow {#workflow}`다. H3의 앵커는 선택이다.
- id는 `[a-z0-9-]+`이고 페이지 안에서 중복되지 않는다. 제목을 바꿔도 공개된 id는 유지한다. 앵커 문법 자체를 설명할 때는 반드시 인라인 코드 안에 둔다.
- 페이지 링크는 `../setup/workflow.md#workflow`처럼 상대 `.md` 경로로 쓴다. `/docs/...` 절대경로를 원고에 넣지 않는다. 같은 페이지의 앵커 링크는 `#workflow`처럼 쓸 수 있다.
- **한 페이지를 섹션으로 나누면 옛 절 id 전부를 `SECTION_LEGACY_ANCHORS`(같은 파일)에 그 장 slug로 등재한다** — 공유된 `/docs/<장>#<id>`가 개요 맨 위에 멈춘다(malmoi#152, `ai-agents`).
- 옛 해시 일곱은 `lib/guide/legacy-anchors.ts`가 정본이다. 개요에 본문을 중복하지 않도록 `how-it-works`는 `sync/README.md`의 같은 id로 옮긴다. 나머지 절도 매핑된 페이지에 같은 id를 보존한다.

## 표 이름 {#tables}

표의 접근 이름은 가장 가까운 상위 헤딩의 텍스트다. 한 페이지 안에서 표 이름이 겹치지 않게 표마다 구별되는 헤딩을 둔다. 작성·촬영 매뉴얼의 기계 판독 표에도 앵커를 둔다. 외부 라벨 표는 `external-labels`, 촬영 매핑 표는 `shots`, 마스킹 표는 `masking`을 유지한다.

## 영어 원고의 톤 {#tone}

- 짧은 문장으로 지금 할 일과 그 결과를 설명한다. 절차는 사용자가 실행하는 순서로 쓴다.
- 독자를 `you`로 부르고, 역할을 제한할 때는 `project owners`라고 쓴다. 편집자에게 내부 DB·어댑터·토큰 구조를 설명하지 않는다. 화면에 없는 pull request, transaction, token, namespace, cron, OAuth, challenge, database는 같은 문장에서 뜻을 풀지 않으면 쓰지 않는다. Editor 원고의 key도 처음 뜻을 풀지 않으면 쓰지 않으며, base branch, payload, request도 내부 용어로 쓰지 않는다. 자동 검사는 금지어 전체를 보장하지 않는다.
- **축약형(`could not`·`does not` …)은 원고에서 금지하지 않는다** — 축약형은 화면 문장의 문체 규칙(DESIGN §10)이지 개념 동의어가 아니고, 원고는 설명문이라 오독되지 않는다(2026-10-01, ux-drift-unify — `terminology.test.ts`의 원고 색인이 뺀다). 원고 문체를 화면에 맞출지는 후속 후보다.
- 성공·실패·확인 불가를 구별한다. 확인하지 못한 PR을 없다고 쓰거나, 저장만 된 변경을 전달됐다고 쓰지 않는다.
- `TODO`·`TBD`·`lorem` 같은 자리표시자를 원고에 남기지 않는다. 검증하지 않은 동작을 약속하지 않는다.
- 독자가 파일로 저장할 코드 블록에는 `title=".github/workflows/malmoi-i18n.yml"`처럼 파일명 메타를 붙인다. 설정 필드에 붙이는 목록이나 코드 조각은 파일명이 없어도 된다.
- 이미지 alt는 보이는 상태, Markdown 이미지 title 캡션은 할 일을 설명한다. 이미지 경로는 `/guide/<kebab-name>.webp`이고 하위 디렉터리를 만들지 않는다. authoring 규약이나 예시 placeholder를 guide 페이지에 넣지 않는다.

## 한국어 원고의 톤 {#tone-ko}

- **합니다체, 지시는 `~하세요`** — 해요체·반말·`~하십시오`를 쓰지 않는다. 화면 문체(`docs/DESIGN.md` §10.0)와 같다.
- **번역투를 쓰지 않는다** — `~하는 것`·`~에 대한`·`~를 통해`·이중 피동(`~되어진다`)·지나친 명사화(`~를 수행합니다` → `~합니다`)는 능동 동사 문장으로 푼다. en 문장을 한 줄씩 옮기지 말고, 한국어로 먼저 썼다면 나왔을 문장으로 쓴다.
- **영문으로 두는 말**: 제품·프로토콜 이름(Malmoi·GitHub·Google·MCP·OAuth), `PR`, 개발자 문맥의 실제 명령·형식(push·diff·JSON·YAML), 경로·식별자·명령. 익숙한 외래어(리포지토리·브랜치·커밋·키)는 한국어 표기로 쓴다. 한국어로 쓸 수 있는 일반 동작(저장·취소·동기화·게시·복원)은 영문으로 바꾸지 않는다.
- **핵심 용어와 쓰지 않는 말은 복제하지 않는다** — 정본은 `docs/DESIGN.md` §10.1 개념 표와 `lib/i18n/__tests__/helpers/banned-terms.ts`다. 새 낱말이 필요하면 그쪽을 먼저 본다.
- **화면 라벨을 인용할 때는 `messages/ko.tsx`의 값**을 그대로 쓴다. 산문의 낱말도 그 라벨과 같게 맞춘다.

## 사실 대조 소스 {#fact-sources}

경로는 저장소 루트 기준이다(페이지 열은 언어 트리 기준). 제품 범위·독자·권한은 PRODUCT와, 실제 동작은 코드와 함께 대조한다. 표의 `messages/en.tsx` 키는 en 원고 기준이고, ko·es 원고는 **같은 키의 그 언어 사전 값**(`messages/ko.tsx`·`es.tsx`)과 대조한다. 불일치하면 원고에 추측을 넣지 말고 차이를 보고한다. 파일명만 맞추는 것이 아니라 사용자가 만나는 화면 분기와 실패 상태까지 읽는다.

| 페이지 | 확인할 사실 | 대조 소스 |
| --- | --- | --- |
| `README.md`, `setup/README.md`, `translate/README.md`, `account/README.md`, `reference/README.md` | 독자별 진입·장 구성·도입 설명 | `guide/SUMMARY.md`, 각 하위 페이지 도입, `docs/PRODUCT.md` §3·§7.7 |
| `setup/create-project.md` | GitHub 연결·설치, 생성 ①–④, 첫 적재 | `components/onboarding/`, `lib/onboarding/`, `lib/github-connect/`, `app/(edit)/projects/actions.ts`, `docs/PRODUCT.md` §7.1–§7.5 |
| `setup/sources.md` | 소스 추가, 상태·기준 언어 선언, OWNER 제한 | `app/(edit)/projects/[slug]/sources/page.tsx`, 같은 디렉터리 `actions.ts`, `components/sources/`, `lib/sources/`, `lib/surfaces/`, `docs/PRODUCT.md` §7.1 |
| `setup/workflow.md` | 생성 YAML, 파일 경로, `PUSH_TOKEN`, 첫 실행 | `lib/onboarding/workflow.ts`, `components/settings/ci-card.tsx`, `.github/actions/malmoi-i18n-push/action.yml`, `docs/ACTIONS.md` |
| `setup/allowed-actions.md` | 실행 action 넷과 제한된 GitHub Actions 설정 | `lib/guide/__tests__/helpers/allowed-actions.ts`, `lib/onboarding/workflow.ts`, `.github/actions/malmoi-i18n-push/action.yml`, `docs/ACTIONS.md`; 외부 화면의 현재 라벨은 별도 확인 |
| `setup/members.md` | 역할, 초대 메일·재발급·멤버 관리 | `lib/auth/permission.ts`, `lib/auth/invitation.ts`, `lib/invitation-email/`, `app/(edit)/projects/actions.ts`, `components/members/`, `docs/PRODUCT.md` §3·§4.1 |
| `setup/archive.md` | 보관·복원, 열린 PR 유지, 이력 읽기 | `components/settings/archive-card.tsx`, `app/(edit)/projects/actions.ts`, `lib/auth/permission.ts`, `docs/PRODUCT.md` §7.9 |
| `translate/join.md` | 초대 주소·로그인·수락·거부 | `app/invite/`, `lib/auth/invitation.ts`, `lib/login-link/`, `docs/PRODUCT.md` §3 |
| `translate/edit.md` | EDITOR의 화면 검색·글로벌 검색·헤더 Inbox·필터·저장·미저장 확인·플래그 | `components/translations/workspace/`, `app/(edit)/actions.ts`, `lib/keys/save-key.ts`, `lib/keys/save.ts`, `lib/keys/translation-list.ts`, `components/search/`, `lib/search/`, `app/search/actions.ts`, `lib/keys/search.ts`, `lib/translations/query.ts`(`Q_MAX_LENGTH`), `lib/search/match.ts`(`KEY_QUERY_MIN`·`SEARCH_GROUP_LIMIT` — 산문의 `two`·`five`·`200`은 `content.test.ts`가 상수에 묶는다), `lib/keyboard.ts`(단축키), 헤더 Inbox·`/inbox` 페이지·사이드바 항목(`#inbox` — `components/shell/attention-inbox.tsx`, `app/(edit)/inbox/`, `components/inbox/`, `lib/shell/nav.ts`(`navWorkItems`), `lib/inbox/plan.ts`, `lib/home/attention-view.ts`의 목적지, `messages/en.tsx`의 `inbox`), `docs/PRODUCT.md` §3·§4.1·§4.2 |
| `translate/publish.md` | EDITOR의 미리보기·실행·결과, PR 표시 범위, 열린 PR 동안의 적재 보류 | `components/translations/`, `app/(edit)/publish-actions.ts`, `lib/publish/`, `lib/pull/`, `docs/PRODUCT.md` §3·§7.6 |
| `sync/README.md` | 코드와 DB의 경계, 병합 없음 | `docs/ARCHITECTURE.md` §0, `lib/push/apply.ts`, `lib/pull/run.ts` |
| `sync/push.md` | strict 적재, 보류 사유(미전달 편집·열린 PR·PR 조회 실패), 사라진 키 보존 | `app/api/push/route.ts`, `lib/push/apply.ts`, `lib/protection/where.ts`, `lib/protection/plan.ts`(`planOpenPrGate`), `lib/projects/open-pr.ts`, `lib/cli/push-response.ts`, `docs/ARCHITECTURE.md` §5.5.2 |
| `sync/merging.md` | 고정 PR·브랜치, 머지 방식, `SKIP_MARKER` | `lib/pull/payload.ts`의 `withSkipMarker`, `docs/ARCHITECTURE.md:733`, `lib/pull/run.ts`, `lib/onboarding/workflow.ts`, `.github/actions/malmoi-i18n-push/action.yml`, `docs/ACTIONS.md` |
| `sync/nightly.md` | 하루 한 번 프로젝트마다 Publish·서버 적재·스킵 중 하나, 대상·보류 사유(열린 PR·PR 조회 실패·`too-large`·base 읽기 실패), 워크플로와의 관계 | `vercel.json`, `app/api/pull/route.ts`, `lib/pull/`, `lib/nightly/plan.ts`, `lib/import/run.ts`·`lib/import/automation.ts`, `messages/en.tsx`의 `logs.deferReasons`, `docs/PRODUCT.md` §4.1·§7.6, `docs/ARCHITECTURE.md` §3.05 |
| `sync/revert.md` | OWNER 전용 복원·수동 Sync, 지문 확인·미전달 처리 | `lib/keys/revert.ts`, `lib/protection/`, `lib/sync/`, `app/(edit)/actions.ts`, `docs/ARCHITECTURE.md` §5.8 |
| `sync/logs.md` | 필터(행위자 `CI`·`Nightly`)·상세(`Values`·`Held because`)·수동 갱신·보관 이력 | `app/(edit)/projects/[slug]/logs/page.tsx`, `components/logs/`, `lib/events/`(`triggerOf`·`trigger-where.ts`), `docs/ARCHITECTURE.md` §5.7 |
| `account/profile.md` | 프로필·로그인 수단·GitHub 연결·전체 로그아웃 | `app/(edit)/account/`, `components/account/`, `lib/account-connect/`, `lib/login-link/`, `lib/session-revocation/`, `docs/PRODUCT.md` §4.1·§7.7 |
| `account/preferences.md` | 공개 푸터 스위처·Preferences Language 카드·판정 순서(계정 > 기기 쿠키 > English)·실패 문구·가이드와 방침의 제공 언어 · Theme 카드(계정 > 기기 쿠키 > Light, 푸터 스위처 없음) | `components/i18n/locale-switcher.tsx`, `components/public-shell/footer.tsx`, `components/preferences/language-card.tsx`, `components/preferences/time-zone-card.tsx`, `components/preferences/theme-card.tsx`, `lib/color-scheme/scheme.ts`(`resolveColorScheme`), `app/ui-locale/actions.ts`, `app/(edit)/preferences/actions.ts`, `lib/date-format.ts`, `lib/i18n/locales.ts`(`resolveUiLocale`·`planUiLocaleWrite`), `lib/shell/nav.ts`, `app/privacy/page.tsx`, `app/docs/layout.tsx`, `messages/{en,ko,es}.tsx`의 `uiLocale`·`preferences` |
| `faq.md` | 질문마다 짧은 답 + 자세한 페이지 링크. **답은 정본에서만 쓴다** — 포지셔닝·역할·비범위(기계 번역·승인 단계·과금 없음)는 PRODUCT, "그러면 어떻게 되나"(병합 없음·보류·키 보존·고정 PR)는 ARCHITECTURE §0, 저장 항목·삭제 절차는 `/privacy` 본문. 링크한 페이지와 숫자·낱말이 갈리면 그 페이지가 정본이다. 가격·로드맵을 약속하지 않는다 | `docs/PRODUCT.md` §2·§3·§4.2, `docs/ARCHITECTURE.md` §0, `messages/en.tsx`의 `publicDocs.privacy`(`collected`·`purposes`·`deletion`), 각 답이 링크한 가이드 페이지 |
| `ai-agents/README.md` | 연결 방식 둘·MCP 주소·사전 조건 | `app/(edit)/mcp/`, `docs/ARCHITECTURE.md` §6.45, `docs/PRODUCT.md` §4.1 |
| `ai-agents/browser.md` | 브라우저 로그인 연결(조각 둘·claude.ai 커넥터 단계·동의 화면·재동의 대체·요청 10분), Connected apps·끊기 | `app/oauth/authorize/`, `components/oauth/`, `lib/oauth/authorize-view.ts`, `app/(edit)/mcp/`, `components/mcp/`, 가이드 조각이 정본(2026-09-30 앱 안 사본인 Connect 카드를 걷었다 — `content.test.ts`는 `MALMOI_TOKEN` 참조만 본다), `messages/en.tsx`의 `mcpConnector` |
| `ai-agents/token.md` | 토큰 발급·회전·폐기, 토큰 조각 셋 | `app/(edit)/mcp/`, `components/mcp/`, `lib/mcp/snippets.ts`(조각 — `content.test.ts`가 글자 단위로 대조), `messages/en.tsx`의 `mcpConnector` |
| `ai-agents/permissions.md` | 역할 ∩ 허용 권한, 도구 묶음 | `lib/mcp/catalog.ts`, `lib/mcp/grant.ts`, `lib/mcp/tools/`, `messages/en.tsx`의 `mcp`, `docs/PRODUCT.md` §4.1 |
| `ai-agents/prompts.md` | 에이전트 프로젝트 생성·push 토큰 secret 저장·번역 채워 Publish | `lib/mcp/tools/`, `lib/onboarding/workflow.ts`, `docs/ARCHITECTURE.md` §6.45 |
| `reference/formats.md` | 지원 포맷 다섯·경로·보존 특성 | `lib/adapters/index.ts`, `lib/adapters/`, `lib/onboarding/detect.ts`, `docs/ARCHITECTURE.md` §1 |
| `reference/limits.md` | 프로젝트·멤버·slug·초대 상한, 파일·적재 예산 | `lib/onboarding/create-plan.ts` (`PROJECT_LIMIT`), `lib/projects/owner-limit.ts` (`lockOwnerSlots` — 복원·OWNER 승격·OWNER 초대 수락의 상한), `messages/en.tsx` (`errors.access["owner-limit-reached"]`·`errors.invite["limit-reached"]` — 거부 문구의 결), `lib/auth/invitation.ts` (`MEMBER_LIMIT`), `lib/onboarding/slug.ts` (`PROJECT_SLUG_MAX`), `lib/invitation-email/limits.ts` (`INVITATION_HOURLY_LIMIT`), `lib/onboarding/budget.ts`, `lib/push/plan.ts` |
| `reference/troubleshooting.md` | 설치 누락·stale commit 409·payload 400·사용자 복구 경로 | `app/api/push/route.ts`, `lib/push/guard.ts`, `lib/push/plan.ts`, `docs/ACTIONS.md` §3, `lib/github-connect/message.ts`, `lib/onboarding/message.ts`, `messages/en.tsx` |
| `self-hosting/README.md`, `self-hosting/install.md`, `self-hosting/operate.md`, `self-hosting/troubleshooting.md` | 지원 범위·hosted 비교·외부 앱 등록·설정 표·Compose 설치·업데이트·백업/복원·키 회전·preflight 사유 코드·운영자 개인정보 재료. **명령은 실습으로 확인한 꼴을 지킨다**(SELF-HOSTING.md "셀프 호스팅 실습 기록") — 고치면 그 표에 미실행으로 남는다. 개인정보 재료 표는 `collected.ts`와 필드 단위 일대일이고 화면이 없어 스크린샷이 없다 | `deploy/**`(compose·`.env.example`·nginx·bootstrap·scheduler), `Dockerfile`, `lib/deployment/`(`preflight.ts`의 `SELF_HOSTED_ENV`·사유 코드), `scripts/preflight.ts`, `lib/credentials/`, `lib/privacy/collected.ts`, `lib/invitation-email/`, `docs/PRODUCT.md` §4.1 "셀프 호스팅", `docs/ARCHITECTURE.md` §7 "self-hosted DB", `docs/SELF-HOSTING.md` "셀프 호스팅 실습 기록" |
| 모든 페이지 | 정확한 UI 라벨·화면 용어 | 그 원고 언어의 사전(`messages/en.tsx`·`ko.tsx`·`es.tsx`), `lib/guide/dictionary.ts`, 실제 컴포넌트의 역할별 분기, `docs/DESIGN.md` §10·§10.0·§10.1 |

## 사전 본문 이관과 동결 {#dictionary-freeze}

옛 `m.publicDocs.docs.sections` 본문은 제거됐다. Markdown이 정본이고 라벨 게이트는 전체 사전 문자열을 대상으로 한다. 사전 본문에 새 기능 설명을 추가하지 않는다.

## 검증 {#verification}

검증 명령은 `pnpm test`다. 실물 원고에 거는 게이트는 그 원고와 같은 커밋에서 green이어야 한다.

- 구성 단계: 언어마다 SUMMARY와 파일 트리 일치, 세 트리의 구조 동형(`locales.test.ts`), H1 하나, H2 앵커 필수·중복 없음, 모든 페이지 도입 문단, 옛 해시 일곱의 대상 존재를 검사한다. 문자열 스캐너 셋은 실제 guide Markdown을 적어도 하나 읽어야 한다.
- 본문 단계: 내부 링크·앵커, 자리표시자, 사전·허용 목록 라벨, 표 이름 중복, 정본 상수를 추가 검사한다. 정본 상수는 `sectionByAnchor`로 해당 절만 잘라 대조한다. action 목록은 공유 헬퍼를 사용하고 고유 action 수가 4인지 유지한다.
- 이미지 단계: 참조·파일 양방향 일치, alt·치수·매핑 소스 경로·마스킹을 검사한다. `locales.test.ts`는 스페인어 설명 alt·title이 영어 원문에 머물지 않았는지도 필드별로 검사한다(브랜드명만인 설명은 명시한 예외). 이미지 0개일 때만 촬영 매뉴얼 부재를 허용한다.
- 스크린샷 최신성은 `pnpm guide:check`가 도입된 뒤 그 결과를 인용한다. stale 여부는 테스트의 차단 조건이 아니다.
- 자동 검사가 라벨의 실제 위치, EDITOR 화면 범위, 문장의 정확성까지 보장하지 않는다. 사용자 원고 검토와 실제 화면 대조 결과를 별도로 기록한다.

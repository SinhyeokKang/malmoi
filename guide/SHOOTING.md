# 가이드 촬영 규약

공개 가이드(`/docs`)의 스크린샷을 찍고 기록하는 규칙이다. `/guide-shots`가 이 문서를 로드해 실행하고, 이미지 게이트(`pnpm test`)와 `pnpm guide:check`가 아래 두 표를 읽는다. 본문 작성 규칙은 `AUTHORING.md`가 소유한다.

## 규격 {#spec}

| 항목 | 값 | 이유 |
| --- | --- | --- |
| 뷰포트 | **1280×800 CSS px** (16:10) — README 히어로만 1400×875 | 앱의 최소 폭 1280이다 (2026-09-28 사용자) |
| DPR | 2 | 캡처 원본이 곧 파일이다 — 줄이지 않는다 |
| 범위 | **뷰포트 전체** — 셸(LNB·헤더)과 모달의 Dim까지 그대로 | 독자는 글자를 읽으려는 게 아니라 화면의 전반적인 모양을 본다 (2026-09-28 사용자). 표시 폭 720에서 앱 글자가 작아지는 것은 받아들였다 |
| 파일 | 2560×1600 (히어로 2800×1750) | DPR 2 × 뷰포트 |
| 형식 | WebP(`sharp`, quality 90) | 같은 origin 정적 파일이라 CSP `img-src 'self'`로 충분하다 |
| 액자·배경 | **파일에 굽지 않는다** | 액자(`--border-subtle` · radius 12 · `shadow-low`)는 렌더러 CSS가 그린다 |

- ⚠️ **2026-09-28 전 규격은 조작 영역 중심의 부분 크롭(원본 폭 ≤ 850 CSS px · 표시 기준 최소 글자 11px)이었다** — 사용자가 뷰포트 전체로 뒤집었다. README도 같은 파일을 쓴다(`docs/assets/readme/`에는 README 전용 두 장 — 히어로 · Logs — 만 있다).
- 뷰포트는 `page.cdp("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 2, mobile: false })`로 고정한다(끝나면 `Emulation.clearDeviceMetricsOverride`). 캡처는 `page.cdp("Page.captureScreenshot", { clip: { x: 0, y: 0, width: 1280, height: 800, scale: 1 } })` — `scale`은 DPR에 곱해지므로 1이 2x 파일이다.
- 캡처 직전 마우스를 뷰포트 구석으로 옮긴다 — hover 면이 행에 남는다. Next dev 오버레이(`nextjs-portal`)는 DOM에서 지운다(브라우저 확장이 `<html>`에 속성을 붙여 hydration 경고를 띄운다).

## 환경 {#environment}

- 로컬 `pnpm dev` + dev DB. **촬영 전에 `pnpm dev`를 다시 띄운다** — dev 서버가 도는 중에 `pnpm build`를 돌리면 서버 컴포넌트가 낡은 채로 남는다.
- 데이터는 dev DB의 상주 QA 프로젝트 `bugshot-i18n-test-qa`(OWNER + EDITOR 두 계정)다. 지우거나 새로 만들지 않는다.
- **편집자 장(`translate/*`)의 컷은 EDITOR 계정으로 찍는다** — OWNER에게만 보이는 동작이 편집자 가이드 이미지에 들어가면 거짓이다.
- GitHub 화면은 github.com에서 폐기용 리포의 설정 화면으로 찍는다. **폼을 채워도 저장·제출하지 않고**, 촬영 뒤 새로고침해 되돌린다.
- 로그인(OAuth)은 사람이 한다. 계정을 바꿔야 하는 컷은 한 계정의 컷을 모아 찍는다.

## 마스킹 {#masking}

`/docs`는 공개 라우트다. 촬영 직전 DOM 텍스트 노드에서 `원본`을 `치환`으로 바꾼다. **위에서 아래 순서로 적용한다** — 긴 원본이 먼저여야 짧은 원본이 그 안을 반쯤 바꾸지 않는다. 가상 이름은 랜딩 목업(`m.landing.mockup` — `Acme web`·`acme/web`)과 맞춘다. 게이트는 이 표의 원본이 서빙되는 md에 0임을 본다.

| 원본 | 치환 |
| --- | --- |
| malmoi-test-org/bugshot-i18n-test | acme/web |
| bugshot-i18n-test-qa | acme-web |
| malmoi-test-org | acme |
| bugshot-i18n-test | web |
| i18n-order-check | acme-mobile |

**사람을 가리키는 값은 이 표에 적지 않는다** — 표 자체가 공개 리포에 커밋된다. 촬영자가 원본을 로컬에서만 들고 치환한다: OWNER 표시 이름·GitHub 로그인 → `Alex Kim`·`@alex-kim`, EDITOR 표시 이름 → `Jordan Lee`, 이메일(가려진 `ab***@…` 꼴 포함) → `@example.com` 주소, 사람 사진 → 치환 이름의 이니셜 원(`Avatar` 폴백 모양). 뷰포트 전체 규격이라 셸 좌상단·우상단 아바타가 늘 컷에 들어간다 — 크롭으로 뺄 수 없다.
- 앱 origin `localhost:3000`은 `mal-moi.com`으로 바꾼다 — `/mcp`의 Server URL과 조각이 origin을 그대로 보인다(가이드 본문이 프로덕션 주소를 쓴다).

- ⚠️ **오너 GitHub 계정명은 원본으로 올릴 수 없다** — `SinhyeokKang/malmoi/...`는 action 경로라 `setup/allowed-actions.md`에 정당하게 있고, 게이트가 부분 문자열로 red를 낸다. 화면에서 그 계정이 사람으로 보이는 자리(셸 좌측 상단·계정 메뉴)는 크롭으로 뺀다. action 경로 속 계정명은 공개 식별자라 그대로 둔다.
- 픽셀 안의 문자열은 게이트가 못 본다. 컷마다 눈으로 확인한다.

## 컷 목록 {#picks}

그림이 독자에게 실제로 도움이 되는 자리만 찍는다.

| 에셋 | 페이지 · 절 | 계정 | 화면 |
| --- | --- | --- | --- |
| `/guide/push-token-secret.webp` | `setup/workflow.md#push-token` | OWNER(GitHub) | 리포 Settings → Secrets and variables → Actions → New repository secret 폼, Name에 `PUSH_TOKEN` |
| `/guide/workflow-file.webp` | `setup/workflow.md#workflow` | OWNER | 프로젝트 Settings → CI integration → Workflow file 모달 |
| `/guide/actions-policy.webp` | `setup/allowed-actions.md#allowed-actions` | OWNER(GitHub) | 리포 Settings → Actions → General의 Actions permissions, 넷 패턴 입력 |
| `/guide/translation-editor.webp` | `translate/edit.md#find-key` | EDITOR | Translations — Keys 목록 + 선택한 키의 언어별 칸 |
| `/guide/publish-preview.webp` | `translate/publish.md#preview` | EDITOR | Publish 미리보기(저장한 편집 1건, 새 PR) |
| `/guide/create-repository.webp` | `setup/create-project.md#connect-github` | OWNER | ①단계 — `i18n`으로 거른 저장소 목록, 선택 + Branch |
| `/guide/create-files.webp` | `setup/create-project.md#choose-files` | OWNER | ②단계 — 감지된 세트 둘 선택 + 미리보기 |
| `/guide/create-name.webp` | `setup/create-project.md#confirm-project` | OWNER | ③단계 — Name·Address + Base language(Create project 누르지 않음) |
| `/guide/create-ready.webp` | `setup/create-project.md#finish-setup` | OWNER | ④단계 `Malmoi is ready` — 토큰 칩(가짜 값) + 워크플로 블록 + Open project |
| `/guide/project-home.webp` | `README.md` | OWNER | 프로젝트 Home — 카운트 카드 넷 + 프로젝트 메타 |
| `/guide/invite-members.webp` | `setup/members.md#invite` | OWNER | Members → Invite member 모달, 가짜 주소 둘(전송 안 함) |
| `/guide/members.webp` | `setup/members.md#members` | OWNER | Members 목록(Owner·Editor) + 빈 Pending invitations |
| `/guide/sources.webp` | `setup/sources.md#sources` | OWNER | Sources 목록 — 소스 둘 |
| `/guide/add-sources.webp` | `setup/sources.md#add-sources` | OWNER | Add sources 모달 — 감지 파일 + 미리보기 + Base language(추가 안 함) |
| `/guide/archive-card.webp` | `setup/archive.md#archive` | OWNER | Settings를 Archive project 카드까지 스크롤(누르지 않음) |
| `/guide/accept-invitation.webp` | `translate/join.md#join` | EDITOR | 초대 수락 화면(`/invite/<token>`) — dev DB에 심은 초대 1건, 수락 안 함 |
| `/guide/state-filter.webp` | `translate/edit.md#find-key` | EDITOR | Translations의 State 필터 메뉴 펼침 |
| `/guide/home-publish.webp` | `translate/publish.md#preview` | EDITOR | Home — 보낼 변경 1건, 켜진 Publish |
| `/guide/publish-result.webp` | `translate/publish.md#result` | EDITOR | Publish 결과 `Nothing changed in the files`(GitHub 쓰기 없음) |
| `/guide/home-paused.webp` | `sync/push.md#deferred` | OWNER | Home — To send 1 · repository updates held |
| `/guide/revert-confirm.webp` | `sync/revert.md#revert` | OWNER | Revert to last sent 확인창(`_locales` 셀 하나) |
| `/guide/sync-discard.webp` | `sync/revert.md#resync` | OWNER | Sync 확인창 — 미전달 1건 폐기 경고(확정 안 함) |
| `/guide/logs-event.webp` | `sync/logs.md#event-details` | OWNER | Logs(Kind: Publish)에서 연 Publish 사건 상세 |
| `/guide/account.webp` | `account.md#profile` | OWNER | Account — Profile · Sign-in methods · GitHub App |
| `/guide/mcp-create-token.webp` | `ai-agents/token.md#token` | EDITOR | MCP connector → Create token 모달 ①단계(만들지 않음 — ② 토큰 원문은 찍지 않는다) |
| `/guide/mcp-connector.webp` | `ai-agents/browser.md#connected-apps` | OWNER | MCP connector — Connected apps(연결 둘, 로고 칸) + 토큰 카드(원문 없음) — Connect 카드는 2026-09-30에 걷었다 |
| `/guide/oauth-consent.webp` | `ai-agents/browser.md#browser` | OWNER | `/oauth/authorize` 동의 화면 — claude.ai CIMD 요청(Authorize 누르지 않음), Translate & publish 하나 체크 |

## 에셋 매핑 {#shots}

`소스`는 그 화면을 그리는 리포 경로를 쉼표로 가른다. `blob`은 소스마다 `git hash-object <경로>` — **`소스`와 같은 순서, 같은 개수**다. `치수`는 파일의 실제 `WxH`이고 게이트가 파일과 대조하며 렌더러가 `width`·`height`로 쓴다. 외부(GitHub) 화면은 그 화면에 들어가는 값을 만드는 파일을 소스로 삼는다.

- `messages/en.tsx`는 소스로 올리지 않는다 — 모든 컷이 사전 수정마다 stale이 되어 신호가 죽는다. **컷의 요지인 낱말은 사전 키를 소스로 올린다**: `dict:<키 경로>`(예: `dict:translations.workspace.filters.state.unsent`), `blob` 칸은 **찍힌 낱말**(그 문자열)의 SHA-1이다. **보이는 문자열 잎만** 올린다 — 서브트리는 받지 않고, aria 전용 키(필터 축 이름)는 컷에 안 보이니 올리지 않는다. 새로 찍을 때는 그 값을 `dictDigest`(`lib/guide/stale.ts`)로 다시 잰다. 키 행이 없는 컷의 라벨을 바꿨으면 그 라벨이 보이는 컷을 손으로 고른다.

| 에셋 | 소스 | blob | 치수 |
| --- | --- | --- | --- |
| /guide/push-token-secret.webp | lib/onboarding/workflow.ts | 45d351ca4d9fc6cff70c84d0e784e6e992edba69 | 2560x1600 |
| /guide/workflow-file.webp | components/settings/ci-card.tsx, components/onboarding/workflow-block.tsx, lib/onboarding/workflow.ts | 2433140d7a63d80b70a281e298fac0babb52c027, e099fcb70b6fca21b04b07c69217a0b2a0018f9e, 45d351ca4d9fc6cff70c84d0e784e6e992edba69 | 2560x1600 |
| /guide/actions-policy.webp | lib/onboarding/workflow.ts, .github/actions/malmoi-i18n-push/action.yml | 45d351ca4d9fc6cff70c84d0e784e6e992edba69, 559ddc28bcd1c0fa8f4a1946dd15f7e8fcd0f03d | 2560x1600 |
| /guide/translation-editor.webp | components/translations/workspace/key-list.tsx, components/translations/workspace/locale-panel.tsx | 0a18a5bcbc8fa31d663ea0dbf7523c2b72c4b6cc, 1616f975ee725ef8c687ea5f647ae3fecbe3e4ac | 2560x1600 |
| /guide/publish-preview.webp | components/publish-button.tsx, lib/publish/preview.ts | 5da54cab3106be7df63d6093f2d28c42f2b643d5, 257ebc5a440efdd31731c6426b9851f869a41561 | 2560x1600 |
| /guide/project-home.webp | app/(edit)/projects/[slug]/(home)/page.tsx, components/home/count-cards.tsx, components/home/meta-column.tsx | 5d062707f1ec591a4acdd7437f5f20093c9766b2, cd1ba61b1b8896bbb609c8abe427d58e48205709, 78473e6f0b5d94e3bcfb526bef57d6da113f9f50 | 2560x1600 |
| /guide/invite-members.webp | components/members/invite-modal.tsx | a081452a0821600fc1e9ed02fb20dbd8073ae06e | 2560x1600 |
| /guide/members.webp | components/members/member-list.tsx, components/members/member-row.tsx, components/members/pending-invitations.tsx | 4945fd24321dc38619c04e3251b1afc108785e09, 540128fd7eff236573687ebd7bbbec98a8dc09a8, b64f43fad2ebaed332569e381b893ecac7414db7 | 2560x1600 |
| /guide/sources.webp | components/sources/sources-screen.tsx, components/sources/source-status.tsx | 5de1b8ef34458c4c5c9c4ca3d4c0931d734c4918, 0a919f69e5584af9bf861731c25cdd85b12c8e63 | 2560x1600 |
| /guide/add-sources.webp | components/sources/add-sources-modal.tsx | a5d967e4ae6d9c0ea5e6490d959f5bd8fb3539af | 2560x1600 |
| /guide/archive-card.webp | components/settings/archive-card.tsx | b16198f250b8322cffa1938286fb2814189851c3 | 2560x1600 |
| /guide/accept-invitation.webp | app/invite/[token]/page.tsx, components/invite/project-card.tsx, components/signin/auth-layout.tsx | f52c60923f6a8391492807fdf92bb8b473164029, f04bd2df388d5f046ad05818553e51c39fd45376, 707e072f943e340d3d4fb9b389ecb39f75d67eb2 | 2560x1600 |
| /guide/state-filter.webp | components/translations/workspace/filter-menu.tsx, dict:translations.workspace.filters.state.any, dict:translations.workspace.filters.state.unsent, dict:translations.workspace.filters.state.review, dict:translations.workspace.filters.state.new | 8122e89e1cd4f89a9de260f4d4eb875822d168dd, c7274cb43067637368cb3c704ecbb7895c5ae845, 587c501eb4069b3a59c57ceec50534b82deec57e, 33a506cf6ec5a56c261838f0a5a3d29cd7f2dacc, 56539cd31aeb7453fb2900c2952b988146fd6127 | 2560x1600 |
| /guide/home-publish.webp | app/(edit)/projects/[slug]/(home)/page.tsx, components/home/count-cards.tsx, components/publish-button.tsx | 5d062707f1ec591a4acdd7437f5f20093c9766b2, cd1ba61b1b8896bbb609c8abe427d58e48205709, 5da54cab3106be7df63d6093f2d28c42f2b643d5 | 2560x1600 |
| /guide/publish-result.webp | components/publish-button.tsx | 5da54cab3106be7df63d6093f2d28c42f2b643d5 | 2560x1600 |
| /guide/home-paused.webp | app/(edit)/projects/[slug]/(home)/page.tsx, components/home/count-cards.tsx, dict:home.cards.repositoryUpdatesHeld | 5d062707f1ec591a4acdd7437f5f20093c9766b2, cd1ba61b1b8896bbb609c8abe427d58e48205709, 80ab385ad53054c5819ef24d273e387217757eb4 | 2560x1600 |
| /guide/revert-confirm.webp | components/translations/workspace/workspace.tsx, components/translations/edit-loss-banner.tsx | 0401ce55fb57f4b2b24b175da11fe2b9efea88af, 4cbebb3c05947fab764389a51253f24589bfb2d0 | 2560x1600 |
| /guide/sync-discard.webp | components/home/sync-button.tsx | 7993dfca5dac36ad87d5fdf3de1b168410dcd8fb | 2560x1600 |
| /guide/logs-event.webp | components/logs/event-dialog.tsx, components/logs/event-detail.tsx | cadf74e0cb02c69164c5d8bd828ea5441dc71d60, 68a8754957aeedf36812d1f15a34df4cc7a4d08b | 2560x1600 |
| /guide/account.webp | app/(edit)/account/page.tsx, components/account/profile-picture.tsx, components/account/login-methods.tsx, components/account/github-section.tsx | 6d03357fb3f33f6c8a21c869640d7f72f0bdca76, 37eec1067fce9caa706483a11deb51d76bf4f39b, b5c854085c6c97a92859631493939f2ef4220967, e866658706416a009765e582123f1158decc7d6c | 2560x1600 |
| /guide/mcp-create-token.webp | components/mcp/token-modal.tsx, components/mcp/token-grant-fields.tsx | d56afa2334b2932c1734bab087e52280f6a4d543, bb5b03497d33a637fe411536b527156084be275d | 2560x1600 |
| /guide/mcp-connector.webp | components/mcp/connected-apps-card.tsx, components/mcp/token-card.tsx | 6ff150d2c6518cf026c8da643895cca18e0d47f3, 02dec0a0e34bb906d65c1921d5f9e1ed50b61d42 | 2560x1600 |
| /guide/oauth-consent.webp | app/oauth/authorize/page.tsx, components/oauth/consent-panel.tsx, components/oauth/app-card.tsx, components/mcp/token-grant-fields.tsx | 3440235fe7a45c306afa13f94ba1536d829b5f36, 12ad3105c15d4917f0a245797f1b092f59159757, c53824331c89ec5759a6173c71718b1b6b1ce01f, bb5b03497d33a637fe411536b527156084be275d | 2560x1600 |
| /guide/create-repository.webp | components/onboarding/new-project.tsx, components/onboarding/steps/repo.tsx | 92d8908f3e4e816ef619ad5056bf7c5fe7f9d5dd, 35a6949ccd7201ce6de97c7b3b2d944d32828c05 | 2560x1600 |
| /guide/create-files.webp | components/onboarding/new-project.tsx, components/onboarding/steps/files.tsx | 92d8908f3e4e816ef619ad5056bf7c5fe7f9d5dd, 72c92128cde6e327a6215f67634a0a8d512d31d7 | 2560x1600 |
| /guide/create-name.webp | components/onboarding/new-project.tsx, components/onboarding/steps/naming.tsx | 92d8908f3e4e816ef619ad5056bf7c5fe7f9d5dd, c588cef72e7d02b563634caec2630909d0b346c0 | 2560x1600 |
| /guide/create-ready.webp | components/onboarding/new-project.tsx, components/onboarding/steps/result.tsx, components/onboarding/workflow-block.tsx | 92d8908f3e4e816ef619ad5056bf7c5fe7f9d5dd, fa71478e64a00108ed033fcb26b2ff8e1f998f1c, e099fcb70b6fca21b04b07c69217a0b2a0018f9e | 2560x1600 |

- ⚠️ **셸이 컷에 들어간 뒤로 LNB·패널 머리·카드 머리(`components/shell/**`·`components/ui/panel-card.tsx` 등)의 변경도 모든 컷을 낡게 한다** — 소스로 올리면 신호가 죽으므로(`messages/en.tsx`와 같은 이유) 올리지 않는다. 셸을 바꿨으면 컷 전체를 손으로 다시 본다.

## 알려진 벽 {#walls}

- **GitHub App 설치 왕복**(①의 1클릭 설치·요청 복귀·승인 복귀)은 로컬에서 못 밟는다 — 설치 URL이 `redirect_uri`를 안 받아 프로덕션 callback으로 간다. 찍어야 하면 수동으로 찍고, 아니면 건너뛴다.
- **④ `Malmoi is ready`는 프로젝트를 새로 만들어야만 닿는다**(2026-09-29 사용자 승인으로 찍었다). 절차: ①–③과 같이 `i18n-order-check`를 보관해 자리를 만들고 → 실제 UI로 일회용 프로젝트를 만든다(Name `Acme web`·Address `acme-web` — 마스킹이 필요 없다) → ④가 뜨면 **스냅샷·텍스트 출력 전에** 토큰 칩(`<code>`)을 같은 형(base64url 43자)의 무작위 가짜 값으로 바꾸고, 캡처 직전 그 값이 남았는지 다시 확인한다 → YAML의 `api-url:` 줄은 로컬에서만 생기므로 DOM에서 지운다(프로덕션 출력과 맞춘다) → 캡처 뒤 Close → 일회용 프로젝트를 dev DB에서 **그 id로 좁힌 SQL**로 지운다(한 트랜잭션: `ProjectEvent`·`DeliveryConfirmation`·`SyncRun`·`TranslationBaseline`·`Translation`·`StringKey`(`KeyRef`는 cascade)·`Locale`·`ProjectInvitation`·`ProjectMember` → `Project.defaultSurfaceId` NULL → `TranslationSurface` → `Project`. **UI 삭제는 없다**) → `i18n-order-check`를 Restore. ⚠️ 폐기한 프로젝트의 사건은 촬영 흔적이라 같이 지운다 — 남은 프로젝트의 사건은 지우지 않는다.
- ⚠️ **미전달 표시를 지우는 길** (2026-09-28): 촬영용 편집을 원래 값으로 다시 저장하면 값은 리포와 같아지고 표시만 남는다. 그 셀에 전달된 적 있는 값이 없으면 **Revert to last sent가 꺼진다**(OWNER에게도 — "The last sent version isn't available"). 그때 OWNER의 Publish 미리보기가 *Nothing differs from dev*를 내고, 그 Publish는 **PR 없이 보낸 것으로 표시만 한다**(GitHub 쓰기 없음, Logs에 Publish 사건 1건). 편집자 장 컷은 이 정리 **뒤에** 찍는다 — 남으면 번역 화면에 `Repository updates are paused…` 배너와 `Not sent` 칩이 선다.
- **Publish 미리보기는 미전달 편집이 있어야 열린다** — 없으면 Publish가 `aria-disabled`다. 편집을 하나 저장해 찍으면 그 셀에 미전달 표시가 남는다. **Revert to last sent**는 마지막 전달 값이 없는 셀에서 꺼져 있을 수 있고, 같은 값을 다시 저장해도 미전달 표시는 안 지워진다(`lib/keys/save-key.ts`가 저장마다 새 토큰을 쓴다). 촬영 전에 되돌릴 길을 정한다.
- **GitHub 설정 화면에서 뷰포트 에뮬레이션(`Emulation.setDeviceMetricsOverride`)은 자동 모드 분류기가 막았다**(2026-09-27). ⚠️ 2026-09-28에는 앱에서 건 에뮬레이션이 같은 탭의 github.com 이동 뒤에도 유지돼 막히지 않았다 — 막히면 앱 탭에서 걸고 이동한다. GitHub 테마는 촬영 계정의 설정(지금 다크)을 따른다 — 바꾸지 않는다.
- **로그인 전환은 공급자의 계정 선택 화면으로 된다** — OWNER는 GitHub, EDITOR는 Google 계정이다. 비밀번호·2단계 인증을 묻으면 사람에게 넘긴다.

- ⚠️ **Revert to last sent는 전달 확인(`DeliveryConfirmation`)이 유효할 때만 켜진다** (2026-09-29): 확인이 무효인 소스에선 편집 직후에도 "The last sent version isn't available"로 꺼진다. **PR 없이 끝나는 Publish(`Nothing differs from dev` → `Nothing changed in the files`)가 새 확인을 세운다** — 그 뒤에 한 편집은 기준이 기록돼 Revert가 켜지고, 확인창 촬영 뒤 실제 Revert로 셀을 되돌리면 미전달 표시까지 GitHub 쓰기 없이 지워진다. 순서: 편집 → 원래 값으로 재저장 → Publish(Nothing differs) → 새 편집 → Revert 확인창 촬영 → Revert.
- **새 프로젝트 흐름(①–③)은 OWNER가 활성 프로젝트 상한(셋)이면 `/projects/new`가 목록으로 돌려보낸다** (2026-09-29 — 같은 dev DB를 쓰는 다른 QA가 MCP로 프로젝트를 만들어 셋이 됐다). 자리는 **OWNER 단독의 유휴 프로젝트(`i18n-order-check`)를 Settings에서 보관**해 만들고, 촬영 뒤 같은 카드의 Restore project로 되돌린다(사용자 승인 2026-09-29). 남이 쓰는 프로젝트는 건드리지 않는다. ③에서 **Create project를 누르지 않는다** — ④는 위 절차(일회용 프로젝트 + 정리)로만 찍는다.
- ①의 저장소 목록은 설치가 닿는 **개인 리포 이름을 전부** 보인다 — 검색창에 `i18n`을 넣어 테스트 리포만 남긴 상태로 찍는다. 목록의 GitHub 계정명은 `alex-kim`으로 치환한다(셸의 표시 이름은 `Alex Kim`).
- **dev DB는 다른 워커·preview와 함께 쓴다** — 촬영 중에 프로젝트 수·Logs·Projects 배지가 바뀔 수 있다. 촬영 전후 상태를 스냅샷으로 대조한다.

## 진행 상태 {#progress}

- 2026-09-27 초판 촬영 — 컷 목록 다섯 전부 반영. 남은 컷 없음.
- ④ `Malmoi is ready`는 벽(위)이라 Settings 모달로 대신했다.
- Publish 미리보기 촬영에 쓴 편집(`common.cancel` fr)은 값을 원래대로 다시 저장했지만 **Revert to last sent**가 꺼져 있어 미전달 표시가 남았다 — 그 뒤 미리보기가 "Close pull request #8"을 제안한다. 실행하지 않았다.
- GitHub 정책 컷의 옵션 문구 `Allow OWNER, and select non-OWNER, actions and reusable workflows`를 실물(조직 소유 리포)에서 확인했다.
- 2026-09-27 `/guide/workflow-file.webp` 재촬영 — #120이 모달의 중복 문장(`Save this in your repository as …`)을 지우고 힌트 링크를 `Add the workflow`로 바꿨다.
- 2026-09-27 action v2(action-run-cache) — `workflow.ts`(checkout v7.0.1·`@malmoi-i18n-push-v2`)·`action.yml`(셋업 판 교체) 변경으로 `push-token-secret`·`workflow-file`·`actions-policy`가 stale — **재촬영 없이 blob SHA만 갱신**했다. 바뀐 줄은 `workflow-file`의 스크롤 아래이고, 허용 목록 넷(`@*`)과 GitHub 화면은 그대로다.
- 2026-09-28 **규격 전환 — 뷰포트 전체(1280×800 · DPR 2 · 셸과 Dim 포함)로 다섯 컷 전부 재촬영**(사용자). 같은 날 셸 변경(PanelHeader·카드 머리 12/16, 번역 화면 카드 머리 52, LNB Changelog 버전 배지)이 들어간 화면이다. README가 같은 다섯 파일을 쓰고, README 전용은 `docs/assets/readme/hero.webp`(1400×875)·`logs.webp`(1280×800) 둘이다. 편집자 장 컷(`translation-editor`·`publish-preview`)은 EDITOR 계정이고 표시 이름을 `Jordan Lee`로 치환했다. Publish 촬영용 편집(`common.cancel` fr `Abandonner`)은 `Annuler`로 되돌리고 OWNER의 "Nothing differs" Publish로 미전달 표시를 지웠다.
- 2026-09-29 **컷 17장 추가 + 셸 컷 재촬영**(사용자 — "add more screenshots all over the docs"). 추가: `project-home` · `invite-members` · `members` · `sources` · `add-sources` · `archive-card` · `accept-invitation` · `state-filter` · `home-publish` · `publish-result` · `home-paused` · `revert-confirm` · `sync-discard` · `logs-event` · `account` · `mcp-create-token` · `mcp-connector`. 재촬영: stale 셋(`workflow-file` · `translation-editor` · `publish-preview`) — LNB에 MCP 로고 `MCP connector`가 선 셸 — 과 README 두 장(`hero` · `logs`, `logs`는 Kind: Publish로 거른 목록). GitHub 화면 둘(`push-token-secret` · `actions-policy`)은 셸이 없어 그대로다. 건너뜀: `setup/create-project.md`(①–③은 위 상한 벽, ④ `Malmoi is ready`는 벽 + 버튼 문구 변경 예정이라 지휘자가 제외). 초대 수락 컷은 dev DB에 초대 1건을 심어 찍고 수락 없이 id로 지웠다. 편집·Publish 흔적: `common.cancel` fr · `EXT_NAME` fr · `cancelConfirm.body` fr을 각각 원래 값으로 되돌렸고 미전달 0, Logs에 편집·`Nothing changed` Publish 2건·Revert 1건이 남았다(사건은 지우지 않는다).
- 2026-09-29 `api-url`(생성 워크플로가 프로덕션 밖에서만 `api-url` 한 줄을 싣는다) — `workflow.ts` 변경으로 `push-token-secret`·`workflow-file`·`actions-policy`가 stale — 세 컷은 프로덕션 출력(변화 없음)이라 **재촬영 없이 blob SHA만 갱신**했다.
- 2026-09-29 (같은 날, 사용자 지시) `setup/create-project.md` ①–③ 세 장 추가(`create-repository` · `create-files` · `create-name`) — `i18n-order-check`를 보관해 상한 자리를 만들고 촬영 뒤 복원했다. ④는 여전히 건너뜀.
- 2026-09-29 `/guide/accept-invitation.webp` 재촬영 — 셸 밖 골격이 `/signin` 외엔 장식 없는 단일 패널이 됐다(`AuthLayout`의 `decoration`). 변경이 `auth-layout.tsx` 안에서 끝나 `guide:check`가 못 잡았으므로 그 파일을 매핑 소스에 더했다. 초대는 전과 같이 dev DB에 1건(`i18n-order-check`, EDITOR 주소)을 사건 없이 심어 찍고 수락 없이 id로 지웠다. EDITOR 세션에서 `accept` 상태, 이메일은 마스킹된 `o***@…` 꼴이라 `*`까지 잡는 치환이 필요했다.
- 2026-09-29 mcp-oauth — `mcp-connector` **재촬영**: 맨 위에 Connected apps 카드가 섰다(`ai-agents.md#connected-apps`로 옮겼다). 연결 둘(`Claude Code` · 이름 없는 Codex CIMD URL)은 dev DB에 가짜 `OAuthConnection` 행으로 심었고, 토큰 카드는 UI로 만든 토큰(원문은 찍지 않았다)이다 — 촬영 뒤 셋 다 지웠다. origin `http://localhost:3000` → `https://mal-moi.com`, OWNER 이름·아바타 치환. `mcp-create-token`은 필드를 `token-grant-fields.tsx`로 옮긴 리팩터라 화면이 같아 **재촬영 없이 소스에 그 파일을 더하고 SHA만 갱신**했다.
- 2026-09-29 mcp-oauth 후속 — `oauth-consent` **추가**(`ai-agents.md#browser`): claude.ai CIMD(`claude.ai/oauth/mcp-oauth-client-metadata`, 콜백 `claude.ai/api/mcp/auth_callback`)로 만든 authorize 요청의 동의 화면, Authorize는 누르지 않았다(요청 행 1건은 10분 뒤 만료돼 다음 저장이 지운다). 이메일 → `alex.kim@example.com`, GitHub 아바타 → `AK` 이니셜 원. **SHA만 갱신** 둘: `accept-invitation`(`auth-layout.tsx`에 `scroll` prop과 주석만 — 초대 화면은 그 prop을 안 넘긴다) · `mcp-connector`(`connect-card.tsx`에 claude.ai 조직 안내 줄 — claude.ai 탭 안이라 기본 선택(Claude Code) 컷에 안 보인다).
- 2026-09-29 `create-ready` **추가**(`setup/create-project.md#finish-setup` ④, 사용자 지시) — 벽 절의 절차대로 일회용 프로젝트(`SinhyeokKang/i18n-format-check` · dev · `locales/{locale}.yml` 한 세트)를 만들어 찍고 id로 지웠다(`ProjectEvent` 3 · `Translation` 28 · `StringKey` 10 · `Locale` 3 · `ProjectMember` 1 · `TranslationSurface` 1 · `Project` 1). 토큰 칩은 가짜 값이고 `api-url` 줄은 지웠다. Dim 뒤 셸은 마스킹 표 + `SinhyeokKang` → `Alex Kim`·`alex-kim/` + 아바타 `AK` 치환. `i18n-order-check`는 보관 → 복원(Logs에 보관·복원 사건이 남는다). 화면 문구(`Malmoi is ready` · `Push token` · `Open project`)가 본문과 같아 제외 사유였던 "버튼 문구 변경 예정"은 해소됐다. `create-project.md`에 남은 컷 없음.
- 2026-09-29 Alert 재작업(테두리 없는 다섯 tone · `compact` · `live`) — stale 11컷 중 **Alert가 화면에 있는 둘만 재촬영**: `revert-confirm`(뒤의 보류 배너가 `info`→`neutral` 무테) · `sync-discard`(경고 블록이 `Alert warning compact`로). 편집은 `_locales` `EXT_NAME` fr 하나(`Signalement de bugs en un instant` → `Signaler un bug en un seul clic`)를 저장해 두 확인창을 찍고(Sync는 Cancel) 실제 Revert로 되돌렸다 — 미전달 0, GitHub 쓰기 없음, Logs에 편집 1·Revert 1 사건이 남았다. **SHA만 갱신** 아홉: `project-home`·`home-publish`·`home-paused`(Home 알림 띠가 비어 `empty:hidden` — 위 여백 16은 띠가 설 때만, `page.tsx`는 주석·memo 옵션), `sources`·`add-sources`(prop 배선·async transition 걷기 — 화면 불변), `logs-event`(성공 Publish라 노트가 없다), `account`·`mcp-connector`·`oauth-consent`(`role`→`live` 개명, 해당 Alert는 결과·미확인 상태에서만 선다).
- 2026-09-29 `sync-discard` **재촬영** — 미전달 1건일 때 대명사를 단수로 고쳤다(`replace them` → `replace it`, `To keep them` → `To keep it`). 같은 셋업(`_locales` `EXT_NAME` fr 편집 1건 → Sync 확인창, Cancel → 실제 Revert로 복원)이고 미전달 0, GitHub 쓰기 없음, Logs에 편집 1·Revert 1 사건이 더 남았다.
- 2026-09-30 ui-polish(셸 헤더 우측 `New project | 아바타` · LNB 사용자 구역 머리 줄 제거 · 동의 화면 만료 탭 폭) — **셸이 든 컷 전부 재촬영**: 앱 안 컷 22장 + `oauth-consent`(만료 탭이 폼 폭을 채운다) + `mcp-create-token`(stale) + README 두 장(`hero` · `logs`). 그대로 둔 셋: `push-token-secret` · `actions-policy`(GitHub 화면) · `accept-invitation`(셸 밖 골격, 변경 없음). `oauth-consent`의 만료 탭은 `token-grant-fields.tsx`가 그려 `guide:check`가 못 잡았으므로 그 파일을 매핑 소스에 더했다. 사람 사진은 `Avatar` 폴백 모양(이름 색 + 첫 글자 — `Alex Kim` amber · `Jordan Lee` sky)으로 치환했다 — 옛 컷의 주황·`AK` 회색 원은 손으로 만든 값이었다. 셋업: MCP 연결 둘은 가짜 `OAuthConnection` 행 + UI 토큰(원문 미촬영) → 촬영 뒤 행 삭제·UI 폐기(연결·토큰 0) · OWNER 편집 `_locales` `EXT_NAME` fr → paused·Revert·Sync(Cancel) 확인창 → 실제 Revert · ①–③은 `i18n-order-check` 보관 → 복원 · ④는 벽 절 절차대로 일회용 프로젝트(`i18n-format-check` · `Acme web`)를 만들어 찍고 id로 지웠다(사건 3 · 번역 28 · 키 10 · 로케일 3 · 멤버 1 · 표면 1 · 프로젝트 1) · `oauth-consent`는 claude.ai CIMD authorize 요청(Authorize 안 누름) · EDITOR Publish 셋은 `common.cancel` fr `Annuler`→`Abandonner` 저장 → Home·미리보기(PR 안 엶) → `Annuler` 재저장 → Publish(`Nothing differs`) → 결과 촬영. 미전달 0, GitHub 쓰기 없음. README `logs`는 최신 행이 전부 Nightly `Nothing to send`라 Sent·Not sent가 섞인 구간(17:11~)으로 목록을 스크롤해 찍었다(날짜 머리가 컷 밖으로 빠진다). ⚠️ **새로 밟은 것**: 목록의 GitHub 계정명은 `Alex Kim`이 아니라 `alex-kim`이다 — 이름과 로그인이 같은 문자열이라 일반 치환이 `Alex Kim`으로 바꾼다(`@alex-kim`·`alex-kim · Pushed`는 따로 먼저 치환). Settings의 Base branch 셀렉트는 첫 렌더에 skeleton이라 값(`dev`)이 뜬 뒤 찍는다. Sync 확인창은 `Checking whether anything is still waiting…`이 사라진 뒤 찍는다. 가짜 push 토큰은 **43자**(base64url)다.
- 2026-09-30 nightly-sync(Home 메타의 ` · manual`/` · nightly`/` · CI` 트리거 · Logs의 Nightly 행 문장·행위자 라벨 · 온보딩 ④ 설명 문구) — **재촬영**: `project-home` · `home-paused`(OWNER) · `home-publish`(EDITOR) · `logs-event`(같은 사건 `Jordan Lee sent translations to GitHub` · 2 files) · README `logs`(Kind: Publish, 17:11 구간 — Nightly 행에서 `automatic` 칩이 빠졌다). **SHA만 갱신**: `actions-policy` — `action.yml`은 주석과 `::warning` 문자열만 바뀌었고 GitHub 설정 화면(허용 패턴 넷)은 그대로다. **남은 컷: `create-ready`** — 설명 문구가 `messages/en.tsx`에서 바뀌어 `guide:check`엔 안 잡히지만 화면이 달라졌다. 이번 세션에서 `i18n-order-check` 보관 클릭이 자동 모드 분류기(공유 리소스 변경)에 막혀 일회용 프로젝트를 만들지 못했다 — 다음 촬영은 그 보관을 사람이 승인한 뒤 벽 절 절차로 찍는다. 셋업: OWNER `_locales` `EXT_NAME` fr 편집 → paused 촬영 → **Revert to last sent가 꺼져 있었다**(`The last sent version isn't available for every changed language.` — PR #17을 닫아 전달 확인이 무효) → 원래 값 재저장 → OWNER Publish(`Nothing differs`) · EDITOR `common.cancel` fr `Annuler`→`Abandonner` → Home 촬영 → `Annuler` 재저장 → EDITOR Publish(`Nothing differs`). 전후 대조: 미전달 0→0, 열린 Malmoi PR 0, GitHub 쓰기 없음, `bugshot-i18n-test-qa` 사건 433→439(편집·재저장·Publish × 2), `i18n-order-check`는 손대지 않았다(보관 안 됨). EDITOR 표시 이름은 소문자·공백 꼴이라 대소문자 구분 치환이 따로 필요했다. `bugshot-i18n-test-qa3`(base 브랜치 삭제로 실패한 sync)는 Projects 목록에만 보여 이번 컷엔 없다.
- 2026-09-30 nightly-sync 후속 — `create-ready` **재촬영**(④ 설명 문구 `Every night, Malmoi sends translations not yet sent … or picks up new commits` — `messages/en.tsx`라 매핑 SHA는 그대로다). 사용자 승인으로 벽 절 절차 그대로: `i18n-order-check` 보관 → 일회용 프로젝트(`SinhyeokKang/i18n-format-check` · dev · `locales/{locale}.yml` 한 세트 · `Acme web`/`acme-web` · English) → 토큰 칩을 브라우저에서 만든 43자 가짜 값으로 교체 · `api-url` 줄 제거 → 캡처 → id로 삭제(사건 3 · 번역 28 · 키 10 · 로케일 3 · 멤버 1 · 표면 1 · 프로젝트 1) → 복원. `i18n-order-check` 사건 64→68(이 촬영과 앞선 막힌 시도의 보관·복원 각 2쌍). ⚠️ **새로 밟은 것**: 자동 모드 분류기가 보관 클릭·`/projects/new` 진입을 공유 리소스 변경으로, ④ 대화상자 텍스트를 출력하는 것을 자격증명 노출로 막았다 — 보관·생성은 사람의 명시 승인이 필요하고, ④에선 토큰 교체 뒤에도 **대화상자 텍스트를 출력하지 않고** 개수·불리언만 확인한다(40자 넘는 다른 문자열은 액션 핀 SHA 하나).

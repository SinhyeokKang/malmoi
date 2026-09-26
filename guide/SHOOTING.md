# 가이드 촬영 규약

공개 가이드(`/docs`)의 스크린샷을 찍고 기록하는 규칙이다. `/guide-shots`가 이 문서를 로드해 실행하고, 이미지 게이트(`pnpm test`)와 `pnpm guide:check`가 아래 두 표를 읽는다. 본문 작성 규칙은 `AUTHORING.md`가 소유한다.

## 규격 {#spec}

| 항목 | 값 | 이유 |
| --- | --- | --- |
| DPR | 2 | 표시 폭 720 칸에서 흐리지 않다 |
| 크롭 | 조작 영역 중심의 부분 크롭 · 원본 폭 ≤ 850 CSS px | 앱 13px가 720 칸에서 11px 이상으로 남는다 |
| 파일 폭 | ≤ 1700px | DPR 2 × 850 |
| 표시 폭 | 720 | 본문 칼럼 가득(DESIGN §6.61) |
| 최소 글자 | 표시 기준 11px | 12px 문구가 많은 화면은 780 CSS px 안팎으로 더 좁힌다 |
| 형식 | WebP(`sharp`, quality 90) | 같은 origin 정적 파일이라 CSP `img-src 'self'`로 충분하다 |
| 액자·배경 | **파일에 굽지 않는다** | 액자(`--border-subtle` · radius 12 · `shadow-low`)는 렌더러 CSS가 그린다. 둥근 모달은 모서리의 배경막이 안 들어오게 안쪽으로 자른다 |

- 폭이 넘치는 화면은 뷰포트를 바꾸지 않고 **촬영 직전 DOM에서 그 칼럼·모달의 폭만 줄인다**(`style.width`). 저장·제출은 하지 않는다. 앱의 모달과 번역 화면 칼럼은 폭을 따라 흐르므로 실물과 같은 배치가 나온다.
- 캡처는 `page.cdp("Page.captureScreenshot", { clip: { …, scale: 1 } })`로 받는다 — `scale`은 DPR에 곱해지므로 1이 2x 파일이다. `page.screenshot()`의 `clip`은 CSS 1x로 떨어진다.
- 촬영 직전 `innerWidth`·`devicePixelRatio`를 확인한다(ego-browser 기본 창은 DPR 2였다).

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

**사람을 가리키는 값은 이 표에 적지 않는다** — 표 자체가 공개 리포에 커밋된다. 계정 표시 이름은 `Alex Kim`으로 바꾸고, 이메일·아바타·계정 메뉴는 크롭 밖으로 뺀다. 촬영자가 원본을 로컬에서만 들고 치환한다.

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
| `/guide/publish-preview.webp` | `translate/publish.md#preview` | EDITOR | Publish 미리보기(저장한 편집 1건, 열린 PR 교체) |

## 에셋 매핑 {#shots}

`소스`는 그 화면을 그리는 리포 경로를 쉼표로 가른다. `blob`은 소스마다 `git hash-object <경로>` — **`소스`와 같은 순서, 같은 개수**다. `치수`는 파일의 실제 `WxH`이고 게이트가 파일과 대조하며 렌더러가 `width`·`height`로 쓴다. 외부(GitHub) 화면은 그 화면에 들어가는 값을 만드는 파일을 소스로 삼는다.

- `messages/en.tsx`는 소스로 올리지 않는다 — 모든 컷이 사전 수정마다 stale이 되어 신호가 죽는다. 라벨을 바꿨으면 그 라벨이 보이는 컷을 손으로 고른다.

| 에셋 | 소스 | blob | 치수 |
| --- | --- | --- | --- |
| /guide/push-token-secret.webp | lib/onboarding/workflow.ts | 83a27a21602a5499990ed7d0a0149c9bd4391eb4 | 1672x876 |
| /guide/workflow-file.webp | components/settings/ci-card.tsx, components/onboarding/workflow-block.tsx, lib/onboarding/workflow.ts | a2a262f34608ceefb15e81d9f1fa7748337c9cf0, e099fcb70b6fca21b04b07c69217a0b2a0018f9e, 83a27a21602a5499990ed7d0a0149c9bd4391eb4 | 1496x1036 |
| /guide/actions-policy.webp | lib/onboarding/workflow.ts, .github/actions/malmoi-i18n-push/action.yml | 83a27a21602a5499990ed7d0a0149c9bd4391eb4, 53c5d7d7e9b47a639698cddb6e35c83c88888915 | 1672x1044 |
| /guide/translation-editor.webp | components/translations/workspace/key-list.tsx, components/translations/workspace/locale-panel.tsx | 2b76bc12d1bef23dc6db41b0877ce19bd6f4c52b, 017cfe5e337051262ffdd18f1c9bcc14962c1169 | 1700x1616 |
| /guide/publish-preview.webp | components/publish-button.tsx, lib/publish/preview.ts | 0b34325ec125423306f9a2bd15c71a02d8e0c389, 53a5195bd22c62e1f778cca4f7c3bb46d5f0515c | 1496x1160 |

## 알려진 벽 {#walls}

- **GitHub App 설치 왕복**(①의 1클릭 설치·요청 복귀·승인 복귀)은 로컬에서 못 밟는다 — 설치 URL이 `redirect_uri`를 안 받아 프로덕션 callback으로 간다. 찍어야 하면 수동으로 찍고, 아니면 건너뛴다.
- **④ `Malmoi is ready`는 프로젝트를 새로 만들어야만 닿는다.** OWNER 계정이 활성 프로젝트 셋(상한)을 이미 가져 생성이 막히고, 만들면 dev DB에 일회용 프로젝트가 쌓인다. 게다가 그 화면은 push 토큰 원문을 보인다. 같은 워크플로 문구는 Settings → CI integration → Workflow file 모달에서 찍는다(본문도 "or later from Settings"로 안내한다).
- **Publish 미리보기는 미전달 편집이 있어야 열린다** — 없으면 Publish가 `aria-disabled`다. 편집을 하나 저장해 찍으면 그 셀에 미전달 표시가 남는다. **Revert to last sent**는 마지막 전달 값이 없는 셀에서 꺼져 있을 수 있고, 같은 값을 다시 저장해도 미전달 표시는 안 지워진다(`lib/keys/save-key.ts`가 저장마다 새 토큰을 쓴다). 촬영 전에 되돌릴 길을 정한다.
- **GitHub 설정 화면에서 뷰포트 에뮬레이션(`Emulation.setDeviceMetricsOverride`)은 자동 모드 분류기가 막았다**(2026-09-27). 칼럼 폭을 DOM에서 줄이는 쪽으로 찍는다.

## 진행 상태 {#progress}

- 2026-09-27 초판 촬영 — 컷 목록 다섯 전부 반영. 남은 컷 없음.
- ④ `Malmoi is ready`는 벽(위)이라 Settings 모달로 대신했다.
- Publish 미리보기 촬영에 쓴 편집(`common.cancel` fr)은 값을 원래대로 다시 저장했지만 **Revert to last sent**가 꺼져 있어 미전달 표시가 남았다 — 그 뒤 미리보기가 "Close pull request #8"을 제안한다. 실행하지 않았다.
- GitHub 정책 컷의 옵션 문구 `Allow OWNER, and select non-OWNER, actions and reusable workflows`를 실물(조직 소유 리포)에서 확인했다.

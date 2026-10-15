# ph-launch — Product Hunt 런칭 자료

작성: 2026-10-15 · 상태: **씬·카피 초안 확정 · 갤러리 디자인은 사용자가 직접 · 목업은 임시 컷(재촬영 대기)**

**런칭 시점은 지금 `docs/features/`에 있는 기능이 전부 프로덕션에 들어간 뒤다**(2026-10-15 사용자): `locale-add` · `source-row-locale-meter` ·
`project-row-redesign` · `agent-readiness`. 그래서 씬 구성은 그 기능들을 전제로 짰고, 지금 목업은 현재 화면으로 찍은 **임시 컷**이다 — 디자인을 먼저
만들고, 배포 뒤 다시 찍은 컷으로 목업만 바꿔 끼운다.

- 이미지 위치: **`~/Desktop/malmoi-ph/`**(리포 밖). 파일명이 아래 씬 번호다. `reference-bugshot/`에 BugShot 갤러리 원본 7장 + 썸네일이 있다.
- 카피의 사실 근거는 `README.md`·`docs/PRODUCT.md`다. 기능이 바뀌면 카피가 틀린 쪽이다.

## 1. 레퍼런스 — BugShot 런칭 페이지

[producthunt.com/posts/bugshot-3](https://www.producthunt.com/posts/bugshot-3) — 갤러리 7장, 1280×800 PNG, 썸네일 240×240.

| 요소 | BugShot이 한 것 |
|---|---|
| 배경 | 연한 하늘색 그라데이션(평면, 장식 없음) |
| 헤드라인 | 굵은 남색 산세리프 2~3줄, 서브카피 없음 |
| 목업 | 앱 패널을 카드로 잘라 2장 겹침(뒤 카드는 잘리게) · 아래쪽 페이드 |
| 배치 | 장마다 카피 위치를 바꾼다 — 왼쪽 · 위 · 오른쪽 · 아래 |
| 마지막 장 | 연동 서비스 로고 4×2 그리드 |

## 2. 갤러리 씬 (8장, 한 장 = 대표 기능 하나)

| # | 기능 | 헤드라인 | 목업(배포 뒤 최종 컷) | 지금 임시 컷 | 배치 제안 |
|---|---|---|---|---|---|
| 1 | 번역 편집기 | **Translate your repo without touching Git** | 번역 화면 — `checkout.submit`을 en·de·fr·ja로 연 우측 패널 | `01-translation-editor.png` (현행, 1400×875 @2x) | 카피 왼쪽 · 패널 오른쪽 |
| 2 | 로케일 파일 자동 감지 | **Finds the translation files already in your repo** | 온보딩 ② "Which files hold your strings?" | `02-file-detection.png` (가이드 컷 `create-files`) | 카피 위 · 카드 겹침 |
| 3 | 언어 추가·제거 (`locale-add`) | **Add a language. It ships in the next pull request.** | 소스 상세 Languages 카드의 Add language Dialog | `03-add-language.png` (현행 Languages 카드 — **Add language 버튼 없음**) | 패널 왼쪽 · 카피 오른쪽 |
| 4 | 언어별 진행 (`source-row-locale-meter`) | **See which language is falling behind** | Sources 목록 — 소스 행마다 언어 막대 | `04-language-progress.png` (현행 Sources 목록 — **막대 없음**) | 카피 위 · 카드 겹침 |
| 5 | Publish → PR 하나 | **Every edit goes back as one pull request** | Publish 미리보기(키×언어 변경 + Open pull request) | `05-publish-pull-request.png` (가이드 컷 `publish-preview` — `guide:check` stale) | 패널 위 · 카피 아래 가운데 |
| 6 | push마다 자동 동기화 | **New keys arrive on every push** | 생성된 워크플로 파일 Dialog | `06-sync-on-push.png` (가이드 컷 `workflow-file`) | 카피 왼쪽 · 패널 오른쪽 잘림 |
| 7 | MCP — 코딩 에이전트 | **Let your coding agent translate & publish** | MCP connector — Claude Code·Codex 연결 | `07-mcp-agents.png` (가이드 컷 `mcp-connector`) | 카피 오른쪽 · 패널 왼쪽 |
| 8 | **셀프 호스팅** | **Self-host it with Docker Compose** | 코드 카드 둘 — `deploy/compose.yaml` 발췌(서비스 web · postgres · scheduler) + 터미널 `docker compose up -d` · 이미지 줄 `ghcr.io/sinhyeokkang/malmoi:v<x.y.z>` | 없음(코드 카드는 디자인에서 조판) | 카피 위 가운데 · 카드 겹침 |

- **오픈소스·셀프 호스팅이 런칭의 축이다**(2026-10-15 사용자). **셀프 호스팅은 갤러리 씬 하나(8번)**로, **오픈소스는 런칭 문구(태그라인·설명·메이커 코멘트 첫 문단)**로 든다 — 갤러리 씬은 기능 소개만 한다.
- 8번에서 뺀 로고 그리드(GitHub · GitLab · JSON · YAML · TS/JS · Chrome `_locales` · Claude Code · Codex)는 2번 목업 아래 띠로 넣어도 된다 — 디자인 판단.
- **8번 카피의 사실 범위**: 서버 한 대 + Docker Compose(앱 · PostgreSQL 17 · 업로드 볼륨 · 야간 스케줄러) + 사용자의 HTTPS 프록시. Kubernetes·다중 인스턴스·GitHub Enterprise·GitLab Self-Managed는 지원하지 않는다(README "Self-hosting") — 카피에 "anywhere"·"any Git host"를 붙이지 않는다.
- **7번 문구를 "AI translates"로 바꾸지 않는다** — Malmoi는 AI 모델을 부르지 않는다(README "AI agents over MCP"). 에이전트는 사용자 것이고, 할 수 있는 일은 그 사람 권한 + 동의 화면에서 허용한 범위다.
- **3번은 OWNER 동작이고 `json-catalog`·`chrome-locales`만 지원한다** — 카피가 포맷을 말하지 않으니 그대로 참이다. 목업은 OWNER 계정으로 찍는다.
- 갤러리에서 뺀 기능 — 활동 로그(편집 전후 값), 팀 초대·역할, 프로젝트 목록(`project-row-redesign`)은 아래 설명·메이커 코멘트에서 말한다.

## 3. 페이지 문구 (en)

글자 수 상한은 제출 폼에서 다시 확인한다(작성 시점 기준 태그라인 60자 · 설명 260자로 맞췄다).

**Name** — `Malmoi`

**Tagline** (55자) — `Open-source localization for your GitHub & GitLab repos`

**Description** (241자)

> Open-source localization for GitHub and GitLab repos. Malmoi finds your translation files, lets teammates edit every language in the browser, and sends their changes back as one pull request. Free on mal-moi.com, or self-host it with Docker.

**Links** — Website `https://mal-moi.com` · GitHub `https://github.com/SinhyeokKang/malmoi` · Docs `https://mal-moi.com/docs`

**Pricing** — Free

**Topics** — Open Source · Developer Tools · GitHub

**Thumbnail** — 240×240, `public/brand/malmoi-icon-black.svg`(데스크톱 폴더에 복사본)

### 메이커 첫 코멘트 (초안)

> Hi Product Hunt 👋
>
> I built Malmoi because every localization tool I tried wanted to own my strings. You upload files, translators edit them somewhere else, and then someone has to merge the two back together.
>
> Malmoi keeps one rule instead: **the code decides which keys exist, and Malmoi holds the translated values.** Nothing gets merged.
>
> **It's open source (MIT), and you can run it yourself.** Use mal-moi.com for free, or deploy the same app on your own server with Docker Compose. Every release ships a container image on GHCR, so your strings and your team's accounts stay on your infrastructure.
>
> - **Connect a GitHub or GitLab repo.** Malmoi detects your locale files (JSON, YAML, TS/JS dictionaries, Chrome `_locales`) and loads them. No config file, no upload.
> - **Invite teammates by email.** They edit every language of a key side by side and never touch Git.
> - **Hit Publish.** Every saved edit goes back as one pull request (a merge request on GitLab). Merging stays with your reviewers.
> - **Add or remove a language from the app.** The file change ships in that same pull request.
> - **Stay in sync.** A generated GitHub Actions workflow (or GitLab CI job) brings new keys in on every push, and a nightly sync covers the rest.
> - **Use your coding agent.** Claude Code, Codex, or a claude.ai connector can do the same work over MCP. You sign in through the browser, so there's no token to copy. Malmoi itself never calls an AI model.
>
> Every edit, sync, and publish is logged with who did it and the value before and after.
>
> What it deliberately doesn't do: machine translation, translation memory, ICU plurals, approval workflows. If you need those, Crowdin or Tolgee is a better fit.
>
> The name comes from *Malmoi* (말모이, "gathering words"), a 1910s effort to collect scattered Korean words into one dictionary. Many people gathering words into one place is what this tool does.
>
> I'd love to hear how your team handles translations today.

## 4. 재촬영 (배포 뒤)

조건: 위 네 기능이 **dev에 다 들어간 뒤**, 로컬 `pnpm dev` + dev DB 상주 프로젝트 `Acme web`(SHOOTING §resident)에서 찍는다. 규격·마스킹은 `guide/SHOOTING.md`를
따르되 **PH용 컷은 `public/guide/`에 쓰지 않고** 데스크톱 폴더의 같은 파일명을 덮는다. 가이드 컷도 같이 stale이 될 것이므로 `/guide-shots`와 한 번에 찍으면 된다.

| # | 다시 찍을 이유 | 셋업 |
|---|---|---|
| 1 | 사이드바·편집기 변경 반영(현행 컷이어도 배포 뒤 버전 배지가 바뀐다) | OWNER · `web` › `checkout` › `checkout.submit` · 1400×875 |
| 3 | Add language Dialog가 아직 없다 | OWNER · `web` 소스 상세 → Add language → 코드 하나 입력한 상태(제출하지 않는다) |
| 4 | 소스 행 막대가 아직 없다 | Sources 목록 그대로 |
| 5 | 가이드 컷이 `guide:check` stale | SHOOTING §resident의 EDITOR 셋업(fr 저장 → 미리보기 → 칸 비워 저장 → Publish로 미전달 0) |
| 2·6·7 | 가이드 컷 재촬영분으로 교체 | `/guide-shots` 결과를 PNG로 변환해 덮는다 |

- ⚠️ **2026-10-15 촬영 때 ego에서 `Page.captureScreenshot`이 매번 타임아웃이 났다**(어느 탭이든, 뷰포트 고정 여부와 무관). `Page.printToPDF`(`media: screen` · 용지 = 뷰포트 · 여백 0) → CoreGraphics로 2x 래스터화하는 우회로 찍었다. 이 경로는 `box-shadow`를 색이 어긋난 비트맵으로 굽고 `backdrop-filter`를 못 그려서 **둘 다 끄고 찍었다** — 그래서 지금 임시 컷 01·03·04에는 그림자가 없다. 재촬영 때는 `captureScreenshot`이 되는지부터 본다.
- 계정의 테마가 dark라 캡처 직전 `<html data-theme="light">`로 바꿔 찍었다(계정 설정은 건드리지 않았다).

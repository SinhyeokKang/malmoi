# docs-guide — 설계

## 0. bugshot-2에서 가져오는 것 / 버리는 것

| bugshot-2 | malmoi | 이유 |
|---|---|---|
| `guide/{ko,en}/**.md` + 로케일별 `SUMMARY.md` | **`guide/**.md` + `guide/SUMMARY.md` 하나** | en 단일 |
| `guide/AUTHORING.md` — IA·톤·사실 대조 소스 표·검증 grep | **가져온다(한국어)** — 검증 grep은 `pnpm test`로 올린다 | bugshot은 체크리스트를 사람이 돌린다. 여기는 순수 함수라 테스트가 싸다 |
| `guide/SHOOTING.md` — 상수·합성·마스킹·벽·진행 상태 | **가져온다(한국어)** + **에셋 매핑 표(소스 경로·blob SHA·치수)를 여기 둔다** | 매핑의 출처를 하나로 |
| `/guide` · `/guide-shots` 분리 | **가져온다** | 촬영은 ego-browser 세션만 된다 |
| stale = 소스 커밋 시각 > 이미지 커밋 시각 | **버린다 → blob SHA 기록 비교** | dev→main squash + `/sync` hard reset이면 둘이 같은 커밋 시각이 되어 머지마다 신호가 사라진다. CI(`actions/checkout` depth 1)에서는 값이 없는 게 아니라 **전부 grafted HEAD 시각으로 틀리게** 나온다 |
| 별도 리포 fetch · `normalizeMarkdown`(gitbook 유산) · Fuse 검색 · 언어 전환 | **버린다** | 같은 앱 · en 단일 · 페이지 수가 적다 |
| 정규식 기반 링크 재작성 | **버린다 → mdast** | 게이트와 렌더러가 같은 AST를 본다 |

## 1. 영향 받는 흐름

push / 편집 UI / pull **어디에도 붙지 않는다.** 공개 라우트 `/docs`와 그 소비자 **다섯**(`app/page.tsx:41` · `components/public-shell/header.tsx:40` · `lib/links.ts:23` · `lib/shell/nav.ts:210` · `components/settings/ci-card.tsx:40`)만 움직인다.

## 2. 디렉터리

```
guide/
  SUMMARY.md          # IA 정본 — 내비 순서·계층
  README.md           # /docs (개요 — 독자 두 갈래)
  <section>/README.md # /docs/<section>
  <section>/<page>.md # /docs/<section>/<page>
  AUTHORING.md        # 작성 매뉴얼(한국어) — SUMMARY 밖, 서빙 안 함
  SHOOTING.md         # 촬영 매뉴얼 + 에셋 매핑 표(한국어) — SUMMARY 밖, 서빙 안 함
public/guide/         # 이미지(WebP). 커밋된다. md는 `/guide/<name>.webp` 절대경로로만 참조
lib/guide/            # 순수 함수 + server-only 로더
```

- `docs/`(내부 문서)와 이름을 가르려고 `guide/`다. 라우트만 `/docs`다.
- **`<x>.md`와 `<x>/README.md`가 둘 다 있으면 red다** — 둘 다 `["x"]`로 해소된다.
- **이미지는 `public/guide/`에 바로 커밋한다** — 복사 단계가 없다. 대가: GitHub의 md 미리보기에서 이미지가 깨진다(목적 밖).
- **치수는 에셋마다 SHOOTING 표에 기록한다** — 부분 크롭이라 캔버스가 하나일 수 없다. 테스트가 실제 파일(`sharp` 메타데이터 — 이미 의존성이고 vitest에서 쓰인다)과 대조하고, 렌더러가 그 값을 `width`·`height`로 써서 CLS를 막는다.

## 3. IA (① 단계의 입력 — 코드 대조로 확정한다)

`[D]` 개발자 · `[E]` 편집자 · `[*]` 공통. `←`는 지금 `/docs` 절의 이관처(= 옛 해시 매핑 표).

```
- Malmoi                           README.md                       [*] ← #how-it-works   독자 두 갈래(Set up / Translate)
- Set up a project                 setup/README.md                 [D]
  - Create a project               setup/create-project.md         [D]   온보딩 ①–④, GitHub App 설치
  - Add sources                    setup/sources.md                [D]   Add sources · 기준 로케일
  - Add the workflow               setup/workflow.md               [D] ← #workflow
  - Allow the actions              setup/allowed-actions.md        [D] ← #allowed-actions
  - Invite translators             setup/members.md                [D]   역할표(PRODUCT §3)
  - Archive a project              setup/archive.md                [D]
- Translate                        translate/README.md             [E]
  - Join a project                 translate/join.md               [E]   초대 수락 · 로그인
  - Edit translations              translate/edit.md               [E]   번역 화면 · 필터 · Needs review(플래그)
  - Publish                        translate/publish.md            [E]   미리보기 diff → PR (EDITOR가 보는 범위만)
- How syncing works                sync/README.md                  [*]
  - When code changes              sync/push.md                    [D]   push · orphaned · 보류(deferred)
  - Merging the pull request       sync/merging.md                 [D] ← #merging
  - Every night                    sync/nightly.md                 [*] ← #nightly
  - Undo and resync                sync/revert.md                  [D]   Revert to last sent · 수동 Sync (OWNER)
  - Activity log                   sync/logs.md                    [*]
- Your account                     account.md                      [*]   로그인 수단 연결 · 프로필
- Reference                        reference/README.md             [*]
  - Supported file formats         reference/formats.md            [D] ← #formats
  - Limits                         reference/limits.md             [*] ← #limits
  - Troubleshooting                reference/troubleshooting.md    [D]   not-installed · 409 stale-commit · push 400 사유
```

- ⚠️ **초안이다** — 제목·배치는 ①에서 확정한다. **장 제목과 본문은 코드명이 아니라 화면 문구를 쓴다**(surface가 아니라 `Sources`·`Add sources`).
- **앵커는 데이터다** — `## Heading {#workflow}`. **모든 H2에 필수**(목차에서 조용히 빠지는 것을 막는다 — DESIGN §6.61·§6.616의 h2 `id` 필수와 같다). H3는 선택. id 문자 집합은 `[a-z0-9-]`.

## 4. 순수 함수 (`/tdd` 대상) — `lib/guide/`

**파서는 mdast 한 벌이다** — `unified` + `remark-parse` + `remark-gfm`으로 AST를 만들고 게이트·목차·렌더러가 같은 트리를 본다. 코드 펜스·인라인 코드 안의 `{#id}`·`**x**`·`[a](b)`는 AST에서 코드 노드라 원리적으로 안 잡힌다. 파일 읽기는 `lib/guide/load.ts`(`server-only`) 하나이고, **모듈 최상위에서 읽지 않는다** — 함수 안 + React `cache`(md가 번들에서 빠지면 import 순간 500이 되어 원인이 가려진다 — prisma.config와 같은 부류).

| 함수 | 입력 → 출력 |
|---|---|
| `parseMd(text)` | md → mdast (게이트·렌더 공용) |
| `parseSummary(tree)` | SUMMARY → 내비 트리. 중복 경로·`guide/` 밖 경로·AUTHORING/SHOOTING 등재 → 오류 |
| `pathToSlug` / `slugToFile(slug, files)` | `setup/README.md` ↔ `["setup"]`. 충돌·미등재 → null. `Object.create(null)` |
| `flattenNav(tree)` | 선위 순회 → 이전/다음 |
| `parseHeadingAnchor(text)` | `"Add the workflow {#workflow}"` → `{ text, id }`. id 문자 집합 검증 |
| `extractToc(tree)` | H2(+시안이 정하면 H3) → 목차 |
| `sectionByAnchor(tree, id)` | 앵커 헤딩부터 다음 같은 급 헤딩 전까지의 텍스트 — 상수 대조용(지금 테스트의 `closest("section")` 대응) |
| `tableLabel(tree, table)` | 가장 가까운 상위 헤딩 텍스트 → `DocTable`의 `label` |
| `resolveDocLink(fromFile, href)` | 상대 `.md` 링크 → `/docs/<slug>#anchor` |
| `collectLinks` / `collectImages` / `collectUiLabels` | mdast → 참조 목록(굵게 = `strong` 노드) |
| `dictionaryStrings(m)` | 사전 → 문자열 집합. **`publicDocs` 서브트리 제외**(자기 참조로 늘 green이 된다) · 함수 값 제외 · JSX 값 제외(`isValidElement`) |
| `parseMdTable(tree, headingId)` | AUTHORING·SHOOTING의 표(외부 라벨 허용 목록 · 에셋 매핑 · 마스킹) → 행 배열 — 표 셋이 파서 하나를 쓴다 |
| `legacyAnchorTarget(hash)` | `"formats"` → `/docs/reference/formats#formats` 또는 null — 옛 해시 일곱 |
| `staleShots(shots, currentBlobs)` | 매핑 표의 기록 SHA vs 현재 SHA → stale 목록 |

**라벨 게이트 규약**(AUTHORING에 박는다): 굵게 = UI 라벨, 기울임 = 강조. 대조는 **정확 일치**(대소문자·`…` 포함). **보간·함수형 라벨**(`Publish 3 changes`, `hookHint`)은 굵게 쓰지 않는다. 외부 라벨(GitHub 등)은 AUTHORING 허용 목록 표에 올린다. 못 잡는 것: 사전에 여전히 있지만 다른 화면으로 옮겨간 라벨 — 사람의 몫이다.

## 5. 렌더러 (④ — 시안 수신 후)

- 라우트 `app/docs/[[...slug]]/page.tsx`가 `app/docs/page.tsx`를 대체한다. **동적이다** — 지금의 `/docs`(`app/docs/page.tsx:13`)와 `/privacy`(`publicCta`)가 이미 세션을 읽는다. 404는 `slugToFile`이 null이면 `notFound()` 한 줄이다(`generateStaticParams` 없음).
- **`next.config.ts`의 `outputFileTracingIncludes`에 `guide/**/*.md`를 넣는 것은 필수다** — 동적 라우트가 `fs`로 읽으므로 Vercel 함수 번들에 안 들어갈 수 있고, 로컬 `next start`는 그것을 못 잡는다. 판정은 빌드 산출 `.nft.json`이다.
- 의존성(직접 — pnpm strict라 전이 의존성은 import할 수 없다): `react-markdown` · `remark-gfm` · `remark-parse` · `unified` · `unist-util-visit` · `@types/mdast`. **① 시점에 파싱 몫을, ④ 시점에 `react-markdown`을** 넣는다. `minimumReleaseAge` 확인 · `onlyBuiltDependencies`에 안 넣는다. **`rehype-raw`·`rehype-slug`는 넣지 않는다.** `urlTransform`을 덮지 않는다(기본값이 `javascript:`를 걷는다 — 리포가 public이라 md 기여 PR이 신뢰 경계다).
- **기본 요소 매핑**(값은 시안이 정하고, 아래는 규칙만):
  - 표 → `DocTable`(hast → `{ head, rows }`, `label` = `tableLabel`). region과 `<table>` 양쪽 이름(POSTMORTEM 2026-09-19).
  - 링크 → 본문 링크는 내부든 외부든 `text-blue-600` · 밑줄 없음 · 포커스 링 셋(§6.616 · `privacy-doc.tsx:55`). 외부는 `target="_blank" rel="noreferrer"`. ⚠️ 지금 `public-doc.tsx:79`의 `[&_a]:`는 링이 없다 — 그대로 옮기면 회귀다.
  - `strong` → `font-medium`(500). 브라우저 기본 700은 `visual-system.test.ts`의 굵기 규칙 밖이다.
  - 코드 → 인라인·블록 `text-mono`. 가로 스크롤 블록은 표와 같은 이유로 `tabIndex={0}` + region 이름 + 링(`focus-ring.test.ts`).
  - 이미지 → `<img width height loading="lazy" alt>`(치수는 SHOOTING 표).
- **상호작용 규칙**:
  - 페이지 이동 = 스크롤러 포커스(§6.615 키보드 행 그대로) · 해시 착지 = 대상 h2(`tabIndex={-1}`) 포커스(privacy 선례 `toc.tsx:96-104`).
  - 목차는 **잎 `lib/public-doc/toc.ts`를 재사용**하고 컴포넌트는 제목·항목을 prop으로 받게 일반화한다 — 두 벌을 만들지 않는다.
  - 헤더 `current`에 `docs`를 더한다(지금 `home`만) · 사이드바 Docs 항목의 `exact: true`(`nav.ts:210`)를 하위 페이지까지 보게 판정한다.
  - **복귀 링크는 걷는다** — 공개 셸 헤더의 `publicCta`가 나가는 길을 든다(`/privacy` 선례). `m.publicDocs.back`은 고아가 되면 지운다.
  - 옛 해시: `/docs`(개요)의 작은 클라이언트 잎이 `location.hash`를 `legacyAnchorTarget`에 넣고 값이 있으면 `router.replace`한다.
- **새 색 0 · `dark:` 0** — 등재된 `blue-600`과 토큰뿐이다. 합성 액자를 CSS로 그리게 되면 §6.2 등재 대상이다. `text-prose`를 쓰면 `app/globals.css:105` 주석과 DESIGN §4 소비자 목록을 갱신한다.
- **링크 생성기** `routes.docs(page?: string, anchor?: string)` — 식 본문의 템플릿 하나로 쓴다(`entry-points.test.ts:476`의 `routeShapes`가 화살표 뒤 첫 리터럴만 잡는다). 앱 소스(`app`·`components`·`lib`)의 모든 호출을 찾아 **인자가 리터럴이 아니면 red**, 대상 페이지·앵커가 없으면 red. ci-card의 `` `${routes.docs()}#workflow` `` 연결을 생성기로 옮긴다(경로 문자열은 타입이 못 본다 — POSTMORTEM 2026-09-05).
- **`entry-points.test.ts`**: `shape()`(`:351-353`)가 `[[...slug]]`를 `/docs/*]`로 만든다 — optional catch-all 처리와 회귀 단언이 필요하다. `EXEMPT`(`:53`)의 `docs/page.tsx`를 `docs/[[...slug]]/page.tsx`로 **같은 커밋에서** 교체한다(`:207-211`이 실재를 강제한다). `PUBLIC`(`:793`)에 `/docs/setup/workflow` 샘플을 더한다.

### 시안에 넘길 목록 (Claude Design 브리프의 재료)

- 공개 셸 안 배치: 좌측 문서 내비(SUMMARY 2단) · 본문 칼럼 폭 · 우측 목차(H2만인가 H3까지인가) · 이전/다음.
- 개요 첫 화면의 독자 두 갈래(Set up / Translate).
- 페이지 이동 때 내비가 스크롤러 밖에 있어 재마운트를 피하는가(내비 스크롤 위치·Tab 위치 유지).
- 폰 폭 — 반응형을 줄 것인가(안 주면 `min-w-[1280px]` 수용).
- 본문 급: h1·h2·h3·본문(16?)·목록·인용·hr·코드 블록·표.
- 이미지: 액자(랜딩 목업 프레임 토큰과 맞출지) · 확대 보기 필요 여부 · 로드 실패 모양.
- 404가 공개 셸 안(내비와 함께)에 착지하는가.

## 6. 이미지 촬영 (③b — 4.0 뒤)

- **환경**: 로컬 `pnpm dev` + dev DB + 상주 QA 프로젝트 `bugshot-i18n-test-qa`. **편집자 장은 EDITOR 계정 화면으로 찍고 쓴다**(EDITOR는 열린 PR 조회·Revert가 안 보인다 — PRODUCT §3·:839). GitHub 화면은 github.com에서 찍는다.
- **규격**(SHOOTING §1): 조작 영역 중심의 **부분 크롭** · DPR 2 · **표시 폭 기준 최소 글자 11px**(칼럼 폭은 시안이 준다 — 720 칼럼에 1280 전체 화면이면 앱 14px이 약 7.9px가 된다) · 액자는 시안 또는 랜딩 목업 프레임 토큰.
- **실행체**: ego-browser. ⚠️ GitHub App 설치 왕복은 로컬에서 못 밟는다 — 그 컷은 SHOOTING §벽에 적고 수동 촬영한다.
- **마스킹**: DOM 텍스트 치환. 가상 데이터는 랜딩 목업과 같은 이름(`m.landing.mockup` — `Acme web`·`acme/web`).
- **기록**: 촬영한 컷마다 매핑 소스의 `git hash-object`를 SHOOTING 표에 적는다 — `guide:check`의 기준값이다.
- 결과는 스크래치패드에 모아 눈으로 확인한 뒤 반영한다. 촬영 전 `pnpm dev`를 다시 띄운다(build-while-dev 함정).

## 7. 하네스

| 층 | 무엇 | 차단? |
|---|---|---|
| `pnpm test` (`lib/guide/__tests__/`) | 함수 단위는 **픽스처 디렉터리**로(각 커밋이 단독 green), 실물 `guide/`에 거는 단언은 원고와 같은 커밋에서: SUMMARY↔트리 · H1 하나 · H2 `{#id}` 필수·중복 0 · 플레이스홀더 0 · 링크·앵커 해소 · 이미지 해소·고아 0·alt·치수 · 표 이름 중복 0 · 매핑 표 전수·경로 존재 · 라벨 ⊂ 사전 ∪ 허용 목록 · 정본 상수 대조(`docs-content.test.tsx` 이관, action 넷 추출은 공유 헬퍼로) · 마스킹 원본 0 · 옛 해시 매핑 · `routes.docs(...)` 호출 대상 | **차단** |
| `no-korean-ui` · `brand-spelling` · `terminology` | `guide`의 **SUMMARY에 오른 md만** 훑는다(AUTHORING·SHOOTING은 한국어라 제외 — 서빙되지 않는다). ⚠️ **md에서는 `stripComments`를 건너뛴다** — 그 정규식(`no-korean-ui.test.ts:79-81`, `brand-spelling.test.ts:35-37`)이 `packages/*/locales/*.json` 같은 글롭의 `/*`와 URL의 `//`를 주석으로 먹어 거짓 음성을 낸다 | 차단 |
| `pnpm guide:check` | 기록 SHA vs `git hash-object`(작업 트리 기준 — 미커밋 수정도 stale로 본다) → 목록. 히스토리 불필요. `pnpm scan`처럼 결과가 어떻든 exit 0 | 아님 |
| `/push` 4단계 · `/implement` 보고 | 매핑·사실 대조 소스가 diff에 걸리면 경고 / "가이드 영향" 플래그 | 아님 |
| `/guide` · `/guide-shots` | 작성 / 촬영. **stale 판정을 복제하지 않고 `pnpm guide:check` 출력을 인용한다** | — |

- stale 판정을 `pnpm test`에 넣지 않는다 — "화면이 바뀌었으니 다시 찍어라"는 red로 막을 일이 아니다(찍을 수 있는 런타임이 로컬뿐이다).
- 커밋 prefix: `docs(guide): …`.

## 스키마 변경 · 새 환경변수

없음 · 없음.

## 불변식 영향 (ARCHITECTURE §0)

**없음** — export 결정성·blob SHA·병합 없음 축에 닿지 않는다. 경계:

- **인증 경계**: `/docs/*`는 공개다. matcher(`middleware.ts:58`) 밖이고, `EXEMPT` 교체 + `PUBLIC` 샘플이 고정한다.
- **보안**: HTML 원문 렌더 없음(`rehype-raw` 없음) · `urlTransform` 기본값 유지 · 외부 링크 `rel="noreferrer"`.
- **개인정보 방침·CSP**: 새 외부 호스트·쿠키 없음. 이미지는 같은 origin이라 `img-src 'self'`(`lib/security-headers.ts:51`)로 충분하다 — `security-headers.test.ts`로 확인한다.

## 정본 갱신 (태스크로)

- PRODUCT — §7.7 IA의 `/docs` 행 · :177(`/docs#nightly` → `sync/nightly`) · :574(`docs-content.test.tsx` 언급) · :576("`/docs`는 셸 밖 1열").
- DESIGN — §6.61을 시안 기준으로 다시 쓴다. **§6.61:766의 "마크다운 파일로 빼지 않는다"를 뒤집는 기록**(날짜 · 근거였던 스캔 게이트는 `ROOTS` 확장이, 클라이언트 번들 대가는 서버 렌더가 해소한다) · §4 `text-prose` 소비자.
- DIRECTORY — `guide/` · `public/guide/` · `lib/guide/`.
- CLAUDE.md — 스택 표(의존성 여섯) · 명령 표(`guide:check`) · 스킬 19→21 · 미러 제외 6→7 · 권장 흐름 · 문서 지도(`guide/AUTHORING.md`·`SHOOTING.md`). README 미러.

# docs-guide — 태스크

사용자가 정한 다섯 단계 순서를 따르되 두 가지를 옮겼다.
- **⑤의 자동 게이트(순수 함수 + `pnpm test`)를 ①·②로 당긴다** — 게이트 없이 원고가 쌓이지 않게.
- **③의 촬영(3.3·3.4)을 4.0(시안 확정) 뒤로 민다** — 칼럼 폭이 치수와 글자 크기를 정한다. ✅ 2026-09-26 시안 확정(`Docs.dc.html` 1a–1d)으로 ③b·④ 모두 착수 가능하다.

**커밋 규칙**: 함수 단위 테스트는 픽스처(`lib/guide/__tests__/fixtures/`)로 단독 green이다. 실물 `guide/`에 거는 게이트는 **그것을 green으로 만드는 원고와 같은 커밋**에 넣는다. 그래서 모든 `[C]`가 단독 green이다.

**본문 두 벌 기간**: ①–④ 동안 서비스되는 것은 사전 본문이다. **2.4 이후 사전 본문은 동결**한다 — 정본은 md다. 급한 사실 오류만 양쪽에 같이 고친다(AUTHORING에 적는다).

`[C]` = 커밋 경계 · `(수동)` = 사람이 보는 확인.

---

## ① 구성 (IA)

- [ ] **1.0** 파싱 의존성 설치 — `unified` · `remark-parse` · `remark-gfm` · `unist-util-visit` · `@types/mdast`(버전 명시 · `minimumReleaseAge` 확인 · lockfile 확인).
  검증: `pnpm install` 뒤 lockfile에 명시 버전 · `pnpm typecheck` green.
- [ ] **1.1** `parseMd`·`parseSummary`·`pathToSlug`·`slugToFile`·`flattenNav`·`parseHeadingAnchor` 테스트 먼저(`/tdd interface`, 픽스처) → 구현.
  검증: `pnpm test` green. 케이스 — 들여쓰기 계층 · `README.md` → 상위 slug · **`x.md`와 `x/README.md` 충돌 → 오류** · SUMMARY 중복 경로·중복 slug → 오류 · 빈 SUMMARY → 빈 트리 · `guide/` 밖 경로(`../`, 절대경로) → 오류 · AUTHORING/SHOOTING 등재 → 오류 · `slugToFile(["AUTHORING"])` → null · 공백·비ASCII 파일명 → 오류 · `__proto__` slug · `{#id}` 파싱 · id 문자 집합 밖 → 오류 · **코드 펜스 안 `{#id}`는 헤딩이 아니다**.
- [ ] **1.2** IA 확정 — design §3 초안을 코드·PRODUCT와 대조해 `guide/SUMMARY.md` + 페이지별 뼈대(H1 + H2 `{#id}`)를 만든다. **같은 커밋에** 실물 구조 게이트 `lib/guide/__tests__/structure.test.ts`(SUMMARY↔트리 · H1 하나 · 모든 H2 `{#id}` · 페이지 안 id 중복 0)와 `legacyAnchorTarget`(옛 id 일곱 → 새 경로, 표 전체를 테스트로 고정)을 넣는다.
  검증: `pnpm test` green · 매핑 표에 일곱 id 전부.
- [ ] **1.3** `guide/AUTHORING.md` 초판(한국어) — 운영 방식 · IA 표(페이지 → 독자) · **표기 규약**(굵게 = UI 라벨, 기울임 = 강조, 정확 일치, 보간·함수형 라벨은 굵게 안 씀) · **외부 라벨 허용 목록 표**(빈 표로 시작) · 앵커 규칙 · 표 이름 규칙(가장 가까운 상위 헤딩, 한 페이지 중복 0) · 톤(en) · **화면 문구 규칙**(코드명 대신 화면 문구 — `Sources`) · **EDITOR 규칙**(편집자 장은 EDITOR가 보는 화면만) · **`Needs review`는 플래그로만** · 사실 대조 소스 표 · 본문 두 벌 기간의 동결 규칙 · 검증 = `pnpm test`.
  검증: (수동) 사용자 확인.
- [ ] **[C]** `chore(deps): add markdown parsing packages` · `feat(guide): add summary and anchor parsers` · `docs(guide): draft information architecture`(1.2 게이트 포함)

## ② 본문

- [ ] **2.1** `collectLinks`·`resolveDocLink`·`collectUiLabels`·`dictionaryStrings`·`sectionByAnchor`·`parseMdTable`·`leadParagraph` 테스트 먼저(픽스처) → 구현. action 넷 추출(`renderProjectWorkflowYaml` + `action.yml`의 `uses:`)을 공유 헬퍼로 뺀다 — `docs-content.test.tsx:48-55`와 md 게이트가 같은 목록을 본다.
  검증: `pnpm test` green. 케이스 — 상대 `../setup/workflow.md#workflow` 해소 · 외부 URL 무시 · **코드 스팬·펜스 안 `**x**`는 라벨이 아니다** · `**[Settings](..)**`(링크 안 굵게) · `__x__` · 표 셀 안 굵게 · `dictionaryStrings`가 **`publicDocs` 서브트리·함수 값·JSX 값을 뺀다** · `sectionByAnchor`가 다음 같은 급 헤딩에서 멈춘다 · `leadParagraph`가 H1 뒤 첫 문단만(이미지·인용·코드가 먼저 오면 null).
- [ ] **2.2** `no-korean-ui`·`brand-spelling`·`terminology`를 서빙 md로 확장 — `sourceFiles`에 `.md` 분기 · **md에서는 `stripComments`를 건너뛴다** · SUMMARY 밖 md(AUTHORING·SHOOTING) 제외.
  검증: `pnpm test` green. 픽스처 — md 속 `packages/*/locales/*.json` 뒤의 한글이 잡힌다(벗기기를 건너뛰었다는 증거) · `https://…` 뒤의 `MALMOI`가 잡힌다 · 한국어 AUTHORING 픽스처는 무시된다.
- [ ] **2.3** 본문 작성 — 사전의 문장을 이관처로 옮기고(이후 사전 동결), 편집자 장·새 장을 AUTHORING 사실 대조 표대로 쓴다. 개요에 독자 두 갈래 링크. 이미지는 아직 넣지 않는다. **같은 커밋에** 실물 내용 게이트 — 링크·앵커 해소 · 플레이스홀더 0(`TODO`·`TBD`·`lorem`) · 라벨 ⊂ 사전 ∪ 허용 목록 · 표 이름 중복 0 · **모든 페이지에 도입 문단** · **이미지 참조 0**(③ 게이트가 서기 전까지) · 정본 상수 대조(`PROJECT_LIMIT`·`MEMBER_LIMIT`·`PROJECT_SLUG_MAX`·`INVITATION_HOURLY_LIMIT`·action 넷·포맷 다섯·`SKIP_MARKER`·`PUSH_TOKEN`·워크플로 경로 — `sectionByAnchor`로 절을 잘라 대조).
  검증: `pnpm test` green · (수동) 사용자 원고 검토.
- [ ] **[C]** `feat(guide): add link, label, and section collectors` · `test(i18n): scan served guide markdown` · `docs(guide): write user guide pages`(2.3 게이트 포함)

## ③a 이미지 게이트 (시안 전)

- [ ] **3.1** `collectImages` 테스트 먼저(픽스처) → 구현. 매핑·마스킹 표는 `parseMdTable` 재사용.
  검증: `pnpm test` green. 케이스 — `/guide/x.webp` 절대경로만 허용(상대경로 → 오류) · 같은 에셋 두 번 참조 허용 · alt 빈 값 → 오류.
- [ ] **3.2** 이미지 게이트 — 참조 해소(`public/guide/`) · 고아 0 · alt 필수 · 치수 = SHOOTING 표 기록(`sharp` 메타데이터) · 모든 에셋이 매핑 표에 있고 경로 존재 · 마스킹 원본 문자열이 md에 0. 2.3의 "이미지 참조 0" 단언을 이것으로 교체.
  검증: `pnpm test` green(실물은 에셋 0·참조 0) · 픽스처 — 참조만 있고 파일 없음 red · 파일만 있고 참조 없음 red · 치수 불일치 red.
- [ ] **[C]** `test(guide): gate image references and shot mapping`

## ④ 라우팅·렌더링 — 시안 확정됨(design §5 "시안 — 정본 확정")

- [x] **4.0a** 시안 수신·피드백 1회·정본 확정(2026-09-26 — `Docs.dc.html` 1a–1d, design §5 표).
- [ ] **4.0b** DESIGN §6.61을 시안 기준으로 다시 쓴다(`docs(DESIGN): …` — §6.61:766 반전 기록 · 새 색 0 · `text-prose` 소비자). 4.4와 같은 배치에서.
  검증: (수동) design §5 표의 행이 전부 DESIGN에 있다.
- [ ] **4.1** `extractToc`·`tableLabel` 테스트 먼저 → 구현. remark 플러그인(`{#id}` → `id` 속성, 텍스트에서 표식 제거) 테스트 → 구현.
  검증: `pnpm test` green.
- [ ] **4.2** `react-markdown` 설치(버전 명시 · `minimumReleaseAge` · lockfile) → CLAUDE.md 스택 표(의존성 여섯).
  검증: lockfile에 명시 버전 · `pnpm typecheck` green.
- [ ] **4.3** `routes.docs(page?, anchor?)` 테스트 먼저 → 구현(식 본문 템플릿 하나). 호출 스캔 테스트(`app`·`components`·`lib` — 비리터럴 인자 red · 대상 페이지·앵커 부재 red). ci-card 연결을 생성기로. **`docs-content.test.tsx:83-88`의 `a[href="/docs#workflow"]`를 `routes.docs("setup/workflow","workflow")`로 교체.** `routes.test.ts:120`·`:124-133` 갱신.
  검증: `pnpm test` green.
- [ ] **4.4** `app/docs/[[...slug]]/page.tsx`(동적, `notFound()`) + `app/docs/layout.tsx`(셸 + 내비) · 페이지(본문 스크롤러) · 개요 두 갈래(`lib/guide/overview.ts` 상수 — slug 전부 SUMMARY에 있음을 테스트) · 장 개요 하위 목록 · `app/docs/not-found.tsx`(요청 주소 클라이언트 잎) · 요소 매핑(design §5 표 — 코드 블록 Copy + visually-hidden live region 포함) + 옛 해시 클라이언트 잎 + 헤더 `current: "docs"` + 사이드바 `exact` 판정. 옛 `app/docs/page.tsx` 제거. `entry-points.test.ts` — `shape()` optional catch-all 처리 + 회귀 단언, `EXEMPT` 교체(같은 커밋), `PUBLIC`에 하위 경로 샘플. `security-headers.test.ts`로 `img-src 'self'` 확인.
  검증: `pnpm test` · `pnpm typecheck` · `pnpm build` green · **`pnpm dev`를 다시 띄운 뒤** (수동) `/docs`·`/docs/setup/workflow`·`/docs#formats`(→ 새 페이지)·없는 slug 404·`/docs/AUTHORING` 404 · 키보드로 페이지 이동·해시 착지 포커스.
- [ ] **4.5** 고아 정리 — `m.publicDocs.docs.sections`·`m.publicDocs.back`(고아면) 제거. **`DocBlock`·`DocSection` 타입을 먼저 옮기고**(`lib/privacy/doc-text.ts:6`이 `@/components/public-doc`에서 import한다) `components/public-doc.tsx`·`public-doc.test.tsx` 제거. `docs-content.test.tsx`의 사전 대상 단언 제거(md 게이트가 대신한다). **`terminology.test.ts:88,90`의 `publicDocs.docs.sections[…]` 경로 제거**(2.2가 md를 대신 본다). `m.publicDocs.docs.title`은 남긴다(`nav.ts:210` · `nav.test.ts:294-297`).
  검증: `pnpm test` green · `git grep "publicDocs.docs.sections"` 0 · `git grep "components/public-doc\""` 0.
- [ ] **4.6** `next.config.ts` `outputFileTracingIncludes`에 `guide/**/*.md`.
  검증: `pnpm build` 뒤 `.next/server/app/docs/[[...slug]]/page.js.nft.json`에 `guide/` md가 있다(명령으로 확인 — 자동 판정 가능) · `/push` 후 (수동) ego-browser 로그인 세션으로 `https://dev.mal-moi.com/docs/setup/workflow` 본문·이미지 확인(curl은 SSO 302라 판정 불가).
- [ ] **4.7** `/design-sync` — 시안 대조 루프.
  검증: 스킬의 일치 판정.
- [ ] **4.8** 정본 갱신 — PRODUCT §7.7 · :177 · :574 · :576 · DESIGN §4 `text-prose` 소비자(+ `app/globals.css:105` 주석) · DIRECTORY · README.
  검증: (수동) `/doc-check` 또는 `/push` 4단계.
- [ ] **[C]** `feat(guide): add toc and anchor plugin` · `feat(routes): route docs links through one generator` · `feat(docs): render the guide from markdown` · `refactor(docs): remove dictionary-backed docs` · `docs(PRODUCT|DESIGN|DIRECTORY): …`

## ③b 촬영 — 시안 확정됨

- [ ] **3.3** `guide/SHOOTING.md` 초판(한국어) — 상수(DPR 2 · 부분 크롭 원본 폭 ≤ 850 CSS px · 파일 폭 ≤ 1700px · 표시 폭 720 · 최소 글자 11px · **액자·배경을 파일에 굽지 않는다** — CSS가 그린다) · 환경(로컬 dev + `bugshot-i18n-test-qa` + OWNER/EDITOR) · **마스킹 표**(`Acme web`·`acme/web`) · **에셋 매핑 표**(에셋 · 소스 경로 · blob SHA · 치수) · 알려진 벽(App 설치 왕복) · **진행 상태**.
  검증: (수동) 사용자 확인.
- [ ] **3.4** 촬영 — ego-browser. `pnpm dev`를 다시 띄운 뒤. 스크래치패드에 모아 확인 → `public/guide/`에 반영 → md에 참조 → SHOOTING 표에 소스 blob SHA(`git hash-object`)·치수 기록.
  검증: `pnpm test` green(3.2 게이트) · (수동) 컷마다 마스킹·잘림·글자 크기 확인.
- [ ] **[C]** `docs(guide): add screenshots and shooting manual`

## ⑤ 최신화 하네스 (사람·스킬 쪽)

- [ ] **5.1** `staleShots(shots, currentBlobs)` 테스트 먼저 → 구현 → `scripts/guide-check.ts` + `pnpm guide:check`(읽기 전용, exit 0, 인자 오류만 2). 현재 SHA는 `git hash-object`(작업 트리 기준).
  검증: `pnpm test` green(케이스 — 일치 · 불일치 · 매핑 소스 삭제 · 에셋 기록 없음) · (수동) 매핑 소스 한 줄을 고친 뒤 실행하면 그 에셋이 뜬다.
- [ ] **5.2** `.claude/commands/guide.md` — en 단일 · AUTHORING 로드 필수 · 사실 대조는 AUTHORING 표 · stale은 `pnpm guide:check` 인용 · 검증 = `pnpm test` · 빌드·커밋 안 함. frontmatter `description:` 필수(`scripts/sync-agents.mjs:30-36`이 없으면 throw). `pnpm sync:agents`.
  검증: `pnpm sync:agents:check` green.
- [ ] **5.3** `.claude/commands/guide-shots.md` — 런타임 능력 판정(ego-browser 없으면 `check`만) · stale = `pnpm guide:check` · 촬영 = SHOOTING · 진행 상태 갱신. **`scripts/sync-agents.mjs:26`의 `EXCLUDE`에 추가.**
  검증: `pnpm sync:agents:check` green · 미러 디렉터리에 없음.
- [ ] **5.4** `/push` 4단계 경고 · `/implement` 보고의 "가이드 영향" 플래그.
  검증: (수동) 스킬 문서 diff 검토.
- [ ] **5.5** CLAUDE.md — 명령 표(`guide:check`) · 스킬 19→21 · 미러 제외 6→7 · 권장 흐름 · 문서 지도. README 미러 · `pnpm sync:agents`.
  검증: `pnpm sync:agents:check` green.
- [ ] **[C]** `feat(guide): add stale shot detection` · `chore(skills): add guide and guide-shots` · `docs(CLAUDE): …`

## 끝

- [ ] 결론을 정본으로 올리고 `docs/features/docs-guide/`를 지운다.
  검증: `git grep "docs/features/docs-guide"` 0.

## 결정 기록 (/orchestrate 2026-09-26)

- **배치**: G1 core(1.0·1.1·2.1·2.2·3.1) → G2 content(1.2·1.3·2.3·3.2) ∥ G3 render(4.0b·4.1–4.8, 4.3 전 `WAITING FOR G2-IA`) ∥ G4 harness(5.1–5.5 + CLAUDE.md 스택 표) → G5 shots(3.3·3.4).
- **파일 소유**: CLAUDE.md·README = G4만 · DESIGN·PRODUCT·DIRECTORY = G3만(G4 몫 DIRECTORY 줄은 지휘자가 얹는다) · `messages/en.tsx` = G3만 · `guide/**` = G2 → G5 직렬.
- **G5는 main 체크아웃에서 로컬 커밋**(push 없음) — 그동안 지휘자는 cherry-pick·build를 멈춘다.
- **G2(본문)는 Codex 워커**(2026-09-26 사용자) — 미러 `.agents/skills/source-command-ship`을 따르고 커밋 단계에서 멈춘다. 나머지 배치는 Claude Code.
- **본문은 리뷰 → 보완 루프를 여러 바퀴 돈다**(2026-09-26 사용자). G2 Phase 2 인계마다 본문 리뷰(코드 사실 대조 · EDITOR 범위 · 비개발자 가독성 · 톤 · 게이트 규약)를 돌리고 🔴·🟡가 0이 될 때까지 같은 Codex 워커에 수정 라운드를 보낸다(최소 2바퀴).

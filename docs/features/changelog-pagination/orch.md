# Changelog pagination — 지휘 계획

작성: 2026-10-16 · 시작 dev `7ada80b9` · 원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md) (복제하지 않는다 — 항목 번호는 tasks의 절 번호다)

## 결정 기록

- spec·design의 제품 결정은 `/feature-review`(2026-10-16)에서 끝났다 — 버튼만 · `MAX_PAGES = 3` · `RevealItem` + context · 진입 해시만 · `landDocumentHeading` 재사용 · 끝 문장은 다 드러난 뒤 · 버튼 `ghost`·`md`·가운데·`pb-12`. 워커가 다시 묻지 않는다.
- 지휘자 판단 — **배치를 셋(A·B 병렬 → C)으로 나눈다**: 로더(`lib/changelog/parse·load`)와 클라이언트 잎(`reveal`·`release-list`)은 파일이 겹치지 않고, 페이지 배선은 둘 다를 소비하므로 둘이 dev에 들어간 뒤 C로 둔다.
- 지휘자 판단 — **C는 B 워커 터미널에 새 Dispatch로 준다**: 배선의 위험(서버 노드를 `RevealItem` children으로 넘김·`trailing`)이 B의 문맥이다. A 워커는 A 통합 뒤 정리한다.
- 지휘자 판단 — **`/design-sync` 행 없음**: `design-brief.md`·핸드오프가 없고 기존 화면(§6.617) 수정이다. 시각 확인은 §6 실물 QA(라이트·다크·375)가 든다.
- 지휘자 판단 — **PRODUCT 개정(tasks §0)은 A가 첫 커밋으로 낸다**(코드보다 먼저, 파일 겹침 없음). DESIGN·DIRECTORY(§5)는 C — 상수·variant가 확정된 뒤 쓴다.
- 지휘자 판단 — ko·es 사전 키는 C가 `/translate` 모드 ①로 같은 커밋에 넣는다. ko 검수는 사용자가 `/merge` 전에 한다.
- 모델 경계: Claude Code 지휘 → Sonnet 5.5·Opus 5.5만, effort ≤ high. 교차 허가 없음.

## 배치

| 배치 | tasks 항목 | 소유 파일 | 선행 | 모델·effort (이유) | 출시 차단 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|---|
| **A** 로더 | §0 · §1 `parseReleasePage`·`mergeReleasePages` · §2 전부 | `docs/PRODUCT.md` · `lib/changelog/parse.ts` · `lib/changelog/load.ts` · `lib/changelog/__tests__/{parse,load}.test.ts` | 없음 | Sonnet 5.5 high (명세가 의사코드까지 있는 순수 함수 + 얇은 껍데기) | 예 | `pnpm gate --base dev` · 독립 리뷰 | 대기 |
| **B** 클라이언트 잎 | §1 `reveal`·`client-graph` · §3 전부 | `lib/changelog/reveal.ts` · `lib/changelog/__tests__/reveal.test.ts` · `components/changelog/release-list.tsx` · `components/__tests__/release-list.test.tsx` · `components/__tests__/client-graph.test.ts` · `components/public-shell/scroller.tsx`(주석만) | 없음 | Opus 5.5 high (jsdom 포커스 함정·effect 순서·변형 red) | 예 | `pnpm gate --base dev` · 독립 리뷰 | 대기 |
| **C** 배선·문서 | §4 전부 · §5 전부 | `app/changelog/page.tsx` · `app/__tests__/changelog-page.test.tsx` · `components/changelog/release-entry.tsx`(주석) · `messages/{en,ko,es}.tsx` · `docs/DESIGN.md` · `docs/DIRECTORY.md` | A·B dev 통합 | Opus 5.5 high (B 터미널 재사용) | 예 | `pnpm gate --base dev` · 독립 리뷰 | 대기 |
| **G** 통합 게이트 | §6 첫 항목 | — (main 체크아웃) | C | 지휘자 | 예 | `pnpm gate` 끝줄 + dev CI | 대기 |
| **Q** 실물 QA | §6 둘째 항목 | — (main 체크아웃, 리포트·BugShot 전용) | G push | Opus 5.5 medium (측정 위주, 단일 워커) | 예 | 측정표 + 이슈 | 대기 |

**파일 겹침**: A↔B 0. C는 A(`truncated` 의미)·B(`ReleaseList`·`RevealItem` API)를 소비하고 둘의 파일은 고치지 않는다. `messages/*`는 C만 건드린다.

**tasks ↔ 배치 대조** (주인 없는 항목 0): §0→A · §1 parse/merge→A · §1 reveal·client-graph→B · §2→A · §3(테스트·구현·scroller 주석)→B · §4(사전·페이지)→C · §5(DESIGN·DIRECTORY·가이드 대조)→C · §6 gate→G · §6 실물→Q.

## 진행 기록

- 2026-10-16 Run `run_876f768af6af`. A 시작(Sonnet 5.5 high, 워크트리 `clp-a`, Dispatch `ctx_a9f4968014cb`) · B 시작(Opus 5.5 high, 워크트리 `clp-b`, Dispatch `ctx_7fcef484e678`). 브리프는 main `.scratch/orch-changelog-pagination/brief-{A,B}.md`.
- A 완료(3커밋, worker gate ok · 15406 tests). 독립 리뷰(Opus 5.5 medium) 🔴0 🟡0 ⚪5 — 통합 가능. 지휘자 판단 — ⚪는 받지 않는다(이름·IA 행 낱말·red 테스트 커밋 squash·커밋 경계·선택 케이스; red 커밋은 이 리포 TDD 흐름의 형이라 그대로 둔다).
- A 통합 `59cf55f1` push · dev CI green(run 38830478238). A 워크트리·터미널 정리.
- B 완료(3커밋, worker gate ok · 15406 tests · 변형 red 확인). 독립 리뷰(Opus 5.5 medium) 🔴0 🟡0 ⚪3 — 통합 가능. 지휘자 판단 — ⚪1(StrictMode에서 숨은 대상에 첫 착지가 헛돈다 — `next dev` QA를 흐린다)은 C 첫 항목으로 받는다(대상이 `[hidden]` 안이면 착지를 미룬다). ⚪3(`ReleaseList` 빠뜨림)은 C의 페이지 테스트 "11번째가 hidden" 단언이 덮는다. ⚪2는 받지 않는다.

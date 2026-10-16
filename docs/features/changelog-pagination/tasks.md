# Changelog pagination — 태스크

작성: 2026-10-16 · `/feature-review` 반영 2026-10-16. 순서는 정본 → 순수 함수 → 로더 → 클라이언트 잎 → 페이지·사전 → 실물 확인이다. 배치 하나(`/ship` 단위)이고, 커밋 경계는 각 절 끝에 적었다. 마이그레이션은 없다.

## 0. 정본 개정 — 코드보다 먼저

- [x] PRODUCT `/changelog` 비범위에서 페이지네이션을 빼고, IA `/changelog` 행과 비범위 줄에 **수집**(최대 3페이지·전체 3초·부분 실패)과 **표시**(10개 단위 버튼·끝 문장은 다 드러난 뒤) 두 판정과 근거 한 줄을 적는다(design §8). 검증(수동 대조): spec §3 표·목록과 문장이 일치한다. 커밋 `docs(PRODUCT): ...`.

## 1. 순수 함수 — 테스트 먼저

- [x] `parseReleasePage`: 형 오류는 `null`, 빈 배열은 `{ releases: [], full: false }`, 원 배열 100칸이면 `full: true`(거른 뒤 0건이어도), draft·prerelease·`published_at: null`·액션 태그 제외. 기존 `parse.test.ts`의 `parseReleases` 테스트(68-81행 `truncated` 100/99 판정 포함)를 옮긴다. 검증: `lib/changelog/__tests__/` green.
- [x] `mergeReleasePages`: 페이지 경계 중복 태그를 한 번만 남김, 같은 100건이 두 페이지에 반복돼도 한 벌, 합친 뒤 정렬(페이지 2의 항목이 페이지 1보다 최신이어도 앞에 선다), semver 숫자 비교 유지, 빈 입력은 `[]`. 검증: 같은 디렉터리 green.
- [x] `nextVisible`·`visibleToInclude`·`REVEAL_STEP`: total 경계(0·10·11·25), 이미 보이는 index는 줄이지 않음, 범위 밖 index는 그대로. 검증: `lib/changelog/__tests__/reveal.test.ts` green.
- [x] `client-graph.test.ts`: `CLIENT_LIB_FILES`에 `lib/changelog/reveal.ts` 한 줄(잎 근거 주석) + `lib/landing/stage.ts` 형의 잎 검사("`reveal.ts`는 아무것도 물지 않는다"). 검증: `components/__tests__/client-graph.test.ts` green, 검사 자체는 완화하지 않음.
- 커밋: `feat(changelog): split release parsing into page and merge` · `feat(changelog): add reveal step helpers`.

## 2. 로더 — 페이지 따라 읽기

- [x] `load.test.ts` 먼저. **의도한 red가 날 기존 단언**: 46-47행(`toHaveBeenCalledTimes(1)`·정확한 URL `?per_page=100`), 59·63행(`deploy=` URL). 이 셋은 새 URL 형(`page=N` 포함)으로 고친다. 새 단언:
  - ① 100칸이면 `page=2`를 부르고 100칸 미만에서 멈춤. 2페이지가 `[]`이면 실패가 아니라 `truncated: false`로 끝남(원 배열이 정확히 100건).
  - ② 모든 요청 URL에 `per_page=100`·`page=N`·`deploy=`가 있음.
  - ③ `AbortSignal.timeout`이 **1회** 호출되고 모든 요청의 `init.signal`이 그 반환값과 `toBe`(기존 77-83행 관용구의 확장).
  - ④ 2페이지 실패·타임아웃·형 오류 → 1페이지 목록 + `truncated: true`, warn 한 줄(페이지 번호·상태·남은 한도뿐).
  - ⑤ 1페이지 실패 → `{ ok: false }`.
  - ⑥ `MAX_PAGES`(3) 도달 + 마지막이 full → `truncated: true`, 요청 수 = 3. 같은 100건이 매 페이지 반복돼도 3회에서 멈추고 결과는 한 벌.
  - ⑦ Authorization 없음 유지.
  
  검증: red 확인 뒤 구현, green.
- [x] 로더 구현과 머리 주석 갱신(한도·캐시·전체 시간 상한·부분 실패). `RELEASES_PAGE_SIZE` 주석에서 "페이지네이션 없음"을 고친다. 검증: `pnpm test` green.
- 커밋: `feat(changelog): follow GitHub release pages up to a cap`.

## 3. 클라이언트 잎 `ReleaseList` · `RevealItem`

- [x] DOM 테스트 먼저(`components/__tests__/release-list.test.tsx` — 기존 `changelog-entry.test.tsx`와 같은 자리, jsdom). **브라우저 흉내 스텁**: `HTMLElement.prototype.focus`와 스크롤러의 `scrollTo`를 감싸 `closest("[hidden]")`인 대상에는 아무 일도 하지 않게 한다(jsdom은 숨은 요소에도 포커스를 준다 — design §4).
  - 25개 → 10개 보임 · 15개 `hidden` · 버튼 하나(`ghost`·`md`, 그릇 `flex justify-center pb-12`, 선 없음).
  - 버튼 클릭 → 20개 보임 · 포커스가 11번째 `h1`. 다시 클릭 → 25개 · 포커스가 21번째 `h1`(body가 아님) · 버튼 없음.
  - 정확히 10개 → 버튼 없음. 10개 미만도 같다.
  - `trailing`이 있으면: 숨은 항목이 남은 동안 그려지지 않고, 마지막 묶음이 드러나면 버튼 자리에 선다. 10개 이하면 처음부터 선다.
  - 초기 `location.hash = "#v<18번째>"` → 20개 보임 · 그 `h1`이 포커스 · `landDocumentHeading`의 스크롤 호출 시점에 대상이 숨어 있지 않음. `PublicScroller` 안에 넣어 같은 결과(design §4의 effect 순서).
  - **변형 red**: 착지 effect를 지운 변형에서 위 단언이 red인지 한 번 확인하고 리포트에 적는다(스텁이 실제로 재고 있다는 증거).
  - 이미 보이는 판의 초기 해시 → `visible` 변화 없음 · `ReleaseList`가 착지를 부르지 않음. 깨진 인코딩(`#%E0`)·없는 태그·거른 액션 태그 → 변화 없음.
- [x] `components/changelog/release-list.tsx` 구현. import는 `@/lib/changelog/reveal`·`@/lib/public-doc/landing`·`components/ui/button`뿐. 검증: 위 테스트 + `client-graph.test.ts` green(§1에서 더한 한 줄 외 목록 변경 없음).
- [x] `components/public-shell/scroller.tsx` 41행 주석에 `/changelog` 숨은 대상의 예외를 한 줄 더한다(동작 변경 없음). 검증(수동 대조): 주석이 design §4와 일치한다.
- 커밋: `feat(changelog): reveal releases ten at a time`.

## 4. 페이지·사전

- [x] `messages/en.tsx`에 `changelog.showOlder: "Show older releases"`. ko·es는 `/translate` 모드 ①로 같은 커밋에 넣는다. `truncated` 주석을 "페이지 상한·부분 실패"로 고친다. 검증: `dictionary-consistency.test.ts`·`banned-terms` green.
- [x] `app/changelog/page.tsx`: 항목을 `RevealItem`으로 감싸 `ReleaseList`에 넘기고 `Older` 문장을 `trailing`으로 넘긴다. 빈 목록 경로(`empty` + `truncated`)는 지금처럼 바깥이다. 73-76행 주석을 새 의미로 고치고, 머리 주석에 10개 단위 드러내기를 한 줄 더한다. `release-entry.tsx` 15·27행 주석(100건 문장·`parseReleases`)도 고친다. 검증: `app/__tests__/changelog-page.test.tsx` 갱신.
  - 기존 단언(같은 틀·Latest·순서·좁은 폭)은 그대로 green.
  - **예외 — 118행 `first:` 단언**: 감싼 뒤 `section.parentElement`가 래퍼가 되어 목록 그릇을 더는 보지 않는다. 목록 그릇(`mt-8`)과 래퍼 둘 다 `/first/`가 없는지 보도록 고친다.
  - "100건" 테스트 셋의 이름·의미를 `truncated` 새 의미로 바꾸고, 11번째 이후가 DOM에 있고 `hidden`인지 단언을 더한다.
- 커밋: `feat(changelog): wire paged release list into the page`.

## 5. 정본·문서

- [x] DESIGN §6.617 갱신(머리 문단 1195행·목록·실패/빈/100건 행·새 "더 보기" 행 — design §8). DIRECTORY 새 파일 두 줄과 `changelog/` 줄(1053행). 검증(수동 대조): 문서 문장이 코드의 상수(`REVEAL_STEP`·`MAX_PAGES`)·variant·size와 일치한다. 문서별 커밋 `docs(DESIGN): ...` · `docs(DIRECTORY): ...`.
- [x] 가이드 영향 없음 확인. 검증(수동 대조): en 원고의 changelog 언급 넷 — `guide/en/translate/edit.md:41`, `guide/en/account/preferences.md:54`, `guide/en/self-hosting/README.md:30`, `guide/en/self-hosting/troubleshooting.md:125` — 을 읽고 여전히 참인지 판정한다(`pnpm guide:check`는 스크린샷 SHA만 보므로 이 판정에 쓰지 않는다).

## 6. 실물 확인 — 로컬

- [x] `pnpm gate` green. ⚠️ `/changelog`는 `readSession`을 읽는 동적 페이지라 `next build`가 렌더하지 않는다 — 서버 노드를 `children`으로 넘기는 경계의 증거는 아래 로컬 실물 렌더다.
- [x] 로컬 `/changelog`(실 GitHub, 31개)를 ego-browser로 측정한다(`/runtime-test` 규칙). jsdom 통과를 실측으로 적지 않는다.
  - 첫 진입: 보이는 항목 10개, 숨은 항목 21개(`[data-reveal-index][hidden]` 수).
  - 버튼 클릭: 클릭마다 `document.activeElement.id`가 새 묶음 첫 태그(`v…`)이고 body가 아님. 31개째까지 펼친 뒤 버튼 없음.
  - Tab으로 버튼 도달 → Enter: 위와 같은 포커스 결과. 스크롤만으로는 항목이 드러나지 않음.
  - `/changelog#v1.0.1` 직접 진입: `document.activeElement.id === "v1.0.1"`, 그 `h1`의 `getBoundingClientRect().top`이 헤더 아래 48px 근처.
  - 이미 보이는 판(`#<최신 태그>`) 직접 진입: 지금과 같은 착지·포커스.
  - 라이트·다크, 375 폭.
  - HTML 크기(31건 기준)를 적어 둔다.
  
  리포트에 "100건 넘는 실데이터가 없어 페이지 따라 읽기의 증거는 §2 단위 테스트뿐"이라고 적는다.

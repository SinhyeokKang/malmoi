# Changelog pagination — 설계

작성: 2026-10-16 · `/feature-review` 반영 2026-10-16. 무엇을·왜는 [spec](./spec.md)이 정본이다.

## 0. 영향 받는 흐름

push·편집 UI·pull 어디에도 붙지 않는다. **공개 셸의 `/changelog` 한 화면과 그 로더**다. DB·스키마·인가·Server Action과 무관하다.

| 파일 | 변화 |
|---|---|
| `lib/changelog/parse.ts` | 한 페이지 파싱과 페이지 합치기로 나눈다(§1) |
| `lib/changelog/load.ts` | 페이지를 따라 읽는다. 전체 시간 상한 하나, 부분 실패 처리(§2) |
| `lib/changelog/reveal.ts` (신규) | 드러낼 개수 판정. import 0인 순수 잎(§3) |
| `components/changelog/release-list.tsx` (신규, `"use client"`) | `ReleaseList`·`RevealItem` — 숨김 해제·버튼·진입 해시(§4) |
| `app/changelog/page.tsx` | 항목을 `RevealItem`으로 감싸 `ReleaseList`에 넘기고, `Older` 문장을 `trailing`으로 넘긴다. 실패·빈 목록 문장 배치는 그대로다. 원 배열 100칸을 말하는 주석(73-76행)을 새 의미로 고친다 |
| `components/changelog/release-entry.tsx` | 주석만: `ENTRY_BLOCK` 주석의 "100건 문장"(15행), `parseReleases` 지명(27행) |
| `components/public-shell/scroller.tsx` | 주석만: "여기가 마지막 판정"(41행)에 `/changelog`의 숨은 대상은 `ReleaseList`가 렌더 뒤에 착지시킨다는 예외를 한 줄 더한다. 동작은 바꾸지 않는다 |
| `components/__tests__/client-graph.test.ts` | `CLIENT_LIB_FILES`에 `lib/changelog/reveal.ts` 한 줄 + 잎 검사 하나(§7) |
| `messages/{en,ko,es}.tsx` | `changelog.showOlder` 추가. `truncated` 주석을 새 의미로 고친다 |

## 1. 순수 함수 — 파싱·합치기 (`lib/changelog/parse.ts`)

지금의 `parseReleases(json) → { releases, truncated } | null`을 둘로 나눈다.

```ts
/** 한 페이지 — 형이 어긋나면 null. `full`은 **거르기 전** 길이가 per_page를 채웠는가(다음 페이지가 있을 수 있다). */
export function parseReleasePage(json: unknown): { releases: Release[]; full: boolean } | null;

/** 여러 페이지 → 화면 목록. 태그로 중복을 걷고(먼저 나온 것을 남긴다) 합친 뒤 한 번 정렬한다(`newestFirst`). */
export function mergeReleasePages(pages: Release[][]): Release[];
```

- **중복 제거는 값싼 안전망이다.** 페이지마다 URL이 달라 따로 1시간 캐시된다. GitHub 응답은 생성 순 내림차순이므로, 새 릴리스가 생긴 뒤 **뒤 페이지만 새것**이면 앞 페이지 끝 항목이 뒤 페이지 첫 칸에도 나온다(중복). 그대로 두면 같은 `key`와 같은 `id`(해시 착지 대상)가 둘이 된다. 반대로 **앞 페이지만 새것**이면 경계의 한 항목이 다음 재검증까지 빠진다(누락). 이것은 받아들인다. 실제로는 같은 요청에서 두 페이지가 함께 stale이 되어 함께 재검증되고, 배포마다 캐시 키가 바뀌므로(`deploy=`) 어긋나는 창이 짧다.
- 정렬은 합친 뒤 한 번 한다. GitHub 응답 순서(생성 순)와 화면 순서(`published_at` → semver 숫자)가 다르므로 페이지 안 정렬만으로는 페이지 경계에서 순서가 틀릴 수 있다.
- `parseReleases`는 지운다. 소비자는 로더 하나와 테스트뿐이다. 테스트는 새 함수로 옮긴다.

## 2. 로더 — 페이지 따라 읽기 (`lib/changelog/load.ts`)

```
deadline = AbortSignal.timeout(TIMEOUT_MS)   // 루프 밖에서 한 번
page = 1
while page <= MAX_PAGES:
  fetch ?per_page=100&page=N[&deploy=…]   (같은 headers · next.revalidate 3600 · signal: deadline)
  실패(던짐·!ok·json 실패·형 오류):
    page == 1 → { ok: false }               (지금과 같다)
    page > 1  → 읽은 데까지 + truncated: true, warn 한 줄
  pages.push(releases)
  full이 아니면 끝 → truncated: false
  page++
상한 도달(마지막이 full) → truncated: true
```

- **`MAX_PAGES = 3`**(원 배열 300건, 2026-10-16 사용자). 지금 속도(하루 약 1.9개)면 2027-03 무렵 닿는다. 페이지 상한이 곧 렌더 상한이다 — 이 페이지는 `readSession` 때문에 동적이라 요청마다 전 항목을 `react-markdown`으로 렌더하고 HTML과 RSC 페이로드에 두 벌 싣는다(지금 31건 본문 합계 약 41KB). 넘으면 끝 문장이 서고, 그때 실측으로 상한을 다시 정한다. 상한이 없으면 GitHub 응답이 이상할 때(같은 100건이 반복되는 등) 루프가 끝나지 않는다.
- **시간 상한은 요청마다가 아니라 전체에 하나다.** 지금 `AbortSignal.timeout(3000)`이 지키는 것은 "콜드 캐시 첫 진입의 상한"이다(로더 머리 주석). 페이지마다 3초를 주면 상한이 페이지 수에 비례해 는다. 둘째 페이지부터의 타임아웃은 부분 실패로 처리한다. Next는 stale 재검증에서 signal을 떼고 부르므로(`next/dist/server/lib/patch-fetch.js`) 공유 deadline은 포그라운드 콜드 미스에만 걸린다.
- **캐시**: 페이지마다 URL이 달라 각자 캐시된다. Next는 200 응답만 저장하므로 실패한 페이지는 다음 요청이 다시 부른다. 합친 결과는 캐시하지 않는다(요청마다 다시 합친다. 캐시에서 읽으면 비용이 없다).
- **비인증 한도(60회/시간, 공유 egress IP)**: 캐시가 비었을 때 드는 호출 수가 1에서 최대 3으로 는다. 지금은 원 배열이 100건 미만이라 1이다. 상한에 닿으면 콜드 진입과 매시간 재검증이 각각 3회다. 한도에 걸리면 첫 페이지는 지금처럼 실패 문장이고, 둘째 페이지부터는 부분 목록이 된다.
- 로그(`fail`)는 지금처럼 상태와 남은 한도만 싣고, 페이지 번호를 더한다. 본문·오류 메시지는 싣지 않는다.
- `LoadedReleases` 형은 그대로다(`{ ok: true; releases; truncated } | { ok: false }`). 페이지는 `truncated`의 의미만 바꾼다. 원래는 "한 요청 상한에 닿았다"였고, 이제 "읽지 못한 옛 판이 있을 수 있다(페이지 상한·부분 실패)"다.
- `RELEASES_PAGE_SIZE`(100)는 GitHub `per_page` 최댓값이라 그대로 둔다. 주석의 "페이지네이션 없음"을 고친다.

## 3. 순수 함수 — 드러낼 개수 (`lib/changelog/reveal.ts`)

```ts
export const REVEAL_STEP = 10;
/** 다음 묶음 — total을 넘지 않는다. */
export function nextVisible(visible: number, total: number): number;
/** index번째(0부터)를 포함하는 묶음 끝 — 이미 보이면 visible 그대로(줄이지 않는다). */
export function visibleToInclude(index: number, visible: number, total: number): number;
```

- import가 0인 잎이다. 그래도 클라이언트가 값으로 읽는 `lib/**` 파일이므로 `client-graph.test.ts`의 `CLIENT_LIB_FILES`(정확 일치)에 한 줄을 더하고 잎 검사를 붙인다(§7).
- 초기값은 `Math.min(REVEAL_STEP, total)`이다. 서버 렌더와 첫 클라이언트 렌더가 같아야 하므로 **초기값에 해시를 쓰지 않는다**(서버는 해시를 모른다. 쓰면 hydration 불일치다).

## 4. 클라이언트 잎 — `ReleaseList` · `RevealItem`

```tsx
<ReleaseList total={releases.length} showOlder={m.changelog.showOlder}
             trailing={loaded.truncated ? <Sentence>{m.changelog.truncated(link)}</Sentence> : null}>
  {releases.map((r, i) => (
    <RevealItem key={r.tag} index={i}>
      <ReleaseEntry … />   {/* 서버 컴포넌트 */}
    </RevealItem>
  ))}
</ReleaseList>
```

- **본문 렌더는 서버에 남는다.** `ReleaseEntry`(`react-markdown`)는 서버 컴포넌트이고, `RevealItem`은 그 결과를 `children`으로 받아 감싸기만 한다. `react-markdown`이 클라이언트 번들에 오지 않는다.
- **순서의 출처는 하나다.** `ReleaseList`가 context로 `visible`을 내리고, `RevealItem`이 `<div data-reveal-index={index} hidden={index >= visible}>`를 그린다. `tags` prop이나 `Children` 조작이 없다. `section`(`aria-labelledby`)은 그 안에 그대로 있다. 감싸는 `div`에는 이름이 없으니 랜드마크가 아니다(POSTMORTEM 2026-09-15 "이름 없는 section" 계열과 충돌하지 않는다). `ENTRY_BLOCK`은 항목마다 자기 `border-t py-12`를 들고 목록에 형제 선택자가 없으므로, `display:none` 래퍼가 선·여백을 깨지 않는다.
- **버튼**: `visible < total`일 때만 목록 끝에 선다. `components/ui/button`의 **`ghost` · `md`**, 그릇은 **`flex justify-center pb-12`이고 선이 없다**(2026-10-16 사용자 — `ENTRY_BLOCK`을 주면 항목처럼 읽힌다). 새 프리미티브는 없다. 누르면 `nextVisible` 뒤 **새로 드러난 첫 항목의 버전 `h1`로 포커스**한다. 대상은 `[data-reveal-index="<옛 visible>"]` 안의 `id` + `tabIndex={-1}` 요소이고, 렌더 뒤 effect에서 옮긴다. 마지막 묶음이면 버튼이 사라지므로 이 이동이 포커스가 body로 빠지는 것을 막는다.
- **끝 문장(`trailing`)**: `visible >= total`일 때만 버튼 자리에 그린다. 숨은 판이 남은 동안 "옛 판은 GitHub에 있다"가 버튼과 엇갈리는 말을 하지 않게 하기 위해서다. 문장 노드(링크 포함)는 서버가 만들어 넘기므로 `release-list.tsx` 소스에 링크가 없다 — `action-rules.test.tsx`의 `BLUE_UNRENDERED` 목록은 바뀌지 않는다. 빈 목록(거른 뒤 0건) 경로는 `ReleaseList` 없이 지금처럼 `empty` + `truncated` 문장을 바깥에 그린다.
- **진입 해시**: 마운트 때 한 번 `location.hash`를 태그로 읽는다(`decodeURIComponent` 실패는 무시한다. `PublicScroller`의 `hashTarget`과 같은 규칙). `document.getElementById(tag)?.closest("[data-reveal-index]")`로 index를 찾아, 보이지 않는 묶음에 있으면 `visibleToInclude`로 펼치고 렌더 뒤 **`landDocumentHeading(tag)`**(`lib/public-doc/landing.ts` — 이미 `CLIENT_LIB_FILES`에 있다)로 착지·포커스한다. 그 함수가 헤더 48 보정·`prefers-reduced-motion`·`preventScroll` 포커스를 든다. 이미 보이는 판이면 아무것도 하지 않는다(`PublicScroller`가 지금처럼 처리한다). `hashchange`는 듣지 않는다 — 페이지 안에 `#v…` 링크가 없고 `PublicScroller`도 듣지 않는다(spec §5).
  - ⚠️ **`PublicScroller`와의 순서**: 자식 effect가 먼저 돌고 `PublicScroller`가 마지막에 포커스를 정한다(`scroller.tsx:41`). 그 시점에 대상이 아직 `hidden`이라 브라우저에서는 `focus()`가 아무 일도 안 하고 포커스가 body에 남는다. 그 뒤 리렌더에서 대상이 드러나고 `ReleaseList`의 착지 effect가 포커스를 준다. 그래서 `PublicScroller`의 동작은 고치지 않고 주석만 고친다.
  - ⚠️ **jsdom은 이 순서를 재지 못한다.** jsdom은 `hidden` 안 요소에도 `tabindex`만 보고 포커스를 준다. 그래서 `ReleaseList`의 착지 코드를 지워도 `PublicScroller`가 숨은 `h1`에 포커스를 줘 green이 된다(POSTMORTEM 2026-09-20·09-24와 같은 부류). DOM 테스트는 `closest("[hidden]")`인 요소의 `focus`·`scrollTo`를 no-op으로 감싸 브라우저를 흉내 내고, 착지 코드를 지운 변형에서 red가 나는지 확인한다. 실제 증거는 tasks §6의 실물 측정이다.
  - 브라우저의 기본 해시 스크롤은 `hidden` 요소로 가지 않는다. 그래서 스크롤도 이쪽이 직접 한다.
- 이 파일은 `@/lib/changelog/reveal`, `@/lib/public-doc/landing`, `components/ui/button`만 import한다.

## 5. 쓰지 않은 대안

| 대안 | 안 쓴 이유 |
|---|---|
| 서버 `?page=` 페이징 | 버전 해시가 서버에 오지 않아 옛 판의 주소가 첫 페이지에서 깨진다 |
| 공개 Server Action·Route Handler로 다음 묶음 받기 | JSX를 돌려주거나 `react-markdown`을 클라이언트에 실어야 한다. 데이터는 이미 한 번에 서버 캐시에 있으므로 얻는 것이 없다 |
| 스크롤 감지(`IntersectionObserver`)로 자동 드러내기 | 계속 내리는 사람에게 스크롤 길이를 줄이지 못한다. 관찰자는 교차 상태가 바뀔 때만 알려 묶음마다 다시 관찰해야 하고, 버튼에 포커스가 있을 때 항목을 버튼 위에 끼워 넣는다(2026-10-16 사용자 — 버튼만 남긴다) |
| `hidden="until-found"` | 찾기(⌘F)와 해시 착지를 브라우저가 대신해 주지만, Safari 지원과 React 19의 문자열 `hidden` 처리를 확인해야 하고 폴백이 필요하다(2026-10-16 사용자) |
| `children` + `tags`로 받아 `Children.toArray`로 감싸기 | 순서의 출처가 둘로 갈리고, RSC로 넘어온 노드를 클라이언트에서 조작하게 된다. `RevealItem` + context가 둘 다 없앤다 |
| 착지에 `scrollIntoView` + `scroll-mt-12` | 같은 문서 안 착지 프리미티브(`landDocumentHeading`)가 이미 있고 reduced-motion을 반영한다. 둘째 형을 만들지 않는다 |
| GitHub `Link` 헤더의 `rel="last"`로 남은 페이지를 병렬로 받기 | 지금 1페이지이고 상한도 3페이지다. 순차가 더 단순하고 전체 시간 상한이 대기를 묶는다 |

## 6. 스키마·환경변수·셀프 호스팅

- 스키마 변경 없음. 새 환경변수 없음. 새 패키지 없음.
- self-hosted도 같은 상류 GitHub Releases를 같은 방식으로 읽는다(`guide/en/self-hosting/troubleshooting.md` 125행의 "요청에 사용자 데이터가 없다"는 그대로 참이다). SELF-HOSTING §3 체크리스트에 걸리는 항목이 없다.
- `/privacy`: 새 전송처·쿠키·목적이 없다. 같은 호스트(`api.github.com`)로 가는 요청 수만 는다.

## 7. 불변식 영향

없다. export 결정성·blob SHA·인증 경계·`projectId` 좁히기와 무관하다. 지키는 기존 계약은 다섯이다.

- **토큰 없이 부른다**(GitHub 자격증명 셋 중 어느 것도 쓰지 않는다 — 로더 머리 주석). 페이지가 늘어도 같다.
- **던지지 않는다**. 공개 페이지가 GitHub 장애로 에러 경계에 가지 않는다.
- **본문은 사전을 지나지 않는다**. 렌더러가 방어선인 구조(DESIGN §6.617)는 그대로다.
- **날짜는 UTC 고정**(`FIXED_UTC`). `ReleaseEntry`를 바꾸지 않고 새 파일에 날짜 표기가 없다.
- **클라이언트 그래프**: `CLIENT_LIB_FILES`는 정확 일치 목록이라 새 잎 `lib/changelog/reveal.ts`를 한 줄 더한다(POSTMORTEM "새 잎은 client-graph의 정확한 목록에만 추가한다" — 검사 자체는 완화하지 않는다). `lib/landing/stage.ts` 잎 검사와 같은 형으로 "`reveal.ts`는 아무것도 물지 않는다"를 더한다. `lib/public-doc/landing.ts`와 `components/ui/button`의 의존(`lib/keyboard`·`lib/utils`)은 이미 목록에 있다.

## 8. 정본에 올릴 것 (구현 때)

- PRODUCT `/changelog` 비범위 줄(875행 부근)과 IA의 `/changelog` 행(835행): 페이지네이션을 범위로 옮기며 **수집**(최대 3페이지·전체 3초·부분 실패는 읽은 데까지)과 **표시**(10개 단위 버튼·끝 문장은 다 드러난 뒤) 두 판정으로 적는다. 다시 들이는 근거(2026-11월 말 100건 도달)를 한 줄 남긴다. "100건 초과분은 GitHub 링크 한 문장"은 "페이지 상한·부분 실패의 끝 문장"으로 바꾼다.
- DESIGN §6.617: 머리 문단의 "100건 안내"(1195행), "목록" 행에 10개 단위 드러내기, "실패·빈 목록·100건" 행의 의미 변경, 새 "더 보기" 행(버튼 `ghost`·`md`·가운데·`pb-12`·선 없음 · 포커스 · 진입 해시 · 끝 문장 자리).
- DIRECTORY: `components/changelog/release-list.tsx`·`lib/changelog/reveal.ts` 두 줄, `changelog/` 줄(1053행)의 `parseReleases`와 로더 설명(페이지 따라 읽기).
- POSTMORTEM: 해당 없음(회귀 아님).

## 9. POSTMORTEM에서 소환한 함정

- 2026-09-15 "시안 없이 만든 화면이 네 곳에서 어긋났고…"의 둘째 항목(이름 없는 `<section>`이 `role="generic"`) — 감싸는 요소는 `div`이고, `section`은 기존 `aria-labelledby`를 그대로 든다(§4).
- 2026-09-07 "클라이언트 번들에 7.2MB가 들어갔고…" — 본문 렌더를 서버에 남기고, 새 잎의 import를 셋으로 묶는다(§4). `client-graph.test.ts`가 상시 검사다.
- 2026-09-20 "포커스 복귀가 브라우저에서만 깨졌고…"(#64)·2026-09-24 "초대 모달의 포커스·입력 규칙이 jsdom에서만 참이었다" — jsdom이 숨은 요소에도 포커스를 준다. 브라우저 흉내 스텁 + 변형 red + 실물 측정(§4, tasks §3·§6).
- 2026-09-24 "포커스가 `body`로 빠지는 자리가 열한 곳이었고…" — 마지막 묶음에서 버튼이 사라질 때 포커스를 새 `h1`로 옮긴다(§4).
- 2026-10-13 "비-"use client" 프리미티브에 넣은 이벤트 핸들러가 서버 페이지를 떨어뜨렸다" — `/changelog`는 동적 페이지라 `next build`가 렌더하지 않는다. 서버→클라이언트 경계의 증거는 로컬 실물 렌더다(tasks §6).

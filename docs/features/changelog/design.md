# changelog — design

## 영향 받는 흐름

push · 편집 UI · pull 어느 파이프라인에도 붙지 않는다. **공개 셸에 읽기 전용 페이지가 하나 늘고**, 앱 셸의 링크 두 곳이 그 페이지를 가리키도록 바뀌며, **앱의 절대 날짜·시각 표기가 한 포맷터로 모인다.** DB · Server Action · Route Handler는 없다.

## 구성

```
app/changelog/page.tsx        서버 컴포넌트 — readSession(헤더 CTA) + loadReleases() + PublicShell
lib/utc-time.ts               (순수, 잎) utcDay 추가 · utcMinute 형 변경
lib/links.ts                  GITHUB_REPO 상수 + 파생 URL + releaseTagUrl
lib/changelog/
  parse.ts        (순수) API JSON → { releases, truncated } | null — 검증 · 거르기 · 정렬
  markdown.ts     (순수) 본문 mdast 변환 — 제목 깊이 · Full changelog 줄 제거 · 이미지 → 링크
  load.ts         (껍데기, import "server-only") fetch + revalidate + 타임아웃 → { ok: true, … } | { ok: false }
components/changelog/
  release-markdown.tsx   react-markdown 렌더러 (rehype-raw 없음)
  release-entry.tsx      항목 하나 (시안)
```

순수 모듈(`utc-time` · `parse` · `markdown`)에는 `server-only`를 붙이지 않는다 — 테스트가 직접 import한다. 환경변수를 읽지 않는다.

### 데이터 소스

- `GET https://api.github.com/repos/SinhyeokKang/malmoi/releases?per_page=100`, **토큰 없이** 부른다. 리포가 공개라 자격증명이 필요 없다(`lib/links.ts`의 "리포가 public이어야 이 링크가 산다"와 같은 전제다). 헤더는 `Accept: application/vnd.github+json`, `X-GitHub-Api-Version`, `User-Agent` — **`Authorization`은 없다**(T4가 단언).
- **리포 좌표**: `lib/links.ts`에 `GITHUB_REPO = "SinhyeokKang/malmoi"`를 두고 `GITHUB_REPO_URL` · `GITHUB_RELEASES_URL` · `GITHUB_RELEASES_API_URL` · `releaseTagUrl(tag)`(`${GITHUB_REPO_URL}/releases/tag/<tag>` — `View on GitHub` 행선지, compare가 없는 1.0.0에도 선다)를 전부 거기서 파생한다. URL 문자열 치환으로 API 주소를 만들지 않는다.
- ⚠️ **GitHub 자격증명 셋 중 어느 것도 쓰지 않는다** — installation 토큰을 끌어오면 공개 페이지가 App 설치 상태에 묶인다. `octokit`도 쓰지 않고 `fetch`로 부른다(Resend `lib/invitation-email/send.ts`와 같은 판단). ⚠️ `credential-separation.test.ts`는 `fetch`·`api.github.com`을 보지 않고 `lib/changelog`를 스캔 범위에 두지 않는다 — 이 경로를 지키는 것은 T4의 "`Authorization` 없음" 단언이다.
- **캐시**: `fetch(url, { next: { revalidate: 3600 } })`. `readSession` 때문에 페이지는 동적이지만, 명시적 `revalidate > 0`이면 데이터 캐시가 요청과 무관하게 공유된다(Next 16.3.3 `patch-fetch.js`의 `autoNoCache` 분기는 `revalidate`가 비었을 때만 돈다 — `next.config.ts`에 `cacheComponents` 없음).
- **무엇이 캐시되나**: 저장 조건은 `res.status === 200`이다(`patch-fetch.js:696`). 그래서 403·5xx·타임아웃은 우리 코드가 판정하기 전에 이미 캐시 밖이고 다음 요청이 다시 부른다. ⚠️ **200인데 스키마가 어긋난 응답은 1시간 캐시된다** — 그동안 실패 안내가 고정된다. 받아들인다(spec 조건 6). stale 뒤의 백그라운드 재검증은 caller `signal`을 떼고 돌고, 실패해도 기존 200 항목이 남는다.
- **타임아웃**: `AbortSignal.timeout(3000)`. GitHub가 느리면 페이지가 같이 느려지므로 실패로 떨어뜨린다. 콜드 캐시 첫 진입은 최대 3초 멈춘다 — `/privacy`처럼 `loading.tsx`를 두지 않고 T6에서 실측만 한다.
- `load.ts`는 **던지지 않는다.** 실패는 `console.warn` 한 줄(`status`와 `x-ratelimit-remaining`만, 본문 없음) + `{ ok: false }`다. 공개 페이지가 GitHub 장애로 에러 경계에 가지 않는다. 비인증 한도는 Vercel 공유 egress IP라 남의 호출과 나눈다 — 걸린 동안은 매 방문이 빠른 403 → 안내 문장이다.

## 순수 함수 — `/tdd` 대상

| 함수 | 계약 |
|---|---|
| `parseReleases(json: unknown): { releases: Release[]; truncated: boolean } \| null` | Zod로 배열 형을 검증한다(불일치면 `null`). 항목 필드는 `tag_name` · `published_at` · `body` · `html_url` · `draft` · `prerelease`. **draft · prerelease · `/^v\d+\.\d+\.\d+$/` 밖의 태그 · `published_at` null을 거른다.** `published_at` 내림차순으로 정렬하고, 같은 시각이면 tag의 semver **숫자** 내림차순이다(`v1.0.10` > `v1.0.9` — 결정성). `body` null은 `""`다. `truncated`는 **거르기 전 원 배열 길이가 100**이면 참이다(액션 태그 릴리스도 같은 100칸을 쓴다) |
| `utcDay(at: Date): string` (`lib/utc-time.ts`) | `getUTCFullYear/Month/Date` + 고정 월 약어 12개 배열 → `Sep 27, 2026`. **ICU·런타임 TZ에 의존하지 않는다**(`toLocaleDateString` 금지 — POSTMORTEM 2026-09-20의 grep 0건 규칙). 경계 사례: `2026-09-27T16:34:14Z`는 서울 기준 09-28이지만 `Sep 27, 2026`이다 |
| `utcMinute(at: Date): string` (형 변경) | `${utcDay(at)} ${HH:MM} UTC` → `Sep 27, 2026 16:34 UTC`. 이름·시그니처는 그대로라 소비자 코드는 안 바뀌고 출력만 바뀐다 |
| `shiftHeadings(tree)` (remark 플러그인) | 본문의 **최소 제목 깊이를 3으로** 맞추고 나머지를 같은 폭으로 내린다(`##`·`###` → `h3`·`h4`, 사람이 넣은 `#`도 `h3`가 된다). 최대 `h6`에서 멈춘다. 인자 없음 — 페이지 `h1` → 버전 `h2` 아래라 바닥이 늘 3이다 |
| `dropFullChangelog(tree)` (remark 플러그인) | 본문 **마지막 문단**이 `**Full changelog:**`(strong 첫 자식)로 시작하면 제거한다. 중간 문단이나 다른 강조 문단은 건드리지 않는다. 그 줄의 역할은 항목 끝의 `View on GitHub` 버튼이 대신한다(시안 1f) |
| `imagesToLinks(tree)` (remark 플러그인) | `image` 노드를 `link`(href = 원 URL, 글자 = alt, alt가 비면 URL)로 바꾼다. `<img>`를 만들지 않아 CSP `img-src`(`lib/security-headers.ts:88`)·`/privacy` 전송처가 그대로다 |

`releaseAnchor`는 두지 않는다 — 태그 패턴이 id로 안전함을 이미 보장하므로 `id={release.tag}`로 쓴다.

## 렌더

- 시안: Claude Design [`Changelog.dc.html`](https://claude.ai/design/p/b99d54cd-3034-44f1-8446-0a864da9d767?file=Changelog.dc.html)(1a–1f) + `Changelog Page.dc.html`. 읽기 그릇은 **`mx-auto max-w-[800px] px-10 pt-16 pb-30`** 한 겹(본문 720 + 좌우 40, 위 64는 헤더 이웃 Docs와 같음, 목차 없음) — 시안의 1120 바깥 그릇에서 이탈하므로 DESIGN에 등재한다. 항목 머리 버전 `h2` 24/600 → 8 → 날짜 14 muted → 32 · 항목 사이 `border-t` + 위아래 40. 소개 문단 위 여백은 가이드의 `h1+p` 20과 맞춘다.
- ⚠️ **읽기 그릇이 `DocFrame`(720 + 목차 200)을 따르지 않는다** — 목차 없이 빈 200 열을 남기면 본문이 왼쪽으로 쏠린다. DESIGN §6.61 근처에 등재하고, 같은 절 :772의 "Privacy 그릇 그대로"(이미 폭·위 여백이 다르다)도 바로잡는다.
- **버전 앵커**: 항목 `h2`는 `id={tag}` · `tabIndex={-1}` · `scroll-mt-12` · `focus:outline-none`(`guide-markdown.tsx:42`와 같은 형 — 해시 착지 때 브라우저 기본 윤곽이 안 뜬다)이고, 그 안의 글자가 **자기 자신을 가리키는 네이티브 `<a href="#v1.0.1">`**다. 링크 색은 `foreground` 그대로(본문 `DOC_LINK` 파랑 아님) + 포커스 링만. 시안의 `replaceState` + JS 스크롤은 쓰지 않는다 — 하드 진입의 해시 착지·포커스는 `PublicScroller`(`components/public-shell/scroller.tsx:36-43`)가 이미 한다.
- **`View on GitHub`**: `Button`에는 `asChild`가 없고 `ButtonLink`는 `next/link`라, 랜딩 GitHub CTA(`app/page.tsx:78-81`)와 같은 형 — `<a>` + `buttonClass({ variant: "default", size: "md" })` + `target="_blank" rel="noreferrer"` + 선행 `<GithubMark />`. 보이는 문구는 시안대로 두고 접근 이름은 `View v1.0.1 on GitHub`(`aria-label`)다 — 항목 수만큼 같은 이름이 서지 않게.
- `react-markdown` + `remark-gfm`, **`rehype-raw` 없음** — 가이드 렌더러(`components/docs/guide-markdown.tsx`)와 같은 조합이다. raw HTML은 글자로 남는다. 기본 `urlTransform`을 덮어쓰지 않는다(`javascript:` href가 걷힌다).
- **제목 급**: `h3` = 가이드 h3 그대로(18/1.5/500, 위 32), `h4`~`h6` = `text-prose`(16) · 500 · 위 24. 이 리포에 `h4` 급이 없어 새로 정한다 — 없으면 브라우저 기본 700이 나온다.
- ⚠️ **`GuideMarkdown`을 그대로 재사용하지 않는다.** 그 컴포넌트는 스크린샷 크기 표 · 원고 게이트(`renderProblems`) · 제목 `tabIndex` 등 가이드 원고 전용 전제를 든다. 공유할 것은 **클래스 상수**(`PROSE`·`LIST` 류 · `components/docs/classes.ts`의 `INLINE_CODE`·`DOC_LINK`)뿐이고, 공유가 필요하면 상수를 export로 꺼낸다. 컴포넌트를 일반화하지 않는다(CLAUDE.md "요청하지 않은 추상화 금지").
- 본문 링크는 공개 셸 규칙(`text-blue-600`, DESIGN §6.3 · §6.616)을 따른다. `components.a`가 `http(s):` 링크에 `target="_blank" rel="noreferrer"`를 붙인다(가이드는 `lib/guide/remark.ts:42`의 `hProperties`로 같은 일을 한다).
- 문구(시안 원문, 실패 문구는 문법만 고침):
  - 소개: `What changed in each release of Malmoi, newest first. Dates are in UTC. The same notes are published on [GitHub Releases].`
  - 실패(1c): `The changelog couldn't be loaded from GitHub just now. Read it on [GitHub Releases].` — 시안의 "Read them"은 단수 changelog를 받지 못해 고친다.
  - 빈 목록(1d): `No releases have been published yet. New versions appear here and on [GitHub Releases].`
  - 100건(truncated): 목록 끝 `Older releases are on [GitHub Releases].`
  - 실패·빈 목록은 첫 항목 자리의 본문 문장 하나다 — `Alert`·`EmptyState`·재시도 없음. 문장 안 링크는 전부 새 탭 + `rel="noreferrer"`다.
- 화면 문구(페이지 제목 · 실패 안내 · 빈 목록 · truncated)는 `messages/en.tsx`의 새 묶음 `changelog`에 둔다. `m.changelog.title`이 다섯 자리의 라벨 키다(spec 결정). 본문은 GitHub 원문이라 사전을 지나지 않는다. **사전을 지나지 않는 유일한 공개 텍스트**이고, 그 원문의 계약은 `.claude/commands/merge.md` 5단계 ② 양식이다. 영어 단일이다(`no-korean-ui` 검사는 소스만 본다).

## 날짜 표기 통일

`lib/utc-time.ts` 하나가 절대 날짜·시각을 만든다. 기준은 UTC, 표기만 바뀐다.

| 자리 | 지금 | 뒤 |
|---|---|---|
| `utcMinute` 소비자 — `settings/page.tsx` 보관 줄 · `publish-button.tsx` · `logs/event-row.tsx`(접근 이름) · `logs/event-detail.tsx` · `sources/source-detail-modal.tsx` · `sources/source-status.tsx` · `sources/sources-archived.tsx` · `lib/invitation-email/retry-at.ts` | `2026-09-27 16:34 UTC` | `Sep 27, 2026 16:34 UTC` (코드 변경 없음, 출력만) |
| Logs 날짜 카드 머리 (`lib/events/view.ts` `dayLabel`) | `2026-09-27` | `utcDay` — ⚠️ `dayKey`(그룹 키)는 ISO 그대로 |
| Logs coverage 줄 · 보관 복구 줄 (`logs/page.tsx:145·185`) | ISO `slice(0, 10)` | `utcDay` |
| `/privacy` 시행일 (`privacy-doc.tsx:33`) | 사전 원문 `2026-09-27` | 표시만 `utcDay(new Date(effectiveDate))`, `dateTime`·사전 값은 ISO 그대로(`policy-gate`가 그 값을 본다) |
| `/changelog` 날짜 | — | `utcDay`, `<time dateTime>`에는 원 ISO 전체 |

대상이 아닌 것: URL·입력 값의 ISO 날짜(`log-filters.tsx:328` · `lib/events/filter.ts:185` · `dayKey`), 계정 병합의 가입 월(`app/signin/link/[challenge]/page.tsx:118` — 비목표에 남김).

## 앱 셸 변경

- `lib/routes.ts`에 `changelog: () => "/changelog"`를 추가한다. `entry-points.test.ts`의 "죽은 라우트 링크" 검사가 실재하는 `page.tsx`와 대조하므로 **라우트와 같은 커밋**에 넣는다.
- `lib/shell/nav.ts`의 `navFooterItems` 중 `releaseNotes`를 key `changelog` · `href: routes.changelog()` · `external` 제거 · 라벨 `m.changelog.title`로 바꾼다. **실제 소비자는 `components/shell/sidebar.tsx:101` · `components/landing/mockup/app-frame.tsx:30`(랜딩 목업 LNB에 `Changelog`가 보이게 됨) · `app/page.tsx:30`(Docs 아이콘만)이다.** 머리 주석의 "GitHub Releases 외부 링크" 문구도 고친다.
- `components/shell/user-menu.tsx`는 `navFooterItems`를 쓰지 않고 `m.common.nav.releaseNotes`를 직접 읽는다(:80). 그 `<a target="_blank">`를 같은 파일의 비공개 `MenuLink`(:121, 내부 링크 전용)로 바꾸고 라벨을 `m.changelog.title`로 바꾼다. 주석 :24·:27도 고친다.
- `GITHUB_RELEASES_URL`은 남는다 — 소개 문장·실패·빈 목록·truncated 안내가 소비한다. 앱 셸 소비자 둘은 사라진다.
- **공개 헤더 내비는 `Home · Docs · Changelog`다** (2026-09-28 사용자) — **GitHub 링크를 헤더에서 뺀다.** `PublicHeader`는 랜딩·`/privacy`·`/docs`·`/changelog`가 같이 쓰므로 네 화면 모두에서 빠진다. GitHub는 푸터 첫 링크와 랜딩 마무리 CTA(`m.landing.shell.github` — 사전 키가 고아가 되지 않는다)에 남는다. `current` 타입(`header.tsx:33`)에 `"changelog"`를 더하고 `aria-current="page"`만 세운다(선택 상태를 그리지 않는 헤더 규칙 그대로). :25의 "셋뿐" 주석을 고친다. 헤더에서 `GITHUB_REPO_URL` import가 고아가 되면 지운다.
- **공개 푸터는 `GitHub · Privacy Policy · Docs · Changelog`다** — `FOOTER_LINKS` 끝에 붙인다. 앞 셋의 순서는 2026-09-26 사용자 판정이라 건드리지 않는다. 한 상수라 `/signin`·초대·계정 병합(`components/signin/auth-layout.tsx:62`) 푸터에도 선다. `lib/links.ts:20`·`components/public-shell/footer.tsx:11`의 낡은 소비자 주석을 같이 고친다.
- 사이드바·사용자 메뉴의 `Compass` 아이콘은 그대로다(시안 1e).

## 공개 페이지 배선

| 무엇 | 어디 | 비고 |
|---|---|---|
| 인가 예외 등재 | `app/__tests__/entry-points.test.ts`의 `EXEMPT`에 `changelog/page.tsx`, **`PUBLIC`(:771)에 `/changelog`** | 이유 주석 한 줄. `PUBLIC`이 빠지면 "보호 경로 아님"(:844)·"matcher가 CSP를 건다"(:849)가 이 라우트를 재지 않는다. 1차 차단 `isProtectedPath`에는 넣지 않는다 |
| metadata | `pageMetadata({ title, description, path: "/changelog" })` | `/privacy`와 같은 형 |
| sitemap | `lib/seo/crawl.ts`의 `sitemapEntries` — **`/privacy` 앞** | `crawl.test.ts:37-39`의 `at(-1) === /privacy`는 유지되고 개수만 `+3`이 된다. `lastModified`는 싣지 않는다(같은 파일의 규칙) |
| analytics | `lib/seo/analytics.ts`의 `TRACKED`에 `\/changelog` | ⚠️ 해시(`#v1.0.1`)는 이미 벗겨진다. `analytics.test.ts`에 통과·거부 사례를 더한다(`/changelog/`, `/changelogx`) |
| robots | 변경 없음 | `allow: "/"` 아래다 |
| CSP | 변경 없음 | fetch가 서버에서만 돌고, 본문 이미지는 `<img>`가 아니라 링크다(`imagesToLinks`) |

## 스키마 변경

없음.

## 새 환경변수

없음. 리포 좌표는 `lib/links.ts`의 `GITHUB_REPO` 하나에서 조립한다(`SinhyeokKang/malmoi` 문자열을 새로 흩지 않는다).

## 불변식 영향

- **export 결정성 · blob SHA**: 무관하다.
- **인증 경계(ARCHITECTURE §6)**: 공개 라우트가 하나 늘지만 DB를 읽지 않고 세션은 헤더 CTA에만 쓴다(`/privacy`와 같다). GitHub 자격증명을 쓰지 않는다.
- **개인정보(`/privacy`)**: 서버가 GitHub를 부르는 요청에는 사용자 데이터가 없고 쿠키도 없다. 본문 이미지를 `<img>`로 그리지 않으므로 방문자 브라우저가 GitHub로 직접 요청하지 않는다. 새 **목적** · **전송처** · **쿠키** 모두 0이라 방침 본문 변경은 없다(시행일 표시 형만 바뀌고 사전 값은 그대로라 `policy-gate`는 안 움직인다). `/push` 4단계에서 다시 확인한다.
- **CLAUDE.md "절대 시각은 UTC `lib/utc-time.ts` 형"**: 형이 `Sep 27, 2026 16:34 UTC`로 바뀐다. "UTC를 말한다"와 "생산자는 `utc-time.ts` 하나"는 그대로다. CLAUDE.md 코드 컨벤션 · DESIGN · `utc-time.ts` 머리 주석(L7.1)을 고친다(T11b).
- **CLAUDE.md "화면 문구는 사전을 지난다"**: 본문이 예외다. 문구가 아니라 외부 데이터라서다. 그 사실을 페이지 머리 주석과 DESIGN에 남긴다.

## 과거 함정 (POSTMORTEM 대조)

- **절대 시각 grep 0건**(2026-09-20): `toLocaleDateString`을 쓰지 않고 `utcDay`를 `utc-time.ts`에 둔다. 통일 뒤에도 `grep -rn "toLocaleDateString\|toLocaleTimeString" app components lib`는 0건이다.
- **새 `<img>`는 `avatar`·`image-tile`·국기 셋 중 하나를 지난다**(2026-09-20): 본문 이미지를 `<img>`로 만들지 않아 해당 없다.
- **`force-static` 트레이스 함정**(`app/sitemap.ts`·`llms.txt`의 머리 주석): sitemap에 **정적 URL 하나**를 더할 뿐 동적 API를 부르지 않으므로 `force-static`이 유지된다. `sitemap.ts`에서 GitHub를 부르지 않는다 — 부르면 빌드가 GitHub에 묶인다.
- **라우트 없는 링크 생성기**(`lib/routes.ts` 머리 주석, 2026-09-05): `routes.changelog`는 `page.tsx`와 같은 커밋에 넣는다.
- **외부 링크 규칙이 원래 화면에만**(2026-09-20 계열, `public-shell.test.tsx:180`): 새 외부 링크 자리(`View on GitHub` · 안내 문장 · 본문)마다 `target`·`rel`을 따로 센다.
- `revalidatePath` 계열 함정은 해당 없다 — Server Action이 없다.

# changelog — design

## 영향 받는 흐름

push · 편집 UI · pull 어느 파이프라인에도 붙지 않는다. **공개 셸에 읽기 전용 페이지가 하나 늘고**, 앱 셸의 링크 두 곳이 그 페이지를 가리키도록 바뀐다. DB · Server Action · Route Handler는 없다.

## 구성

```
app/changelog/page.tsx        서버 컴포넌트 — readSession(헤더 CTA) + loadReleases() + PublicShell
lib/changelog/
  parse.ts        (순수) API JSON → Release[]  — 검증 · 거르기 · 정렬
  anchor.ts       (순수) tag → 요소 id
  markdown.ts     (순수) 본문 mdast 변환 — 제목 깊이 이동 · Full changelog 줄 제거
  date.ts         (순수) published_at → `Sep 27, 2026`(UTC)
  load.ts         (껍데기) fetch + revalidate + 타임아웃 → { ok: true, releases } | { ok: false }
components/changelog/
  release-markdown.tsx   react-markdown 렌더러 (rehype-raw 없음)
  release-entry.tsx      항목 하나 (시안)
```

### 데이터 소스

- `GET https://api.github.com/repos/SinhyeokKang/malmoi/releases?per_page=100`, **토큰 없이** 부른다. 리포가 공개라 자격증명이 필요 없다(`lib/links.ts`의 "리포가 public이어야 이 링크가 산다"와 같은 전제다). 헤더는 `Accept: application/vnd.github+json`, `X-GitHub-Api-Version`, `User-Agent`.
- ⚠️ **GitHub 자격증명 셋 중 어느 것도 쓰지 않는다** — installation 토큰을 끌어오면 공개 페이지가 App 설치 상태에 묶인다. `credential-separation.test.ts`의 검사식(`octokit` App · `github-connect/user` import)에 걸리지 않는 형이다. `octokit`도 쓰지 않고 `fetch`로 부른다(Resend와 같은 판단).
- **캐시**: `fetch(url, { next: { revalidate: 3600 } })`. 페이지 자체는 `readSession` 때문에 동적이지만, fetch 데이터 캐시는 요청과 무관하게 공유된다. 비인증 한도(IP당 60회/시간) 안에 들어간다.
- **타임아웃**: `AbortSignal.timeout(3000)`. GitHub가 느리면 페이지가 같이 느려지므로 실패로 떨어뜨린다. ⚠️ 실패 응답은 캐시되지 않아야 한다 — `res.ok`가 아니면 던져서 `load.ts`가 `{ ok: false }`로 바꾼다(Next는 던진 fetch를 캐시하지 않는다). 실측으로 확인한다(T6).
- `load.ts`는 **던지지 않는다.** 실패는 `console.warn` 한 줄 + `{ ok: false }`다. 공개 페이지가 GitHub 장애로 에러 경계에 가지 않는다.

## 순수 함수 — `/tdd` 대상

| 함수 | 계약 |
|---|---|
| `parseReleases(json: unknown): Release[] \| null` | Zod로 배열 형을 검증한다(불일치면 `null`). 항목 필드는 `tag_name` · `published_at` · `body` · `html_url` · `draft` · `prerelease`. **draft · prerelease · `/^v\d+\.\d+\.\d+$/` 밖의 태그 · `published_at` null을 거른다.** `published_at` 내림차순으로 정렬하고, 같은 시각이면 tag의 semver 내림차순이다(결정성). `body` null은 `""`다 |
| `releaseAnchor(tag: string): string` | `v1.0.1` → `v1.0.1`. 태그 패턴을 이미 통과한 값이라 그대로 두되, 계약을 테스트로 고정한다 |
| `changelogDate(iso: string): string` | `toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })` → `Sep 27, 2026`. ⚠️ **`lib/utc-time.ts` 형(`2026-09-27 16:34 UTC`)의 예외다** (2026-09-28 사용자 — 공개 페이지의 읽는 글이라 사람이 읽는 형). UTC라는 사실은 페이지 소개 문장 `Dates are in UTC.` 한 번이 말하고, `<time dateTime>`에는 원 ISO 전체를 싣는다. 경계 사례: `2026-09-27T16:34:14Z`는 서울 기준 09-28이지만 `Sep 27, 2026`이다 — 테스트가 그 사례를 고정한다(런타임 TZ에 흔들리지 않음) |
| `shiftHeadings(tree, by)` (remark 플러그인) | 본문의 `##`·`###`를 한 단계씩 내린다. 페이지 `h1` 아래에 항목 제목(`h2` — 버전)이 서므로, 본문 `## Highlights`는 `h3`가 되어야 문서 개요가 맞다. 최대 `h6`에서 멈춘다 |
| `dropFullChangelog(tree)` (remark 플러그인) | 본문 **마지막 문단**이 `**Full changelog:**`(strong 첫 자식)로 시작하면 제거한다. 중간 문단이나 다른 강조 문단은 건드리지 않는다. 그 줄의 역할은 항목 끝의 `View on GitHub` 버튼이 대신한다(시안 1f) |
| `releaseUrl(tag)` | `${GITHUB_REPO_URL}/releases/tag/<tag>` — `View on GitHub` 행선지. compare가 없는 1.0.0에도 선다 |

## 렌더

- 시안: Claude Design `Changelog.dc.html`(1a–1f) + `Changelog Page.dc.html`. 치수는 시안 설명 카드가 정본이다 — 읽기 그릇 720 한 열 가운데(`max-w-[1120px]` · `px-10 pt-16 pb-30`, 목차 없음) · 항목 머리 버전 `h2` 24/600 → 8 → 날짜 14 muted → 32 · 항목 사이 `border-t` + 위아래 40 · 끝에 `Button` default md `View on GitHub`(`GithubMark`, 새 탭).
- ⚠️ **읽기 그릇이 `DocFrame`(720 + 목차 200)을 따르지 않는다** — 목차 없이 빈 200 열을 남기면 본문이 왼쪽으로 쏠린다. 새 그릇이므로 DESIGN §6.61 근처에 등재한다.
- **버전 앵커는 네이티브 `<a href="#v1.0.1">`** + 제목 `tabIndex={-1}` · `scroll-mt-12`다. 시안의 `replaceState` + JS 스크롤은 쓰지 않는다 — 착지가 같고 클라이언트 JS가 0이다(차이는 히스토리 항목 하나). 하드 진입의 해시 착지·포커스는 `PublicScroller`가 이미 한다.
- `react-markdown` + `remark-gfm`, **`rehype-raw` 없음** — 가이드 렌더러(`components/docs/guide-markdown.tsx`)와 같은 조합이다. 이것이 "Release 본문 HTML이 그대로 실리지 않는다"를 보장한다.
- ⚠️ **`GuideMarkdown`을 그대로 재사용하지 않는다.** 그 컴포넌트는 스크린샷 크기 표 · 원고 게이트(`renderProblems`) · 제목 `tabIndex` 등 가이드 원고 전용 전제를 든다. 공유할 것은 **클래스 상수**(`PROSE`·`LIST` 류 · `components/docs/classes.ts`의 `INLINE_CODE`)뿐이고, 공유가 필요하면 상수를 export로 꺼낸다. 컴포넌트를 일반화하지 않는다(CLAUDE.md "요청하지 않은 추상화 금지").
- 본문 링크는 공개 셸 규칙(`text-blue-600`, DESIGN §6.3 · §6.616)을 따른다. 외부 링크(`compare/…`)는 새 탭으로 연다.
- 문구(시안 원문, 실패 문구는 문법만 고침):
  - 소개: `What changed in each release of Malmoi, newest first. Dates are in UTC. The same notes are published on [GitHub Releases].`
  - 실패(1c): `The changelog couldn't be loaded from GitHub just now. Read it on [GitHub Releases].` — 시안의 "Read them"은 단수 changelog를 받지 못해 고친다.
  - 빈 목록(1d): `No releases have been published yet. New versions appear here and on [GitHub Releases].`
  - 실패·빈 목록은 첫 항목 자리의 본문 문장 하나다 — `Alert`·`EmptyState`·재시도 없음.
- 화면 문구(페이지 제목 · 실패 안내 · 빈 목록)는 `messages/en.tsx`의 새 묶음 `changelog`에 둔다. 본문은 GitHub 원문이라 사전을 지나지 않는다. **사전을 지나지 않는 유일한 공개 텍스트**이고, 그 원문의 계약은 `.claude/commands/merge.md` 5단계 ② 양식이다. 영어 단일이다(`no-korean-ui` 검사는 소스만 본다).

## 앱 셸 변경

- `lib/routes.ts`에 `changelog: () => "/changelog"`를 추가한다. `entry-points.test.ts`의 "죽은 라우트 링크" 검사가 실재하는 `page.tsx`와 대조하므로 **라우트와 같은 커밋**에 넣는다.
- `lib/shell/nav.ts`의 `navFooterItems` 중 `releaseNotes`를 key `changelog` · `href: routes.changelog()` · `external` 제거로 바꾸고, 사전 키 `m.common.nav.releaseNotes`("Release notes")를 `m.common.nav.changelog`("Changelog")로 바꾼다. 소비자는 사이드바·사용자 메뉴 둘이다. `nav.test.ts:318`을 갱신한다.
- `components/shell/user-menu.tsx`의 `<a target="_blank">`를 `MenuLink`로 바꾼다.
- `GITHUB_RELEASES_URL`은 남는다 — 소개 문장·실패·빈 목록 안내가 소비한다. 앱 셸 소비자 둘은 사라진다.
- **공개 헤더 내비는 `Home · Docs · Changelog`다** (2026-09-28 사용자) — **GitHub 링크를 헤더에서 뺀다.** `PublicHeader`는 랜딩·`/privacy`·`/docs`·`/changelog`가 같이 쓰므로 네 화면 모두에서 빠진다. GitHub는 푸터 첫 링크와 랜딩 마무리 CTA에 남는다. `current` 타입에 `"changelog"`를 더하고 `aria-current="page"`만 세운다(선택 상태를 그리지 않는 헤더 규칙 그대로). 헤더에서 `GITHUB_REPO_URL` import가 고아가 되면 지운다.
- **공개 푸터는 `GitHub · Privacy Policy · Docs · Changelog`다** — `FOOTER_LINKS` 끝에 붙인다. 앞 셋의 순서는 2026-09-26 사용자 판정이라 건드리지 않는다. 한 상수라 `/signin`·초대·계정 병합 푸터에도 선다.
- 사이드바·사용자 메뉴의 `Compass` 아이콘은 그대로다(시안 1e).

## 공개 페이지 배선

| 무엇 | 어디 | 비고 |
|---|---|---|
| 인가 예외 등재 | `app/__tests__/entry-points.test.ts`의 `EXEMPT`에 `changelog/page.tsx` | 이유 주석 한 줄. 1차 차단 `isProtectedPath`에는 넣지 않는다 |
| metadata | `pageMetadata({ title, description, path: "/changelog" })` | `/privacy`와 같은 형 |
| sitemap | `lib/seo/crawl.ts`의 `sitemapEntries` | `crawl.test.ts` 갱신. `lastModified`는 싣지 않는다(같은 파일의 규칙) |
| analytics | `lib/seo/analytics.ts`의 `TRACKED`에 `\/changelog` | ⚠️ 해시(`#v1.0.1`)는 이미 벗겨진다. `analytics.test.ts`에 통과·거부 사례를 더한다(`/changelog/`, `/changelogx`) |
| robots | 변경 없음 | `allow: "/"` 아래다 |
| CSP | 변경 없음 | fetch가 서버에서만 돈다 |

## 스키마 변경

없음.

## 새 환경변수

없음. 리포 좌표는 `lib/links.ts`의 `GITHUB_REPO_URL`과 같은 출처에서 조립한다(`SinhyeokKang/malmoi` 문자열을 새로 흩지 않는다).

## 불변식 영향

- **export 결정성 · blob SHA**: 무관하다.
- **인증 경계(ARCHITECTURE §6)**: 공개 라우트가 하나 늘지만 DB를 읽지 않고 세션은 헤더 CTA에만 쓴다(`/privacy`와 같다). GitHub 자격증명을 쓰지 않는다.
- **개인정보(`/privacy`)**: 서버가 GitHub를 부르는 요청에는 사용자 데이터가 없고 쿠키도 없다. 새 **목적** · **전송처**(사용자 데이터 기준) · **쿠키** 모두 0이라 방침 본문 변경은 없다고 판단한다. `/push` 4단계에서 다시 확인한다.
- **CLAUDE.md "절대 시각은 UTC `lib/utc-time.ts` 형"**: 이 페이지의 날짜가 예외다(위 `changelogDate`). UTC 기준은 지키고 표기만 다르다. CLAUDE.md 코드 컨벤션 · DESIGN에 예외를 적는다(T11b).
- **CLAUDE.md "화면 문구는 사전을 지난다"**: 본문이 예외다. 문구가 아니라 외부 데이터라서다. 그 사실을 페이지 머리 주석과 DESIGN에 남긴다.

## 과거 함정 (POSTMORTEM 대조)

- **`force-static` 트레이스 함정**(`app/sitemap.ts`·`llms.txt`의 머리 주석): sitemap에 **정적 URL 하나**를 더할 뿐 동적 API를 부르지 않으므로 `force-static`이 유지된다. `sitemap.ts`에서 GitHub를 부르지 않는다 — 부르면 빌드가 GitHub에 묶인다.
- **라우트 없는 링크 생성기**(`lib/routes.ts` 머리 주석, 2026-09-05): `routes.changelog`는 `page.tsx`와 같은 커밋에 넣는다.
- `revalidatePath` 계열 함정은 해당 없다 — Server Action이 없다.

## 확인 필요

1. **캐시 1시간** — `/merge` 뒤 최대 1시간 동안 새 버전이 안 보인다. 받아들인다고 가정했다.

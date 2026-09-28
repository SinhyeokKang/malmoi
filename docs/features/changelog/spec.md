# changelog — spec

## 사용자

**방문자와 번역 편집자(비개발자 동료)** 다. 이들이 "무엇이 바뀌었나"를 앱 안에서 읽는다. 개발자(나)는 쓰는 쪽이다 — 원문은 `/merge`가 이미 GitHub Release로 쓰고 있고, 이 기능이 쓰는 일을 늘리지 않는다.

## 문제

- 사이드바 하단과 사용자 메뉴의 `Release notes`가 **GitHub Releases로 나가는 외부 링크**다(`lib/links.ts`의 `GITHUB_RELEASES_URL`). 비개발자는 앱을 떠나 GitHub 화면을 읽어야 하고, 그 화면에는 태그 · 커밋 SHA · 에셋 같은 개발자 맥락이 섞여 있다.
- 원문은 이미 사용자용으로 쓰여 있다. `/merge` 5단계 ② 양식이 "사용자가 체감하는 변화만" 남기고, `v1.0.0`~`v1.0.2`가 그 양식으로 나갔다(판마다 섹션 구성이 다르다 — 1.0.0엔 Fixes가, 1.0.2엔 Features가 없다). 빠진 것은 앱 안에서 보여 주는 화면 하나다.
- 공개 헤더 내비(`Home · Docs · GitHub`)에서 외부 목적지는 GitHub 하나이고, 같은 링크가 푸터 첫 자리와 랜딩 CTA에 이미 있다. 앱 안 목적지가 하나 늘면 헤더는 **앱 안 페이지만** 드는 편이 일관된다.
- 날짜 표기가 화면마다 갈린다 — Logs·Sources·Publish는 `2026-09-10 12:00 UTC`, 날짜만 쓰는 자리(Logs 날짜 카드·coverage·보관 줄, `/privacy` 시행일)는 `2026-09-27` 원문 그대로다. 이 페이지의 `Sep 27, 2026`이 셋째 형이 되기 전에 한 포맷터로 모은다.

## 결정

- 라우트는 **`/changelog`**, 메뉴 라벨은 **`Changelog`** 다(지금 `Release notes`에서 바꾼다 — 2026-09-28 사용자).
- **라벨 키는 페이지 제목 `m.changelog.title` 하나다.** 사이드바 · 사용자 메뉴 · 공개 헤더 · 푸터 · 페이지 `h1` 다섯 자리가 같은 키를 읽는다(사이드바 Docs가 `m.publicDocs.docs.title`을 읽는 선례, DESIGN "라벨이 그 화면의 제목과 같은 키"). `m.common.nav.releaseNotes`는 지우고 `m.common.nav.changelog`는 만들지 않는다.
- **원문의 정본은 GitHub Release**(`SinhyeokKang/malmoi`)다. 소스에 사본을 두지 않는다 — 두 벌이면 한쪽만 고쳐진다.
- 공개 셸(`PublicShell`) 안의 **공개 페이지**다. 인가가 없다(`/privacy`와 같은 급).
- 시각 시안은 Claude Design 핸드오프 [`Changelog.dc.html`](https://claude.ai/design/p/b99d54cd-3034-44f1-8446-0a864da9d767?file=Changelog.dc.html)(프로젝트 `b99d54cd-3034-44f1-8446-0a864da9d767`, 컴포넌트 `Changelog Page.dc.html`)에서 받았다(`/design-sync`).
- **공개 헤더 내비는 `Home · Docs · Changelog`** 다. GitHub를 헤더에서 빼고 푸터 첫 링크와 랜딩 CTA에만 둔다. 공개 푸터 끝에 `Changelog`를 붙인다(2026-09-28 사용자).
- **날짜 표기를 앱 전체에서 한 형으로 통일한다** (2026-09-28 사용자). 날짜만 쓰는 자리는 `Sep 27, 2026`, 시각까지 쓰는 자리는 `Sep 27, 2026 16:34 UTC`다. 둘 다 `lib/utc-time.ts` 한 파일이 만들고(`utcDay` · `utcMinute`) 기준은 UTC다. 이 페이지는 날짜만 쓰고, UTC라는 사실은 소개 문장이 한 번 말한다.
- 본문의 `**Full changelog:**` 줄은 빼고, 항목마다 `View on GitHub`(그 판의 Release 페이지)를 둔다. `Latest` 표시는 없다.
- **본문의 마크다운 이미지는 `<img>`로 그리지 않고 alt 글자의 외부 링크로 바꾼다.** CSP `img-src`와 `/privacy`의 전송처를 넓히지 않기 위해서다(지금 원문엔 이미지가 없다).
- **GitHub 응답이 한 요청 상한(100건)에 닿으면** 목록 끝에 `Older releases are on [GitHub Releases].` 한 문장을 둔다. 페이지네이션은 없다.

## 뒤집는 근거

| 뒤집는 판정 | 어디 | 근거 |
|---|---|---|
| 하단 항목 `Release notes`(복수형 사용자 결정) — GitHub Releases 외부 링크 | `messages/en.tsx:292` · PRODUCT:687 | 목적지가 앱 안 페이지로 바뀌었고, 화면 라벨이 그 페이지 제목과 같은 키여야 한다. 제목은 `Changelog`다 |
| 공개 헤더 `Home · Docs · GitHub` | PRODUCT:570-571 · DESIGN:810·814 | 헤더 내비는 앱 안 목적지만 든다. GitHub는 푸터 첫 링크·랜딩 CTA에 남아 도달성이 줄지 않는다 |
| 절대 시각 `2026-09-10 12:00 UTC`(launch-readiness L7.1 — Logs 형이 정본) | `lib/utc-time.ts` 머리 · CLAUDE.md 코드 컨벤션 | 날짜만 쓰는 자리와 시각을 쓰는 자리가 서로 다른 형이었고, 이 페이지가 셋째 형을 들일 참이었다. **UTC를 말한다**는 L7.1의 요지는 그대로 둔다 — 바뀌는 것은 표기뿐이다 |

## 완료 조건

1. 로그아웃 상태에서 `/changelog`가 200이고, 공개된 앱 릴리스(`v<x.y.z>` 태그)가 **`published_at` 내림차순**으로 전부 보인다.
2. 각 릴리스에 버전 · UTC 날짜 · 본문이 보이고, 본문은 **원문에 있는 섹션만** 그대로 보인다(없는 섹션을 만들지 않는다). `#v1.0.1`로 들어오면 그 항목에 착지한다.
3. 본문 마크다운의 raw HTML은 렌더되지 않고(글자로 나온다), 마크다운 이미지는 `<img>`가 아니라 alt 글자의 외부 링크로 나온다. `<script>`·`<img onerror>`·`![](https://github.com/user-attachments/…)`가 든 본문을 넣은 단위 테스트로 확인한다.
4. draft · prerelease · `v<x.y.z>` 꼴이 아닌 태그(예: `malmoi-i18n-push-v2`)의 릴리스는 목록에 없다.
5. GitHub API가 실패하거나(5xx · 403 한도 · 타임아웃 · 스키마 불일치) 0건을 돌려주면 **페이지는 200**이고, GitHub Releases 외부 링크를 든 안내가 보인다. 에러 경계로 떨어지지 않는다. Vercel의 공유 egress IP로 비인증 한도(60회/시간)에 걸리는 경우도 이 폴백이 받는다.
6. **성공 응답만 1시간 캐시되고**, 비 200·타임아웃은 캐시되지 않아 다음 요청이 다시 부른다. `fetch`의 `next.revalidate: 3600` 인자를 단위 테스트가 단언한다. ⚠️ 200인데 스키마가 어긋난 응답은 1시간 캐시되어 그동안 안내가 고정된다 — 받아들인다.
7. 사이드바 하단과 사용자 메뉴의 `Release notes`가 라벨 `Changelog`가 되고 **새 탭 없이** `/changelog`로 간다.
8. 공개 헤더(랜딩 · `/privacy` · `/docs` · `/changelog`)에 `Home · Docs · Changelog`가 서고 GitHub가 없다. 공개 푸터(그 넷 + `/signin` · 초대 · `/signin/link`)의 끝에 `Changelog`가 있다.
9. `v1.0.1`(`2026-09-27T16:34:14Z`)의 날짜가 런타임 시간대와 무관하게 `Sep 27, 2026`이고, 본문에 `Full changelog` 줄이 없으며 `View on GitHub`가 `/releases/tag/v1.0.1`로 간다.
10. `/changelog`가 sitemap에 있고, Vercel Analytics 허용 목록이 그 경로를 통과시킨다(쿼리·해시는 벗긴다).
11. GitHub 응답이 100건이면 목록 끝에 `Older releases` 안내가 선다. 99건 이하면 없다.
12. 앱의 절대 날짜·시각이 전부 `lib/utc-time.ts`를 지난다 — Logs(행 접근 이름 · 상세 · 날짜 카드 · coverage · 보관 줄) · Sources · Publish · 설정 보관 줄 · 초대 재발송 시각 · `/privacy` 시행일이 `Sep 27, 2026` / `Sep 27, 2026 16:34 UTC` 형이다. `grep -rn "toLocaleDateString\|toLocaleTimeString" app components lib`가 0건이다.
13. `pnpm typecheck` · `pnpm test` · `pnpm build`가 green이다.

## 비목표

- 버전별 상세 하위 페이지(`/changelog/v1.0.1`), 검색 · 필터 · 페이지네이션(100건 초과분은 GitHub 링크 한 문장이 받는다).
- RSS · 구독 · 이메일 알림 — PRODUCT §4.2 "범용 알림 시스템" 비범위다.
- 사이드바의 새 버전 배지 · 읽음 표시 — 같은 알림 비범위에 인접한다.
- 앱 안에서 릴리스를 쓰거나 고치는 UI. 원문은 `/merge`가 GitHub에서만 쓴다.
- `/merge` 직후 즉시 반영(on-demand revalidate). 1시간 지연을 받아들인다 — 필요해지면 그때 넣는다.
- `llms.txt`·`llms-full.txt` 등재. 그 둘은 빌드 때 고정되는 가이드 원고 색인이고, 이 페이지는 런타임 데이터다.
- 액션 태그(`malmoi-i18n-push-vN`) 릴리스 노트. 앱 태그와 별개 축이다.
- 본문 이미지 표시(CSP·방침 확장).
- 계정 병합 화면의 가입 월(`app/signin/link/[challenge]/page.tsx:118`, `Mar 2026` — 월 단위라 날짜·시각이 아니다). 같은 grep의 사각이라는 사실만 남긴다.

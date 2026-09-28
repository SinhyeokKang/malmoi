# changelog — spec

## 사용자

**방문자와 번역 편집자(비개발자 동료)** 다. 이들이 "무엇이 바뀌었나"를 앱 안에서 읽는다. 개발자(나)는 쓰는 쪽이다 — 원문은 `/merge`가 이미 GitHub Release로 쓰고 있고, 이 기능이 쓰는 일을 늘리지 않는다.

## 문제

- 사이드바 하단과 사용자 메뉴의 `Release notes`가 **GitHub Releases로 나가는 외부 링크**다(`lib/links.ts`의 `GITHUB_RELEASES_URL`). 비개발자는 앱을 떠나 GitHub 화면을 읽어야 하고, 그 화면에는 태그 · 커밋 SHA · 에셋 같은 개발자 맥락이 섞여 있다.
- 원문은 이미 사용자용으로 쓰여 있다. `/merge` 5단계 ② 양식이 "사용자가 체감하는 변화만" 남기고, `v1.0.0`·`v1.0.1`이 그 양식으로 나갔다. 빠진 것은 앱 안에서 보여 주는 화면 하나다.

## 결정

- 라우트는 **`/changelog`**, 메뉴 라벨은 **`Changelog`** 다(지금 `Release notes`에서 바꾼다).
- **원문의 정본은 GitHub Release**(`SinhyeokKang/malmoi`)다. 소스에 사본을 두지 않는다 — 두 벌이면 한쪽만 고쳐진다.
- 공개 셸(`PublicShell`) 안의 **공개 페이지**다. 인가가 없다(`/privacy`와 같은 급).
- 시각 시안은 Claude Design 핸드오프 [`Changelog.dc.html`](https://claude.ai/design/p/b99d54cd-3034-44f1-8446-0a864da9d767?file=Changelog.dc.html)(프로젝트 `b99d54cd-3034-44f1-8446-0a864da9d767`, 컴포넌트 `Changelog Page.dc.html`)에서 받았다(`/design-sync`).
- **공개 헤더 내비는 `Home · Docs · Changelog`** 다. GitHub를 헤더에서 빼고 푸터 첫 링크와 랜딩 CTA에만 둔다. 공개 푸터 끝에 `Changelog`를 붙인다(2026-09-28 사용자).
- **날짜는 `Sep 27, 2026`(UTC 기준)** 이다. 앱 규약 `2026-09-27 16:34 UTC`의 예외이고, UTC라는 사실은 소개 문장이 한 번 말한다(2026-09-28 사용자).
- 본문의 `**Full changelog:**` 줄은 빼고, 항목마다 `View on GitHub`(그 판의 Release 페이지)를 둔다. `Latest` 표시는 없다.

## 완료 조건

1. 로그아웃 상태에서 `/changelog`가 200이고, 공개된 앱 릴리스(`v<x.y.z>` 태그)가 **`published_at` 내림차순**으로 전부 보인다.
2. 각 릴리스에 버전 · UTC 날짜 · 본문(Highlights / Features / Fixes)이 보이고, `#v1.0.1`로 들어오면 그 항목에 착지한다.
3. 본문 마크다운의 raw HTML은 렌더되지 않는다(글자로 나오거나 빠진다). `<script>`가 든 본문을 넣은 단위 테스트로 확인한다.
4. draft · prerelease · `v<x.y.z>` 꼴이 아닌 태그(예: `malmoi-i18n-push-v2`)의 릴리스는 목록에 없다.
5. GitHub API가 실패하거나(5xx · 403 한도 · 타임아웃 · 스키마 불일치) 0건을 돌려주면 **페이지는 200**이고, GitHub Releases 외부 링크를 든 안내가 보인다. 에러 경계로 떨어지지 않는다.
6. 요청마다 GitHub를 부르지 않는다. 응답은 **1시간** 캐시된다. `fetch`의 `next.revalidate` 인자를 단위 테스트가 단언한다.
7. 사이드바 하단과 사용자 메뉴의 `Release notes`가 라벨 `Changelog`가 되고 **새 탭 없이** `/changelog`로 간다.
8. 공개 헤더에 `Home · Docs · Changelog`가 서고 GitHub가 없으며, 공개 푸터 끝에 `Changelog`가 있다(랜딩·`/privacy`·`/docs`·`/signin` 공통).
9. `v1.0.1`(`2026-09-27T16:34:14Z`)의 날짜가 런타임 시간대와 무관하게 `Sep 27, 2026`이고, 본문에 `Full changelog` 줄이 없으며 `View on GitHub`가 `/releases/tag/v1.0.1`로 간다.
10. `/changelog`가 sitemap에 있고, Vercel Analytics 허용 목록이 그 경로를 통과시킨다(쿼리·해시는 벗긴다).
11. `pnpm typecheck` · `pnpm test` · `pnpm build`가 green이다.

## 비목표

- 버전별 상세 하위 페이지(`/changelog/v1.0.1`), 검색 · 필터 · 페이지네이션(한 요청 100건 안에서 끝난다).
- RSS · 구독 · 이메일 알림 — PRODUCT §4.2 "범용 알림 시스템" 비범위다.
- 앱 안에서 릴리스를 쓰거나 고치는 UI. 원문은 `/merge`가 GitHub에서만 쓴다.
- `/merge` 직후 즉시 반영(on-demand revalidate). 1시간 지연을 받아들인다 — 필요해지면 그때 넣는다.
- `llms.txt`·`llms-full.txt` 등재. 그 둘은 빌드 때 고정되는 가이드 원고 색인이고, 이 페이지는 런타임 데이터다.
- 액션 태그(`malmoi-i18n-push-vN`) 릴리스 노트. 앱 태그와 별개 축이다.

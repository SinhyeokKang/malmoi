# changelog — tasks

시안: Claude Design [`Changelog.dc.html`](https://claude.ai/design/p/b99d54cd-3034-44f1-8446-0a864da9d767?file=Changelog.dc.html) · `Changelog Page.dc.html` (2026-09-28 수령, 판정 반영 완료).

커밋마다 `pnpm typecheck && pnpm test`가 green이어야 한다(커밋 경계가 곧 되돌림 단위다). `pnpm build`는 T9에서 한 번 돈다.

## 커밋 1 — 날짜 포맷터 통일 (`refactor(time): unify absolute dates on utc-time`)

- [ ] **T0a `utcDay` · `utcMinute` 형** — `lib/__tests__/utc-time.test.ts`를 먼저 고친다. `utcDay(2026-09-27T16:34:14Z)` = `Sep 27, 2026`, `utcMinute` = `Sep 27, 2026 16:34 UTC`, 1월·12월·한 자리 날짜. **TZ 고정**: 파일 최상단에서 `process.env.TZ = "Asia/Seoul"`을 세우고 가드 단언 `expect(new Date("2026-09-27T16:34:14Z").getDate()).toBe(28)`를 먼저 둔다(TZ가 실제로 먹었다는 증거 — 없으면 CI(UTC)에서 공허하게 통과한다).
  검증: `pnpm test lib/__tests__/utc-time.test.ts` green. `grep -rn "toLocaleDateString\|toLocaleTimeString" app components lib | grep -v __tests__` 0건.
- [ ] **T0b 날짜 전용 자리** — `lib/events/view.ts` `dayLabel`(표시만, `dayKey`는 ISO 유지) · `logs/page.tsx:145·185` · `privacy-doc.tsx:33`(표시만, `dateTime`·사전 값 ISO 유지).
  검증: 기존 형을 단언하던 테스트를 새 형으로 옮긴다 — `lib/invitation-email/__tests__/retry-at.test.ts` · `components/__tests__/pending-resend.test.tsx` · `invite-modal.test.tsx` · `settings-layout.test.tsx` + `grep -rn "[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\} [0-9]\{2\}:[0-9]\{2\} UTC" app components lib`로 남은 단언을 센다. Logs 날짜 카드·`/privacy` 시행일 테스트가 없으면 그 자리 DOM 단언을 하나씩 더한다. `policy-gate.test.tsx` green(사전 값 불변).

## 커밋 2 — 순수 함수 (`feat(changelog): parse GitHub releases`)

- [ ] **T1 `parseReleases`** — 테스트를 먼저 쓴다. 사례는 draft · prerelease · 액션 태그(`malmoi-i18n-push-v2`) · `published_at` null · `body` null · 같은 시각 두 건 · **같은 시각 `v1.0.10`/`v1.0.9`(숫자순 — 문자열 비교 구현이 red)** · 형 불일치(`null`) · 원 배열 100건 → `truncated: true`(거른 뒤 99건이어도) · 99건 → `false`. 픽스처는 실제 `v1.0.0`~`v1.0.2` 응답 발췌다.
  검증: `pnpm test lib/changelog` green.
- [ ] **T2 `GITHUB_REPO` · `releaseTagUrl`** (`lib/links.ts`) — `releaseTagUrl("v1.0.1")` → `…/releases/tag/v1.0.1`, `GITHUB_RELEASES_API_URL`이 `GITHUB_REPO`에서 파생됨.
  검증: 단위 테스트 green.
- [ ] **T3 `shiftHeadings` · `dropFullChangelog` · `imagesToLinks` remark 플러그인** — 최소 깊이 3 맞춤(`##`→`h3`·`###`→`h4`, `#`만 있는 본문도 `h3`, `h6` 상한). 마지막 문단의 `**Full changelog:**`만 제거한다(중간 문단 · 1.0.0처럼 줄이 없는 본문 · **그 줄만 있는 본문**(빈 결과가 깨지지 않음) · `Maintenance release` 한 줄 변형(merge.md:134)은 그대로). **CRLF 본문**이 LF 본문과 같은 트리를 낸다. 이미지 → alt 글자 링크(alt 빈 값이면 URL).
  검증: 단위 테스트 green. mdast 입력 → 출력을 단언한다.

## 커밋 3 — 껍데기 (`feat(changelog): load releases with hourly revalidate`)

- [ ] **T4 `loadReleases`** — `fetch`를 mock한다(`lib/invitation-email/__tests__/send.test.ts:46-49`의 `lastRequest()` 형). 단언: URL · `init.next` `toEqual({ revalidate: 3600 })` · 헤더 · **`init.headers`에 `Authorization` 없음** · `vi.spyOn(AbortSignal, "timeout")` `toHaveBeenCalledWith(3000)`. 실패(비 2xx · throw · `DOMException("TimeoutError")` · 파싱 `null`)는 `{ ok: false }`이고 **던지지 않는다**. `console.warn` 인자에 `status`·`x-ratelimit-remaining`만 있고 본문이 없다.
  검증: 단위 테스트 green.

## 커밋 4 — 페이지 + 공개 배선 (`feat(changelog): public changelog page`) — 시안 이후

- [ ] **T5 렌더러 · 항목 컴포넌트** — `/design-sync`로 `Changelog.dc.html` 1a–1d에 맞춘다(800 한 겹 그릇 · 항목 머리 · `h2` 자기 링크 앵커 · `View on GitHub`). DOM 테스트(jsdom):
  - 본문 `<script>`·`<img onerror>`가 DOM 요소로 생기지 않고 **글자로 보인다**(`guide-markdown.test.tsx:71-72` 형).
  - `![x](https://github.com/user-attachments/…)` → `<img>` 0개, 글자 `x`의 링크.
  - `[x](javascript:alert(1))` → href가 걷힌다(`guide-markdown.test.tsx:74-80` 형).
  - 본문 외부 링크 · `View on GitHub`에 `target="_blank"` + `rel` noreferrer.
  - `View on GitHub` 접근 이름이 `View v1.0.1 on GitHub`.
  - `h4`가 정한 급의 클래스를 든다.
  검증: DOM 테스트 green, `/design-sync` 실측 통과(수동).
- [ ] **T6 `app/changelog/page.tsx` + `routes.changelog` + `EXEMPT`·`PUBLIC` 등재 + 사전 `changelog` 묶음**.
  - 자동: `lib/__tests__/routes.test.ts:117-127`에 `routes.changelog()` 사례. `app/__tests__/changelog-page.test.tsx`(`privacy-page.test.tsx:34-57` 형) — `loadReleases`를 `{ok:false}` · 빈 목록 · 두 건 · truncated로 mock해 문구와 `GITHUB_RELEASES_URL` 링크(새 탭 + `rel`), 헤더 `aria-current="page"`가 Changelog에, 푸터가 `FOOTER_LINKS`와 같음, truncated 문장 유무를 단언한다.
  검증: `entry-points.test.ts` · `no-korean-ui` · `terminology` · `changelog-page.test.tsx` · `routes.test.ts` green.
  - 수동(ego-browser, **`pnpm build && pnpm start`에서** — `next dev`는 HMR fetch 캐시라 판정 불가): 로그아웃 200, `#v1.0.1` 착지·포커스. 실패 미캐시: `.next/cache/fetch-cache`를 비운다 → 오프라인으로 첫 요청 → 1c 안내 → 온라인 복귀 후 새로고침 → 목록(실패가 캐시되지 않았다는 증거). 콜드 캐시 첫 진입 지연을 잰다. "200인데 스키마 불일치"는 수동 재현 불가 — spec 조건 6에 수용한 한계로 적혀 있다.
- [ ] **T7 sitemap · analytics 허용 목록** — sitemap은 `/privacy` 앞.
  검증: `crawl.test.ts`(`at(-1) === /privacy` 유지, 개수 갱신) · `analytics.test.ts`(`/changelog` 통과, `/changelog/`·`/changelogx` 거부) green.
- [ ] **T7b 공개 헤더 · 푸터** — `PublicHeader` 내비 `Home · Docs · Changelog`(GitHub 제거, `current: "changelog"`, `header.tsx:25·33`), `FOOTER_LINKS` 끝에 `Changelog`, 라벨 `m.changelog.title`.
  검증: `components/__tests__/public-shell.test.tsx` 갱신 green —
  - :125-135 내비 순서 Home·Docs·Changelog.
  - :147-150 `/docs`의 `aria-current` 배열.
  - **:190-193 "랜딩 헤더 GitHub 정확히 1건"을 "헤더 GitHub 0건"으로 뒤집는다**(지우면 헤더에 GitHub가 돌아오는 회귀를 못 잡는다).
  - :241-247 푸터 순서에 Changelog.
  수동(ego-browser): 랜딩·`/privacy`·`/docs`·`/changelog` 헤더에 GitHub 없음, 그 넷 + `/signin`·초대 푸터 끝에 Changelog.

## 커밋 5 — 앱 셸 링크 (`feat(shell): point Changelog at the in-app page`)

- [ ] **T8 `navFooterItems` · `user-menu`** — 외부 → 내부, 라벨 `m.changelog.title`, `m.common.nav.releaseNotes` 삭제. 소비자 `sidebar.tsx:101` · `landing/mockup/app-frame.tsx:30` · `user-menu.tsx:80`(→ `MenuLink`).
  검증: 갱신 green —
  - `lib/shell/__tests__/nav.test.ts:318`, :9의 고아 `GITHUB_RELEASES_URL` import 제거.
  - `components/__tests__/user-menu.test.tsx:31-64`(행 순서 · href · `target` 없음 — 내부 항목 규칙).
  - `sign-out-pending.test.tsx:36-44`.
  - `landing-mockup.test.tsx:74` · `landing-page.test.tsx:120`.
  수동: 사이드바에서 클릭하면 같은 탭에서 `/changelog`가 열린다. 랜딩 목업 LNB에 `Changelog`.

## 게이트 · 문서 (별도 커밋)

- [ ] **T9** `pnpm typecheck` + `pnpm test` + `pnpm build` green. 빌드가 GitHub를 부르지 않는지(페이지가 동적이고 sitemap이 정적) 빌드 로그로 본다.
- [ ] **T10** `docs(PRODUCT)`: §7.7 IA에 `/changelog`. :530 sitemap 목록 · :532 "공개 넷" canonical 목록 · :570-571 헤더 `Home · Docs · GitHub · Get started` → `Home · Docs · Changelog · Get started` · :687 8-3 하단 항목(`Release notes · Docs` → `Changelog · Docs`)과 "GitHub Releases 외부 링크" 설명. 뒤집은 판정 셋의 근거(spec "뒤집는 근거")를 옮긴다. 확인: `grep -n "Release notes\|Home · Docs · GitHub" docs/PRODUCT.md` 0건.
- [ ] **T11** `docs(DESIGN)`: 공개 셸 화면 목록에 추가, 시안 이탈값(800 한 겹 그릇 · 앵커 자기 링크 · `h4` 급) 등재, "본문이 사전을 지나지 않는 유일한 공개 텍스트" 명시. 고칠 행: :32 · :644 · :654 · :772 · :800(공개 셸 화면 셋 → 넷) · :810 · :811 · :814 · :840(시행일 "날짜 포맷터를 새로 만들지 않는다" → `utcDay`) · :1603(행 접근 이름 예시 형) · :1709-1710. 확인: `grep -n "Release notes\|Home · Docs · GitHub\|[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\} [0-9]\{2\}:[0-9]\{2\} UTC" docs/DESIGN.md` 0건.
- [ ] **T11b** CLAUDE.md 코드 컨벤션 "날짜" 항목을 새 형(`Sep 27, 2026` / `Sep 27, 2026 16:34 UTC`, 생산자 `lib/utc-time.ts`)으로 고치고 `pnpm sync:agents`를 돌린다. `lib/utc-time.ts` 머리 주석의 L7.1 형도 고친다(T0a).
- [ ] **T12** `docs(DIRECTORY)`: `lib/changelog/` · `components/changelog/`.
- [ ] **T13** `.claude/commands/merge.md` 5단계 ②에 "이 양식이 `/changelog` 화면 문구다 — 이미지는 링크로 바뀐다"를 한 줄 추가하고, `pnpm sync:agents`를 돌린다.
- [ ] **T14** README에 사용자 노출 링크·날짜 예시가 있으면 대조한다. `/privacy` 참 여부를 확인한다(`/push` 4단계). `guide/`·SHOOTING 매핑에 `Release notes`·헤더 GitHub·옛 시각 형이 찍힌 스크린샷이 있는지 `pnpm guide:check`와 grep으로 본다.
- [ ] 기능 종료 시 결론을 정본에 올리고 `docs/features/changelog/`를 지운다.

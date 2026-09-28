# changelog — tasks

시안: Claude Design `Changelog.dc.html` · `Changelog Page.dc.html` (2026-09-28 수령, 판정 반영 완료).

## 커밋 1 — 순수 함수 (`feat(changelog): parse GitHub releases`)

- [ ] **T1 `parseReleases`** — 테스트를 먼저 쓴다. 사례는 draft · prerelease · 액션 태그(`malmoi-i18n-push-v2`) · `published_at` null · `body` null · 같은 시각 두 건 · 형 불일치(`null`)이고, 픽스처는 실제 `v1.0.0`·`v1.0.1` 응답 발췌다.
  검증: `pnpm test lib/changelog` green.
- [ ] **T2 `releaseAnchor` · `releaseUrl` · `changelogDate`** — 날짜는 `Sep 27, 2026`(UTC). `2026-09-27T16:34:14Z` → `Sep 27, 2026` 경계 사례를 `TZ=Asia/Seoul`에서도 고정한다.
  검증: 단위 테스트 green.
- [ ] **T3 `shiftHeadings` · `dropFullChangelog` remark 플러그인** — `##`→`h3`, `###`→`h4`, `h6`에서 상한. 마지막 문단의 `**Full changelog:**`만 제거한다(중간 문단·1.0.0처럼 줄이 없는 본문은 그대로).
  검증: 단위 테스트 green. mdast 입력 → 출력을 단언한다.

## 커밋 2 — 껍데기 (`feat(changelog): load releases with hourly revalidate`)

- [ ] **T4 `loadReleases`** — `fetch`를 mock한다. 단언할 것은 URL · `next.revalidate: 3600` · 헤더 · 타임아웃 시그널이다. 실패(비 2xx · throw · 파싱 `null`)는 `{ ok: false }`이고 **던지지 않는다**.
  검증: 단위 테스트 green. `credential-separation.test.ts` green.

## 커밋 3 — 페이지 + 공개 배선 (`feat(changelog): public changelog page`) — 시안 이후

- [ ] **T5 렌더러 · 항목 컴포넌트** — `/design-sync`로 `Changelog.dc.html` 1a–1d에 맞춘다(720 한 열 그릇 · 항목 머리 · `View on GitHub` · 네이티브 버전 앵커). raw HTML 미렌더 테스트(jsdom): 본문 `<script>`·`<img onerror>`가 DOM 요소로 생기지 않는다.
  검증: DOM 테스트 green, `/design-sync` 실측 통과.
- [ ] **T6 `app/changelog/page.tsx` + `routes.changelog` + `EXEMPT` 등재 + 사전 `changelog` 묶음**.
  검증: `entry-points.test.ts` · `no-korean-ui` green. 로컬에서 로그아웃으로 200, `#v1.0.1` 착지. 네트워크를 끊거나 URL을 틀려 1c 안내가 뜨는지, 복구 뒤 재시도에서 목록이 뜨는지(실패가 캐시되지 않음)를 ego-browser로 확인한다.
- [ ] **T7 sitemap · analytics 허용 목록**.
  검증: `crawl.test.ts` · `analytics.test.ts` 갱신 green.
- [ ] **T7b 공개 헤더 · 푸터** — `PublicHeader` 내비 `Home · Docs · Changelog`(GitHub 제거, `current: "changelog"`), `FOOTER_LINKS` 끝에 `Changelog`.
  검증: 헤더·푸터 DOM 테스트 갱신 green. 랜딩·`/privacy`·`/docs`·`/signin`에서 ego-browser로 헤더에 GitHub가 없고 푸터 끝에 Changelog가 있는지 확인한다.

## 커밋 4 — 앱 셸 링크 (`feat(shell): point Changelog at the in-app page`)

- [ ] **T8 `navFooterItems` · `user-menu`** — 외부 → 내부, 라벨 `Release notes` → `Changelog`(key·사전 키 `releaseNotes` → `changelog`).
  검증: `nav.test.ts:318` 갱신 green. 사이드바에서 클릭하면 같은 탭에서 `/changelog`가 열린다.

## 게이트 · 문서 (별도 커밋)

- [ ] **T9** `pnpm typecheck` + `pnpm test` + `pnpm build` green.
- [ ] **T10** `docs(PRODUCT)`: §7.7 IA에 `/changelog`를 올리고, 8-3 뒤집힘 문단의 하단 항목(`Release notes · Docs` → `Changelog · Docs`)과 "GitHub Releases 외부 링크" 설명을 고친다. `lib/shell/nav.ts` 머리 주석의 같은 문구도 T8에서 고친다.
- [ ] **T11** `docs(DESIGN)`: 공개 셸 화면 목록에 추가, 시안 이탈값 등재, "본문이 사전을 지나지 않는 유일한 공개 텍스트" 명시.
- [ ] **T11b** CLAUDE.md 코드 컨벤션 "날짜" 항목에 `/changelog`의 `Sep 27, 2026` 예외 한 줄을 넣고, `pnpm sync:agents`를 돌린다. DESIGN에 720 한 열 그릇 · 공개 헤더 내비 변경(GitHub 제거)을 등재한다.
- [ ] **T12** `docs(DIRECTORY)`: `lib/changelog/` · `components/changelog/`.
- [ ] **T13** `.claude/commands/merge.md` 5단계 ②에 "이 양식이 `/changelog` 화면 문구다"를 한 줄 추가하고, `pnpm sync:agents`를 돌린다.
- [ ] **T14** README에 사용자 노출 링크가 있으면 대조한다. `/privacy` 참 여부를 확인한다(`/push` 4단계).
- [ ] 기능 종료 시 결론을 정본에 올리고 `docs/features/changelog/`를 지운다.

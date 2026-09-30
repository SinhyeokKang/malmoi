# component-unify — tasks

순서: **재조사 → 토큰(값 0 변화) → API 규약 → 형제 통합 → 새 프리미티브(+이관 같은 커밋) → 값이 바뀌는 교정 → 그물 → 문서.**
`[commit]`이 커밋 경계이고 **경계마다 `pnpm gate` green**(출력을 파이프로 거르지 않는다). 라벨: **[자동]** 테스트 · **[수동]** 브라우저 레이아웃 QA.
**신설·통합 태스크는 그 프리미티브의 "ui 밖 사본 0" 스캔 테스트를 같은 커밋에 넣는다**(design §5).

## 0. 착수 전

- **T0** 재조사 — `ux-drift-unify` 종료 뒤 dev에서 설문 세 갈래(손 조립·API·토큰)를 다시 돌려 design §4 "흡수" 열·§6 수치를 갱신한다.
  ux-drift가 이미 해소한 행(닫기 버튼·Sources hover·배지 글리프 등)은 지운다. design §7 C1–C6 답을 spec "사용자 결정"에 적는다.
  검증 [수동]: design §4·§6의 모든 행에 갱신 날짜와 현재 file:line이 있다.
  `[commit] docs(feature): component-unify refreshed inventory`

## A. 토큰 — 값 변화 0

- **T1** 철자 접기(design §6.1). 검증 [자동]: `visual-system.test.ts`에 "같은 값 두 철자 0" 규칙 + 카나리아 · `pnpm test` green. [수동] 1280 스크린샷 전후 동일(대표 6화면).
- **T2** 토큰 신설(C5 확정분) + raw 사용 교체. 검증 [자동]: 토큰 값의 raw 사용 0 스캔 · `lib`·`messages` 포함 · 접두 확장.
- **T3** `@theme` 소비자 0 색 정리(C4) · 이메일 hex 대조 테스트. 검증 [자동]: `globals-css.test.ts`가 남은 토큰마다 소비자 ≥1 또는 사유 · hex 대조 green.
  `[commit] refactor(tokens): one spelling per value and tokens for repeated values`

## B. API 규약

- **T4** 규약 스캔 테스트 먼저(design §3 표 행마다 — red로 시작). 검증 [자동]: 위반 목록이 design §3 "지금 어긋난 곳"과 일치.
- **T5** 이름 교정 — 상태 색 `tone`, `toneFill` → `hueFill`, 슬롯 이름, a11y 철자, `*ClassName` 제거, rest props·`data-tone`. 소비자 전수 교체(형제 export마다 따로 센다).
  검증 [자동]: T4 green · `pnpm typecheck`.
- **T6** tone→variant 매핑 하나(`canon.ts`) — `ResultBadge`·`SourceStatus`·`event-detail:127` 사본 삭제, `StatusBadge`로. 검증 [자동]: 사본 0 스캔 · 해당 화면 스위트.
  `[commit] refactor(ui): one naming contract across primitives`

## C. 형제 통합

- **T7** Card(C1) — 머리 슬롯 합집합, `CardRows`/`CardList`. 소비자 18곳 이관. 검증 [자동]: `card-head.test.ts` 갱신 · 사본 0 · [수동] 카드 전수 머리 선 1개.
- **T8** EmptyState `placement`(+`EmptyRowCard` 흡수) · NoMatch · ErrorState. 검증 [자동]: placement 셋 렌더 테스트 · 오류 경계 전부 같은 컴포넌트 스캔.
- **T9** LargeModal(C2) — wizard 바닥 분리 · `event-dialog` 흡수 · `100svh`. 검증 [자동]: `modal-initial-focus`·`onboarding-modal` green · 1024 껍데기 사본 0 · [수동] 포커스 복귀(POSTMORTEM 2026-09-20·24).
- **T10** ButtonLink `external` · Button `size="icon-*"`·스피너 크기. 검증 [자동]: `<a className={buttonClass()}>` 0 · `[&_.animate-spin]:size-` 0 · 포커스 링 스캔.
  `[commit]` 태스크마다 하나 — `refactor(ui): …`

## D. 새 프리미티브 (+ 이관 같은 커밋)

- **T11** ListRow(`PanelRow` 확장, C6) — 누르는 행 5 · 정적 2 · 두 줄 본문 14 · Button 행 3 · `ListItemButton`. [수동] 행 높이·hover 전후.
- **T12** SelectRow · SecretField · CopyButton 이동 · Facts · Meter · Popover · ProjectThumbnail · SearchInput · Skeleton 기본값 · Link(인라인).
- **T13** ArchivedNotice(C3 결정 후). 각 검증 [자동]: 프리미티브 렌더 테스트 + ui 밖 사본 0 + 카나리아.
  `[commit]` 프리미티브마다 하나 — `feat(ui): …`

## E. 값이 바뀌는 교정

- **T14** design §6.3 목록(T0 갱신분). 검증 [수동]: 레이아웃 QA 1280·1440·1890 — 바뀐 자리만 바뀌었다.
  `[commit] fix(ui): …`

## F. 그물 · 문서

- **T15** 렌더 계약 테스트 공백(design §5) · sr 상태 줄 glob 테스트. 검증 [자동]: 공백 표 전부 ✓.
- **T16** DESIGN §2.1·§4·§5·§6.4·§8(API 규약 표) · `globals.css` 주석 · DIRECTORY. 검증 [수동]: design §6.4 목록 전부 ✓.
- **T17** 기능 종료 — 결론을 정본으로 올렸는지 확인하고 디렉터리 삭제. 검증 [자동]: `pnpm gate` green.
  `[commit] docs: close component-unify`

## 후속

- `/runtime-test` 레이아웃 QA(극단 데이터 포함) · `/guide-shots`(모양이 바뀐 컷).

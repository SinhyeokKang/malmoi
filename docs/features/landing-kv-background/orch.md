# landing-kv-background — orch

> 지휘 계획. 원본은 [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md) · [design-brief](./design-brief.md)이고 여기에 복제하지 않는다.
> 착수 2026-10-18 · 시작 dev `be88153f` · 지휘자 Claude Code(Opus 5.5) · 끝은 dev push다(`/merge`는 사용자가 부른다).

## 착수 범위

tasks T1–T8 전부. 스키마·마이그레이션·새 환경변수·새 패키지 없음 — 셀프 호스팅 체크리스트 해당 없음.

## 결정 기록

| # | 결정 | 출처 |
|---|---|---|
| D1 | `lg` 미만에도 적용한다(숨기지 않는다) | 사용자 2026-10-18 (spec 머리말) |
| D2 | 그라디언트는 CTA 아랫변 = 패널 바닥에서 끝난다 | 사용자 2026-10-18 |
| D3 | 터치 기기는 자동 순회 상시, 모션 감소면 정적 | 사용자 2026-10-18 |
| D4 | 랜딩 패널만 보더·그림자 없음 — `PublicShell` `kv` 갈래, `/docs`·`/privacy`·`/changelog`는 바이트 단위로 불변 | 사용자 2026-10-18 (시안 K1 주석 채택, design R13) |
| D5 | `kv` 갈래는 `bg-background`도 뺀다 — 고무줄 스크롤 때 패널 바탕 띠 | 사용자 2026-10-18 (질문 응답) |
| D6 | 그라디언트 위 Light 대비 부족(3.68 · 4.01 · 4.38, 알약 면 1.01)을 보정하지 않는다 | 사용자 2026-10-18 (spec 비목표) |
| D7 | `follow="scroller"`는 `pointerType === "mouse"`만 실제 커서로 친다 | 지휘자 판단 — D3(터치 자동 순회 상시)을 지키려면 탭이 가상 커서를 끌면 안 된다(design §3 R7) |
| D8 | T8(가이드·README 재촬영) 대상 없음 | 지휘자 판단 — `guide/SHOOTING.md` 매핑에 랜딩·공개 셸 소스가 없고 README `hero.webp`는 번역 편집기 컷이다. push 전 `pnpm guide:check --json` stale 0으로 확인한다 |
| D9 | 워커는 Claude Code(Opus 5.5)만 쓴다 | 지휘자 런타임 경계 — 패밀리 교차 허가 없음 |

## 배치

| 배치 | tasks | 소유 파일(쓰기) | 선행 | 워커 · 모델 · effort | 출시 차단 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|---|
| A | T1 · T2 | `lib/signin/dot-field.ts` · `lib/signin/__tests__/dot-field.test.ts` · `components/signin/dot-field.tsx` · `components/__tests__/dot-field.test.tsx` | — | 워크트리 · Opus 5.5 high — 로그인 동작 바이트 불변 + 리스너·rAF·묶음 그리기 판정이 얽혀 있다 | 예 | `pnpm gate --base dev` · 독립 리뷰 | 대기 |
| B | T3 (DotField 삽입 제외) | `app/page.tsx` · `components/landing/stage.tsx` · `components/public-shell/public-shell.tsx` · `components/__tests__/public-shell.test.tsx` · 랜딩 DOM·소스 테스트 | — | 워크트리 · Opus 5.5 medium — `--landing-stage-h` 이동이 스테이지 높이 판정에 닿는다 | 예 | `pnpm gate --base dev` · 독립 리뷰 | 대기 |
| B2 | T3 나머지 — `<DotField follow="scroller">` 삽입 + 그 DOM 단언 | `app/page.tsx` · 랜딩 테스트 | A·B 통합 | B 터미널 새 Task · 같은 모델 | 예 | `pnpm gate --base dev` · 지휘자 diff 확인 | 대기 |
| DS | T4 `/design-sync` — `Landing KV Background.dc.html`(3a–3h · 2a–2c) + `Landing KV Background Narrow.dc.html`(K1–K5) | 없음(리포트 전용 · BugShot) | B2 통합 · **push 전** | main 체크아웃 QA 워커 · Opus 5.5 medium | 예 | 불일치 0 — 결함은 A/B 워커가 고친다 | 대기 |
| QA | T5 · T6 `/runtime-test` (로컬 · Light·Dark · 1280·768·375 · 정적 흐름 · `/signin`·`/docs`·`/privacy`·`/changelog` 불변) | 없음(리포트 전용 · BugShot) | DS 뒤 dev push | DS와 같은 워커의 새 Task(단일 QA 워커) | 예 | 이슈 0 또는 수정·재실측 완료 | 대기 |
| DOC | T7 정본 갱신(DESIGN §6.615 · §6.62 · 공개 셸 절 · 토큰 소비자 표 · DIRECTORY) + 이 디렉터리 삭제 | `docs/DESIGN.md` · `docs/DIRECTORY.md` · `docs/features/landing-kv-background/` | QA 완료 | 남은 워커(B 우선) 새 Task · Sonnet 5.5 medium로 새로 띄우면 그 값 | 아니오 | `/push` 4단계 문서 신선도 | 대기 |
| T8 | 가이드 영향 | — | push 전 | 지휘자 | 아니오 | `pnpm guide:check --json` stale 0 (D8) | 대기 |

### 파일 겹침

A와 B는 쓰기 파일이 겹치지 않는다 → **병렬**. B는 `DotField`의 `follow` prop을 쓰는 한 줄(캔버스 삽입)만 A에 기댄다 → 그 몫을 B2로 떼었다. B 브리프는 기다리지 말고 그 항목을 남긴 채 `worker_done`을 보내게 한다. `messages/*.tsx`는 문구 변경이 없어 아무 배치도 건드리지 않는다.

### 주인 없는 tasks 항목 대조

T0(완료) · T1 A · T2 A · T3 B+B2 · T4 DS · T5 QA · T6 QA · T7 DOC · T8 지휘자 — 0건.

## 진행 기록

(통합 커밋 · 리뷰 라운드 · 검증 결과 · 이슈를 여기에 쌓는다)

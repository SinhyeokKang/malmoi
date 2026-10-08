# user-menu-projects — orch

원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md). 이 문서는 지휘 계획과 진행 상태만 든다.

- 착수: 2026-10-09 · 시작 dev `8f9fdcb3`
- 지휘: Claude Code(Opus 5.5) — 워커 패밀리 Sonnet·Opus

## 결정 기록

| # | 결정 | 출처 |
|---|---|---|
| D-1 | T5 QA 데이터: OWNER 비보관 6개를 맞추려 **폐기용 프로젝트 2개를 만들고 남겨 둔다**(상주 QA 데이터로 편입). 하나는 긴 이름 · 하나는 썸네일 없음. 기존 상주 4개·보관 `malmoi`는 건드리지 않는다 | 사용자 2026-10-09 |
| D-2 | T1–T4는 **한 배치(A)로 직렬** — `switcher.ts`·`project-switcher.tsx`·`user-menu.tsx`·`user-menu.test.tsx`가 태스크마다 겹친다 | 지휘자 판단 — 파일 겹침 행렬 |
| D-3 | T6 정본 문서는 **배치 A가 문서별 커밋으로** 쓴다(design "문서 갱신" 목록 + responsive-public P-01·P-06 · responsive-app A-01 등재). 기능 디렉터리 삭제는 QA 뒤 지휘자가 한다 | 지휘자 판단 — 결정 근거를 쥔 워커가 쓰는 편이 드리프트가 적다 |
| D-4 | 가이드 영향 없음 — `/guide`·`/guide-shots` 안 부른다 | design "문서 갱신" — SHOOTING 매핑 0 |

## 배치

| 배치 | 항목 | 소유 파일 | 선행 | 워커 | 출시 차단 | 게이트 | 상태 |
|---|---|---|---|---|---|---|---|
| A | T1·T2·T3·T4·T6 | `lib/shell/switcher.ts`(+test) · `components/shell/project-menu-item.tsx`(신규) · `project-switcher.tsx` · `user-menu.tsx` · `components/shell/header.tsx` · `components/__tests__/{user-menu,shell-header,public-shell}.test.tsx` · (공유 조각이 생기면) `attention-inbox.tsx` · 문서 | — | Claude Opus 5.5 high — Promise identity 회차·포커스 노드 동일성·asChild 회귀 등 POSTMORTEM 다섯 건을 지는 판단 | 예 | `pnpm gate --base dev` · 독립 리뷰 🔴 0 | 대기 |
| QA | T5 | 코드 수정 없음 · main 체크아웃 | A가 dev에 | Claude Opus 5.5 medium — computed style 실측 + 스위처 회귀 | 예 | 관측 기록 · 결함은 BugShot | 대기 |

병렬 없음(배치 하나 + 직렬 QA).

## 진행 로그

- (비어 있음)

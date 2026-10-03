# search-ux-polish — 지휘 계획 (`/orchestrate`)

search-ux-unify(dev `22ed879c`까지) 뒤처리 두 갈래를 병렬로 태운다. 시작 dev: `22ed879c` (2026-10-03). 끝은 dev push다 — `/merge`는 사용자가 부른다.

- **갈래 1 — UX 재감사 범위 밖 🟡 4건**: 원문은 2026-10-03 `/ux-audit` 리포트 §0·§2′(로컬 `.scratch/orch-sup/ux-audit-REPORT.md` — gitignore라 아래 표가 항목의 정본이다).
- **갈래 2 — design-sync**: 승인된 디자인 정본 Claude Design [`Search UX.dc.html`](https://claude.ai/design/p/b99d54cd-3034-44f1-8446-0a864da9d767?file=Search+UX.dc.html)(로컬 사본 `.scratch/orch-sup/Search UX.dc.html`)과 구현을 프레임별로 대조한다. search-ux-unify는 정본을 준비해 두고도 design-sync를 돌리지 않았다(사용자 2026-10-03 — "정본이 존재했잖음. 디자인 싱크했어야지").

## 항목 — 갈래 1 (P)

| # | 항목 | 고칠 것 | 결정 |
|---|---|---|---|
| P1 (S2) | 보관 시각 문장이 세 형 — Sources `Archived — {date}`(`components/sources/sources-archived.tsx:33`, 낱말은 `m.logs.archived.badge` `en.tsx:1432`), Logs `Archived on {date}. …`(`en.tsx:1434`), Settings `Archived on {date}`(`en.tsx:1484`) | `Archived on {date}` 한 형, 낱말은 `STATE.archived.label` | 리포트 정본 제안 |
| P2 (W1) | 축약형 갈림 — `en.tsx:1897` `you are` ↔ `:3622`·`:3677` `you're`. 같은 부류 ⚪ W3 `en.tsx:2749,2798`의 `It is` | `you're`·`it's`. `terminology.test.ts:174` `CONTRACTIONS`에 `you are`·`it is` 추가 | 리포트 정본 제안 |
| P3 (Q2) | 단독 버튼 결과 Dialog의 `[Review again]`만 default(`components/translations/workspace/workspace.tsx:1030`) ↔ 셋은 primary | **primary**. DESIGN §6.4에 "결과 Dialog의 단독 버튼 = primary" 명시 | 사용자 2026-10-03 |
| P4 (Q3) | MCP 토큰 모달만 `Done`(`en.tsx:2012`, `components/mcp/token-modal.tsx:128`) ↔ `Close` | **`Close`로 통일**(§10.1 예외 없음) | 사용자 2026-10-03 |

## 결정 기록

| # | 결정 | 근거 |
|---|---|---|
| O1 | Q2 = primary, Q3 = `Close` | 사용자 2026-10-03 |
| O2 | design-sync는 **`--audit` 모드로 main 체크아웃에서** 돈다(dev 서버·`.env.local` 필요). 결함은 BugShot(`[design-sync]` 태그)으로 내고, 수정은 **별도 워크트리의 수정 워커(DF)**가 한다 — 지휘자는 코드를 고치지 않는다. 수정이 dev에 들어가면 같은 감사 워커(또는 새 워커)가 재실측한다 | `/orchestrate` 규칙 + design-sync 3단계를 워커 둘로 나눔 |
| O3 | **문서화된 이탈은 이탈이 아니다** — search-ux-unify 결정이 시안 뒤에 정한 것: D15 그룹 머리 `text-gray-dim`(시안도 같음) · O9 첫 열림 활성 = 첫 행 · #173 활성 이동은 mousemove만 · U1 보관 프로젝트 Pages 행 배지 · `hover:bg-transparent` 비활성 행만 · `CommandStatus` 묶음 · `/docs` 질의 중 개요 문서 한 행. 정본 문서(`docs/DESIGN.md` §6.4·§6.54 등)에 적힌 것은 코드가 이긴다 | design-sync §2 "문서화된 이탈" |
| O4 | Safari는 범위 밖(이전 orch O2 그대로) — Chromium만 잰다 | 사용자 2026-10-03 |
| O8 | **상태 칩 여백은 `px-1.5`로 통일**(코드베이스 기준 — 문구 배지 49곳 중 47곳이 `Badge` 기본). 스위처·`/projects`의 `px-2` 덧칠을 걷는다. 시안 B1의 `px-2`는 따르지 않고 #174는 결함 아님으로 닫는다 | 사용자 2026-10-03 (DS 판단 요청) |
| O5 | 워커 모델: Claude Code 지휘 → Opus 5.5·Sonnet 5.5, effort ≤ high | `/orchestrate` 0단계 |
| O6 | **갈래 3 — `/guide-shots` 전부 재촬영 + README 이미지**("계속 미뤄서 이번에 다 찍어야함"). 대상: `pnpm guide:check` stale 전부(직전 25컷 · 밀린 `create-ready` 포함) + README 두 장(`hero` · `logs`) + 이번 변경이 바꾼 화면. **번역 페이지 컷은 랜딩 목업과 유사한 씬**(`m.landing.mockup` — `Acme web` · 소스 `web`/`emails` · 네임스페이스 `cart`·`checkout`·`common`·`product`…, 트리에 네임스페이스가 많아 보이게). 모든 UI 변경(P·DF)이 dev에 들어간 뒤 main 체크아웃에서 직렬로 돈다 | 사용자 2026-10-03 |
| O7 | 목업 씬 데이터는 **상주 촬영 프로젝트**(2026-10-03 번복 — 지우지 않고 이후 스크린샷 갱신마다 재사용): `bugshot-i18n-test-qa3`(base 브랜치 삭제로 sync 실패)를 **영구 보관**해 OWNER 한도 자리를 비우고 → 촬영 리포 `i18n-format-check`에 목업과 같은 소스·네임스페이스 로케일 픽스처를 **커밋**(리포 쓰기 승인) → 그 리포로 `Acme web` 프로젝트 생성·적재 → 촬영. 삭제하지 않는다. `i18n-order-check`는 건드리지 않는다. dev 전/후 표 + `guide/SHOOTING.md`에 상주 촬영 프로젝트 절차를 정본으로 적는다 | 사용자 2026-10-03 |

## 배치

| 배치 | 내용 | 워커 · 모델/effort (이유) | 위치 | 선행 | 상태 |
|---|---|---|---|---|---|
| **P** | P1~P4 | Sonnet 5.5 medium — 문구·variant 기계 수정 + 테스트 | 새 워크트리 `sup-p` | — | 대기 |
| **DS** | `/design-sync --audit` 전 프레임(H1·H2·S1~S11·W1·K1·B1) | Opus 5.5 high — 문서화된 이탈 판정이 많다 | main 체크아웃(dev) | — | 대기 |
| **DF** | DS가 낸 design-sync 결함 수정 | Opus 5.5 medium | 새 워크트리 `sup-df` | DS 리포트 | 대기 |
| **R** | P·DF diff 독립 리뷰 | Opus 5.5 high — 리포트 전용 | 해당 워크트리 | 각 배치 완료 | 대기 |
| **DS2** | DF 반영 뒤 재실측 + 이슈 닫기 | Opus 5.5 medium | main 체크아웃 | DF dev 통합 | 대기 |
| **GS** | `/guide-shots` 전부 + README(O6·O7) | Opus 5.5 medium — 마스킹·씬 구성 판단 | main 체크아웃(커밋은 `public/guide/`·`docs/assets/readme/`·`guide/SHOOTING.md`만) | P·DF dev 통합 + DS2 | 대기 |

## 파일 겹침 → 순서

| 파일 | P | DF |
|---|---|---|
| `messages/en.tsx` | ✔ | (가능) |
| `docs/DESIGN.md` | ✔(§6.4·§10.1) | (가능) |
| `components/ui/command.tsx`·`components/search/*`·`kbd`·`field-button`·헤더 | | ✔(가능) |

- P ∥ DS(DS는 읽기·실측만). DF는 DS 리포트 뒤에 띄우고, P가 dev에 들어간 뒤 `git rebase dev`로 시작한다(겹침 `en.tsx`·DESIGN).
- ⚠️ DS가 main 체크아웃에서 `pnpm dev`를 쓰는 동안 cherry-pick·build 금지 — P 통합은 DS 인계 뒤.

## 검증 게이트

- 워커: 커밋 경계마다 `pnpm typecheck && pnpm test`, 끝에 `pnpm gate --base dev`(파이프 금지).
- 지휘자 통합: cherry-pick → `pnpm gate` `gate: ok` → push.

## 진행 기록

| 시각 | 사건 |
|---|---|
| 2026-10-03 | orch.md 작성, dev `22ed879c`. Run `run_1ee53ed0f3b0` |
| 2026-10-03 | P 시작(`sup-p`, Sonnet medium) ∥ DS 시작(main 체크아웃, Opus high) |
| 2026-10-03 | 갈래 3(GS) 추가 — 사용자 지시, 일회용 프로젝트 승인(O6·O7) |
| 2026-10-03 | O7 번복 — 촬영 프로젝트 상주(qa3 영구 보관 · 픽스처는 촬영 리포에 커밋) |
| 2026-10-03 | P(+fix1) 5커밋 dev 통합(`de98d385..f7bf0910`), gate ok. DS 감사: 결함 4(#174~#177) — #174는 O8로 결함 아님(닫음). DF 시작(#175·#176·#177 + O8) |

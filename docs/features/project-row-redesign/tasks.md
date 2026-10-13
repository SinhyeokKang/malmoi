# project-row-redesign — tasks

> 순서: 시안 수령 → 순수 함수 → 로더 → UI → 시안 대조 → 정본 문서. 커밋 경계는 `──`로 표시한다.
> design.md "결정" 다섯(2026-10-14)이 브리프에 반영돼 있다. 결정 5(조회 실패 띠 문구)는 T0에서 시안 제안을 받아 확정한다.

## 0. 시안
- [ ] **T0 — Claude Design 시안 수령.** `design-brief.md`를 넘기고 핸드오프를 받는다. 프레임 표의 번호가 전부 있는지 확인한다.
  - 검증: `DesignSync list_files`에 핸드오프가 있고 브리프 프레임 1–14가 각각 그려져 있다.
  - 시안이 design.md의 판정(상태 표·메타 셋)과 다르면 **코드 전에 어느 쪽을 고칠지** 사용자에게 묻는다.

──

## 1. 순수 함수 (`/tdd interface` → `/implement`)
- [ ] **T1 — `projectLanguageProgress`** (`lib/projects/list.ts`). 소스 합치기 · base 제외 · 덜 된 것 먼저 · `hidden` · orphaned 거름 · 분모 0.
  - 검증: 새 단위 테스트 green — 소스 둘(`api` en/ko/ja/fr, `web` en/ko/de)에서 `de`가 빠지지 않는다 · 두 소스의 `ko`가 한 막대로 합쳐진다 · base 코드가 결과에 없다.
- [ ] **T2 — `planProjectRow`** (`lib/projects/list.ts`). design.md 상태 표 9행 전수 + 불변식 표 테스트(칩 `active` ⇔ `all_set` · 보관이면 띠 없음 · `languages`면 언어 ≥ 1).
  - 검증: 새 단위 테스트 green. 옛 `rowChip`·`projectGroup`·`meterSlot` 테스트는 새 함수로 옮기고 함수는 지운다(소비자가 사라진 고아). `rowBanner`는 `planProjectRow` 안으로 접힌다.
- [ ] **T3 — 대표 메타 재료** — 언어 수(T1의 `count`) · 키 수 · 마지막 동기화(`max lastImportedAt`). 필요하면 `projectRowMeta` 순수 함수.
  - 검증: 단위 테스트 green — 키 수가 `MembershipRow.keyCount`와 같은 정의(비보관 소스의 비-orphaned 키 합).

──

## 2. 로더
- [ ] **T4 — `loadProjectList` 재료 교체** (`lib/keys/query.ts`). `meters` → `languages: ProjectLanguages` · `keyCount` · `lastSyncedAt` select 추가. 새 왕복 없음, 전부 `projectId in ids`.
  - 검증: `pnpm typecheck` · `pnpm test` green · `pnpm test:projects:postgres` green(`pnpm gate`가 트리거로 붙인다) · 사이드바 배지 키 수와 행 키 수가 같은 프로젝트에서 같다(교차 테스트).

──

## 3. UI (`/implement`, 시안 기준)
- [ ] **T5 — 행 재조립** (`components/projects/project-list.tsx`). `planProjectRow` 하나를 읽고, 행 전체가 `withRepoHost`를 지난다. 둘째 줄 상태 문장 제거.
  - 검증: DOM 테스트 — GitLab 행 렌더에 `GitHub` 0건 · 칩 낱말과 둘째 줄 문장 교집합 0 · 보관 행 띠 없음 · 행이 `<a>`, 띠가 형제 · `ring-inset` 유지.
- [ ] **T6 — 언어 막대** — 시안이 `LocaleMeter`를 바꾸면 그 컴포넌트를 고친다(소비자 하나). `hidden > 0`이면 "몇 개 더"가 선다.
  - 검증: DOM 테스트 — 언어 5개 프로젝트에서 막대 3 + `+2`.
- [ ] **T7 — 사전** (`/translate` 모드 ①) — 새 en 키를 세 사전에 같은 커밋으로. 소비자를 잃은 `projects.meter.note.*`·`onGitLab.meter`를 지운다. 새 낱말은 DESIGN §10.1 표 대조.
  - 검증: `dictionary-consistency`·`host.test`·`terminology`·`gitlab-scope-sweep` green.
- [ ] **T8 — 로딩 골격** (`app/(edit)/projects/(list)/loading.tsx`) — 새 행 치수와 같게.
  - 검증: 골격 테스트 green · 브라우저에서 데이터 도착 순간 목록이 밀리지 않는다.

──

## 4. 대조·정본
- [ ] **T9 — `/design-sync`** — 시안 프레임마다 computed style + 접근성 트리 실측.
  - 검증: 실측 전부 일치 · 리뷰 지적 0.
- [ ] **T10 — 정본 갱신** — DESIGN §6.63(행·Meter·Meter 자리 문장·상태 배지·그룹 항 — "검토·열린 PR은 All set"의 근거 확장, `LocaleMeter` 소비자 서술 정정) · PRODUCT(목록 그룹 판정이 적혀 있으면) · DESIGN §10.1(새 낱말). 그 뒤 `docs/features/project-row-redesign/`를 지운다.
  - 검증: `/push` 4단계 문서 신선도 통과 · `rg -n "meterSlot|rowChip|projectGroup" docs lib components`가 0(주석의 옛 이름 포함).
- [ ] **T11 — 가이드 영향 확인** — `/projects` 행을 찍은 가이드 컷·본문이 있으면 `/guide`·`/guide-shots`. (2026-10-14 기준 `guide/SHOOTING.md`에 `project-list.tsx` 매핑 컷 없음.)
  - 검증: `pnpm guide:check`에 이 기능 경로가 걸리지 않는다.

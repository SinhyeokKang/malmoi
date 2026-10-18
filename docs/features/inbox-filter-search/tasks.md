# inbox-filter-search — tasks

> 착수 조건: language-request-todo가 dev에 들어간 뒤(Inbox 종류·렌더가 겹친다). 순서: 순수 판정 → 프리미티브 이관 → 사전 → 화면 → 확인 → 정본. 커밋 경계는 `──`. 커밋마다 `pnpm gate` green.

## 1. 순수 판정
- [ ] **T1 — `lib/inbox/filter.ts`** — `parseInboxFilter` · `inboxQuery` · `hasNarrowing` · `clearedInboxQuery` · `filterInbox`(design §1–§4).
  - 검증(자동): `lib/inbox/__tests__/filter.test.ts` — design "순수 함수" 1–3. `client-graph.test.ts` green(필터 줄이 클라이언트에서 import하므로 잎이어야 한다).

──

## 2. 프리미티브 이관
- [ ] **T2 — `components/ui/filter-menu.tsx`** — Logs 지역 `Filter`를 옮기고 Logs가 import한다(동작·마크업 불변).
  - 검증(자동): 기존 Logs 필터 테스트 green(접근 이름 `축: 값` · `active` · 메뉴 `aria-labelledby`) · 프리미티브 수를 세는 테스트·DESIGN §6.4 목록 갱신이 필요하면 같은 커밋.

──

## 3. 사전
- [ ] **T3 — `inbox.filters.*` · `inbox.search.*` · `inbox.noMatch.*`** — 종류 라벨은 기존 낱말 재사용(design §2), 세 사전 같은 커밋(`/translate` 모드 ①).
  - 검증(자동): `dictionary-consistency` · `terminology` green.

──

## 4. 화면
- [ ] **T4 — 필터 줄 + 페이지 배선** (`components/inbox/inbox-filters.tsx` · `app/(edit)/inbox/page.tsx` · `lib/routes.ts` · `components/inbox/inbox-list.tsx`).
  - 검증(자동, DOM): 필터 둘 + Clear(좁힘 있을 때만) + SearchInput · 프로젝트 메뉴 `menuitemcheckbox` · 고르면 `router.push`가 `inboxQuery` 결과로 불린다 · 좁힌 결과 0이면 `NoMatch`, 원래 0이면 `All clear` · 헤더 드롭다운·배지 테스트 green · (§5 결정에 따라) 좁힘이 있을 때 `MarkSeen` 렌더 여부.

──

## 5. 확인 · 정본
- [ ] **T5 — 런타임 확인**(`/runtime-test`, 로컬): 프로젝트 여럿·종류 여럿 fixture에서 축마다·조합 · 뒤로 가기 · 새로고침 · 375 감김 · 키보드(메뉴 열기·체크·Esc 복귀).
- [ ] **T6 — 정본**(문서별 커밋): PRODUCT "Attention inbox"(페이지 필터·검색) · DESIGN §6.545(Inbox 페이지 필터 줄) · §6.4(`FilterMenu` 프리미티브 — 소비자 Logs·Inbox) · DIRECTORY(`lib/inbox/filter.ts` · `components/ui/filter-menu.tsx` · `inbox-filters.tsx`) · 가이드 `guide/{en,ko,es}/translate/edit.md#inbox`에 Inbox 페이지 서술이 있으면 `/guide`. 그 뒤 이 디렉터리를 지운다.
  - 검증: `/push` 4단계 문서 신선도 · `pnpm guide:check --json` stale 0.

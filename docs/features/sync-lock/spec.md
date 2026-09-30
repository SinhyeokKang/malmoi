# sync-lock — spec

> **착수 조건: `ux-drift-unify` 종료 뒤.** 2026-10-01 사용자 결정 — "아싸리 강하게 잠금, 서버에서도 차단. 싱크 로딩과 싱크 결과 및 번역값 수정 차단은 작은 다이얼로그로 확실하게 보여준다."

## 사용자

**번역 편집자(주)와 Sync를 누른 OWNER.** 편집자는 지금 Sync가 도는 줄 모른 채 저장하고, 저장은 성공하지만 그 셀만 리포 값을 못 받은 unsent로
남는다("싱크했는데 이 셀만 안 바뀌었다"). OWNER는 확인 Dialog가 닫힌 뒤 결과가 Home Alert로 따로 서서, 도는 동안 무엇이 막혔는지 모른다.

## 문제 (관측 — 2026-10-01 코드 추적)

1. **저장 경로가 실행 중인 적재를 보지 않는다** — `saveTranslationKey`·MCP `set_translations` → `applyKeySave(Batch)`(`lib/keys/save-key.ts:41`)는
   `lockProjectAccess`만 잡고 `repositoryImportToken`을 읽지 않는다. 적재는 짧은 트랜잭션 넷(획득·표면 표시·적용·해제)만 잠그고 스냅샷 다운로드·파싱은
   잠금 밖이라, 그 사이 저장이 끼어든다. **값이 조용히 사라지지는 않는다**(새 `pendingEditToken`이 적용 SQL `lib/push/apply.ts:488`을 통과하지 못해 남고,
   승인 전 저장은 지문 재확인 `reconfirm`으로 Sync를 멈춘다) — 문제는 결과가 사람이 예상한 것과 다르고 아무도 그 이유를 못 본다는 것이다.
2. **화면이 적재 상태를 모른다** — `app/`·`components/`에서 `repositoryImportStartedAt`을 읽는 곳이 0이다. Revert만 서버가 `busy`로 막는다(`lib/keys/revert.ts:78`).
3. **Sync 결과가 확인 Dialog 밖에 따로 선다** — 확정하면 Dialog가 닫히고, 결과는 Home의 Alert로 온다. 번역 화면에서 누른 Sync는 결과를 어디서 보는지가 화면마다 다르다.

## 완료 조건

1. **적재 lease가 살아 있는 동안 그 프로젝트의 번역 쓰기가 서버에서 거부된다** — 저장(화면·MCP 단건·배치)·Revert(기존 `busy` 흡수). 거부는 쓰기 트랜잭션의
   Project 잠금 **안에서** lease를 읽고 판정한다(POSTMORTEM 2026-09-13 — 잠금 전에 읽은 값으로 판정하지 않는다). 거부는 아무 행도 바꾸지 않는다.
2. 판정은 순수 함수 하나(`planWriteLock` 가칭)이고 Publish 시작 게이트(`planSyncStart`)·Revert·저장이 같은 lease 술어(`isRunActive` — stale 300초 경계 포함)를 쓴다.
3. **Sync를 누른 사람**: 확인 Dialog가 닫히지 않고 같은 작은 Dialog가 진행 상태 → 결과로 바뀐다. 진행 중엔 닫을 수 없고(Escape·바깥 클릭·X 없음),
   결과는 지금 Home 결과 Alert의 문장·톤·동작(`[Try again]` 등)을 그대로 든다(§7 C3).
4. **다른 편집자**: 저장이 `sync-running`으로 거부되면 작은 Dialog가 "Sync in progress — edits are paused until it finishes" + 시작 시각(UTC)을 말하고,
   **입력한 초안은 그대로 남는다**(거부가 초안을 지우지 않는다). 번역 화면을 여는 시점에 lease가 살아 있으면 같은 사실을 처음부터 보여 주고 저장을 끈다.
5. 죽은 적재(프로세스 중단)는 기존 stale 경계(300초) 뒤 자동으로 풀린다 — Dialog 문장이 "늦어도 HH:MM UTC에 다시 열린다"를 거짓 없이 말한다.
6. MCP 쓰기 도구가 같은 거부를 받고, 외부 계약은 §7 C4 결정대로다.
7. `pnpm gate` green · 격리 postgres 스위트에 "lease 활성 중 저장 → 거부 · 행 불변" · "lease 만료(301초) 뒤 저장 → 성공" 행.

## 비목표

- **앱 전체 차단 오버레이** — 막는 것은 같은 프로젝트의 번역 쓰기다. 다른 프로젝트·Logs·읽기는 그대로다.
- **동시 편집·실시간 공동 편집**(PRODUCT §4.2) — 이것은 잠금이지 병합이 아니다. 불변식 2(병합 없음)를 그대로 지킨다.
- stale 경계(300초) 변경 — ARCHITECTURE §5.6.2의 근거(`maxDuration` 60보다 넉넉해야 한다)를 그대로 둔다.
- 설정 쓰기(base locale 선언·소스 추가·멤버)의 잠금 — 번역 값·pending 상태를 쓰지 않는다(§7 C5).

## 사용자 결정 (2026-10-01)

| # | 결정 |
|---|---|
| S0 | 강하게 잠근다 — 서버가 거부하고, 싱크 로딩·결과·편집 차단은 작은 Dialog로 확실하게 보인다 |
| C1 | 야간 적재(같은 lease)도 쓰기를 막는다 |
| C2 | CI push(`/api/push`)는 막지 않는다 |
| C3 | Sync 결과는 Dialog에만 — Home 결과 Alert를 걷는다 |
| C4 | MCP 쓰기 도구는 새 거부 코드 `sync-running` — MCP 출력 계약을 한 값 넓힌다(ARCHITECTURE §6.45 갱신) |
| C5 | 소스 추가·base locale 선언은 막지 않는다(design 추천 그대로) |

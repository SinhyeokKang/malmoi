# nightly-sync — 스펙

## 사용자

**둘 다다.** 축이 갈린다.

- **개발자(OWNER)**: 대상 리포에 워크플로를 붙이지 않았거나 못 붙인 프로젝트에서, 코드가 추가·삭제한 키가 앱에 영영 안 들어온다. 지금 유일한 수단은 수동 Sync이고, 그것을 기억해서 눌러야 한다.
- **번역 편집자(EDITOR)**: Publish한 편집이 PR 머지 전에 다른 코드 커밋의 CI 적재로 DB에서 덮여 화면에서 사라질 수 있다(아래 문제 2). 편집자는 그 이유를 알 방법이 없다.
- **둘 다**: Home 요약의 "Last sync"·"Last publish"가 사람이 한 것인지 자동화가 한 것인지 말하지 않는다.

**상충과 우선순위** (검수 2026-09-29 사용자 — 열린 PR 게이트 유지): 개발자는 새 키를 빨리 받고 싶고, 편집자는 Publish한 편집이 살아 있어야 한다. **편집자가 이긴다** — Malmoi PR이 열린 동안 리포 → DB 적재(CI·야간)가 멈춘다. 푸는 사람은 PR 리뷰어다(머지하거나 닫는다). 그 대가는 아래 "대가"에 적는다.

## 문제 (관측된 사실)

1. **워크플로 없는 프로젝트는 리포 → DB가 멈춘다.** 워크플로는 선택 사항이다 — 첫 적재는 서버가 트리를 직접 읽고(PRODUCT §7.4), App은 Workflows 권한을 요구하지 않아 복사용 YAML만 낸다(PRODUCT §10). 붙이지 않으면 첫 적재 뒤로는 수동 Sync뿐이고, 그 공백이 어디에도 표시되지 않는다.
2. **머지 전 손실 창이 코드에 남아 있다.** Publish가 커밋에 성공하면 편집 토큰이 비워진다(`saveLastPulledAt` → `lib/pull/load.ts`, ARCHITECTURE §3 흐름 절). PR이 아직 열려 있을 때 base에 다른 코드 커밋이 들어오면 CI `/api/push`가 `countPending = 0`을 보고 strict로 덮는다(`lib/push/apply.ts:367` — 토큰 없는 셀은 덮인다). DB는 옛 리포 값으로 돌아가고, 다음 Publish가 sync 브랜치를 force로 옮기면 PR에서도 사라진다. 지금 이 창에 대한 장치는 **경고뿐이다** — action의 "열린 PR 경고"(`github-token`을 줘야 돈다, ARCHITECTURE §3 "손실 창의 유일한 신호")와 수동 Sync Dialog의 `atRisk`(`lib/import/confirm.ts`).
   - ⚠️ **이 기능은 옛 판정 둘을 뒤집는다** (검수 2026-09-29 사용자): ACTIONS "열린 PR 경고는 차단이 아니다 — 막으면 '어느 쪽이 이기는지'를 CI가 판정하게 되고, 그건 병합 로직이다"와 CLAUDE.md "보류 판정은 리포를 보지 않는다 — 입력은 미전달 편집 수 하나".
   - **왜 병합이 아닌가**: 게이트는 셀을 고르지 않는다. 입력은 "Malmoi PR이 열려 있나" 하나이고 결과는 **적재 전체의 보류**다 — `pending-edits` 보류와 같은 부류다. 리포 값과 DB 값을 견주는 코드는 여전히 0곳이다.
3. **야간 cron의 행은 Publish 한 종류뿐이다.** 편집이 없어도 `runSync`가 `SyncRun` + `publish.run`을 쓰고 1층이 스킵해 "Nightly publish had nothing to send"가 선다(`messages/en.tsx`).
4. **Home 요약이 실행 주체를 말하지 않는다.** `lastSync`·`lastPublish` 행은 상대 시각과 PR 링크뿐이다(`lib/home/meta.ts`). Logs 행은 이미 `Nightly`·`CI`·사람 이름으로 가른다(`components/logs/event-row.tsx` `actorLabel`).
5. **Logs의 자동화 필터 라벨이 틀렸다.** 행위자 필터의 `automation` 항목이 `m.logs.trigger.cron`("Nightly")으로 적혀 있는데 CI 적재까지 거른다(`components/logs/log-filters.tsx:165-167`).

## 완료 조건

야간 판정 (프로젝트 단위, `/api/pull`):

1. 미전달 편집 > 0인 프로젝트는 지금과 같은 야간 Publish를 돈다(`runSync`, `trigger: "cron"`). GitHub 호출이 지금보다 늘지 않는다.
2. 미전달 편집 0 · **비교 대상 표면**(활성 · 포맷 완전 · `lastCommitSha` 있음) 전부의 `lastCommitSha`가 base head SHA와 같으면 **트리·blob·PR 목록 호출이 0회**이고, `SyncRun`을 만들지 않으며 사건 하나(`nightly.skip`, 결과 `upToDate` — "보낼 것도 받을 것도 없었다")를 남긴다. 비교 대상이 0개면 사건 없이 요약 카운터 `notReady`로만 센다.
3. 미전달 편집 0 · head가 다름 · 열린 Malmoi PR(`<owner>:malmoi-i18n/sync-<slug>`, `state=open`) 없음이면 **서버 적재**가 돈다. 결과는 IMPORT 사건 `import.nightly`, actor `AUTOMATION`, `source: "nightly"`이고, 적재된 표면마다 `lastCommitSha`·`lastCommitAt`이 base head로 전진한다.
4. 미전달 편집 0 · head가 다름 · 열린 PR 있음이면 적재하지 않고 `nightly.skip` · 결과 `deferred` · `deferReason: "open-pr"`를 남긴다.
5. PR 조회가 실패하거나 마감(`GITHUB_WAIT_MS`)을 넘기면 `deferred` · `pr-check-failed`다. head 조회가 실패하거나 base 브랜치가 없으면(`getRefSha` → `null`) `failed` · errorCode `base-unreadable`다. **실패를 "PR 없음"·"같은 head"로 읽는 경로가 없다** — 단위 테스트가 `undefined → pr-check-failed`와 `sha null → base-unreadable`을 고정한다.
6. 닫힌(머지 안 된) PR은 열린 PR로 세지 않는다.
6a. **모든 적재 사건(CI · 야간 · 수동 Sync · 첫 적재)이 `changedValues`(그 적재가 실제로 `value`를 바꾼 번역 셀 수)를 싣는다.** Logs 상세에 "N values changed"로 보이고, 필드가 없는 옛 사건과 실패 실행은 0이 아니라 `—`다.
6b. **야간 적재가 서버 적재 예산(200파일/10MB, `resource-limit`)에 걸리면** 사건은 `deferred` · `too-large`이고, 표면 `lastImportError`·Home 실패 상태를 **쓰지 않는다** — 야간이 CI로 건강한 프로젝트를 실패로 뒤집지 않는다.
7. 적재 중 누가 편집을 저장하면 **표면별 트랜잭션 안의 재집계**가 그 표면을 롤백하고 뒤 표면은 시작하지 않는다. 앞 표면이 적재됐으면 결과는 `partial`, 하나도 안 됐으면 `deferred` · `pending-edits`다. 편집을 덮는 경로가 없다.
8. **야간 방문마다 사건이 최대 하나다** — Publish(`publish.run`) · 적재(`import.nightly`) · 스킵(`nightly.skip`) 중 하나. 사건이 없는 갈래(동시 실행 거부 `already-running` · 예산으로 미방문 · 비교 대상 0)는 요약 로그 카운터에 센다. 편집이 없는 밤의 결과는 "Nightly publish had nothing to send" 대신 `upToDate`로 선다.
9. 처리 순서의 아사 방지가 유지된다 — 방문한 프로젝트는 성공·스킵·실패와 무관하게 "마지막 야간 방문"(`lastNightlyAt`)이 기록되고, 정렬이 그 값을 본다.
9a. 적재 갈래는 루프 경과가 적재 시작 마감(`NIGHTLY_IMPORT_START_MS`, 20초)을 넘으면 시작하지 않고 `unprocessed`로 센다 — 적재 하나가 `maxDuration`을 뚫어 그 밤의 요약을 통째로 잃지 않는다.

CI 게이트 (`/api/push`):

10. 미전달 편집 0이어도 열린 Malmoi PR이 있으면 200 `{ status: "deferred", reason: "open-pr" }`이고(`pendingCount` 없음) 어떤 컬럼도 쓰지 않는다 — `markImportStarted`·번역·키·표면 갱신 0회, 사건 `deferReason: "open-pr"`.
11. PR 조회가 실패하면 200 `{ status: "deferred", reason: "pr-check-failed" }`다. `installationId` 또는 `repositoryId`가 null인 프로젝트는 게이트가 없다(`null` — PR을 낼 수 없으므로 열린 PR도 없다).
12. 보류 사유 넷(`pending-edits`·`open-pr`·`pr-check-failed`·`too-large`)이 IMPORT 사건과 Logs 문장에서 구별된다. `too-large`는 야간 전용이다.
13. `[skip-malmoi-i18n]` 마커 동작은 그대로다 — Malmoi PR 머지 커밋은 CI가 건너뛰고, 그 밤 야간 판정이 head 변경을 보고 적재한다(PR은 이미 머지돼 열린 PR이 없다).
13a. **action v3**: CLI가 사유별 경고를 낸다(`open-pr` → "a Malmoi pull request is still open — merge or close it"). `action.yml`의 열린 PR 경고 문구("이 push가 그 PR의 편집을 덮는다")가 게이트 이후 사실로 고쳐진다. `malmoi-i18n-push-v3` 태그로 릴리스하고, v2 소비자는 새 사유에서 **경고 없이 green**임을 ACTIONS에 적는다.

UI:

14. Home 요약의 `Last sync`·`Last publish` 행이 `12 hours ago · nightly` 꼴로 주체를 붙인다. 주체는 셋: `manual` · `nightly` · `CI`. 첫 적재는 `manual`이다. 실패 행은 `1d ago · nightly · failed 10m ago` 순서다. 사건이 없으면(이력 도입 전) 주체를 붙이지 않는다.
14a. 최근 적재 사건이 `deferred` · `open-pr`면 `Last sync` 행에 `· held until the pull request is merged`가 붙는다.
15. Logs 행의 행위자가 야간 실행을 `Nightly`로, CI 적재를 `CI`로 말한다(지금은 AUTOMATION IMPORT가 전부 `CI`다). 사람 행은 지금처럼 사람 이름이다. 상세 패널의 Trigger 필드도 같다.
16. **Logs 행위자 메뉴의 `automation` 항목이 `CI` · `Nightly` 둘로 갈린다**(단일 선택 그대로, "Automation" 머리 아래). 옛 링크의 `?actor=automation`은 둘 다로 읽는다(메뉴 항목은 없다).

문서:

17. 새 동작을 말한다:
    - CLAUDE.md 코어 원칙("보류 판정은 리포를 보지 않는다") + `pnpm sync:agents`
    - PRODUCT §4.1(야간 자동 Publish → 야간 동기화) · §4.3 ②(일 단위는 야간이 채운다, 실시간이 필요할 때 연다) · §7.4(워크플로 = 커밋 즉시 받는 선택지) · §7.6
    - ARCHITECTURE §3.05 · §5.5.2(보류 사유 넷과 대가) · §3 손실 창 서술 · §6.45(MCP `list_events`에 새 필드)
    - ACTIONS("열린 PR 경고는 차단이 아니다" 절 개정 · `deferred` 사유 · v3)
    - DESIGN §6.64(메타 열 ` · nightly`) · §6.68(행위자 메뉴 · 행 문장 규칙)
    - 가이드 `guide/sync/nightly.md`·`push.md`·`logs.md` · `guide/translate/publish.md` · `guide/AUTHORING.md` IA 표 · 온보딩 ④ 문구 · README

## 대가 (수용)

- **PR이 열린 동안 새 키·삭제가 앱에 안 들어온다.** 야간 Publish가 PR을 매일 갱신하므로 편집이 이어지는 팀에서는 며칠씩 이어질 수 있다. ARCHITECTURE §5.5.2의 "대가는 정확히 하나다"가 둘이 된다.
- **CI 적재가 GitHub 가용성에 묶인다.** 지금 `/api/push`는 GitHub을 부르지 않는다. 조회 실패는 보류(`pr-check-failed`)라 설치 장애 동안 리포 → DB가 멈춘다(fail-closed).
- **야간 적재가 `lastCommitAt`을 전진시키므로 그 뒤 도착한 옛 커밋의 CI run은 `stale-commit` 409를 받는다** — 수동 Sync에 이미 있는 부류가 매일 자동이 된다.
- **Logs에서 편집 없는 밤의 행이 Publish 종류에서 Imports 종류로 옮겨 간다.** 행 수는 같다. 가이드 `logs.md`에 적는다.

## 비목표

- **opt-in 설정** — 게이트가 있으면 야간 적재가 편집을 버리지 않아 CI 적재와 같은 동작이다. 설정을 늘리지 않는다.
- **push 웹훅** — PRODUCT §4.3 ②. 일 단위는 야간이 채우고, 실시간이 필요해지면 연다.
- **수동 Sync의 열린 PR 처리 변경** — OWNER가 지문으로 승인하는 폐기 경로라 `atRisk` 경고를 그대로 둔다.
- **워크플로 유무 감지·표시** — 앱은 CI 등록 여부를 증명할 수 없다(PRODUCT §7.8).
- **편집 토큰을 PR 머지까지 유지** — 손실 창을 닫는 다른 방법이지만 전달 확인의 의미(ARCHITECTURE §5 `pendingEditToken`)를 바꾼다. 열린 PR 게이트가 더 작다.
- **번역 화면 배너에 보류 신호** — `EditLossBanner`는 미전달 편집의 신호다. 열린 PR 보류는 Home 한 줄(14a)과 Logs가 말한다.
- **PR 교체·인수인계** — `publish-pr-handoff`(PRODUCT §10)의 몫이다. 이번 게이트는 적재를 멈출 뿐 PR을 건드리지 않는다.
- **cron 주기 변경** — Hobby 하루 1회 그대로.

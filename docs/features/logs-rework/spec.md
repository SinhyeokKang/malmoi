# logs-rework — 프로젝트 전체 활동 이력

**SoT는 Claude Design 핸드오프다** — `design_handoff_project_logs/`(`README.md` · `Project Logs.dc.html` 아트보드 1a–1l).
이 문서는 그 핸드오프를 **리포의 계약으로 번역한 것**이고, 시안 값(px·색·간격)을 여기에 복사하지 않는다.
구현 뒤 `/design-sync`가 캔버스와 computed style을 대조한다.

**사용자 판정**: 로그 표면은 **의도적으로 넓혔다**(2026-09-20 사용자). 범위 축소 제안을 하지 않는다 —
코드가 시안에 맞춘다.

## 1. 사용자

**둘 다** — 그리고 이번엔 **둘이 상충하지 않는다.**

| 사용자 | 묻는 것 | 지금 답하는 자리 |
|---|---|---|
| 번역 편집자(비개발자) | "내가 어제 고친 게 어떻게 됐나" · "이 값이 왜 바뀌었나" · "내 편집이 아직 안 나갔나" | 없다 |
| 개발자(나) | "CI 적재가 언제 왜 멈췄나" · "누가 이 소스를 추가했나" · "이 토큰을 언제 갈았나" | 없다(Publish 실행만 `logs`) |

게이트는 지금과 같이 `translation:write`다 — **OWNER 전용이 아니다.** "내가 보낸 게 실제로 갔나"를
묻는 사람이 번역자이고, `project:settings` 뒤에 두면 그 질문에 답할 화면이 그 사람에게 없다.

## 2. 문제 — 관측된 사실

1. **`/projects/:slug/logs`가 `SyncRun`만 본다**(`loadSyncRuns`). 그 테이블은 Publish 실행 전용이고
   `trigger`/`status` enum이 그 가정 위에 서 있다. 번역 편집·CI 적재·멤버 변경·설정 변경은
   **어디에도 이력이 없다** — "무엇이 언제 누구에 의해 바뀌었나"에 답하는 화면이 제품에 없다.
2. **Home의 Recent logs는 다른 출처 넷을 그때그때 조합한다**(`recentActivity` — `Translation.updatedAt`
   · `TranslationSurface.lastCommitAt` · `lastPublishedAt` · `lastImportFailedAt`). 조합은 **사건을
   보존하지 못한다**: 같은 셀을 세 번 고치면 한 줄이고, 적재 실패가 둘이면 컬럼이 하나라 하나만 보이며
   (`lib/home/overview.ts`의 주석이 그 사실을 이미 적고 있다), 7일 창은 조용한 프로젝트의 카드를 통째로 비운다.
3. **표 다섯 열이 Publish에만 맞다.** 종류가 일곱이면 `Changed`·`Reason`이 영원히 빈 칸이고, 빈 칸은
   "값이 없다"와 "이 종류엔 해당 없다"를 구별하지 못한다 — POSTMORTEM 2026-09-03이 말하는 부류다.
4. **보관하면 Logs가 통째로 `ProjectArchived`로 바뀐다**(`logs/page.tsx`). 보관 사건과 그 직전 기록을
   확인하려면 **복원해야 하는 순환**이다.
5. **찾는 수단이 없다.** `?cursor=` 하나뿐이라 20건씩 넘기는 것 말고는 원하는 사건에 닿는 길이 없다.

## 3. 완료 조건 — 검증 가능한 문장

### A. 스트림
1. 종류 일곱(Translations · Imports · Publish · Sources & locales · Members · Project settings, + All activity)의
   사건이 **한 테이블**에 최신순으로 쌓이고, `pnpm test:projects:postgres`가 실제 Postgres에서
   "같은 프로젝트의 서로 다른 종류 N건이 한 쿼리로 시각 내림차순으로 나온다"를 단언한다.
2. **상태 변경 사건은 실제 변경과 같은 트랜잭션에서 확정된다** — 변경 실패 시 사건도 없고,
   이벤트 기록 실패 시 변경도 롤백된다. 번역 저장은 잠금 뒤 현재 값을 읽어 저장과 사건 기록까지
   직렬화한다. 같은 통합 테스트가 동시 저장의 전후 값 연결과 양방향 롤백을 단언한다.
3. **값이 그대로인 저장은 사건을 만들지 않는다.** 잠금 뒤 읽은 값으로 판정하며, 같은 값을 동시에
   저장해도 실제 변경 사건은 한 건이다. 기존의 나중 저장이 최종 값이 되는 동작은 유지한다.
4. **인증 실패 요청은 payload가 주장하는 프로젝트에 아무것도 쓰지 않는다**(`/api/push` 401 경로).
4b. **같은 실행이 두 줄이 되지 않는다** — CI 생산자가 소스별 실행 시작 시 발급한 `executionId`를
    정상 push·실패 보고와 HTTP 재전달에 유지한다. 워크플로 재실행·새 CLI 실행은 별도 실행이다.
    내부 실행은 `SyncRun.id`·import lease token을 쓰고, 서버가 종류·소스 범위를 붙인 `runToken`의
    `@@unique([projectId, runToken])`으로 이벤트 중복을 막는다. 구 생산자의 전환 규칙은 design §3.3에 둔다.

### B. 화면
5. `/projects/:slug/logs`가 표 대신 **날짜 카드 + 이벤트 행**을 그리고, `components/__tests__/table-presets.test.tsx`의
   표 프리셋 소비자 목록에서 Logs가 빠진다.
6. 필터 다섯(`kind`·기간·`actor`·`source`·`result`) + 검색(`q`) + 커서(`cursor`) + 열린 이벤트(`event`)가
   **전부 URL에 있고** `app/__tests__/entry-points.test.ts`의 생성기↔수신자 대조를 지난다.
7. **필터·검색이 바뀌면 `cursor`를 버린다** — 순수 함수 단위 테스트가 단언한다.
8. `cursor`가 해독 불가하면 던지지 않고 첫 페이지를 그린다(`decodeCursor`와 같은 축).
   잘못된 `event`는 목록 필터·커서를 바꾸지 않고 상세 대상 없음으로 처리한다.
8b. **상세는 현재 필터·검색·커서를 유지한 목록 위에서 열린다.** 대상 이벤트가 그 목록에 없더라도
    필터를 해제하거나 이벤트가 있는 페이지로 이동하지 않는다. 닫으면 `event`만 제거한다.
    직접 URL 진입도 같고, Home에서는 Home 위에서 열고 닫는다.
9. Home의 Recent logs가 **같은 스트림의 최신 6건**이고, 같은 이벤트 참조로 **같은 상세**를 그 자리에서 연다.
   `lib/home/overview.ts`의 활동 조합과 7일 창은 **소스에서 사라진다**(`recentActivity` grep 0건).
10. 결과 어휘 아홉이 **실행에만** 붙고, 비실행 사건의 결과 열은 빈 채 폭을 유지한다.
11. 보관된 프로젝트에서 **현 멤버가 Logs를 읽는다.** 편집·Publish·Sync·설정 외 쓰기는 **계속 거부**되고,
    `lib/auth/__tests__/access.test.ts`가 "읽기 허용이 쓰기 허용을 뜻하지 않는다"를 갈래마다 단언한다.
    제거된 멤버는 과거 참여자여도 `not-found`다.
12. **조회는 all-or-nothing이다**(리뷰 확정). 최초 목록·새로고침·다음 페이지·상세 중 하나라도
    조회에 실패하면 해당 페이지 전체를 오류 화면으로 교체한다. 기존 목록을 보존하거나 부분 오류를
    표시하지 않는다. 실패를 빈 상태로 접지 않으며, 재시도는 현재 URL의 목록·상세를 다시 조회한다.
    정상 조회 결과 0건·상세 대상 없음은 조회 실패와 구별한다.
13. 자동 갱신·폴링이 **0건**이다(리포 현황 유지). 갱신 수단은 [Refresh] 하나다.

### C. 경계
14. 토큰 값·해시·초대 링크 원문이 이벤트 payload에 **없다**. 초대 이메일은 기존 `emailLabel` 마스킹을 지난다 —
    원문 이메일이 RSC 페이로드에 실리지 않는다(sec-audit 발견 4와 같은 규칙).
15. 모든 조회가 **인가된 `projectId`로 좁혀진다**(불변식 5). 소스 필터는 사건 당시 대상 소스에
    선택한 소스가 포함되는지로 좁힌다. 여러 소스를 처리한 Sync·Publish도 포함하며 실행은 한 행만
    표시한다. 상세는 기록된 소스별 결과를 구분한다. 과거 Publish의 미수집 소스·결과는 추정하지 않는다.
16. 서버 조회·쓰기 의존성이 **클라이언트 그래프에 닿지 않는다**(`components/__tests__/client-graph.test.ts`).
    I/O 없는 잎 판정 모듈은 클라이언트가 사용할 수 있다.

## 4. 비목표

**이번에 안 하는 것** — 시안이 명시적으로 뺀 것을 그대로 잇는다.

- 총계·총 페이지·성공률 카드. 키셋 페이지네이션 20건 + [Older] 하나를 유지한다.
- 자동 갱신·폴링·실시간 스트리밍·진행률·재시도 카운트. `Running…`은 **조회 시점 스냅샷**이고
  **브라우저 타이머로 실패로 바꾸지 않는다.**
- Logs에서의 재실행·되돌리기 버튼. **`logs`는 과거 이력**이고 "지금 상태 + 행동"은 Home의 패널이다.
- 번역 본문 전문 검색(키·경로·대상 이름·참조까지).
- 소스 삭제 사건 · 승인 워크플로 · PR 머지 웹훅 · 배포 상태 · 로그인 이력 · 조직 감사 콘솔.
  뒤의 셋은 PRODUCT §4.2·§4.3 ②의 연장이다.
- 법적 감사 인증 · 무제한 영구 보존을 약속하는 서술. 보존 기간·자동 삭제는 만들지 않는다(§9 결정 6).
- 모바일 분기. 셸 최소 대응 폭 1280은 그대로이고, 좁은 폭 대응은 **컨테이너 쿼리**(뷰포트가 아니다) 하나다.
- 수집 시작 이전 사건의 복원. **과거는 만들어내지 않는다** — 백필 대상은 보존된 Publish 실행뿐이다.

## 5. 권한 표

| 상황 | Logs 읽기 | 이벤트 상세 | 설정 링크 | 멤버 링크 | 복원 링크 |
|---|---|---|---|---|---|
| OWNER · 정상 | ✅ | ✅ | ✅ | ✅ | — |
| EDITOR · 정상 | ✅ | ✅ | ❌(숨김) | ❌(숨김) | — |
| OWNER · 보관 | ✅ **(신규)** | ✅ | ✅ | ✅ | ✅ |
| EDITOR · 보관 | ✅ **(신규)** | ✅ | ❌ | ❌ | ❌ |
| 비멤버 · 제거된 멤버 | `not-found` | `not-found` | — | — | — |

- **역할로 갈리는 것은 목적지 링크뿐이다** — 같은 활동을 같은 문장으로 읽는다.
- 목적지 링크는 **대상 존재 + 권한을 서버가 판정한 뒤에만** 그린다(죽은 링크 금지 — `entry-points.test.ts`).
- 보관 상태에서 `logs.reasons`의 **"The next nightly run tries again." 절을 뺀다** — 야간 발송이 보관
  프로젝트를 건너뛰므로(`lib/pull/targets.ts`의 `archivedAt === null` 필터) 그 문장이 거짓이 된다.

## 6. 결과 어휘 아홉 + 값 상태 넷

**색은 셋뿐이고 뜻은 낱말이 든다**(DESIGN §6.2 — 새 raw 색 금지).

| 라벨 | 톤 | 서버 판정 근거 | 상세에 붙는 것 |
|---|---|---|---|
| `Running…` | muted + 회전 글리프 | `SyncRun.status = RUNNING` / 실행 이벤트의 `finishedAt === null` | 시작 시각만. 결과가 없다는 한 줄 |
| `Sent` | muted | `SyncRun.status = SUCCEEDED` | 파일 수 · PR URL |
| `Nothing to send` | muted | `SyncRun.status = SKIPPED` | 파일 수(0) · PR 없음 |
| `N dropped` | warning | `SyncRun.warnings > 0` — **성공 행에도 붙는다**(불변식 9) | 버린 수 |
| `Imported` | muted | 적재 실행의 전 소스 성공(`summarizeImport`) | 소스별 결과 · 키 수 |
| `Deferred` | warning | `/api/push`의 200 `deferred` · `applyProtectedPush`의 `status: "deferred"` | 관측된 미전달 편집 수 |
| `Partially completed` | warning | `SurfaceImportResult[]`가 갈림 | 소스별 결과 목록 |
| `Superseded` | muted | `SurfaceImportReason`의 `superseded` · `lease-lost` | 확인된 대체 사유만. 대체 실행 링크·실행 간 연결은 만들지 않는다 |
| `Not started` | warning | **사람이 고쳐야 풀리는 거부 여섯**(§6.1) | 거부 사유 코드 + 문장 |
| `Failed` | danger | `SyncRun.status = FAILED` / 적재 실패 | `errorCode` + `logs.reasons` 문장 |

⚠️ **`SKIPPED` + warnings와 `Sent` + warnings 둘 다 성립한다** — 결과 열에 낱말 하나와 `N dropped`가
함께 선다. 하나로 접지 않는다.

### 6.1 `Not started`로 남기는 거부 — 여섯뿐이다

**다음 번에도 같은 이유로 거부될 것만 남긴다.**

| 남긴다 | 왜 |
|---|---|
| `archived` · `not-ready` | 프로젝트 상태를 사람이 바꿔야 한다 |
| `stale-commit` · `format-mismatch` | 리포와 설정이 어긋나 있다 |
| `repo-replaced` · `not-installed` | 연결이 끊겼다(불변식 11·설치 목록) |

**안 남긴다**: `already-running` · `too-soon`(한 번 더 누르면 사라진다 — `SyncRun`이 그 거부를 행으로 만들지
않는 기존 판정과 같다) · 400 payload 검증 오류 · no-op.

⚠️ **왜곡 금지 목록**(시안 §8 — 문구가 이미 그렇게 쓰여 있다): `Sent`는 PR 생성/갱신이지 머지가 아니다 ·
`Nothing to send`는 성공 전송이 아니다 · `Deferred`는 삭제도 성공도 아니다 · `Failed`는 GitHub에
아무것도 안 갔다는 보장이 아니다 · 파일 수 `null`은 `—`이고 `0`이 아니다.

**값 상태 넷 + 해당 없음** — 빈 칸을 만들지 않는다.

| 낱말 | 뜻 | 언제 |
|---|---|---|
| `Empty` | 사람이 **비운** 값 | 전후 값이 `""` |
| `Spaces only ({n} characters)` | 공백만 있는 값 | 보이지 않는 차이를 보이게 한다 |
| `Not recorded` | 값을 수집하지 않았다 | 과거 사건·소스별 결과 등 기록 자체가 없는 필드. 전후 값 전문을 임의로 자르지 않는다 |
| `Unavailable` | 개별 저장 값의 복호 실패 | 기존 `m.common.unreadable`과 같은 낱말. DB 조회·키 설정 장애는 페이지 전체 오류다 |
| `—` | **해당 없음** | 그 종류가 그 필드를 갖지 않는다 |

## 7. 데이터 공백 규칙

**없는 것을 만들어내지 않는다.**

1. **전체 활동 수집 시작 이전**: 보존된 Publish 실행을 백필한다. 다른 종류의 과거 사건은 복원하지
   않으며 전환 중 관측된 사건이 있더라도 전체 수집을 보장하지 않는다. **경계가 실제로 드러나는 행 바로 위에
   한 번** 그리고, 페이지 경계에 걸리면 **아래 페이지의 첫 행 위**에 선다 — 선이 두 번 그려지지 않는다.
   판정은 `(rows, coverageStart, cursor)` → 인덱스를 내는 순수 함수다. 실제 수집 개시 시각을
   별도로 저장하며 가장 이른 이벤트 시각이나 백필 시각으로 추정하지 않는다.
   **날짜를 서버가 주지 못하면 그 줄을 아예 그리지 않는다**(추정값 금지).
2. **항목별 경고 상세 없음**: `SyncRun.warnings`는 수뿐이라 `N dropped`만 든다. 무엇이 버려졌는지는
   **만들지 않는다.**
3. **과거 파일 목록·diff 없음**: `changed`는 파일 수이고 목록이 아니다. 상세가 파일 이름을 약속하지 않는다.
4. **중단된 `RUNNING`**: Publish는 다음 실행이 `FAILED`/`stale`로 닫는 기존 동작을 유지한다.
   시작을 기록하는 Import도 다음 실행이 만료된 이전 이벤트를 닫도록 추가한다. 종료만 기록하는 CI에는
   진행 중 이벤트가 없다. 브라우저·조회는 실행 상태를 바꾸지 않는다.

## 8. 신규 문구 — `messages/en.tsx` 키 구조

**재사용**(그대로 둔다): `logs.status.*`(넷) · `logs.reasons.*`(여덟) · `logs.trigger.*` · `logs.older` ·
`logs.none` · `logs.warnings(n)` · `translations.publish.viewLink` · `common.unreadable`.

**신규**(전부 `logs.*` 아래. 한국어 UI 리터럴 금지 — `no-korean-ui.test.ts`):

| 키 | 내용 |
|---|---|
| `logs.description` | **교체** — 머리 설명 한 줄(전체 활동 · UTC) |
| `logs.kinds.*` | 일곱(all · translations · imports · publish · sources · members · settings) |
| `logs.filters.*` | 기본값 다섯 + `clear` + 메뉴 안 낱말(`findPerson` · `people` · `automation` · `projectWide` · `clearSources` · `resultScope` · `imports`/`publish`/`both`) |
| `logs.range.*` | 다섯(today · yesterday · last7 · last30 · custom) + 네이티브 `<input type="date">` 둘의 라벨 |
| `logs.search.placeholder` | `Search logs` |
| `logs.status.*` | **다섯 추가**(imported · deferred · partial · superseded · notStarted) |
| `logs.deferredReason(n)` | 보류 사유 문장 |
| `logs.empty.*` | **문구 교체**(`No syncs yet` → `No activity yet` + 설명) |
| `logs.noMatch.*` | 0건 — 빈 이력과 **다른 문구** |
| `logs.coverage(date)` | 수집 공백 경계선 |
| `logs.listError.*` | 목록 오류 셋(제목 · 설명 · 재시도) |
| `logs.queryError.*` | 목록·새로고침·다음 페이지·상세 공통 페이지 오류와 재시도. 부분 오류 문구는 만들지 않는다 |
| `logs.loading.*` | 셋 |
| `logs.detail.labels.*` | 상세 라벨 열여섯 |
| `logs.value.*` | 값 상태 넷 |
| `logs.detail.actions.*` | 액션 일곱 |
| `logs.detail.notes.*` | Publish · 가져오기 · 토큰 주석 셋 |
| `logs.archived.*` | 배지 · 설명 · 복원 안내 |
| `logs.page.*` | `20 events per page, newest first.` · `No older events match these filters.` |
| `home.logs.*` | Home 카드 — `all`(All logs)은 재사용, 빈 상태 문구는 Logs와 **같은 낱말** |

## 9. 닫힌 결정 (2026-09-20 사용자)

**열일곱을 닫았다.** 근거가 필요한 자리는 design.md가 든다.

| # | 결정 | 대가 |
|---|---|---|
| 1 | **기존 `SyncRun`은 백필 + 참조만** — 결과·파일 수·PR은 조인으로 읽고 **복제하지 않는다** | 목록에 조인 하나. 대신 실행이 닫힐 때 두 값이 갈릴 일이 없다 |
| 2 | **상세는 RSC가 그린다** — `?event=`를 서버가 읽고 같은 렌더가 상세를 함께 낸다 | 캔버스 `1i`의 상세 로딩·오류가 라우트 층(Suspense·`error.tsx`)으로 내려간다 — **의도된 이탈** |
| 3 | **검색은 비정규화 `searchText` 한 컬럼** — 조립은 순수 함수 하나가 독점 | 적재 지점마다 그 함수를 지나야 한다(안 지나면 검색에서 조용히 빠진다) |
| 4 | **행위자는 FK + `actorKind`**(USER/AUTOMATION/UNKNOWN). 번역 사건도 세션의 `User.id`를 쓴다 | malmoi#3의 핸들 혼입은 `Translation.updatedBy`에만 남고 이벤트로 번지지 않는다 |
| 5 | **전후 값은 전문 그대로** — 기존 10,000자 상한(`lib/keys/save.ts`·`lib/push/plan.ts`)이 천장이다 | 새 상한을 발명하지 않는다. 값 상태는 넷 그대로 |
| 6 | **보존 정책을 만들지 않는다** — 삭제 코드 0, 화면도 영구를 약속하지 않는다 | 행 수·조회 지연을 실측한 뒤 OPERATIONS 절차로 연다 |
| 7 | **`Not started`는 여섯뿐**(§6.1) | 동시 실행·too-soon은 이력에 안 남는다 |
| 8 | **행위자 필터는 이벤트에 등장한 행위자 distinct** + Automation 그룹 | 계정이 삭제된 사람들은 `Removed user` 하나로 접힌다(FK가 `SetNull`이라 구별이 없다) |
| 9 | **기간 필터는 프리셋 넷 + 네이티브 `<input type="date">` 둘** | 라이브러리 0·새 프리미티브 0. 피커 모양은 브라우저가 정해 시안과 픽셀이 갈린다 — **의도된 이탈** |
| 10 | **`Running…`은 바꾸지 않는다** — 상세에 `The server has not recorded a result.` 한 줄 | 닫는 것은 계속 **다음 실행**이다. 조회가 쓰기를 하지 않는다 |
| 11 | **수집 공백 경계선은 경계가 드러나는 행 바로 위에 한 번**(§7.1) | 페이지 경계에 걸리면 아래 페이지가 든다 |
| 12 | **실행은 행 하나**. 내부 실행은 시작·종료를 같은 행에, CI는 최종 인증 판정 뒤 관측된 종료를 기록한다. 내부 식별자와 CI `executionId`로 중복 방지(리뷰 확정) | CI 전송 계약과 생산자를 함께 변경한다. CI 진행 중 표시는 없으며 상태 변경 사건은 append-only다 |
| 13 | **프로젝트 생성은 사건 셋**(생성 1 + 소스당 1 + 적재 실행 1) | 첫 날 목록에 서너 줄이 선다. 대신 "이 소스가 언제 붙었나"가 나중과 같은 모양으로 답해진다 |
| 14 | **소스 필터는 선택한 소스를 포함한 다중 소스 Sync·Publish도 표시한다**(리뷰 확정) | 사건 당시 대상 소스 집합을 저장한다. 실행 행은 복제하지 않고 상세에서 기록된 소스별 결과를 구분한다 |
| 15 | **상세 대상이 현재 필터에 맞지 않아도 필터·검색·커서를 유지한다**(리뷰 확정) | 상세 뒤 목록에 대상 행이 없을 수 있다. 닫을 때 `event`만 제거하고, 직접 진입에는 대체 포커스를 사용한다 |
| 16 | **조회 실패는 all-or-nothing** — 목록·갱신·페이지 이동·상세 실패 모두 해당 페이지 전체 오류로 처리(리뷰 최종 판정) | 이미 읽은 목록도 오류 화면으로 교체한다. 부분 오류·마지막 성공 목록 보존은 만들지 않고 URL을 유지해 재시도한다 |
| 17 | **`Superseded`는 확인된 사유만 표시한다**(리뷰 확정) | 대체한 실행의 링크나 실행 간 연결 구조를 추가하지 않는다 |

## 10. 남은 열린 결정 — 구현 중에 닫는다

1. **Home 카드의 건수 6** — 오른쪽 메타 열 높이에 맞춘 값이라 Home의 다른 블록이 바뀌면 다시 잰다.
   지금은 6으로 간다.
2. **종류별 payload의 정확한 형태** — `/tdd`가 순수 함수의 입력 타입으로 고정한다. 검색 문자열에
   무엇이 들어가는지(§9.3)가 그 형과 같은 커밋에서 정해진다.

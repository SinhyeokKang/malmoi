# logs-rework — 태스크

## 진행 상태 (2026-09-20)

**커밋 1~5 완료. 6·7·8은 착수 전 조건이 미충족이라 멈췄다.**

| 커밋 | 상태 |
|---|---|
| 1 판정 (`lib/events/{payload,view,filter,search}.ts`) | ✅ |
| 2 스키마 (`ProjectEvent` + enum 둘 + 수집 개시 컬럼 + 백필) | ✅ dev 적용. **prod는 `/merge` 1단계** |
| 3 조회 (`lib/events/query.ts`) | ✅ |
| 4 인가 (`archivedPolicy`) | ✅ |
| 5 적재 지점 | ✅ (T5a·T5a-1·T5b·T5b-0·T5b-1·T5b-2·T5c·T5d·T5e·T5f) |
| 6 Logs 화면 | ⛔ **차단** — 보관 배너(T6d)만 선반영 |
| 7 이벤트 상세 640 | ⛔ **차단** |
| 8 Home 교체 | ⛔ **차단** |
| 9 문서 | 🔶 **착지한 것만** — ARCHITECTURE §5.7 · PRODUCT §3 · DIRECTORY · ACTIONS · OPERATIONS · CLAUDE |

⛔ **차단 사유: 시안 원본(`design_handoff_project_logs/`)이 이 체크아웃에 없다.** spec 머리가
"SoT는 Claude Design 핸드오프"라고 못박았고 사용자 판정도 **"코드가 시안에 맞춘다"**이므로, 없는
상태에서 아트보드 열둘을 그리면 그 판정을 뒤집는 것이 된다. `DesignSync list_projects`에도 malmoi
디자인 시스템 프로젝트가 없다(2026-09-20 확인).

**재개 조건**: 핸드오프를 확보한 뒤 커밋 6부터. 그때 함께 처리할 것 —
- T6d 보관 배너는 **기존 프리미티브로 먼저 서 있다**(`Alert` + `logs.archived.*`). 시안 대조 미검증이라
  `/design-sync`가 첫 대상이다.
- **PRODUCT §7.7 결정 3은 아직 뒤집지 않았다** — `logs`의 원천이 여전히 `SyncRun`이라 그 문장이
  지금은 참이다. 커밋 6이 조회를 바꾸는 순간 같은 커밋에서 뒤집는다.
- **T9e(이 디렉터리 삭제)는 하지 않았다** — 기능이 안 끝났다.

**착지한 것이 이미 하는 일**: 사건이 실제로 쌓이고 있다(번역·멤버·설정·소스·적재·Publish). 화면만
아직 `SyncRun`을 본다 — 그래서 커밋 6이 붙는 날 **과거 데이터가 이미 있다**.

---

**리뷰 결정 반영** — spec §9의 결정 열일곱을 기준으로 구현한다. 남은 둘(spec §10)은 구현 중에 닫는다.
시안 원본은 이번 검수에서 확보하지 못했다. UI 착수 전에 핸드오프를 확보하고 아래 시각 검증 게이트를 수행한다.

**순서의 근거**: 순수 함수 → 껍데기 → 적재 → UI. 역순은 테스트 못 하는 코드를 먼저 쌓는 것이다.
적재(T5)가 UI(T6)보다 앞인 것은, 화면을 먼저 만들면 **빈 테이블을 보고 "동작한다"고 판정**하게 되기 때문이다.

---

## 커밋 1 — 판정 (`/tdd interface` → `/implement`)

| # | 태스크 | 검증 |
|---|---|---|
| T1a | `lib/events/view.ts`(잎) — `eventView` · `valueState` · `groupByDay` · `planArchivedReason` | 결과 아홉과 독립 warnings · 값 상태 넷/해당 없음 · UTC 자정 · 보관 시 야간 문구 제거 단언 |
| T1b | `lib/events/filter.ts`(잎) — `parseLogFilter` · `filterChanged` · 커서 인코딩 | 무효 입력이 **던지지 않고** 기본값/첫 페이지를 내는 케이스를 단언 |
| T1c | `summarizeImportEvent` — 소스별 결과 → 결과 어휘 | `Partially completed`·`Superseded` 갈래가 각각 red→green |
| T1e | `buildSearchText` · `coverageBoundaryIndex(rows, coverageStart, cursor)` · `parseDateRange` | 경계선: 페이지 중간/첫 행/이미 과거인 후속 페이지/필터로 과거만 남음/null 시작일 · UTC 날짜 역전/무효 입력 · 검색에 번역 본문·원문 이메일 없음 |
| T1d | `client-graph.test.ts`에 새 모듈이 **잎으로** 잡히는지 확인 | `pnpm test` green |

`commit: feat(events): pure judgements for the activity stream`

## 커밋 2 — 스키마 (`/db`)

| # | 태스크 | 검증 |
|---|---|---|
| T2a | `ProjectEvent` + enum 둘 · `Project.activityCoverageStartedAt` nullable 컬럼 · 실행/참조 unique와 프로젝트 복합 FK · 조회 인덱스 · `searchText` · `surfaceIds`/`surfaceScope` | `/db`로 SQL 생성·검토 후 dev 적용 · 스키마 및 FK 회귀 |
| T2d | **초기·보충 백필** — 기존 `SyncRun`마다 참조 행 하나, 실행 시각 보존 · 현재 소스/결과를 과거에 복제하지 않음 | 프로젝트별 미연결 실행·중복 참조·교차 프로젝트 연결 0건 · 재실행 불변 · 백필 후 구 writer가 만든 실행도 보충되는 시나리오 |
| T2e | 수집 개시 시각 — 신규 생성 tx에서 기록 · 기존 프로젝트는 구 writer 종료 확인 뒤 실제 시각 기록 | 과거 Publish가 있어도 개시 시각 불변 · 재백필 불변 · 불명확한 전환은 null/경계선 없음 |
| T2f | `lib/privacy/collected.ts`에 새 모델·필드 분류 및 관련 등재 검증 | `pnpm db:generate` 후 `pnpm typecheck` · 개인정보 등재 테스트 |
| T2b | `prisma/__tests__/schema-contract.test.ts`에 새 enum 값 목록 고정 | `pnpm test` green |
| T2c | `anon` 권한이 0인지 확인 (`/db` 5단계) | 새 테이블의 GRANT 0건 |

`commit: feat(db): add the project event store` — additive이지만 배포 후 보충 백필은 별도 게이트다.
프로덕션 스키마 반영은 `/merge` 1단계(`pnpm db:deploy`). 개인정보 등재는 스키마 변경과 함께 검증한다.

## 커밋 3 — 조회

| # | 태스크 | 검증 |
|---|---|---|
| T3a | `lib/events/query.ts` — `loadEvents`(필터·검색·커서) · `loadEvent`(단건) | `server-only`이고 `try` 없음 |
| T3b | 행위자 마스킹 — `maskedEmailLabels`를 **목록 전체로** · 사용자 삭제와 AUTOMATION/UNKNOWN 구별 | 반환 타입과 실제 직렬화 결과에 원문 이메일 없음 · 같은 도메인 라벨 충돌 방지 · 삭제된 USER만 Removed user |
| T3c | `lib/events/__tests__/*.integration.ts` 작성 및 `vitest.projects.config.ts` include 추가 | `pnpm test:projects:postgres`가 신규 파일도 실행함을 확인 · 종류 혼합/같은 시각 21건의 누락·중복 없음 · 타 프로젝트 event/source 차단 · 조인한 Publish 결과 필터 |
| T3d | 소스 필터 — 사건 당시 대상 집합 포함 조회. 단일·다중 소스, 프로젝트 전역, 과거 미수집 범위를 구별 | Postgres: A·B 실행은 각 필터에 한 번 · C에는 0건 · 다른 프로젝트 소스는 0건 · 이후 소스 추가로 과거 결과 불변 · 백필은 전체 목록에만 표시 |

`commit: feat(events): query the activity stream`

## 커밋 4 — 인가 (보관 읽기)

| # | 태스크 | 검증 |
|---|---|---|
| T4a | `planProjectAccess`에 `archivedPolicy` | `access.test.ts` — 읽기 허용이 **쓰기 허용이 아님**을 갈래마다 |
| T4b | `requireProjectAccess`·`getProjectAccess`에 정책 전달 · Logs 페이지만 `"read"` · 제거된 멤버는 `not-found` 유지 | 실제 페이지/Action 배선 테스트와 브라우저 역할×보관 대조 · 쓰기는 기본 차단, 기존 설정 권한 예외 유지 |

`commit: feat(auth): let current members read logs on archived projects`

## 커밋 5 — 적재 지점 (design §3)

**둘로 쪼갠다** — 원자적 기록과 관측 기록은 실패 모드가 다르다.

| # | 태스크 | 검증 |
|---|---|---|
| T5a | 상태 변경 — 번역 저장 · 멤버 넷 · 설정 여덟 · 소스. 번역은 Project→TranslationSurface 잠금 뒤 현재 값 조회·`planSave`·저장·사건 기록을 같은 트랜잭션으로 묶는다 | `test:projects:postgres`: 변경 실패 시 사건 0건 · 각 변경 계열의 이벤트 INSERT 실패 시 변경 전체 롤백 · no-op 시 사건 0건 |
| T5a-1 | 번역 동시 저장 회귀 — 기존 나중 저장 우선 동작 유지 | 실제 Postgres의 두 연결로 `A→B→C` 사건 연결 · 같은 값 동시 저장 사건 한 건 · 번역 행 없는 최초 저장 경합 · 실패 시 기존 값과 `pendingEditToken` 보존을 단언 |
| T5b | 실행 기록 — 내부 Import는 실제 실행 소유 모듈에서 시작/종료 · Publish는 시작 tx에 참조 생성/결과 조인 · CI는 최종 인증 뒤 종료만 기록 | 최초 인증 실패와 토큰 회전 경합 401 모두 이벤트 0건 · 같은 실행 이벤트 한 건 · Publish terminal/stale 갱신이 조인 결과에 반영 |
| T5b-0 | `lib/import/run.ts`의 `acquire`·`runRepositoryImportFromReader` 및 최초 적재의 모든 조기 반환/예외를 기록에 연결 · 다음 실행 시 만료 이벤트 닫기 | 시작 후 중단→lease 만료→다음 실행→이전 Failed/stale · 이전 실행의 늦은 종료가 terminal/다른 실행을 덮지 않음 · 조회만으로 상태 변경 없음 |
| T5b-1 | CI 실행 식별자 계약 — `PushPayload`·`ImportFailureReport`·`buildPushPayload`에 `executionId`, `scripts/push-local.ts`에서 파싱 전에 발급. 정상·실패 보고·HTTP 재전달에 유지 | 서버 계약 테스트와 생산자 테스트: 재전달은 같은 ID · 새 실행은 새 ID · 구 생산자 필드 누락 수용 · 무효 UUID 거부 |
| T5b-2 | CI 이벤트 멱등 기록 — 서버가 실행 종류·인가된 소스 범위를 붙이고 unique 충돌을 기존 행으로 처리 | Postgres: 정상·실패·Deferred·거부의 순차/동시 재전달 한 건 · 완료 결과 불변 · 같은 커밋의 새 실행 두 건 · 프로젝트/소스/내부 실행 간 충돌 없음 |
| T5d | `Not started` 여섯만 기록. Publish Action의 `archived`·`not-ready` 선행 반환에도 배치 | 거부별 이벤트 유무 · 세션/비멤버/다른 프로젝트는 0건 · `already-running`·`too-soon`·400·no-op은 0건 |
| T5e | 프로젝트 생성이 **사건 셋**을 만든다(생성 1 + 소스당 1 + 적재 1) | `test:projects:postgres`에서 소스 둘짜리 생성이 이벤트 넷 |
| T5f | 실행 시작 시 실제 대상 소스 집합 저장 · 관측된 소스별 결과를 상세 payload로 전달 | 다중 소스 Sync·Publish가 행 하나이며 대상 소스가 정확함 · 실행 전체 파일 수/PR/warnings를 소스별 결과로 복제하지 않음 · 미수집 값은 추정 없이 표시 |
| T5c | 토큰·초대 payload에 값·해시·링크 원문이 없다 | 소스 단언(`credential-separation.test.ts`와 같은 형) |
| T5g | 개인정보 계약에 맞춘 이벤트 payload/searchText·계정 삭제 정리 검토 및 필요한 경로 구현 | actor FK 제거 뒤 payload/searchText에 계약상 제거할 식별 정보 잔존 없음 · 이벤트 사실과 번역 값 보존 · 사람 이름/원문 이메일 검색 복제 없음 |

`commit: feat(events): record state changes atomically` / `feat(events): record observed runs`

## 커밋 6 — Logs 화면

| # | 태스크 | 검증 |
|---|---|---|
| T6a | 날짜 카드 + 이벤트 행(시각 · 글리프 · 문장 · 결과 · chevron) | 표 프리셋 소비자에서 Logs가 빠진다 |
| T6b | 필터 다섯 + 검색 + [Refresh] + [Older] · 전부 URL · `routes.logs` 확장 · 새 클라이언트 발신처를 `EXTRA_EMITTERS`에 등록 | 신규 파라미터가 실제 검사 대상에 포함됨 · 생성/수신 왕복 · 필터 변경 시 cursor 제거 |
| T6f | 기간 필터의 `Custom range (UTC)` — 네이티브 `<input type="date">` 둘(**라이브러리 추가 없음**) | `?from=&to=` 왕복 |
| T6c | 빈 이력 · 필터 0건 · 공통 페이지 조회 오류 · 수집 공백 경계선. 오류는 all-or-nothing | 최초·Refresh·Older 실패 주입 시 기존 목록 없이 페이지 전체 오류 · URL 유지 및 재시도 성공 · 정상 0건은 빈 상태 |
| T6d | 보관 배너 + 복원 링크(OWNER만) + `reasons`의 야간 절 제거 | 역할 × 보관 네 갈래 |
| T6e | 문구 — spec §8 키 구조 | `no-korean-ui` · `brand-spelling` green |

`commit: feat(logs): the project activity stream`

## 커밋 7 — 이벤트 상세 640

| # | 태스크 | 검증 |
|---|---|---|
| T7a | `?event=` → 상세. 목록 필터·검색·커서를 유지하고 닫으면 `event`만 제거 | 다른 페이지/필터 밖 이벤트 직접 진입 · 배경 0건 · 잘못된/없는/다른 프로젝트 참조에서도 목록 쿼리 보존 및 테넌트 격리 |
| T7b | 포커스 — 제목으로 이동 · 안에 갇힘 · 닫으면 **눌렀던 행**, 직접 진입/행 부재는 배경 제목으로. 배경 스크롤 별도 보존 | 브라우저 실측(`/design-sync` 4단계): 행 진입·직접 진입·뒤로/앞으로·닫기 후 스크롤과 포커스 |
| T7c | 긴 값 줄바꿈 · 여러 줄 `pre-wrap` · 값 상태 넷 | `1k` 아트보드 대조 |
| T7d | 상세 조회도 목록과 같은 페이지 오류 경계를 사용 | 상세 실패 시 배경 목록까지 오류 화면으로 교체 · URL의 `event` 보존 · 재시도 시 목록과 상세 재조회 · 없는 대상은 정상 조회의 별도 상태 |
| T7e | Superseded는 확인된 사유만 표시 | `superseded`·`lease-lost` 사유 표시 · 대체 실행 링크/연결 데이터 없음 |

`commit: feat(logs): event detail panel`

## 커밋 8 — Home 교체

| # | 태스크 | 검증 |
|---|---|---|
| T8a | `recentActivity` 계열 제거 · 같은 조회의 최신 6건 | `grep -rn "recentActivity\|ACTIVITY_WINDOW_DAYS" lib app components` 0건 |
| T8b | 카드 글리프를 Logs와 같은 모양으로 · `routes.project(slug, { event })` 생성기와 Home 수신자 · 상세가 **Home 위에서** 열린다 | Home 직접 링크·행 진입 모두 닫으면 Home 유지 · `entry-points.test.ts`에 Home 카드 발신처를 등록하고 `event` 수신을 단언 |
| T8c | Home 이벤트 목록·상세 조회도 all-or-nothing | 목록 또는 상세 조회 실패 시 Home 페이지 전체 오류 · 재시도 성공 시 현재 URL의 Home/상세 복구 |

`commit: feat(home): recent logs from the activity stream`

## 커밋 9 — 문서 (문서별 별도 커밋)

| # | 태스크 | 검증 |
|---|---|---|
| T9a | PRODUCT §7.7 결정 3 뒤집기 · IA 표 · §3 권한 표 | `/doc-check` 또는 `/push` 4단계 |
| T9b | ARCHITECTURE — 새 테이블 계약 · §5.6.4 보관 | 같은 게이트 |
| T9c | DESIGN §6.68 · 글리프 칩 색 §6.2 등재 · **의도된 이탈 둘**(상세 로딩은 라우트 층, 조회 실패는 페이지 전체 오류 · 네이티브 date 입력) | 같은 게이트 — 부분 오류·목록 보존을 요구하는 시안과의 이탈도 리뷰 결정 16으로 명시 |
| T9d | DIRECTORY — `lib/events/` | 같은 게이트 |
| T9f | ACTIONS — `executionId` 전송 계약·재전달과 새 실행의 구분·구 생산자 제한·불변 Action 태그 릴리스와 사용 리포 전환 순서 | 서버 선배포 뒤 새 생산자 연결 확인 · 기존/신규 페이로드 호환성 대조 |
| T9g | 개인정보 방침 수집·보존 문구 대조 및 OPERATIONS 계정 삭제·이벤트 보충 백필 절차 반영 | 새 모델 등재와 본문/운영 절차의 대응 확인 · 행위자 FK 외 payload/searchText 처리 누락 없음 |
| T9e | `docs/features/logs-rework/` **삭제** | 기능 종료 규칙(CLAUDE.md) |

`commit: docs(PRODUCT): ...` 등 문서별로.

---

## 게이트

- **커밋 5 이후**에 `pnpm test:projects:postgres`를 손으로 돌린다 — `lib/protection/**`·`app/(edit)/actions.ts`·
  `app/api/push/route.ts`를 건드리므로 CLAUDE.md의 트리거에 걸린다.
- 구현 전체는 `pnpm typecheck`·`pnpm test`도 통과해야 한다. 이 문서 검수에서는 테스트·빌드·마이그레이션을 실행하지 않는다.
- **커밋 6·7 이후** `/design-sync logs` — 캔버스 1a–1l이 SoT다. **예외 아트보드(1c·1i·1j·1k)를 빼먹지 않는다.**
- **`/bugshot-qa`**: 보관 읽기 · 역할별 링크 노출 · 필터 URL 왕복은 브라우저로만 보인다.
  ⚠️ **보관 상태는 dev DB에서 만들어야 한다** — `bugshot-i18n-test-qa`를 보관했다가 복원한다.
- 배포: `/db`(dev) → `/push` → `/merge` 1단계에서 `db:deploy`.
- 새 writer 배포·구 writer 종료 확인 → 실제 수집 개시 시각 기록 → 보충 백필 → 프로젝트별 실행/이벤트
  누락·중복 0건을 확인한 뒤 배포 검증을 마친다. 기존 writer가 살아 있으면 완료로 판정하지 않는다.
- CI 계약 전환: 선택적 `executionId`를 받는 서버 배포 → 새 생산자/불변 Action 태그 릴리스 → 사용 리포 전환.
  원격 푸시·태그 릴리스는 Claude Code 창구에서 수행한다. 구 생산자의 재전달 중복 방지 미지원은 전환 완료까지 명시한다.

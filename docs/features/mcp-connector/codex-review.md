# MCP connector — Codex code review

2026-09-29 기준 미해결 발견은 **P1 1건, P2 3건**이다. 1차 리뷰의 2건을 재확인했고, 문서 작성 전 2차 리뷰에서 2건을 추가했다. 구현 수정은 하지 않았다.

## 범위와 검증 한계

- 기준 브랜치·HEAD: 로컬 `dev`, `e3fb013a`. 작업 시작 시 미커밋 변경 없음, 로컬의 `origin/dev` 참조보다 1커밋 앞섬. 원격 fetch는 하지 않았다.
- 비교 범위: `a2d0db36^..e3fb013a` — 182파일, +10,382/-1,640. MCP 준비를 위한 Action 공통 코어 추출부터 읽기·쓰기 도구, 토큰, Publish 지문, 후속 수정까지 포함한다.
- 집중 검토: `app/api/mcp`, `app/(edit)/mcp`, `lib/mcp`, `lib/auth/lock.ts`, `lib/onboarding-run`, `lib/keys/save-key.ts`, `lib/publish`, `lib/sync`, 관련 테스트와 토큰 UI. 비교 범위에 섞인 MCP 외 변경 전체를 전수 감사한 것은 아니다.
- 방법: 코드·기존 테스트·스펙의 정적 대조. 아래 실패 시나리오는 제어 흐름으로 확인한 것이며, 신규 재현 테스트를 작성하거나 실행한 결과는 아니다.
- 미실행: 단위 테스트, PostgreSQL 통합 테스트, typecheck, 빌드, CLI·브라우저·preview 실물 왕복. 이 보고서는 배포 승인이나 전체 기능 무결성 보장이 아니다.

## 발견

### CR-01 · P1 — Publish 표시값과 확인 지문이 다른 DB 상태를 가리킨다

**상태:** 1차 발견, 2차 재확인. 배포 전 수정 권장.

**위치:** [lib/publish/read.ts](../../../lib/publish/read.ts) 27–34, 113–121, 134–141행.

`readPublishPreview()`는 표시할 번역 `rows`와 집계를 먼저 읽는다. GitHub의 head·tree·blob 조회와 표시 셀 구성이 끝난 뒤 `loadPullState()`를 다시 호출해 렌더와 `fingerprint`를 만든다. `loadPullState()` 자체는 Repeatable Read지만, 앞서 읽은 표시용 행들은 그 스냅샷 밖이다.

실패 시나리오:

1. 미전달 셀의 값이 A일 때 `preview_publish`가 `rows`를 읽는다.
2. GitHub 조회 대기 중 다른 사용자가 같은 셀을 B로 저장한다.
3. 뒤의 `loadPullState()`는 B와 새 편집 토큰을 읽는다.
4. 응답의 `groups`에는 A가, 확인 지문에는 B가 들어간다.
5. 추가 변경 없이 해당 지문으로 `publish`하면 실행기의 지문과 일치해 B를 전송한다. A를 확인한 호출자에게 `reconfirm`이 발생하지 않는다.

이는 단순히 미리보기가 낡는 문제가 아니다. 미리보기와 함께 발급한 확인값이 표시되지 않은 최신 상태를 승인한다. `changedFiles` 역시 뒤의 상태를 쓰므로 동일 응답 안에서 표시값과 파일 목록이 어긋날 수 있다.

**수정 방향:** 표시용 행·집계·표면 설정과 export 입력을 같은 DB 스냅샷에서 얻고, 그 입력으로 미리보기와 지문을 함께 만든다. GitHub 네트워크 대기 동안 DB 트랜잭션을 계속 열어 두는 방식은 피한다.

**필요한 회귀 테스트:** 표시 행 조회와 export 상태 조회 사이에 저장을 끼워 넣는다. 응답이 A를 표시했다면 지문도 A에 대응하고 이후 B의 Publish는 `reconfirm`이어야 한다. 응답이 B를 표시하는 구현이라면 지문·집계·렌더도 모두 B여야 한다. 테스트는 실제 `readPublishPreview()`를 지나야 한다.

**기존 테스트의 빈틈:** `lib/publish/__tests__/read.test.ts`의 지문 테스트는 반환 지문이 mocked `loadPullState`의 지문과 같은지만 확인한다. 표시 행과 그 상태의 일치 여부는 확인하지 않는다.

### CR-02 · P2 — 브랜치 변경 예외가 확정된 이름 변경을 응답에서 지운다

**상태:** 1차 발견, 2차 재확인.

**위치:** [lib/mcp/tools/settings.ts](../../../lib/mcp/tools/settings.ts) 29–39행. 관련: [lib/settings/update.ts](../../../lib/settings/update.ts)의 `changeBaseBranch()`, [lib/mcp/tools/execute.ts](../../../lib/mcp/tools/execute.ts) 12–18행.

`update_project`에 `name`과 `baseBranch`를 함께 보내면 이름을 먼저 별도 트랜잭션으로 커밋한다. 브랜치 코어가 `{ ok: false }`를 반환하면 `changed.name`을 보존하지만, 예외를 던지는 경우에는 이 분기에 도달하지 못한다.

실패 시나리오:

1. 이름 변경이 성공하고 `changed.name`이 설정된다.
2. 브랜치 변경의 DB 조회나 트랜잭션이 연결 오류·잠금 타임아웃으로 reject된다.
3. `executeTool()`의 catch가 전체 응답을 일반 `unavailable`로 만든다.
4. 이름은 DB에 남았는데 응답에는 확정된 부분 성공이 없고, 호출자는 작업 전체를 재시도할 수 있는 장애로 받는다.

**수정 방향:** 브랜치 실행의 예외에서도 앞서 확정한 이름 변경을 보존한다. 브랜치의 명시적 거부와 결과 확인 불가를 구분한다. 통신 예외만으로 브랜치가 반드시 롤백됐다고 단정하지 않는다.

**필요한 회귀 테스트:** 이름 성공 뒤 브랜치 코어가 throw하도록 하고, `executeTool()`까지 거친 응답에 `changed.name`과 브랜치 결과 확인 불가가 남는지 확인한다. 이름 없이 브랜치만 요청한 경우도 별도로 검사한다.

**기존 테스트의 빈틈:** `lib/mcp/tools/__tests__/write-tools.test.ts`는 브랜치가 `invalid-branch`를 반환한 경우의 부분 성공만 확인한다. reject 경로는 다루지 않는다.

### CR-03 · P2 — Publish 후 보조 조회 실패가 전송 상태와 원래 오류 코드를 지운다

**상태:** 2차 신규 발견.

**위치:** [lib/mcp/tools/publish.ts](../../../lib/mcp/tools/publish.ts) 53–59행. 관련: 같은 파일 `publishOutcome()`, [lib/mcp/tools/execute.ts](../../../lib/mcp/tools/execute.ts) 16–18행.

`publishProject()`가 실패 결과를 돌려준 뒤, 오류 문구에 리포 이름·브랜치를 붙이려고 `project.findUnique()`를 추가 호출한다. 이 조회는 `retryable` 장애에도 실행되지만, 해당 장애 응답을 만드는 분기는 리포 라벨을 사용하지 않는다.

실패 시나리오:

1. 실행기가 `{ status: "failed", code: "github-error", delivery: "unknown", retryable: true }`를 반환한다.
2. 뒤의 보조 DB 조회가 실패한다.
3. `publishOutcome()`에 도달하지 못하고 `executeTool()`이 일반 `unavailable`을 반환한다.
4. 이미 확보한 `delivery: "unknown"`과 `code: "github-error"`가 사라져, 호출자는 전송 결과가 불확실한 실행인지 구분하지 못한다.

**수정 방향:** 실행 결과의 직렬화가 후속 DB 조회 성공에 의존하지 않게 한다. 리포 라벨이 필요 없는 실패는 바로 변환하고, 문구를 위한 조회 실패에는 안전한 대체 라벨을 사용하되 원래 `delivery`·`code`·재시도 정보를 보존한다.

**필요한 회귀 테스트:** 위 실행 결과를 반환시킨 뒤 보조 조회만 reject시킨다. 최종 MCP 응답이 원래 전송 상태·오류 코드를 유지하는지 검사한다. `retryable: false` 설정 오류도 조회 실패 때문에 일반 재시도 가능 장애로 바뀌지 않아야 한다.

**기존 테스트의 빈틈:** `write-tools.test.ts`는 실행 실패의 `code`·`delivery` 매핑을 검사하지만, 결과를 받은 뒤의 보조 조회 실패는 주입하지 않는다.

### CR-04 · P2 — 열린 PR 조회 실패를 PR 부재로 바꾼다

**상태:** 2차 신규 발견.

**위치:** [lib/mcp/tools/publish.ts](../../../lib/mcp/tools/publish.ts) 41행. 관련: [lib/projects/open-pr.ts](../../../lib/projects/open-pr.ts)의 `loadOpenPrUrl()`.

`loadOpenPrUrl()`의 `null`은 열린 PR 없음, `undefined`는 조회 실패·시간 초과로 확인하지 못함이다. `readPublishPreview()`는 이 구분을 보존하지만, MCP 응답의 `openPullRequest: preview.openPr ?? null`이 둘을 합친다.

실패 시나리오:

1. 실제로 열린 번역 PR이 있다.
2. PR 목록 조회만 시간 초과되거나 실패하고, 파일 조회·미리보기 생성은 성공한다.
3. 웹 코어는 PR 상태를 미확인으로 반환하지만 MCP는 `openPullRequest: null`을 반환한다.
4. 에이전트가 열린 PR이 없다고 안내할 수 있다. 실제 Publish에서 기존 PR을 찾는 동작과 미리보기 안내가 어긋난다.

**수정 방향:** JSON으로 표현 가능한 명시적 상태로 `unknown`·`none`·`open`을 구분한다. `undefined`를 그대로 넣으면 JSON 직렬화에서 필드가 사라지므로 상태 필드가 필요하다. PR 조회 실패가 전체 미리보기를 반드시 실패시켜야 한다는 뜻은 아니다.

**필요한 회귀 테스트:** `preview.openPr`가 `undefined`, `null`, PR 객체인 세 경우를 최종 MCP 응답으로 직렬화해 모두 구분되는지 확인한다.

**기존 테스트의 빈틈:** `lib/publish/__tests__/read.test.ts`에는 열린 PR 미확인 보존 검사가 있으나, MCP의 응답 투영까지 검사하지 않아 그 다음 층에서 구분이 사라진다.

## POSTMORTEM·설계 대조

- [ARCHITECTURE](../../ARCHITECTURE.md) §0의 불변식, §6.45 및 [design.md](./design.md) §1.25·§2.3·§3.1과 대조했다. CR-01은 확인값과 실제 표시 내용의 일치, CR-02·03은 확정된 결과 전달, CR-04는 미확인과 부재 구분의 문제다.
- [POSTMORTEM](../../POSTMORTEM.md)의 2026-09-20 「소스 추가 커밋 뒤 캐시 오류가 전체 롤백으로 보고될 수 있었다」와 그 형제 Action 재발을 대조했다. CR-02·03은 후속 단계의 예외가 이미 확보한 결과를 지우는 같은 유형이다.
- 잠금 뒤 인가 재확인과 이메일 마스킹 사례도 대조했다. 검토한 경로에서 `userId`와 `tokenHash`를 함께 재조회하는 방어와 기존 마스킹 로더 재사용을 확인했다. 이 항목들은 새 결함으로 보고하지 않으며, 실제 DB 경합·PII 회귀 테스트를 이번 리뷰에서 재실행했다는 뜻은 아니다.
- 보관 프로젝트의 `unarchive_project` 입구는 `project:settings` 예외로 통과하고, 쓰기 코어가 `archiveToggle: true`로 재판정한다. 복원 불가 의심은 코드 추적으로 제외했다.

## 후속 작업

`/refactor`에서 CR-01부터 재현 테스트를 작성하고 수정한다. 나머지 세 항목은 MCP 응답 경계의 예외·정보 보존 테스트를 먼저 추가한다. 수정 뒤 해당 단위 테스트와 프로젝트 규칙상 필요한 전체·PostgreSQL 검증을 수행한다. 이 문서 작성 시점에는 네 항목 모두 미수정이다.

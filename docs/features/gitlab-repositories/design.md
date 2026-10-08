# GitLab repositories — 기술 설계 초안

상태: 구현 보류 · [spec.md](spec.md)의 미확정 결정이 선행한다.

## 1. 현재 코드와 분리 경계

| 현재 위치 | 재사용할 계약 | 분리·수정할 결합 |
|---|---|---|
| `lib/adapters/types.ts`·포맷별 어댑터 | 경로·내용 입력, 탐지·파싱·결정적 write | 제공자 조건을 추가하지 않는다 |
| `lib/push/{payload,plan,apply}.ts` | 페이로드 생산·검증·strict 적재 | 제공자 identity를 CI 입력과 서버 설정 사이에서 검증 |
| `lib/import/{run,apply-plan}.ts` | 실행권·설정 revision·일괄 적재 | `installationId` 및 GitHub reader 의존 |
| `lib/onboarding/readiness.ts` | 최초 적재 성공이 ready의 근거 | 설치 id 존재를 공통 연결 증명으로 대체 |
| `lib/pull/{plan,render,load}.ts` | 렌더·변경 판정·전달 확인 | 제공자별 프로젝트 조회 배선 점검 |
| `lib/pull/{client,run,payload}.ts` | Publish 순서·보호 계약 | Git Data API 단계와 `owner:branch` PR 조회 |
| `lib/github.ts`·`lib/github-connect/` | 기존 GitHub 동작 | GitHub 전용 구현으로 유지 |
| `prisma/schema.prisma` | Project/Surface/Key/Translation/Member/Event | 저장소 제공자·주소·쓰기 자격증명 |

공통 번역 코어 하나와 실제 소비자가 있는 제공자 구현 둘을 둔다. 파일 포맷 어댑터와 저장소 제공자 구현은 별개 축이다. GitLab 구현을 하는 배치에서 GitHub 소비자도 같은 경계로 옮기며, 미리 추상화만 추가하지 않는다.

## 2. 영향 받는 흐름

### 적재와 Sync

서버 설정으로 제공자를 결정 → 불변 repository id로 연결·호출 경로별 권한 검증 → 특정 commit의 완전한 파일 스냅샷 → 기존 탐지·read → 기존 보호 판정과 strict 적재. 파일 다운로드는 DB 트랜잭션 밖, 최종 인가·설정·실행권 재검증은 Project → 정렬된 Surface 잠금 안에서 한다.

호출자의 리포 권한과 서버의 저장소 쓰기 자격증명은 구분한다. 생성·재연결·소스 추가·push 토큰 회전은 호출자의 리포 쓰기 권한을 확인한다. **수동 Sync와 연결된 프로젝트의 브랜치 조회는 읽기 권한만 가진 OWNER도 허용**한다(PRODUCT §3·ARCHITECTURE §6.4, #123 회귀). 이 구분을 두 제공자에 동일하게 적용하고, CI·야간 실행에 대화형 사용자 권한 검사를 추가하지 않는다.

CI는 현재 `lib/push/payload.ts` 생산자를 재사용한다. GitLab CI 전용 래퍼는 checkout·환경 입력·호출만 담당한다. `/api/push`의 프로젝트 토큰이 대상을 결정하며 요청의 제공자·리포명은 라우팅 권한이 아니다. 기존 GitHub 페이로드와의 호환 및 namespace 하위 그룹 입력을 검증한다.

자동 적재는 pending token·열린 PR/MR을 공통 판정으로 받고 조회 실패를 닫힘으로 해석하지 않는다. 사전 전달 revision과 잠금 뒤 revision 비교도 그대로 유지한다. 야간의 Publish/적재/스킵 분기와 수동 Sync 승인 지문을 복제하지 않는다. 승인 지문·캡처 설정에 제공자 identity와 연결 변경이 반영돼 오래된 승인이 재사용되지 않아야 한다.

### Publish

기존 미전달 캡처 → base SHA 고정 → 완전한 tree와 원본 blob 읽기 → 공통 render·변경 판정 → 전달 확인 무효화 → 저장소 쓰기 → 성공 관측 → 기존 DB 확정 순서다.

`GitClient`의 `createTree/createCommit/updateRefForce`를 GitLab이 흉내 내도록 강제하지 않는다. 공통 코어가 필요로 하는 **고정 base에서 파일 스냅샷을 발행하고 review request를 유지하는 동작**으로 경계를 잡는다. 구체 함수 서명은 인증·실물 검증 뒤 확정한다. GitHub의 첫 외부 쓰기 이전 무효화와 API 호출 생략 동작을 보존한다.

GitLab 후보는 [Commits API](https://docs.gitlab.com/api/commits/)의 파일 actions, `start_sha`, `force`와 [Merge requests API](https://docs.gitlab.com/api/merge_requests/)다(2026-10-08 조회). 이것은 구현 가능성의 근거이며 실물 검증 완료를 뜻하지 않는다. `start_sha`에 캡처한 base를 사용해 기존 sync 브랜치와 값을 병합하지 않는다.

다음은 착수 전 실물 검증 게이트다.

- 고정 base를 부모로 재생성하며 변경 외 파일·파일 mode를 보존한다. 보호 브랜치가 거부하면 제한을 우회하지 않는다.
- MR은 source branch로 후보를 찾되, `source_project_id`와 `target_project_id`가 모두 저장된 repositoryId와 일치하는 열린 MR만 재사용하고 target branch 변경을 처리한다. 동명 브랜치를 가진 fork의 MR은 제외하며 no-changes에서도 닫지 않는다([프로젝트 MR 목록 API](https://docs.gitlab.com/api/merge_requests/#list-project-merge-requests)). 동시 생성·응답 유실 뒤 재조회와 자동 적재 보호 판정에도 같은 식별을 적용한다.
- 변경 없음에서 기존 MR에 이유를 남기고 닫는 동작과 sync 브랜치를 base로 되돌리는 동작을 검증한다. branch 삭제·재생성을 동등하다고 가정하지 않는다. 동등 구현이 안 되면 차이를 사용자에게 제시하고 명세를 다시 확정한다.
- 커밋 성공/MR 실패, 타임아웃, 실행권 만료에서 전달 확인·편집 토큰을 성공으로 만들지 않는다.
- 페이지네이션 완료·파일 크기·UTF-8 바이트·blob hash를 확인한다. 불완전한 목록을 삭제 또는 변경 없음으로 판정하지 않는다.

### 편집 UI·MCP

편집 기능·역할은 공유한다. 연결/설정/소스/Publish/Logs/Home의 제공자 URL·용어와 MCP 저장소 목록·생성·재연결·Sync·Publish 입력 및 결과를 점검한다. MCP가 Action을 호출하지 않고 같은 코어를 쓰는 구조를 유지한다. 내부 쓰기는 Server Action, 외부 push는 Route Handler다.

초대 이메일도 영향 범위다. `lib/invitation-email/template.ts`의 GitHub 고정 소개 문구를 제공자 중립 문구로 바꾸고 두 제공자의 초대에서 검증한다. 사전을 통하지 않는 영문 템플릿이므로 사전 갱신과 별도로 다룬다.

UI의 정보 구조와 인증 방식은 아직 미정이다. 디자인 브리프는 현재 작성 보류다. 기능에 UI가 없어서 생략한 것이 아니며, 구현 재개 시 신규 표면·큰 변경 여부를 확인한 뒤 필요한 브리프와 시안을 먼저 확보한다.

## 3. 순수 함수 — 향후 TDD 진입점

| 대상(이름은 가칭) | 입력 → 판정 | 주요 회귀 |
|---|---|---|
| 저장소 identity 정규화/비교 | 제공자·정규 호스트·불변 id·namespace → identity/거부 | 같은 id의 다른 제공자, 하위 그룹, 이전 이름 재사용 |
| 연결·readiness 판정 | 제공자별 연결 증거·첫 적재 상태 → 상태 | 설치 id 없는 정상 GitLab, 설정만 있는 프로젝트 |
| 승인/적재 설정 비교 | 캡처 identity·연결 revision·현재 설정 → 유효/실효 | 조회 중 재연결·권한 철회·소스 변경 |
| GitLab commit 요청 조립 | 고정 base·공통 파일 변경·mode → actions | create/update 구분, 비정상 경로, 파일 mode |
| PR/MR 조회 결과 정규화 | 저장된 repositoryId·sync branch·원격 응답 → 열림/없음/조회 실패 | 권한 은폐 404를 없음으로 오인 금지, source/target project id가 다른 동명 fork MR 제외 |
| 제공자 URL·오류 판정 | identity·commit·경로·상태 → 안전한 URL/복구 코드 | GitLab 하위 그룹, 재연결 필요와 일시 장애 구분 |
| CI 입력 변환 | checkout·base·마커·설정 → 기존 생산자 입력/스킵 | 다른 브랜치, 머지 방식, 오래된 실행 |

strict 적재·미전달 보호·렌더·전달 확인은 기존 순수 함수와 테스트에 양쪽 제공자의 사례를 추가한다. 같은 판정의 GitLab 사본을 만들지 않는다.

## 4. 스키마와 배포

**additive-first 제안**이다. 번역·키·로케일·멤버·이력 테이블을 제공자별로 복제하지 않는다.

- Project에 제공자 식별을 추가하고 기존 행은 GitHub로 해석한다. 호스트는 1차가 GitLab.com이면 서버의 제공자별 고정 매핑으로 충분하다. 사용자 지정 host 컬럼을 선행 추가하지 않는다.
- repository id의 identity는 `(provider, canonical host, repositoryId)`다. DB의 전역 unique 추가 여부는 기존 동일 리포 연결 정책을 확인한 뒤 정하며 임의로 한 리포 한 프로젝트 제약을 만들지 않는다.
- GitHub `installationId`는 GitHub 전용 nullable 정보로 유지한다. GitLab을 통과시키려고 가짜 설치 id를 쓰지 않는다.
- GitLab namespace는 `group/subgroup`을 보존해야 한다. 기존 owner/name 검증을 전수 확인하고 부족한 주소 필드를 additive로 추가한다. repositoryId는 주소와 분리한다.
- 자격증명 저장 위치·열은 인증 결정 후 확정한다. 원문 저장·로그 출력 없이 기존 봉투 암호화/회전 원칙을 따른다. 로그인 Account에 임의로 섞지 않는다.
- `lastPrUrl`·실행 이력은 기존 저장을 활용할 수 있으나 URL 판정·payload 스키마·UI 문구를 제공자에 맞춘다. 이름 변경만을 위한 전면 열 rename은 하지 않는다.

배포 순서: additive migration → 기존 GitHub 행 검증 → 두 제공자를 이해하는 모든 reader/writer 배포 → GitLab 생성 활성화. 구버전이 GitLab 프로젝트를 읽는 혼합 배포·롤백을 허용하지 않도록 활성화/롤백 절차를 확정한다. 구 필드 제거가 필요해지면 소비자 이관과 별도 배포로 나눈다. 현재 마이그레이션을 만들거나 실행하지 않는다.

## 5. 인증과 환경변수 — 미확정

불변식 6의 **로그인/연결 증명/저장소 쓰기 신원 분리**를 유지한다. GitHub 사용자 OAuth를 쓰기에 쓰지 않으며 GitLab 개인 OAuth 쓰기도 자동 승인하지 않는다. 연결하는 사람이 해당 리포에 쓸 수 있다는 증명과 서버가 지속적으로 쓰는 자격증명은 별도 검토한다.

[GitLab 프로젝트 토큰 문서](https://docs.gitlab.com/user/project/settings/project_access_tokens/)는 GitLab.com에서 Premium/Ultimate 조건과 토큰 만료를 명시한다(2026-10-08 조회). 따라서 프로젝트 토큰을 확정하면 지원 플랜과 갱신 UX도 결정된다. 개인 토큰으로 조용히 대체하지 않는다. 실제 도입 팀의 플랜·퇴사/철회 후 동작·최소 권한·회전 절차를 검증해 한 방식을 선택한다.

**새 환경변수는 아직 확정하지 않았다.** OAuth 연결을 선택하면 클라이언트 자격증명·callback 운영 설정이 필요할 수 있다. 확정 시 `.env.example`·OPERATIONS와 배포 환경 설정을 태스크에 포함한다. 사용하지 않을 변수·SDK·키를 미리 추가하지 않는다.

인증 결정 뒤 새 자격증명·수집 정보·GitLab 전송처를 개인정보 방침과 대조한다. GitLab 활성화 전에 `/privacy`의 영문·국문 본문, 해당 수집 목록, 필요한 개정 이력·시행일을 실제 구현에 맞춘다. 현재 방침은 미래 기능으로 고치지 않는다.

## 6. 불변식과 과거 장애

ARCHITECTURE §0·§2·§3·§5.5·§6.4·§6.5·§7 기준으로 다음을 보존한다.

- DB 값/리포 키 소유권과 strict 적재, base 파일의 키 집합 예외, orphan 보존은 그대로다. 제공자 차이로 값 병합을 도입하지 않는다.
- 같은 DB·원본에서 바이트가 같다. blob hash는 commit id와 혼동하지 않고 로컬 `git hash-object` 및 원격 blob과 대조한다.
- 모든 DB 접근은 인가된 projectId/surfaceId로 좁히며 GitLab 역할을 Malmoi 멤버 역할로 승격하지 않는다.
- 리포 identity 검증은 읽기·쓰기·표시·승인 지문 모두에 적용한다. 원격 호출을 DB 잠금 안으로 옮기지 않는다.
- 첫 외부 쓰기 전 전달 확인 무효화, 유효한 실행권/context 확인 후 성공 확정, 미전달 셀 토큰 보존을 양쪽 제공자에서 검증한다.

[POSTMORTEM](../../POSTMORTEM.md)에서 인용할 회귀 근거:

| 사건 | 이 기능의 검증 |
|---|---|
| 2026-09-16 「같은 요청의 Promise.all이 토큰 회전을 둘로 겹쳤고…」 | refresh 방식 채택 시 동시 만료·회전 충돌을 실제 호출로 검증 |
| 2026-09-19 「인가를 철회한 사용자가 잠시 뒤 다시에 갇혔고…」 | 철회와 일시 장애를 구분하고 도달 가능한 재연결 경로 제공 |
| 2026-09-27 「경로 안전만 검사해 경로가 옳은지를 안 봤고…」 | push 토큰 발급·회전·리포 연결의 실제 쓰기 권한과 출력 경로 검증 |
| 2026-10-07 「허용된 CI 경합이 재Publish 뒤 PR의 복구본까지 지울 수 있었다」 | CI/야간 사전 판정 뒤 Publish·no-changes 경합에서 revision 재검; 토큰/확인 원자성 유지 |
| 2026-10-07 「비동기 경계와 검증 트리거가 구현의 끝까지 닿지 않았다」 | 새 PG 테스트의 수집 설정과 실제 구현 경로의 gate-plan 트리거를 함께 확인 |

PRODUCT의 GitHub-native 설명과 ARCHITECTURE의 제공자 특정 계약은 **구현 완료 시** 실제 동작에 맞게 갱신한다. 현재 정본 문서를 미래 기능으로 바꾸지 않는다.

# sec-audit-2 — 구현·검증 기록

2026-09-10. 범위는 [감사 발견](./findings.md) #29~40이다. 암호화 구현은 별도
[credential-storage](../credential-storage/spec.md)로 분리한다. 사용자가 정한 순서는
**이 패치 검증·커밋 → origin/dev 반영 → credential-storage 재개**다.

## 발견별 상태

| 번호 | 상태 | 구현·근거 |
|---|---|---|
| 29 | 코드·회귀 검증 | 초대 소비 시 조회한 만료 시각 CAS + 소비 직전 만료 검사. membership 테스트가 조회 후 미래 시각으로 취소된 옛 역할을 거부 |
| 30 | 코드·회귀 검증 | 다운로드 전후 파일·바이트 예산, YAML 구성 스택 깊이, JSON·코드 구분자 깊이, 첫 적재 PushPayload 검증. budget·ingest·onboarding 테스트 |
| 31 | 코드·회귀 검증 | safePrismaAdapter의 OAuth 세션 만료 거부·조건부 정리, User 잠금 안의 추가 로그인 계정 거부 |
| 32 | 코드·회귀 검증 | loadPullState 전체를 RepeatableRead로 읽어 값과 최대 수정 시각의 스냅샷 일치. load 테스트 |
| 33 | 코드·회귀 검증 | GitHub callback 갱신·삭제의 userId 조건. callback 테스트 |
| 34 | 코드·회귀 검증, DB 적용 전 | repositoryId 고정, ID 한정 installation 토큰, 이름 조회 ID 대조. 기존 행은 OWNER 재연결 필요. repository-client·repository-id·health·connect 테스트 |
| 35 | 코드·회귀 검증 | 글롭 DP 매칭, locale 캡처 길이 제한. glob-linear 테스트와 양쪽 코퍼스 재측정 |
| 36 | sync-runs 기준점에서 구현 | 프로젝트 실행 잠금·실행 기록. 이번 패치로 중복 구현하지 않음 |
| 37 | 별도 정책 결정 | 최초 연결에 repo admin 권한을 요구할지는 변경하지 않음. 현재 가시성 기반 권한 정책 유지 |
| 38 | 별도 기능 | 재인증·전체 세션 회수 UI는 구현하지 않음 |
| 39 | 신규 저장 제거, 기존 데이터 후속 | 로그인 Account 식별 필드만 저장. 기존 로그인 토큰 삭제와 GitHub App 토큰 암호화는 credential-storage 전환 |
| 40 | 코드·회귀 검증 | GitHub 연결 변경을 User 행 잠금으로 직렬화. 동시 첫 연결 두 건 후 한 행만 남는 fake 경쟁 테스트 |

## 요청한 여섯 라운드

- [x] **tdd** — 초대 취소, 과대 첫 적재, pull 스냅샷, 안전 어댑터, 글롭·예산·리포 ID의 실패를 먼저 관측.
- [x] **implement** — 인가·저장소 정체성·입력 예산·Publish 스냅샷 수정. 암호화 구현은 분리.
- [x] **code-review** — 인증 / 데이터·리포 / 입력 경계 병렬 검수. `use server` 위치,
  만료 세션 정리, 예산 초과 표시, 미고정 리포 재연결, YAML 우회·오탐을 발견.
- [x] **refactor** — 발견을 수정. YAML 두 입력 및 재연결 CAS 경합은 추가 red→green 확인.
  동시 첫 로그인·GitHub 연결 테스트와 토큰 repositoryIds 배선 테스트도 추가.
- [x] **doc-check** — ARCHITECTURE·SAAS·features 인덱스·env 양방향 대조와 수정.
  sync-runs 최신 dev 문서와 충돌을 해결하고 암호화 계획을 완료로 표시하지 않음.
- [x] **postmortem** — YAML 구문 추정 실패와 초대 취소 시각 경합을 append-only로 기록.
  회고의 전수 검색 패턴을 실행함.

## 자동 검증

- `pnpm test`: **144파일 / 2,440테스트 통과**.
- `pnpm typecheck`: 통과.
- `git diff --check`: 통과.
- 어댑터 학습 109개 + 홀드아웃 20개 재측정: 조회 실패 0.
  학습 탐지 100/101·오탐 0/100·왕복 의미 99/100·바이트 고정점 100/100,
  홀드아웃 탐지 16/17·오탐 1/16·왕복 의미·고정점 16/16. 기존 15차와 같은 주요 지표.
  기존 실패·오탐을 모두 해결했다는 뜻은 아니다. [측정 기록](../../ADAPTER-COVERAGE.md#22-16차-측정--sec-audit-2-글롭-dp-전환-뒤-2026-09-10).
- 최신 dev의 sync-runs squash 이후에는 코드 차이가 없고 문서만 바뀐 것을 확인했다.
  보안 변경만 최신 dev 기준으로 옮겨 오래된 sync-runs 커밋을 재생하지 않았다.

## 배포·실물 검증 게이트 — 아직 수행하지 않음

- [ ] `20260910030000_pin_repository_id` SQL 검토 후 대상 DB에 적용. **nullable 컬럼 추가가 앱 배포보다 먼저**다.
- [ ] 기존 프로젝트 OWNER 재연결 → repositoryId 고정 → Publish 성공 실물 확인.
- [ ] 만료 쿠키 OAuth 왕복 / GitHub 연결 경합 / RepeatableRead를 실제 격리 DB로 검증.
  단위 테스트는 fake DB 계약이며 PostgreSQL 잠금·트랜잭션 실행 증명이 아니다.
- [ ] Claude Code의 `/push` 흐름에서 최신 origin/dev 통합·배포 게이트 수행.
  Codex는 저장소 역할 분담상 원격 push·merge를 실행하지 않는다.

공유 dev·prod DB와 원격 설정은 이 패치에서 변경하지 않았다. 실제 GitHub 쓰기 스모크와 빌드는
수행하지 않았다. DB 마이그레이션 전에는 새 코드가 새 컬럼을 조회하므로 배포하면 안 된다.
기존 프로젝트의 Publish 차단은 ID를 이름만 보고 자동 신뢰하지 않기 위한 의도된 전환이다.

파일/바이트 상한은 CPU·메모리의 완전한 격리가 아니다. 특히 코드 구문 사전 검사는 정식 언어 파서가
아니므로 공격적 리포의 모든 파싱 비용을 보장하지 않는다. #37·38은 미구현 정책/기능으로 남는다.
이 기록의 완료 체크는 로컬 여섯 라운드에 한정하며 배포·운영 게이트를 닫지 않는다.

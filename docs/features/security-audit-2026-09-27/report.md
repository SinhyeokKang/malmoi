# 보안 전용 감사 — 2026-09-27

**확인 범위에서 외부인의 인증 우회·프로젝트 간 데이터 유출·임의 코드 실행은 재현되지 않았다. 다만 로그인 수단 해제 경합 1건을 실제 PostgreSQL에서 재현했고, 프로덕션의 보안 조치 미반영 2건과 의존성 경고 3건을 확인했다. 보안 검증 완료나 출시 승인으로 해석하지 않는다.**

이 문서는 [전체 감사 배치 문서](../launch-audit-2026-09-27/tasks.md)를 보완한다. 기존 발견을 새 결함으로 중복 집계하지 않는다. 코드 수정은 수행하지 않았으며, 운영 설정·DB·원격 브랜치를 변경하지 않았다.

## 실행 환경과 증거

- 기준 커밋: `2cebd052ea931d463b60b5ad557a6a9f495b374f`. 이후 원본 dev에서 진행한 수정의 결과를 판정하지 않는다.
- Orca 작업 공간: `security-audit-2026-09-27`, 브랜치 `SinhyeokKang/security-audit-2026-09-27`.
- 원본 dev 서버를 사용하지 않았다. 별도 체크아웃의 `127.0.0.1:43187`과 Unix socket 전용 임시 PostgreSQL을 사용했다. 실제 OAuth·GitHub·메일·Blob 자격증명은 테스트 앱에 제공하지 않았다.
- 최종 자동 검증: Node **24.21.0**. 초기 비로그인 HTTP 15개 시나리오는 머신 기본 Node 26.4.0에서 실행했고, 인증 사용자·Action·RSC 검증은 Node 24에서 실행했다. 실제 프로덕션은 일반 GET 4회와 읽기 전용 설정/DB 조회만 했다.
- OWASP ASVS의 인증·세션·인가·입력·운영 경계를 참고한 표적 감사다. ASVS 전체 적합성 인증이나 모든 엔드포인트에 대한 침투 테스트가 아니다.
- 수치와 응답 요약: [evidence.json](./evidence.json). 실패를 재현하는 독립 테스트: [probes.test.ts](./probes.test.ts), [vitest.config.ts](./vitest.config.ts).
- 감사용 HTTP 서버와 임시 PostgreSQL은 종료했다. 로그 원문·실제 시크릿은 이 디렉터리에 포함하지 않았다.

## 발견과 처리 순서

### S1 · 중간 — 해제된 로그인 공급자가 저장 이메일을 변경한다

**기존 audit #5 / B1을 정적 후보에서 실행 재현으로 확인했다.**

- 위치: [lib/credentials/access.ts](../../../lib/credentials/access.ts), `refreshVerifiedEmail`의 Account 조회와 User 잠금 사이.
- 재현 순서: GitHub·Google이 연결된 사용자 → GitHub 콜백의 실제 Account SELECT 완료 → 다른 트랜잭션이 User 잠금 후 GitHub 연결 삭제·커밋 → 콜백 재개 → 이미 해제한 공급자의 새 이메일로 User.email/emailLookup 갱신.
- 결과: `original@example.test`가 `revoked-provider@example.test`로 바뀌었다. Account는 실제로 삭제된 상태였다. 순서만 Prisma query extension으로 제어했고, 조회·잠금·삭제·갱신은 실제 PostgreSQL에서 수행했다.
- 정상 연결의 이메일 갱신과 이미 해제된 연결의 거부는 대조 테스트에서 통과했다. 총 3개 중 **보안 기대값 1개가 red**다.
- 영향: 정본 이메일 및 초대 이메일 대조의 무결성 훼손. 계정 탈취나 타인 세션 발급까지 재현한 것은 아니다. Auth.js의 후속 로그인 거절은 별도로 커밋된 이메일 변경을 롤백하지 않는다.
- 완료 기준: User 잠금 뒤 Account의 존속·소유자를 재검하고, 해제된 공급자 증명으로는 쓰지 않는다. 이 회귀 테스트와 기존 로그인 연결/회수 검증이 함께 통과해야 한다.

### S2 · 중간 — prod의 스키마 권한 차단이 아직 적용되지 않았다

**기존 audit #6 / B0의 운영 상태를 재확인했다.**

- prod: `anon`·`authenticated`의 `public` USAGE=true, CREATE=false. 기존 17개 테이블의 두 역할 권한은 0건이고 public 함수는 0개다. 현재 행 노출을 확인한 결과가 아니다.
- prod: `supabase_admin`의 테이블·시퀀스·함수 기본 ACL에 두 역할의 권한이 남아 있다. 해당 소유자로 새 객체가 생성될 때의 방어가 중요하다.
- dev: 두 역할의 USAGE/CREATE=false, 해당 마이그레이션 적용 완료.
- prod 미적용: [20260926175555_revoke_public_schema_usage_from_api_roles](../../../prisma/migrations/20260926175555_revoke_public_schema_usage_from_api_roles/migration.sql).
- 완료 기준: 기존 `/merge` 배포 게이트에서 적용하고, prod의 실제 schema/table/function 권한과 기본 ACL을 다시 조회한다. 감사에서는 적용하지 않았다.

### S3 · 중간 — 저장소의 nonce CSP가 실제 프로덕션 응답에 없다

**이번 운영 응답 검사에서 추가 확인했다.**

- 저장소: [lib/security-headers.ts](../../../lib/security-headers.ts)의 script-src는 nonce와 strict-dynamic을 사용하고, [middleware.ts](../../../middleware.ts)가 요청별 정책을 만든다.
- 실제 `https://mal-moi.com`의 `/`, `/privacy`, `/signin`, `/projects` 응답은 모두 `script-src 'self' 'unsafe-inline'`이며 nonce·strict-dynamic이 없다.
- 조회된 운영 배포: `dpl_BG3FSZBcZaFcyXaJUBy6Hc8XPbx9`, target=production, READY. CLI 응답에는 Git SHA가 없어 정확한 소스 커밋은 확인하지 못했다.
- 영향: 인라인 스크립트 주입에 대한 추가 방어가 저장소 수준보다 약하다. **이 사실만으로 XSS 취약점이나 침해가 입증되지는 않는다.** 격리 앱의 저장된 프로젝트명 HTML 주입 시도는 정상적으로 이스케이프됐다.
- HSTS, nosniff, frame-ancestors 차단 헤더는 실제 운영 응답에서 확인했다.
- 완료 기준: 예정된 보안 변경을 기존 배포 절차로 반영한 뒤 실제 도메인에서 요청마다 다른 nonce와 script-src 정책을 확인한다. CSP 헤더 존재만으로 완료 처리하지 않는다.

### S4 · 검토 필요 — lockfile에 공급망 보안 경고 3건

`pnpm audit --json`과 `pnpm audit --prod --json`에서 같은 3건을 확인했다. 아래 심각도는 공급자 권고의 심각도이며, 말모이의 외부 공격 가능성 판정과 구분한다.

| 패키지 | 설치 버전 | 공급자 심각도 | 권고 식별자 | 수정 버전 |
|---|---|---|---|---|
| deepmerge-ts | 7.1.5 | High | GHSA-ggr8-5vv4-36mx | 8.0.0 이상 |
| mysql2 | 3.15.3 | High | GHSA-3f6p-5ww8-9rcr | 3.22.0 이상 |
| mysql2 | 3.15.3 | Moderate | GHSA-rgwj-5xj2-c3m3 | 3.23.1 이상 |

- prod 검사에도 `@prisma/client → prisma` 경로로 포함된다. 따라서 단순히 devDependency라는 이유로 제외하면 안 된다.
- 현재 앱 런타임은 `PrismaPg`와 PostgreSQL용 생성 클라이언트를 사용한다. mysql2 연결·압축 프로토콜이나 외부 입력을 deepmerge-ts로 보내는 앱 호출 경로는 확인되지 않았다.
- deepmerge-ts 권고는 순환 객체 그래프를 요구하며 일반 JSON 입력만으로는 그 조건이 만들어지지 않는다. mysql2 권고는 MySQL 연결/프로토콜 사용이 전제다.
- **현재 앱에서 원격 공격 가능한 High 취약점이라고 판정하지 않았다.** 배포 산출물의 실제 포함 여부까지 추적하지 않았으므로 영향 없음으로 확정하지도 않는다.
- 완료 기준: Prisma의 지원 업데이트 경로와 런타임 도달 가능성을 검토하여 업데이트 또는 근거 있는 영향 제외를 기록한다. 임의 override·메이저 업그레이드는 수행하지 않았다.

## 확인한 방어

| 영역 | 수행한 검사 | 결과/범위 |
|---|---|---|
| 기존 자동 검사 | 인증·세션·연결·초대·업로드·온보딩·API·어댑터·입력/출력 관련 테스트 | Node 24에서 **2,273/2,273 통과** |
| 자격증명 DB 경계 | 실제 Auth.js 콜백을 포함한 격리 PostgreSQL 검증 | **64/64 통과**. OAuth 공급자 외부 통신은 fixture이므로 실계정 로그인 검증은 아님 |
| 권한·DB 경계 | 멤버 제거/강등/보관 경합, 초대 경합, schema ACL, 저장·복합 FK | 격리 PostgreSQL **65/65 통과** |
| 새 회귀 | 해제 전후 이메일 갱신 대조 및 경합 | **2 통과·1 실패**, S1 재현 |
| 비로그인 HTTP | 보호 경로, 인코딩 경로, RSC 변형, prefetch, middleware 우회 헤더, cron/push 인증 | 15개 시나리오. 보호 경로는 로그인으로 이동, 토큰 없는 API는 401 |
| 인증된 HTTP | A/B 프로젝트·OWNER/EDITOR·위조 세션, 타인 이메일 원문, 세션 공개 필드 | 14개 시나리오. B 소유자는 canary를 읽고 A는 읽지 못함. 다른 멤버의 이메일 원문·토큰/암호문 노출 없음 |
| RSC 실제 도달 | Next의 `_rsc` 정규화 redirect를 따라간 허용/거부 대조 | 3개 시나리오. B 소유자만 번역 canary 확인; 다른 프로젝트 경로 및 자기 프로젝트의 외부 keyId 모두 차단 |
| OWNER Action 직접 호출 | 비로그인·위조 세션·EDITOR·외부 프로젝트·교차 Origin·정상 OWNER | 6개 시나리오. 거부 요청의 DB 변경 0회, 정상 OWNER만 변경 성공 |
| 번역 쓰기·회수 | 외부 프로젝트/키 저장, 정상 EDITOR 저장, 멤버 제거 후 저장, 세션 삭제 후 읽기 | 5개 시나리오. 정상 대조만 저장 성공, 제거 후 거부 응답, 회수된 세션은 로그인으로 이동 |
| 저장형 HTML 입력 | 프로젝트명에 script 종료 태그와 onerror img 저장 후 응답 파싱 | 입력 저장·렌더 도달 확인, 이벤트 핸들러 태그 생성 0개. 실제 브라우저의 JS 실행 검증은 아님 |
| 실제 운영 응답 | 일반 GET 4회 | 보안 헤더 확인, CSP 배포 차이는 S3 |
| 타입 검사 | 감사 테스트를 포함한 `pnpm typecheck` | 통과 |

인증된 Action 검증은 UI에서 버튼을 숨기는지 확인한 것이 아니라 실제 `next-action` 요청을 보낸 뒤 DB 변경 여부를 비교했다. SSR 스트리밍은 거부여도 HTTP 200이 될 수 있어 상태 코드뿐 아니라 redirect와 응답 canary·DB 상태를 함께 확인했다.

## 시크릿·방화벽·로그

- **Gitleaks 8.30.1:** 공식 릴리스 바이너리 체크섬 검증 후 실행했다. HEAD에서 도달 가능한 이력 637개 커밋과 추적 파일 스냅샷 1,438개를 검사했다. 이력 6건·현재 4건은 같은 테스트용 signing-secret fixture였다. 실제 자격증명 유출은 확인하지 못했다. gitignore된 로컬 파일, dangling Git 객체, CI/외부 서비스 로그 전체는 검사 범위 밖이다.
- **Vercel 프로젝트 custom firewall rule:** 0개, 미게시 draft 없음. 앱 전용 요청 제한이 운영 설정으로 보강됐다는 증거는 없다. 기존 ARCHITECTURE의 ‘남용 관측 후 플랫폼 규칙 검토’ 정책을 새 코드 결함으로 집계하지 않았다.
- **Vercel 통합 firewall overview:** IP Bypass 기능의 요금제 제한으로 HTTP 402. 개별 custom rule 목록은 조회했지만, 이것으로 기본 DDoS 방어·시스템 우회·팀 전체 설정까지 검증했다고 볼 수 없다. 설정을 변경하지 않았다.
- **운영 로그:** production 최근 24시간·최대 100건을 요청했으나 반환된 4건은 이번 감사 GET과 일치했다(200×2, 307×2). 과거 공격·침해 유무를 판단하기에 불충분하다. ‘침해 흔적 없음’으로 결론 내리지 않는다.

## 재현 방법과 남은 범위

S1의 재현 테스트는 일반 `pnpm test` 수집 경로 밖에 둔다. 보안 결함이 남아 있는 기준 커밋에서는 **exit 1이 예상 결과**다. Node 24, 설치된 의존성, 생성된 Prisma 클라이언트, 로컬 PostgreSQL 바이너리가 필요하다. 기본 바이너리 경로는 `/opt/homebrew/opt/postgresql@17/bin`이며 다른 환경은 `CREDENTIAL_PG_BIN`을 지정한다.

```sh
pnpm exec vitest run --config docs/features/security-audit-2026-09-27/vitest.config.ts
```

테스트는 자체 Unix socket 클러스터와 가짜 암호화 키를 사용하고 종료 시 클러스터를 정리한다. 실제 `.env.local`·dev/prod DB 접속 정보가 필요하지 않다.

남은 범위:

- 실제 GitHub/Google 계정으로 하는 OAuth·로그인 연결 전체 브라우저 왕복. 이번 검증은 로컬 가짜 세션과 기존 Auth.js fixture를 사용했다.
- 프로덕션 빌드 산출물의 의존성 도달 가능성 및 production 모드의 전체 동적 검사. 로컬 HTTP는 dev 모드였다.
- 모든 Server Action·모든 역할 조합의 전수 HTTP 검사, 광범위한 능동 스캐너 검사. 이번 HTTP 검증은 위험도가 높은 대표 경로를 선택했다.
- 플랫폼 전체 WAF/DDoS/경보 상태, 충분한 기간의 공격 로그, 키 회전 이력, 백업 복원 실측.
- 고부하·메일 발송·실제 GitHub 쓰기·실제 Blob 쓰기를 동반하는 남용 실험. 이번 감사에서는 수행하지 않았다.

**출시 전 우선순위:** S1 수정 → S2·S3 배포 게이트 완료 및 실제 운영 재검 → S4 영향 판정. 방화벽·로그의 미검증 부분은 별도 운영 체크로 남긴다.

## 외부 근거

- [OWASP ASVS](https://owasp.org/projects/asvs?tab=main): 검증 영역의 참고 기준.
- [Gitleaks 공식 저장소](https://github.com/gitleaks/gitleaks): 시크릿 검사 도구와 redaction 기능.
- [deepmerge-ts 권고](https://github.com/RebeccaStevens/deepmerge-ts/security/advisories/GHSA-ggr8-5vv4-36mx): 순환 객체 병합의 스택 고갈.
- [mysql2 인증 권고](https://github.com/sidorares/node-mysql2/security/advisories/GHSA-3f6p-5ww8-9rcr): MySQL 인증 플러그인 변경에 따른 평문 자격증명 전송.
- [mysql2 압축 권고](https://github.com/sidorares/node-mysql2/security/advisories/GHSA-rgwj-5xj2-c3m3): 압축 프로토콜 처리의 자원 고갈.

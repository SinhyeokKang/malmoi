# 보안 확대 감사 — 2차

2026-09-27. **추가 범위에서 새로 확정한 Critical/High 취약점은 없다.** 기존 S1 이메일 갱신 경합과 S2·S3 운영 반영 문제는 미해결 상태로 인계한다. 이번 회차는 그 수정 완료를 검증하지 않았다. 전체 앱이 안전하다는 인증이나 실제 공격 흔적 부재 판정은 아니다.

앱 기준은 `2cebd052ea931d463b60b5ad557a6a9f495b374f`, 1차 산출물은 `f7ac300f`다. 사용자 작업 중인 dev와 분리된 `SinhyeokKang/security-audit-2026-09-27`에서 수행했다. 앱 구현·의존성·운영 설정은 수정하지 않았다.

## 배치별 결과

| 배치 | 확대 범위 | 실행 결과 | 판정·남은 범위 |
|---|---|---|---|
| E1 | 실제 프로덕션 빌드와 공급망 도달성 | Node 24.21.0에서 `pnpm build` 성공. `.next/**/*.nft.json` 36개에서 `mysql2`, `deepmerge-ts` 경로 0개 | S4를 설치 의존성 경고와 배포 런타임 노출로 구분할 근거 추가. 실제 Vercel 배포 산출물을 내려받아 검사한 것은 아니며, 설치·빌드 환경의 위험까지 없다는 뜻은 아님 |
| E2 | 프로덕션 서버의 인증·테넌트 경계 | 읽기 Action 4종 × 익명/다른 프로젝트 8건, 익명 초대 수락 1건 거부. 같은 계정의 자기 프로젝트 소스 조회 1건 성공 | HTTP 200 자체를 성공으로 세지 않고 RSC 결과의 `unauthorized`·`not-found`·`ok`를 확인. 실제 OAuth 제공자 왕복과 초대 메일 발송은 제외 |
| E3 | 프로덕션 CSP·파일 노출 | 공개 페이지 4회에서 CSP nonce와 모든 실행용 script nonce 일치, 요청별 nonce 변경. 비공개 파일·인코딩된 상위 경로 4건 404 | 로컬 `next start`의 정책은 동작. S3의 실제 운영 배포 차이를 해결한 것은 아님. 브라우저의 정책 집행·JS 실행은 미검증 |
| E4 | 악성 파일·번역 값·CLI/CI 입력 | 새 공격 입력 검사 14건, 기존 CLI/워크플로 회귀 21건 통과 | 아래 입력 범위에서 코드 실행·프로토타입 오염·외부 파일 추적을 확인하지 못함. 전체 파서 입력에 대한 자원 격리나 무제한 부하 내성은 보장하지 않음 |

추가 결과는 **자동화 검사 35/35, HTTP 판정 19/19 통과**다. 1차 2,405개와 합산해 전체 테스트 수로 표현하지 않는다. `pnpm typecheck`도 통과했다.

## E2·E3 HTTP 검사

별도 포트 `127.0.0.1:43187`에서 `next start`를 실행했다. 1차의 socket-only 임시 PostgreSQL과 합성 사용자 `owner-b`를 재사용했다. 세션은 합성 원문 `security-audit-owner-b`를 실제 앱 해시 함수로 저장한 것이며 운영 자격증명이 아니다. 해당 사용자는 `audit-b` OWNER이고 `audit-a` 멤버가 아니다. 두 프로젝트에는 `web` 표면이 있다.

- `loadPublishPreview`, `loadSourceDetail`, `loadMoreTranslationKeys`, `previewTranslationRevert`: 익명은 `unauthorized`, `owner-b`의 `audit-a` 요청은 `not-found`.
- `acceptInvitation`: 가짜 초대 토큰을 가진 익명 요청은 `unauthorized`.
- 양성 대조: 같은 세션으로 `audit-b/web`의 `loadSourceDetail`은 `ok: true`.
- `/privacy` 2회, `/signin`, `/docs`: 각각 실행용 script 15·15·16·17개 전부 CSP nonce와 일치. nonce 4개 모두 다름. `strict-dynamic` 존재, `unsafe-eval` 없음.
- `/.env.local`, `/.git/config`, `/prisma/schema.prisma`, `/docs/%2e%2e/%2e%2e/.env.local`: 전부 404. 단, 격리 체크아웃에는 실제 `.env.local`이 없으므로 첫 요청은 존재하는 비밀 파일 보호를 단독 증명하지 않는다. `prisma/schema.prisma`는 실제 존재한다. worktree의 `.git`은 디렉터리가 아닌 연결 파일이다.

`http-production-probe.py`는 빌드의 Server Action manifest에서 ID를 읽는다. **위 합성 DB·세션을 먼저 준비한 격리 서버 전용**이며 단독 실행 가능한 fixture 생성기는 아니다. 원래 dev나 운영 서버를 대상으로 실행하지 않는다. 실행 뒤 이번 감사가 띄운 서버와 임시 PostgreSQL을 종료했다.

## E4 입력 검사와 정적 추적

`expanded.test.ts`는 저장소 모듈을 직접 호출하며 외부 서비스 쓰기를 하지 않는다.

- 유효 PNG 뒤에 붙인 `<script>`가 WebP 재인코딩 후 사라지는지, PNG 절단 길이 5종이 거부되는지 확인했다.
- 코드 딕셔너리의 IIFE·getter·최상위 대입·템플릿 보간이 파싱 중 실행되지 않는지 canary와 정상 키 양성 대조로 확인했다.
- JSON의 `__proto__`·`constructor.prototype` 키가 전역 객체 프로토타입을 오염시키지 않았다.
- JSON·TS·YAML의 101단 중첩이 어댑터 진입 전 거부됐다. YAML 자기참조 alias는 번역 키로 확장되지 않았다.
- 작은따옴표·큰따옴표 원본에 공격 문자열을 번역으로 출력한 뒤 별도 VM 컨텍스트에서 평가했다. 값은 정확히 보존되고 canary 대입은 실행되지 않았다. 템플릿 리터럴 원본은 어댑터의 비관리 대상이므로 기존 값 유지가 정상이다.

검사 작성 중 YAML alias를 반드시 오류로 반환한다고 가정한 단언과 템플릿 리터럴을 관리 대상으로 본 단언이 각각 실패했다. 구현 계약을 확인해 각각 **확장 없음**, **원본 유지**로 정정했다. 앱 결함을 고쳐 초록으로 만든 결과가 아니다.

추가 회귀는 `lib/cli/__tests__/push-url.test.ts`, `walk.test.ts`, `lib/__tests__/url-token.test.ts`, `scripts/__tests__/workflow-pins.test.ts`다. CI와 composite action, workflow 생성기, push URL·fetch 경로도 읽었다. CI는 `contents: read`이며 외부 action은 SHA에 고정돼 있다. composite의 사용자 입력은 실행 문자열이 아니라 환경변수와 인자 배열로 전달된다. 소비자에게 제공하는 말모이 action 참조는 버전 태그이므로 그 태그의 원격 불변성·보호 정책은 이번 로컬 검사로 증명하지 않는다.

## 재현 명령

Node 24 환경, 격리 체크아웃에서:

```sh
pnpm build
pnpm exec vitest run --config docs/features/security-audit-2026-09-27/vitest.expanded.config.ts
pnpm exec vitest run lib/cli/__tests__/push-url.test.ts lib/cli/__tests__/walk.test.ts lib/__tests__/url-token.test.ts scripts/__tests__/workflow-pins.test.ts
pnpm typecheck
# Only after starting the isolated synthetic production server described above:
python3 docs/features/security-audit-2026-09-27/http-production-probe.py
```

정량 증거는 [expanded-evidence.json](./expanded-evidence.json), 기존 조치 항목은 [1차 보고서](./report.md)에 있다. 다음 출시 판정에는 수정된 dev 커밋의 재검증과 실제 운영 S2·S3 반영 확인이 필요하다.

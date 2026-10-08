# Self-hosting — 기술 설계

작성: 2026-10-08 · 사전 초안 · 범위 정본: [spec.md](spec.md)

## 1. 현재 경계와 변경 지점

| 현재 코드 | 관측 | 제안하는 변경 |
|---|---|---|
| `next.config.ts`, `package.json` | Next 서버 빌드, standalone 미설정 | 기존 버전을 유지한 standalone 컨테이너 |
| `lib/db.ts`, `prisma.config.ts` | PrismaPg, 배포 명령은 dev/prod URL 구분 | 일반 Postgres와 별도의 명시적 self-hosted 운영 명령 |
| `lib/credentials/command.ts` | 대상 Supabase ref·포트·DB·query allowlist 고정 | hosted 방어를 유지하고 self-hosted target을 별도로 검증 |
| `lib/github-connect/origin.ts`, `lib/mcp/http.ts` | 알려진 hosted/로컬 호스트만 허용 | 설정한 origin 하나를 정확하게 허용 |
| `lib/onboarding/workflow.ts`, `app/(edit)/mcp/page.tsx` | 호스팅 서비스 기본 주소가 있음 | self-hosted에서는 명시적 인스턴스 URL, 잘못된 설정은 실패 |
| `lib/upload/store.ts`, `lib/upload/image.ts` | Vercel Blob API·URL 형식 의존 | 기존 경계에 파일 저장 구현을 연결 |
| `lib/invitation-email/config.ts`, `message.ts` | 발송 origin 제한·서비스 도메인 이미지 | 설치 origin 검증과 메일 자산 URL 통일 |
| `vercel.json`, `app/api/pull/route.ts` | Vercel 일일 cron, 프로젝트별 결과 응답 | 독립 스케줄러에서 같은 인증 경로 호출 |
| `lib/seo/site.ts`, sitemap·llms routes, Analytics | 고정 공개 origin·정적 산출물·Vercel 집계 | 런타임 인스턴스 URL, self-hosted noindex 및 집계 비활성 |

push는 생성 워크플로의 목적지만 바뀐다. 편집 UI는 업로드 저장소와 URL 제공 경계만 바뀐다. pull은 같은 코어를 호출하는 실행 주체만 바뀐다. 어댑터·병합·인가 정책은 변경하지 않는다.

## 2. 설정과 origin

서버 전용 설정을 `lib/env.ts`를 통해 지연해서 읽는다. 순수 파서는 주입받은 값으로 `hosted | self-hosted` 계약을 검증한다. 테스트·빌드의 모듈 import 시점에 런타임 비밀을 요구하지 않는다. 실행 전 preflight에서는 필수 설정 누락을 비밀 없이 보고하고 종료한다.

| 환경변수 | 계약 |
|---|---|
| `MALMOI_DEPLOYMENT` (신규) | 생략 시 기존 hosted. Compose는 `self-hosted`를 명시. 알 수 없는 값은 오류 |
| `MALMOI_ORIGIN` (신규) | self-hosted 필수 HTTPS origin. 사용자정보·path·query·fragment 금지. 요청 헤더에서 추론하지 않음 |
| `MALMOI_UPLOAD_DIR` (신규) | self-hosted 업로드 볼륨의 절대 경로. 앱 실행 사용자에게만 필요한 쓰기 권한 |
| `MALMOI_PRIVACY_URL` (신규) | 운영자 정책의 HTTPS URL. 자체 `/privacy`로 순환하는 설정 금지 |
| `AUTH_URL`, `AUTH_TRUST_HOST` (기존 라이브러리 설정) | origin과 일치하는 URL 및 신뢰 proxy 배선. trust 설정만으로 임의 Host를 허용하지 않음 |
| `DATABASE_URL`, `DIRECT_URL` (기존) | 런타임·마이그레이션 연결을 분리. self-hosted는 `DIRECT_URL_PROD`를 사용하지 않음 |
| 기존 OAuth·App·서명·암호화·메일·Cron 값 | 운영자 자신의 값. 호스팅 서비스 값을 복사하지 않음 |

`VERCEL_ENV=production`을 임의로 세워 hosted 판정을 우회하지 않는다. `INVITATION_EMAIL_ORIGIN`을 별도로 제공하면 인스턴스 origin과 일치해야 한다. 새 설정과 필수/선택 여부를 `.env.example` 및 배포 예제에 함께 기록한다.

reverse proxy가 외부 Host와 forwarded 헤더를 정규화하며 앱 포트는 내부망에만 연다. 앱은 설정 origin과 요청의 허용 여부를 검증한다. 인증 콜백·계정 연결·MCP Origin/issuer/resource·Server Action CSRF 검사를 모두 실제 proxy를 통해 시험한다. hosted preview의 기존 허용 목록은 별도로 유지한다.

HSTS는 hosted에서 기존 `max-age=63072000; includeSubDomains; preload`를 유지하고, self-hosted에서는 `max-age=63072000`만 보내 설치 호스트 아래 다른 서비스를 HTTPS로 강제하지 않는다. `lib/security-headers.ts`의 기존 순수 정책을 확장하며 별도 설정 옵션은 추가하지 않는다. 현재 `next.config.ts`의 정적 헤더 배선에 배포 모드를 빌드 시점 값으로 고정하지 않고 런타임 배포 설정을 반영한다. proxy 예제는 앱의 HSTS를 그대로 전달하고 같은 헤더를 추가하지 않는다. 같은 이미지 digest를 두 배포 모드로 실행해 페이지·API·정적 자산의 최종 응답마다 HSTS가 하나이며 해당 모드의 정확한 값인지 검증한다.

GitHub 로그인 OAuth App, GitHub App의 user-to-server 자격증명, installation 토큰의 경계를 유지한다. GitHub·Google provider는 모두 제공하며 운영자가 각 callback을 등록한다. 검증 이메일을 가진 사용자는 현재처럼 로그인할 수 있고, 프로젝트 접근은 멤버십으로만 열린다. 셀프 호스팅을 초대 전용 가입으로 오해하지 않도록 설치 문서에 명시한다.

`workflowApiUrl`은 self-hosted에서 유효한 URL을 반드시 출력한다. 현재 action `malmoi-i18n-push-v2`의 `api-url` 입력과 통합 검증한다. 설정 실패를 `undefined`로 바꿔 SaaS에 보내지 않는다. MCP 화면의 hosted fallback도 같은 계약으로 막는다. 도메인 변경은 OAuth 재등록·재연결을 요구하며 토큰을 자동 이식하지 않는다.

## 3. 이미지 저장

기존 put/read/delete/list 소비자를 그대로 수용하는 작은 저장 경계만 둔다. hosted는 Vercel Blob, self-hosted는 파일 볼륨으로 결정하며 추가 provider 등록 API는 만들지 않는다. 외부 SDK의 list 결과 타입이 새 구현까지 퍼지지 않도록 실제 소비 필드만 정의한다.

- 기존 랜덤 키 문법·업로드 크기 제한·192px WebP 정규화를 유지한다. 원본 이미지는 보관하지 않는다.
- self-hosted DB 이미지 참조는 `/api/images/<key>` 형태로 저장한다. 기존 Blob URL도 기존 규칙으로 처리하며 `imageSrc`, 삭제 계획, 입력 검증, 메일 이미지 URL, 관련 정리 도구를 함께 대조한다.
- 읽기는 기존 이미지 route를 통한다. 공개 난수 키라는 현재 접근 모델을 유지하고 디렉터리 listing·임의 파일 serving을 추가하지 않는다.
- 순수 함수는 키 문법·참조 변환을 판단한다. I/O에서는 볼륨 밖 경로와 symlink 탈출을 차단하고, 임시 파일 후 rename으로 부분 기록을 피한다. 쓰기 실패 후 DB가 존재하지 않는 새 파일을 가리키지 않도록 기존 처리 순서를 검증한다.
- 쿠키·Authorization을 외부 이미지 호스트로 넘기지 않는다. Blob 읽기의 정확한 호스트 제한을 일반 URL 허용으로 완화하지 않는다.

## 4. DB와 키 운영

새 애플리케이션 테이블·컬럼은 필요하지 않다. 기존 마이그레이션 이력을 수정하지 않고 빈 Postgres에서 전부 실행한다. Supabase 역할이 있을 때만 처리하는 SQL과 `public` 권한 회수 이후 런타임 접근을 실제 검증한다.

배포용 bootstrap은 마이그레이션 소유자와 최소 권한 런타임 계정을 분리한다. 기존·향후 테이블 및 sequence 권한을 명시하고 앱에는 DDL/superuser 자격증명을 주지 않는다. 이는 설치 DB의 역할·권한 설정이며 새 제품 스키마 마이그레이션이 아니다. DB 포트는 publish하지 않는다.

운영 명령에 `self-hosted` target을 추가한다. hosted dev/prod의 Supabase allowlist와 `PRISMA_TARGET` 안전 장치를 유지한다. self-hosted URL 역시 driver가 대상 host/user/port를 query로 덮을 수 없도록 검증한다. `db:deploy`를 그대로 호출해 hosted prod URL을 요구하는 경로를 만들지 않는다.

`TOKEN_ENCRYPTION_KEYS`·활성 ID, `PII_ENCRYPTION_KEYS`·활성 ID, `EMAIL_LOOKUP_KEY`·ID, `AUTH_SECRET`, `APP_SIGNING_SECRET`, `CRON_SECRET`을 구분한다. 재시작 때 자동 재생성하지 않으며 keyring의 이전 복호화 키도 백업한다. 현재 회전·verify·reindex·finalize 절차가 self-hosted target에서 실행되어야 한다. 키를 잃은 DB 백업만으로는 복구할 수 없다.

## 5. 컨테이너와 실행 순서

제안 서비스는 proxy, postgres, migrate(일회성), web, scheduler다. proxy의 정확한 배포물은 착수 전 지원 환경 검증에서 고정한다. 사용자가 TLS를 구성해야 하는 전제와 설정 예제를 제공한다. 앱·DB는 같은 서버의 내부망에 두고 웹은 non-root로 실행한다. 업로드와 DB는 각각 영속 볼륨을 사용한다.

순서는 DB healthy → migrate 성공 → web ready → scheduler 시작이다. readiness는 설정 검증·DB 질의·적용된 migration·업로드 경로 사용 가능 여부를 검사하고, 외부 공개 응답에는 상세 오류나 비밀을 싣지 않는다. 업그레이드에서는 기존 migrate 컨테이너의 과거 성공을 재사용하지 않고 해당 릴리스의 명령을 새로 실행한다.

Compose는 컨테이너가 실행 중이라는 사실만으로 readiness를 보장하지 않으므로 `service_healthy`와 `service_completed_successfully` 조건을 사용한다. [Docker 공식 문서](https://docs.docker.com/compose/how-tos/startup-order/)

Node·pnpm·의존성 버전은 현재 저장소 정본을 따른다. runtime 이미지와 migration/키 운영 도구 이미지는 같은 소스 revision으로 만든다. `.env*`, `.git`, 로컬 데이터·백업을 build context에서 제외하고 이미지 layer·history·번들에 비밀이 없는지 검사한다. 운영 비밀은 권한을 제한한 런타임 설정으로만 공급한다.

standalone에는 `public`·`.next/static`을 별도 복사하고 가이드 원고·생성 Prisma client·sharp 네이티브 모듈을 검증한다. 특히 docs뿐 아니라 런타임 llms 경로에서도 원고를 읽을 수 있어야 한다. [Next.js output 문서](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)

한 앱 인스턴스만 지원한다. 다중 replica용 Server Action 키 공유나 무중단 배포는 추가하지 않는다. 업그레이드 후 이전 화면 탭은 새로고침이 필요할 수 있음을 문서화한다. 최신 Next 문서는 참고이고 저장소 버전을 올리는 근거가 아니다.

## 6. 스케줄러

일일 18:00 UTC에 기존 `/api/pull`을 Bearer `CRON_SECRET`으로 호출하는 작은 프로세스를 둔다. 다음 실행 시각 계산만 순수 함수로 분리한다. 스케줄러에는 Cron 비밀과 내부 목적지만 주고 DB·OAuth·암호화 키를 주지 않는다.

실행은 단일 프로세스에서 겹치지 않게 한다. 기존 route의 시간 예산보다 긴 유한 timeout을 사용한다. 200 응답의 `results`와 `unprocessed`까지 해석해 실패·부분 처리를 구별한다. 불명확한 네트워크 실패를 즉시 재시도하지 않고 운영자가 로그로 확인한다. 중단 중 놓친 회차의 자동 따라잡기나 큐는 없다. 수동 실행은 같은 경로를 사용한다.

## 7. 공개 URL·메일·개인정보 안내

호스팅 서비스의 canonical은 계속 서비스 도메인을 가리킨다. self-hosted는 설정 origin을 사용하고 Analytics를 서버에서 제외한다. robots 차단과 페이지 noindex를 제공하되 이것을 보안 기능이라고 설명하지 않는다.

같은 이미지를 여러 origin에 배포하려면 origin을 담는 sitemap·llms 산출물을 빌드 때 고정할 수 없다. 해당 경로는 런타임 렌더링으로 전환하는 안을 사용한다. hosted의 응답 URL·내용은 유지하되 정적 산출물이 동적 실행으로 바뀌는 비용을 검증하고 관련 tracing을 보강한다. origin과 무관한 언어별 검색 색인은 정적으로 유지한다. 캐시를 추가한다면 deployment/origin이 섞이지 않는다는 검증이 선행되어야 한다.

메일은 기존 Resend REST 호출, after-commit 발송, accepted/unknown 판정, 자동 재시도 없음의 계약을 유지한다. 링크·로고·프로젝트 이미지는 설치 origin을 기준으로 만든다. SMTP 선택 시 이 절은 미확정이 되며 transport와 오류 판정 설계를 다시 작성한다.

self-hosted의 `/privacy`는 운영자가 제공한 `MALMOI_PRIVACY_URL`로 임시 redirect한다. 서비스 운영자의 연락처나 Vercel·Supabase 이용 설명을 해당 설치의 정책인 것처럼 노출하지 않는다. 실제 연락처·삭제 요청 절차는 운영자 정책에 포함하도록 문서화한다. 화면 구조를 신설하지 않으므로 디자인 브리프는 없다.

사용자 가이드의 en·ko·es MCP 연결 원고와 FAQ도 필수 변경 대상이다. MCP 연결은 현재 인스턴스의 **Copy server URL**로 얻은 주소를 사용하도록 안내하며, SaaS 주소를 그대로 복사하게 두지 않는다. 개인정보 문의는 해당 설치의 `/privacy`로 연결하고, 처리 기한은 운영자 정책에서 확인하도록 안내한다. hosted의 30일 응답 약속은 hosted 정책에 유지하며 모든 설치의 공통 약속으로 쓰지 않는다. 원고는 런타임 origin 치환 없이 두 배포에서 통하는 안내로 유지한다. 가이드 화면뿐 아니라 언어별 정적 검색 색인과 llms 파생본에도 같은 안내가 반영되는지 확인한다.

## 8. 백업·업그레이드·복구

1. scheduler와 웹의 신규 유입을 멈추고 실행 중 쓰기를 종료한다.
2. DB dump, 업로드 볼륨, 모든 암호화·서명 키 및 배포 설정을 같은 정지 구간에서 백업한다. 이미지 digest·migration 상태·백업 시각을 비밀 없는 manifest로 남긴다.
3. 목표 릴리스 도구로 migration을 실행한 뒤 앱을 기동한다. smoke 성공 뒤 외부 유입과 scheduler를 연다.
4. 실패 시 DB 호환성이 입증된 경우에만 이전 이미지를 사용한다. 그렇지 않으면 이전 DB·이미지·키 백업을 함께 복원한다. 무조건적인 down migration을 제공하지 않는다.
5. 복원 검증은 scheduler를 끈 격리 환경에서 먼저 수행한다. 실제 리포 쓰기는 테스트 리포로 제한하고 의도하지 않은 PR 생성을 막는다.

백업 파일은 DB와 같은 호스트에만 남기지 않도록 운영 안내에 포함한다. 키·DB dump의 접근 권한을 제한하고 복원 검증 없이 백업 성공만으로 SH-10을 통과시키지 않는다. 과거 시점 복원으로 되살아난 세션·토큰의 폐기 여부도 운영 절차에서 점검한다.

## 9. 순수 함수와 불변식

| TDD 대상 | 검증 |
|---|---|
| deployment 설정 parser·origin 정책 | 누락·오타·HTTP·userinfo·서브패스·위조 Host 거절, hosted 호환 |
| workflow/MCP/메일 URL 계획 | self-hosted의 SaaS fallback 금지, 정확한 callback/resource |
| 저장 키·참조·삭제 계획 | 기존 Blob와 로컬 참조, traversal·인코딩 우회 거절 |
| credential target parser | hosted allowlist 유지, self-hosted URL query override 거절 |
| 다음 UTC 실행 시각·응답 요약 | 경계 시각·재시작·부분 실패·미처리 판정 |
| 공개 metadata/추적 정책 | hosted canonical 보존, self-hosted noindex·Analytics 제외 |
| deployment별 HSTS 정책 | hosted 기존 값 보존, self-hosted의 includeSubDomains·preload 제외 |

파일 권한·symlink·atomic write·migration·proxy·OAuth는 순수 테스트만으로 완료하지 않고 통합 검증한다. 기존 함수를 확장하는 곳은 새 이름의 중복 정책을 만들지 않는다.

불변식 1–4의 strict 적재·병합 없음·보존·결정성, 5·7의 멤버십 인가, 6의 자격증명 분리, 8·9의 readiness/실패 표현, 10·11의 경로·repositoryId 보호를 그대로 재사용한다. 새 저장소는 앱 이미지의 저장 경계이고 번역 export/blob SHA 판정에는 관여하지 않는다.

## 10. 과거 장애에서 가져오는 제약

[POSTMORTEM](../../POSTMORTEM.md)의 다음 기록을 구현 리뷰에서 확인한다.

- 2026-08-31 환경변수 import 시점 요구: 비밀 없는 build와 지연 설정 읽기 검증.
- 2026-09-09 DB 직접 공개: 앱 인가 외에 DB 네트워크·권한 검증.
- 2026-09-10 DB URL과 실제 driver 대상 불일치: URL query override 방어 유지.
- 2026-09-28 외부 rewrite의 세션 쿠키 유출: 이미지 proxy의 무헤더 읽기 유지.

새 설정은 런타임에 읽을 수 있는 위치에 두고 reverse proxy를 앞에 둔다는 배포 원칙은 [Next.js self-hosting 문서](https://nextjs.org/docs/app/guides/self-hosting)를 참고한다. 구체적인 동작은 저장소에 고정된 버전에서 검증한다.

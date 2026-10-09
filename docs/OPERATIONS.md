# OPERATIONS — 운영 절차

## 활동 스트림 배포 — 마이그레이션 → 새 writer → 보충 백필 → 수집 개시 시각

logs-rework (ARCHITECTURE §5.7). **운영 차단이 없다** — 새 테이블과 nullable 컬럼 하나뿐이고 기존
읽기 경로는 그대로다. 순서를 지키는 이유는 **과거를 만들어내지 않기 위해서**다.

1. **스키마**: `/merge` 1단계의 `pnpm db:deploy`로 `add_project_event_store`를 프로덕션에 넣는다.
   같은 마이그레이션이 **보존된 `SyncRun`마다 참조 이벤트 하나**를 만든다(결정적 id라 재실행이 no-op).
2. **새 writer 배포** — 프로덕션 alias 전환 + 60초(가장 긴 `maxDuration`) 경과. 여기까지는 구
   writer가 만든 실행이 이벤트 없이 남을 수 있다.
3. **보충 백필** — 1과 같은 `INSERT … ON CONFLICT DO NOTHING`을 다시 돌린다. **구 writer가 더
   쓰지 않는 것을 확인한 뒤에만** 한다(2가 끝나지 않았으면 다시 벌어진다).
   ```sql
   -- 프로젝트별로 세 수가 전부 0이어야 끝난 것이다. 건수 비교 하나로 판정하지 않는다.
   select count(*) from "SyncRun" r
     left join "ProjectEvent" e on e."syncRunId" = r.id and e."projectId" = r."projectId"
    where e.id is null;                                            -- 누락
   select count(*) from (select "projectId","syncRunId" from "ProjectEvent"
     where "syncRunId" is not null group by 1,2 having count(*) > 1) t;   -- 중복
   select count(*) from "ProjectEvent" e join "SyncRun" r on r.id = e."syncRunId"
    where r."projectId" <> e."projectId";                          -- 잘못된 연결
   ```
4. **수집 개시 시각** — 3이 0/0/0으로 끝난 **뒤에** 기존 프로젝트에 실제 전환 시각을 한 번 쓴다.
   ```sql
   update "Project" set "activityCoverageStartedAt" = '<2단계 alias 전환 시각 UTC>'
    where "activityCoverageStartedAt" is null;
   ```
   ⚠️ **입증할 수 없으면 `null`로 둔다** — 화면이 경계선을 숨긴다. 가장 이른 이벤트나 마이그레이션
   시각으로 추정하면 **없는 사실을 말하는** 줄이 하나 생긴다. 신규 프로젝트는 생성 트랜잭션이 이미 쓴다.
   ⚠️ **재백필이 이 값을 바꾸지 않는다** — 3을 다시 돌려도 4는 다시 하지 않는다.
5. **CI 계약 전환은 별개 순서다** (docs/ACTIONS.md "실행 식별자"): 서버가 선택적 `executionId`를
   **받는 상태로 먼저 배포** → 불변 Action 태그 릴리스(`executionId`를 내는 첫 태그는 `@malmoi-i18n-push-v2`다 — v1은 옮기지 않는다) → 사용 리포 전환(워크플로 재복사).
   그 사이의 구 생산자는 정상 처리되지만 **HTTP 재전달 중복 방지가 보장되지 않는다.**

⚠️ **계정 삭제와의 관계**: `ProjectEvent.actorUserId`가 `SetNull`이라 사용자를 지우면 저자만 빈다.
**payload·searchText에는 원문 이메일도 사람 이름도 없다**(멤버 대상은 저장 시점에 마스킹된다) —
그래서 FK 하나로 정리가 끝난다. 그 성질이 깨지면 이 절에 정리 절차를 추가해야 한다.

## 전달 기준 배포 A — 스키마 → writer → 수집 (translation-rework, ARCHITECTURE §5.8)

**운영 차단이 없다** — 새 테이블 둘이고 기존 읽기 경로는 그대로다. 배포 A는 기준을 **모으기만** 하고 아무도 읽지 않는다
(Revert는 배포 B다). 순서를 지키는 이유는 **옛 코드가 남긴 상태를 기준으로 믿지 않기 위해서**다.

1. **스키마**: `/merge` 1단계의 `pnpm db:deploy`로 `20260923020548_add_delivery_baselines`를 넣는다(2026-09-23 적용 완료).
   두 테이블은 비어 있고, 빈 것이 정상이다 — **과거 전달을 추정해 backfill하지 않는다.**
2. **writer 배포**(`bc91a95` 이후) — 첫 **편집 있는** Publish 성공부터 소스마다 `DeliveryConfirmation`이 선다.
   ⚠️ **구 writer와 섞이는 창이 따로 없다** — 전환 직전에 시작한 구 실행은 `RUNNING` 행을 들고 있어 `startRun` 게이트가
   새 실행을 거부하고(`already-running`), 그 실행은 `maxDuration`(60초) 안에 끝난다. 그래서 새 확인 뒤에 구 writer의
   Publish가 끼어들 수 없다. 전환 뒤 첫 확인 전까지는 모든 셀이 unknown이다(정상).
3. **확인**: 아래가 0이어야 한다 — 확인이 가리키는 실행이 성공으로 닫혔는지, 기준 행이 확인과 같은 revision인지.
   ```sql
   select count(*) from "DeliveryConfirmation" c join "SyncRun" r on r.id = c."syncRunId"
    where r.status not in ('SUCCEEDED','SKIPPED');                  -- 실패로 닫힌 실행의 확인
   select count(*) from "TranslationBaseline" b join "DeliveryConfirmation" c
     on c."projectId" = b."projectId" and c."surfaceId" = b."surfaceId"
    where c."invalidatedAt" is null and c.revision <> b.revision;  -- 유효한 확인과 어긋난 기준(Revert가 거부한다 — 0이 아니면 원인 조사)
   ```
   ⚠️ 첫째 쿼리는 **실행 행 종료가 실패한 드문 경우**(성공 확정 뒤 `SyncRun` 갱신 실패)에 1이 될 수 있다 — 그 실행의 외부 쓰기는
   끝났으므로 확인 자체는 참이다. 0이 아니면 그 실행의 로그를 본다.
4. **롤백 후 재전진** — `bc91a95` 이전 빌드로 되돌렸다가 다시 올리면, 그 사이 구 writer가 한 Publish는 확인·기준을 갱신하지
   않았다. **재전진 직후 한 번** 전부 무효화한다(행은 지우지 않는다 — 다음 성공 확정이 되살린다).
   ```sql
   update "DeliveryConfirmation" set "invalidatedAt" = now() where "invalidatedAt" is null;
   ```
   ⚠️ 테이블은 롤백해도 지우지 않는다(additive). 구 코드는 그 테이블을 모르고, FK가 Restrict라 키·로케일 삭제도 막지 않는다
   (그 경로가 원래 없다).

### 배포 B — 화면 개방 (Revert를 사람이 누른다)

**배포 B는 기준을 읽는 쪽이다** — 세 패널 작업 화면이 키 단위 저장(`saveTranslationKey`)과 `Revert to last sent`를 연다.
스키마 변경이 없다. ⚠️ **2026-09-23에 실브라우저·실리포 검증보다 먼저 나갔다**(#71 — C2~C4가 한 번에 머지됐다). 격리 PG
(`pnpm test:projects:postgres`)는 배포 전에 통과했고, 나머지는 배포 뒤 **로컬 dev + dev DB**(preview가 아니다)에서 돌렸다 —
실브라우저 폭·키보드·IME·접힌 트리·재로그인 복구는 Chrome으로, 실리포 왕복은 `bugshot-i18n-test` PR #3(chrome-locales) ·
`i18n-format-check` PR #8(yaml-catalog)으로 전달 → 재편집 → Revert → 머지 → Sync · `no-changes`까지 확인했다.

1. **옛 셀 저장이 남아 있는 빌드와 섞이지 않게 한다** — 옛 셀 단위 Server Action `saveTranslation`(T16에서 지웠다 — 지금의 공유 코어 `lib/keys/save-translation.ts`와 다른 것)은 복원 기준을 기록하지 않고 값을 쓴다.
   그 Action이 살아 있는 빌드로 되돌렸다가 다시 올리면, 그 사이 저장된 셀의 기준이 없거나 낡았다. **재전진 직후 한 번** 위 4번의
   전부 무효화를 돌린다(다음 편집 있는 Publish가 되살린다 — 그 사이 Revert는 `baseline-unknown`으로 막힌다. 막히는 쪽이 옳다).
2. **확인**: 위 3번의 두 쿼리가 계속 0이어야 한다. Revert가 거부만 낸다면(`baseline-unknown`·`baseline-stale`) 먼저 그 소스의 확인이
   무효화됐는지 본다 — push·import·base branch 변경·Publish 시작이 전부 무효화한다(ARCHITECTURE §5.8). 정상 동작이다.

**남은 검증** — 아래는 한 번도 밟지 않았다. 이 화면을 다시 만질 때 먼저 닫는다.

- 200언어 fixture(실리포 상한이 57이었다 — `i18n-many-locales`) · Safari·Firefox · 네이티브 `beforeunload` 확인창 육안 ·
  성능 지표(`responseEnd`·`transferSize`·`loadEventEnd` — dev 서버 수치로 판정하지 않는다, ARCHITECTURE §1.95) · 실브라우저 뒤로/앞으로
  (guard가 Next 내부 동작에 기댄다, ARCHITECTURE §1.97).
- 실리포 왕복에서 빠진 셋: **비-base 부재 셀의 Revert**(두 폐기용 리포에 빈 셀이 없어 리포를 고쳐야 만들 수 있다 — 지금은
  `revert-key.integration.ts`만 덮는다) · **base 빈값** · **편집 전 pull이 `no-changes`로 끝나는 고정점**.
- ⚠️ 대량 적재 직후 첫 렌더가 서버에서 2.0분이었다(57언어 · 619키, 둘째 요청 1.6초). 낡은 통계로 계획이 섰다고 **추정**만 했고
  재현하지 않았다 — 프로덕션의 새 대형 프로젝트 첫 화면에 같은 창이 열리는지 미확인이다.

## 새 머신 셋업 (체크아웃 3개 산출물이 전부 gitignore다)

**두 대에서 작업한다.** 새 체크아웃은 `node_modules`·`generated/prisma`·`public/fonts`·`.env.local`이 전부 없고, 앞의 셋은 명령으로 복구되지만 **`.env.local`만 사람이 채운다.**

1. **Node를 `.nvmrc`에 맞춘다**(24). **어긋났을 때 맞추는 방향은 Vercel 쪽이다** — 프로덕션이 진실이고 `.nvmrc`가 따라간다.
2. `pnpm install`
3. `cp .env.example .env.local` 후 값을 채운다. ⚠️ **암호화 키 셋(환경변수 여섯)이 비면 로그인·초대·멤버 조회가 통째로 죽는다** — TOKEN·PII는 `*_ENCRYPTION_KEYS`와 `*_ACTIVE_KEY_ID` 쌍이고 EMAIL_LOOKUP만 `EMAIL_LOOKUP_KEY`·`_KEY_ID`다. ⚠️ **서명 키 `APP_SIGNING_SECRET`도 비면 GitHub 연결(시작·callback)과 온보딩 탐지·샘플이 500이다**(MCP 탐지·생성 도구는 `unavailable`) — 로그인은 된다. 초대 메일 셋(`RESEND_API_KEY` 등)은 비어도 되고 그때 초대 발급만 막힌다. **⚠️ 이 파일은 에이전트가 편집하지 않는다** — 편집하면 하네스가 "파일이 바뀌었다" 알림으로 **전문을 컨텍스트에 넣어** 시크릿이 트랜스크립트에 남는다(2026-09-04에 실제로 유출돼 전면 재발급했다). 구조가 필요하면 **다른 경로에 템플릿을 쓰고** 사람이 값을 채워 옮긴다. ⚠️ **`vercel env pull`로는 못 가져온다** — 전부 Vercel의 **Sensitive**라 CLI도 대시보드도 값을 못 읽는다. **다른 머신의 `.env.local`을 옮기는 것이 정상 경로**다.
   - **GitHub OAuth 앱은 하나(`malmoi`)이고 세 환경이 같은 값을 쓴다** — Google과 같은 모양이다. ⚠️ **2026-09-14 이전 기록에 "앱이 셋"이 나오면 그건 낡았다**: GitHub이 OAuth App에 **Add redirect URI**를 열어 "callback URL은 앱당 하나"가 거짓이 됐고, 그래서 `malmoi-dev`·`malmoi-local`을 접었다.
   - prod 키 작업(`credentials:prod`·`credentials:finalize:prod`)을 할 머신이면 **`.env.prod.local`도 옮긴다** — prod 키를 담는 파일이고 같은 이유로 gitignore다(§1).
   - ⚠️ **Google도 클라이언트가 하나다** — redirect URI를 여러 개 등록할 수 있어 로컬·preview·프로덕션 셋을 한 클라이언트에 넣고 같은 값을 세 곳에 둔다.
4. `pnpm db:status`(dev) · `pnpm db:status:prod`(prod)로 접속을 확인한다. ⚠️ 두 출력이 **같아 보인다**(pooler 호스트가 같고 ref는 사용자명에 있다) — 구별 신호는 **적용된 마이그레이션 개수**다.
5. `pnpm db:generate` — 안 하면 `@/generated/prisma/client`를 못 찾는다.
6. `pnpm typecheck && pnpm test`로 셋업 확인. 폰트는 `predev`가 복사한다.

⚠️ **`vercel env add`는 환경을 하나씩만 받고, `--force`를 믿지 말고 목록으로 확인한다** (CLI 59.11 실측). Preview에서 `--force`가 `✓ Overrode`를 출력하고도 값이 그대로였다. 갱신 뒤 `vercel env ls <environment>`의 시각 열을 보고, 안 바뀌었으면 `vercel env rm … --yes` 후 다시 넣는다. **성공 메시지가 근거가 아니다.** 값은 stdin으로 넘긴다 — `--value`는 `ps`에 노출된다.

## 1. 암호화 키 셋 — 섞지 않는다

**저장된 것은 전부 봉투·해시이고 원문은 쿠키와 프로세스 메모리에만 있다.** 키가 셋인 이유는 용도가
셋이기 때문이고, `validateCredentialKeys`가 **키 값 셋이 서로 다른지** 검사한다(⚠️ `*_KEY_ID` 셋은
**서로 비교하지 않는다** — keyring 안의 이름이라 전부 `k1`이어도 통과한다. 단 active kid가 그 keyring에
없으면 던진다. 그리고 전환 CLI에서만 돈다).

| 무엇 | 환경변수 | 무엇을 여나 |
|---|---|---|
| 토큰 | `TOKEN_ENCRYPTION_KEYS`·`_ACTIVE_KEY_ID` | GitHub App **연결 토큰**(access·refresh) |
| 개인정보 | `PII_ENCRYPTION_KEYS`·`_ACTIVE_KEY_ID` | `User.email`·`name`·`image` · 초대 email |
| 검색 | `EMAIL_LOOKUP_KEY`·`_KEY_ID` | 정확 일치 조회용 HMAC (**복호화가 아니다** — 되돌릴 수 없다) |

- **세션은 키가 없다** — `sha256:v1:` digest는 도메인 분리 해시라 대조만 한다.
- **서명 키 `APP_SIGNING_SECRET`은 이 셋에 들지 않는다** (2026-09-27, sec-audit-3 #14) — 저장된 것을 여는 키가
  아니라 **GitHub 연결 state 쿠키(10분)와 온보딩 샘플 확인값(30분)**에 HMAC을 거는 키이고, `AUTH_SECRET`(Auth.js
  전용)과도 갈라져 있다. 32바이트 base64url 한 개(`.env.example`에 생성 명령). 셋·`AUTH_SECRET`과 **다른 값**이어야
  한다 — 검사하는 코드는 없다. 회전은 아래 §2 끝.
- ⚠️ **형식이 갈린다**: `*_ENCRYPTION_KEYS`는 keyring JSON, `EMAIL_LOOKUP_KEY`는 **원시 base64 하나**.
  섞으면 base64 디코드가 조용히 깨진다.
- ⚠️ **dev와 prod가 다른 키다** — dev 키가 새도 프로덕션 회원 데이터가 안 열려야 한다. 도구는
  *어느 DB*만 검사하고 **키는 target에 안 묶여 있으므로**, prod 명령은 `.env.prod.local`을 셸로
  source해 덮는다(`set -a; . ./.env.prod.local; set +a;`). 그 파일에 넣을 수 없는 이유는 이름이 같아
  한 파일에 두 벌이 안 들어가고 dotenv가 셸 env를 override하지 않아서다.
- ⚠️ **PII 키를 잃으면 회원 이메일·이름을 복구할 수 없다** — DB 백업을 되살려도 그 시점의 키가 있어야
  열린다. **키와 백업을 쌍으로** 보관하고 회전할 때 옛 키를 지우지 않는다.
- **프로필 이미지 업로드 배포 시**: `User.image`도 PII 봉투 대상이다(`lib/credentials/records.ts`).
  PII 키를 잃으면 사진 URL을 복구할 수 없고 Vercel Blob 파일은 고아로 남는다. 교체 후 이전 파일
  삭제 실패도 고아를 남긴다. `pnpm smoke:blob`은 테스트 파일의 저장·다운로드·삭제·404를 확인하고
  Blob 목록과 복호화된 `User.image`의 차집합을 **삭제 없이 후보로만** 출력한다. 복호 불가 행이나
  동시 업로드가 있으면 오탐할 수 있으므로 후보를 자동 삭제하지 않는다.
  ⚠️ **같은 저장소가 프로젝트 로고도 든다** (2026-09-20 — `projects/<projectId>/…` 프리픽스).
  `Project.image`는 **PII 봉투가 아니라 평문 컬럼**이라 PII 키를 잃어도 살아남는다 —
  `pnpm smoke:blob`은 `avatars/`·`projects/` 두 프리픽스를 모두 훑고 `planImageDelete`·
  `planProjectImageDelete` 둘로 고아 후보를 가른다.
  로컬에는 `BLOB_READ_WRITE_TOKEN`이 필요하며 환경별로 별도 공개 저장소를 쓴다.
  ⚠️ **`BLOB_PUBLIC_HOST`도 환경마다 넣는다** (2026-09-27, sec-audit-3 #12) — 그 환경 스토어의 공개 호스트
  (`<id>.public.blob.vercel-storage.com`, 스킴·경로 없이. Vercel 대시보드 Storage → 스토어 → 파일 하나의 URL 호스트)이고
  **`/api/images/[...key]`가 상류로 부를 호스트다**(2026-09-28 — 전에는 CSP `img-src`의 값이었다).
  **비밀이 아니다**(Sensitive로 넣지 않는다 — 값을 다시 읽을 수 있어야 대조된다).
  ⚠️ **없거나 모양이 틀리면 조용하다** — 부팅·업로드는 성공하고 **업로드한 사진·로고만 화면에서 안 보인다**
  (이제 CSP 위반이 아니라 `/api/images/*`가 전부 404다 — 서버 로그에 `{ stage: "host" }`).
  스토어를 새로 만들거나 바꾸면 이 값도 같이 간다. 확인: `vercel env ls <environment>`에 `BLOB_PUBLIC_HOST`가 있고, 업로드한
  이미지가 뜬다.

## 2. 키 회전

**각 회전에도 전체 차단·drain이 필요하다.** 새 키를 keyring에 추가하고 **기존 키를 보존한 채** 도구
환경의 active kid를 새 키로 설정한다. 기본은 check-only이고 `--apply`는 `--traffic-blocked
--writers-drained`를 함께 요구한다(운영자 확인 표식이지 차단 기능이 아니다).

```sh
pnpm credentials:dev --mode=rotate-token --apply --traffic-blocked --writers-drained
pnpm credentials:dev --mode=rotate-pii   --apply --traffic-blocked --writers-drained
pnpm credentials:dev --mode=verify
```

- **토큰과 PII 회전은 별개다.** `expires_at`과 `emailLookup`을 바꾸지 않는다.
- 새 active kid를 앱에 반영하기 **전에** 전건 복호화와 `verify` 보고의 `oldTokenKey`·`oldPiiKey`가
  각각 0인지 확인한다.
- ⚠️ **active kid 환경변수가 비어 있으면 도구가 멈춘다** (2026-09-14). 전에는 `process.env`를 직접 읽어
  `undefined`와 비교했고, 그러면 **모든 행이 "옛 키"로 읽혀 전건이 재암호화**됐다. 지금은
  `requireEnv`라 던지고, `convertCredentials`가 맨 먼저 부르는 `validateCredentialKeys`가 그 자리에서
  `[credentials] <ref> credential-env: missing environment variable <이름>` 한 줄을 stderr에 찍는다 — **원인은
  그 줄이 말한다.** CLI 마지막 줄 `credential-conversion-failed: keep traffic blocked; no values logged`만 보고
  판단하지 않는다. ⚠️ 변수는 있는데 kid가 키링에 없으면 그 줄 없이 마지막 줄만 나온다 — 그때는 active kid와
  `*_ENCRYPTION_KEYS`의 키 이름이 맞는지 본다.
- **운영 DB뿐 아니라 보존된 백업이 요구하는 키도 폐기하면 안 된다.**
- prod는 명령 이름만 `credentials:prod`로 바꾼다. ⚠️ **그 명령은 prod DB를 직접 겨눈다**(`db:deploy`와
  같은 부류). 도구는 dev/prod 각각 고정 Supabase ref·5432·DB 이름을 검증하고, DB URL을 CLI 인자로
  받지 않으며 URL query는 `sslmode=verify-full`만 허용한다.

**검색 키 교체**는 개인정보 키를 그대로 두고 `EMAIL_LOOKUP_KEY`/`_KEY_ID`만 새 것으로 설정한 뒤 돌린다.
전 행을 복호화해 재색인하므로 **옛 검색 키가 없어도 가능하다.**

```sh
pnpm credentials:dev --mode=reindex --apply --traffic-blocked --writers-drained
pnpm credentials:dev --mode=verify
```

**부분 교체 상태에서 서비스를 재개하지 않는다.** 재실행 뒤 전 행 동일 세대 · 이메일 중복 없음을
확인하고 새 키를 설정한 앱을 활성화한다.

⚠️ **이 절차 둘은 아직 리허설하지 않았다** (2026-09-13 현재). 2026-09-10 전환에서 **미룬 항목이고
실패한 항목이 아니다** — 전환 자체(backfill·전건 검증·평문 인덱스 제거)는 dev·prod 양쪽에서 끝났다.

| 미완 | 무엇을 확인해야 하나 |
|---|---|
| **키 회전 리허설** | 전체 트래픽 차단 상태에서 **부분 실패·재개·키 유실·백업 복원**까지 밟아 본다. `--apply`가 도는 것만 확인한 상태다 |
| **차단·drain 리허설** | 이전 배포 URL·OAuth callback·cron·CI·로컬 writer를 **실제로** 막고, 차단 중 refresh/API 호출이 0인지 확인한다. ⚠️ **이 저장소에는 그 차단을 자동으로 증명하는 수단이 없다** — 수단·증거가 없으면 회전을 **중단**한다 |

**둘 다 실제 회전이 필요해지기 전에 한 번 밟아 본다.** 처음 밟는 자리가 운영 사고 한가운데면
"차단됐는지 모르는 채로 `--apply`를 누르는" 상태가 된다.

### 서명 키 회전 (`APP_SIGNING_SECRET`)

**차단·drain이 필요 없다** — 이 키로 만든 것은 DB에 없고 쿠키·모달 상태와 MCP 에이전트가 든 확인값으로만 산다(최장 30분).
새 값을 넣고 재배포하면 끝이고, 그 순간 진행 중이던 GitHub 연결 왕복과 열린 새 프로젝트 모달의 확인값, 에이전트가
`detect_formats`에서 받아 둔 확인값이 **한 번** 실패한다(연결은 다시 누르고, 모달은 다시 탐지하면 새 확인값을 받는다.
MCP `create_project`·`add_sources`는 `sample-expired`를 받고 `detect_formats`를 다시 부르면 풀린다 — `lib/mcp/confirm.ts`).
이중 키 검증은 두지 않았다.

최초 등록은 2026-09-27 — Vercel Development · Preview · Production과 메인 체크아웃의 `.env.local`. **두 번째 머신의
`.env.local`은 확인되지 않았다** — 그 머신에서 연결·탐지가 500이면 이 키부터 본다.

1. 새 값 생성: `node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))'` — 환경마다 다른 값.
2. `.env.local`(머신 둘)과 Vercel Production · Preview · Development에 넣는다. ⚠️ **`vercel env add`는 환경을 하나씩만
   받고 `--force`의 성공 메시지를 믿지 않는다** — `vercel env ls <environment>`의 시각 열로 확인한다(CLAUDE.md).
3. 재배포. **값이 없으면 연결 시작·callback·온보딩 탐지가 `requireEnv`로 500**이다(fail-closed) — MCP 탐지·생성
   도구는 같은 실패를 `unavailable`로 접는다(`lib/mcp/tools/execute.ts`). 로그인은 `AUTH_SECRET`만 쓰므로 그대로 된다.
   증상이 "연결만 죽었다"이면 이 키부터 본다.

- **`AUTH_SECRET` 회전은 이 키와 무관하다** — 진행 중 로그인 왕복만 깨고 DB 세션도, 연결 state도, 샘플 확인값도
  건드리지 않는다.

## 3. 복구

- **로그인·초대가 전부 "Unavailable"이면 서버 로그의 `[credentials]` 줄부터 본다** (2026-09-18 — 전에는 0줄이었다).
  `credential-env: missing environment variable <이름>`이면 그 키가 빠진 것이고, 나머지는 분류 한 낱말(`sign-in: CredentialError`
  · `credential-io: PrismaClientKnownRequestError` 등)이다. **원문은 어디에도 안 남는다** — Prisma 인자·암호문이 실리기 때문이다.
  같은 형의 줄이 인증 왕복과 초대에도 있다 — `[session-revocation]`·`[login-link]`·`[account-connect]`·`[invite]` 접두의
  `<ref> <단계>: <분류>`(`lib/failure.ts` `logCaught`, 2026-09-18). 콜백이 던졌으면 단계가 `callback`이다.
- **PII 키 유실 시 계정을 재생성하지 않는다 — 백업 키를 복원한다.**
- 암호화 백업 복원 후에도 **트래픽을 차단한 상태에서** 해당 keyring으로 `verify`를 끝낸다.
- **평문 코드로 rollback하지 않는다.**
- **백업 복원·새 DB에서는 `pnpm credentials:finalize:dev` / `:prod`로 finalize 마이그레이션 상태를 먼저
  확인한다** — 기본 check-only라 `pending`만 보고한다. 그다음은 트래픽을 막은 채로 둘이다:
  ```sh
  pnpm credentials:dev --apply --traffic-blocked --writers-drained            # 평문 행이 남아 있으면 — 기본 모드가 backfill이다
  pnpm credentials:finalize:dev --apply --traffic-blocked --writers-drained   # pending이면 — migrate deploy 뒤 verify를 다시 돈다
  ```
  prod는 명령 이름만 `:prod`로 바꾸고 §1처럼 `.env.prod.local`을 source한다. finalize도 먼저 `verify`를 돌아 그것이
  실패하면 아무것도 적용하지 않는다(`scripts/finalize-credentials.ts`).
- 마이그레이션 실패 시 `_prisma_migrations`와 실제 DDL을 대조한다. 전부 롤백된 것이 확인된 경우에만
  검토 후 `migrate resolve --rolled-back <name>`으로 재시도하고, **체크섬 수정·무조건 applied·DB
  reset으로 통과시키지 않는다.**
- **백업 복원·새 DB에서 표면 축을 다시 밟을 때만 `prisma/maintenance/backfill-surfaces.sql`을 쓴다.**
  같은 DB에서 테이블을 잠그고 옛 Project의 포맷·적재 상태와 null 자식을 재백필한다. ⚠️ **새 writer가
  활성화된 뒤에는 실행하지 않는다** — dual-write가 아니므로 Project의 옛 값이 더 이상 정본이 아니다.
  새 Surface 상태가 Project보다 앞섰거나 기본 외 표면이 있으면 스크립트가 중단한다. 끝난 뒤 아래가 전부 0이어야 한다:
  ```sql
  SELECT 'Locale' AS model, count(*) FROM "Locale" WHERE "surfaceId" IS NULL
  UNION ALL SELECT 'StringKey', count(*) FROM "StringKey" WHERE "surfaceId" IS NULL
  UNION ALL SELECT 'Translation', count(*) FROM "Translation" WHERE "surfaceId" IS NULL
  UNION ALL SELECT 'Project', count(*) FROM "Project" WHERE "defaultSurfaceId" IS NULL;
  ```
- **편집 토큰 backfill은 0행이 두 번 연속 나올 때까지 돌린다**(스크립트가 반복한다). 백업 복원이나
  새 DB에서 `pending_edit_token_precondition`이 걸릴 때 필요하다:
  ```
  pnpm exec tsx scripts/backfill-pending-edit-token.ts                     # dev (.env.local의 DATABASE_URL)
  DATABASE_URL='<prod 접속 문자열>' pnpm exec tsx scripts/backfill-pending-edit-token.ts   # prod — 값은 사람이 붙인다
  ```
  ⚠️ **`.env.local`을 편집해 prod를 겨누지 않는다** — 그 파일은 에이전트가 건드리지 않는 파일이다.
  `DIRECT_URL_PROD`(5432)도 쓸 수 있다(한 문장 UPDATE라 세션 모드면 된다).
- **precondition이 실패하면 편집을 버리거나 토큰을 손으로 채워 통과시키지 않는다.**
  `precondition failed: unsent edits without pendingEditToken remain`이면 롤백 → backfill → 재적용이다:
  `migrate resolve`에는 래퍼 스크립트가 없어 **여기서만 예외로 `PRISMA_TARGET`을 손으로 넘긴다**(CLAUDE.md의 "사람이 넘기지 않는다"는 래퍼가 있는 명령 기준이다):
  ```
  PRISMA_TARGET=prod pnpm exec prisma migrate resolve --rolled-back 20260917170000_pending_edit_token_precondition   # dev는 PRISMA_TARGET 없이
  # backfill을 그 DB에 다시 돌린다
  pnpm db:deploy
  ```
  위 "마이그레이션 실패" 규칙 그대로다 — `migrate dev`가 리셋을 제안하면 거부한다. 표면 축의
  precondition도 같다: SQL을 우회하거나 TRUNCATE하지 말고 누락된 surface·default 소유권을 조사한다.

## 4. 재현 가능한 검증

- `pnpm test` — 암호 도구·저장 경계·인가·초대·토큰 refresh 회귀.
- `pnpm typecheck` — 타입 계약.
- `pnpm test:credentials:postgres` — 임시 Unix socket 전용 PostgreSQL 클러스터를 만들고 제거한다.
  공유 DB URL을 읽지 않는다. 기본 바이너리는 `/opt/homebrew/opt/postgresql@17/bin`이고 다른 환경은
  `CREDENTIAL_PG_BIN`에 로컬 PostgreSQL bin 디렉터리를 지정한다. initdb/pg_ctl/pg_dump/psql이 필요하며
  테스트용 프로세스가 root이면 실행할 수 없다.
  ⚠️ **`pnpm test`에 없다**(별도 config). `lib/credentials/**`를 건드리면
  `pnpm gate`가 붙인다(트리거 정본 `scripts/gate-plan.ts`).
- `pnpm test:projects:postgres` — 같은 방식으로 격리 클러스터를 띄워(`CREDENTIAL_PG_BIN` 동일) 목록 집계,
  Add surface 원자성·동일 key/locale 공존·교차 FK 거부·실제 Project 생성, 편집 토큰의 조건부 쓰기를
  검사한다. ⚠️ **이것도 `pnpm test` 밖이다** — 트리거 경로를 건드리면
  `pnpm gate`가 붙인다 — 전체 목록의 정본은 `scripts/gate-plan.ts`다.
- 격리 테스트는 실제 Auth.js 핸들러와 **가짜** OAuth 응답, 실제 DB unique/잠금/CAS, 중단·재개·백업
  복원을 검사한다. **실제 공급자·배포 차단·키보드/포커스 검증을 대신하지 않는다.**

## GitHub App 콘솔 설정 — 설치 중 인가

App 설정 > General (2026-09-18, install-and-connect):

- **Request user authorization (OAuth) during installation** **켬** — GitHub이 설치 URL의 `state`를 callback까지 싣고 `code`와 함께 돌려준다. ①의 [Install GitHub App]이 설치와 연결을 한 왕복으로 끝내는 전제다. 끄면 설치 복귀가 state 없이 오고 연결은 따로 해야 한다(보조 링크 "Connect your account").
- **Setup URL**은 **비운다** — 옵션이 켜져 있으면 쓰이지 않는다(GitHub이 callback으로 보낸다). 남겨 두면 누가 옵션을 끄는 순간 지운 라우트(`/api/github/setup`)로 가서 404다.
- **Redirect on update** 켬 — 리포 선택을 바꾸고 Save하면 callback으로 state 없이 돌아오고, callback이 `/projects/new`에 쓰기 없이 착지시킨다.

⚠️ **App이 둘이다**(2026-09-27): 프로덕션 `malmoi-sync`, 로컬·preview `malmoi-sync-dev`(폐기용 리포에만 설치). **위 세 설정을 두 App에 똑같이 둔다.** dev App의 callback은 `https://dev.mal-moi.com/api/github/callback`(첫째)·`http://localhost:3000/api/github/callback`, prod App은 `https://mal-moi.com/api/github/callback` 하나다. ⚠️ **설치 URL은 `redirect_uri`를 받지 않는다** — App의 **첫** callback으로 간다. 그래서 로컬에서 시작한 설치는 `dev.mal-moi.com`에 착지한다(쿠키가 없어 교환 0회로 거부된다). 로컬에서는 보조 링크(Authorize, `redirect_uri`가 로컬)로 연결하고 GitHub에서 직접 설치한 뒤 [Try again]으로 본다. 요청 대기(D)·목록 위 info는 dev DB의 `Account.installRequestedAt`을 직접 심어 본다. 설치 왕복 자체(1클릭·요청 복귀·승인 복귀)는 **preview(`dev.mal-moi.com`, dev App)와 프로덕션**에서 실측한다. ⚠️ **사용자 인가(user-to-server 토큰)도 App별이다** — App을 바꾸면 그 환경 DB에 남은 옛 App의 인가가 `/account`에 "Connected"로 보이는데 설치 목록이 비어, 연결·push 토큰 교체가 `repo-not-installed`로 거부된다. 그 사용자가 `/account`에서 Disconnect → Authorize GitHub App으로 새 App을 인가하면 풀린다(2026-09-27 dev DB에서 밟음).

### 설치가 안 되거나 `not-installed`일 때

- ⚠️ **GitHub App이 `Make public`이어야 한다 — 2026-09-17까지 private이었다.** private 앱은 **소유 계정(`SinhyeokKang`)에만 설치된다**: 그 사이 다른 계정·조직은 설치 링크에서 GitHub이 막아 **새 사용자의 프로젝트 생성이 통째로 불가능했다**(초대받은 번역자는 설치가 필요 없어 안 드러났다). 증상이 malmoi 쪽에 아무 로그도 안 남기고, 오너 계정으로 검증하면 항상 통과한다 — **"다른 계정에서 설치가 안 된다"를 들으면 앱 설정 Advanced부터 본다.** ⚠️ **앱이 둘이다** (2026-09-27, launch-readiness L2.10): 프로덕션은 `malmoi-sync`(개인키는 Vercel **Production**에만), 로컬·preview는 `malmoi-sync-dev`(`.env.local` + Vercel **Preview**, **폐기용 리포에만 설치**). 두 앱의 권한·설정(설치 중 인가 켬 · Setup URL 비움 · Redirect on update · public)은 같게 유지한다. 앱을 바꾸면 설치 ID가 달라 그 환경의 모든 프로젝트 `installationId`가 무효가 되고 [Reconnect]로 복구된다(malmoi#52). ⚠️ **Vercel의 `GITHUB_APP_*`는 환경별 변수여야 한다** — Production·Preview를 한 변수로 묶어 두면 `vercel env rm <name> preview`가 **Production까지 지운다**(2026-09-27 실측, 곧바로 복구했다).
- ⚠️ **App 설치가 `Only select repositories`면** **DB에 `Project` 행을 만드는 것만으로는 부족하고** GitHub 설치의 선택 목록에도 그 리포를 넣어야 한다. 설치 범위 자체는 여기 적지 않는다(자주 바뀐다 — 콘솔이 정본). 안 넣으면 `probeRepo`가 `not-installed`를 주고 야간 pull은 "base 브랜치를 읽을 수 없다"를 낸다. ⚠️ **리포를 만들었다고 목록에 든 것이 아니다** — 둘은 다른 화면이고, 그 간극이 `not-installed`를 만난 사람을 엉뚱한 곳으로 보낸다. **`not-installed`를 보면 앱 설정의 Repository access를 먼저 연다.** ⚠️ **그 목록을 여기 적지 않는다** — GitHub 콘솔이 정본이고 문서 사본은 실물보다 앞서거나 뒤처지기만 했다(2026-09-23에 걷었다). 폐기용 리포 각각이 **왜 필요한지**는 `.claude/commands/roundtrip.md` 전제 조건 1과 `runtime-test.md` §7.1이 든다.

## Google OAuth 동의 화면 — 게시와 도메인 소유권 (2026-09-19)

**상태: External + 게시(In production).** 그 전까지 테스트 모드였고 **등록된 테스트 사용자만** 로그인됐다 — 초대받은 비개발자 동료가 목록에 없으면 막혔다는 뜻이다. ⚠️ **Internal로 바꾸지 않는다** — 조직 밖 계정이 `403 org_internal`로 막혀 초대 경로가 통째로 죽는다.

**심사는 없었다.** 요청 스코프가 `email`·`profile`(non-sensitive)뿐이라 검토 대상이 아니고, [게시] 버튼이 요구한 것은 **선행 둘**이었다:

1. **개인정보처리방침 URL** — `https://mal-moi.com/privacy`(프로덕션에 실물로 서 있어야 한다).
2. **승인된 도메인 `mal-moi.com`** — 등록이 **Search Console 도메인 소유권 인증**을 요구한다.

### 도메인 소유권 인증 (가비아 DNS)

DNS는 가비아가 든다(`ns.gabia.co.kr`). My가비아 → 도메인 → DNS 관리툴에서 레코드 추가: 타입 `TXT` · 호스트 **`@`**(도메인 전체를 쓰지 않는다) · 값 `google-site-verification=<토큰>` · TTL 기본. 따옴표는 가비아가 붙이므로 값에 직접 넣지 않는다. **기존 CNAME(`dev` → Vercel)과 타입이 달라 충돌하지 않는다.**

⚠️ **한 번 실패했고, 그 실패는 눈으로 구별되지 않는다.** 정상 토큰은 `google-site-verification=` 뒤 **43자**인데 인증 창의 입력칸이 폭에 맞춰 잘려 보여 **36자만 복사됐다.** 그리고 실패 화면이 *"다음 DNS TXT 레코드가 대신 발견되었습니다"*로 **그 잘린 값을 그대로 되읽어**, 화면상으로는 정답과 같은 문자열이 나란히 놓인다. **판정은 길이로 한다**:

```
dig +short TXT mal-moi.com | tr -d '"' | sed 's/.*=//' | awk '{print length($0)}'   # 43이어야 한다
```

값은 인증 창의 **[복사] 버튼**으로 가져온다(드래그 선택 금지 — 칸이 잘려 보인다). 반영은 가비아 원본(`@ns.gabia.co.kr`)과 퍼블릭 리졸버(`@8.8.8.8`) 둘 다에서 확인한 뒤 [확인]을 누른다.

## 개인정보 삭제 요청 (방침 `deletion` 절의 약속)

방침이 공표한 약속: `ox501501@gmail.com`으로 온 열람·정정·삭제 요청에 **30일 안에** 답한다. 셀프서비스 화면은 없다(PRODUCT §4.2).

**지우는 순서가 정해져 있다** — `ProjectMember.user`·`ProjectInvitation.invitedByUser`가 `onDelete: Restrict`라 `User`부터 지우면 던진다.
① 그 사람의 `ProjectMember` 행 ② 그 사람이 **보낸** 초대(`invitedBy`) ③ 그 사람에게 **온** 미수락 초대 ④ `Session`·`Account` ⑤ 직접 올린
프로필 사진(Blob) ⑥ 마지막에 `User`. ⚠️ **마지막 OWNER면 멈춘다** — 그 행을 지우면 아무도 접근할 수 없는 `Project`가 남으므로 소유권
이전이 선행이다. ⚠️ **번역 값은 남기고 저자만 끊는다** — `Translation.updatedBy`는 FK가 없어 손으로 `NULL`을 쓰고, `SyncRun.requestedBy`는
`SetNull`이라 자동이다. 활동 사건(`ProjectEvent`)은 지우지 않고 행위자 연결만 `SetNull`로 끊긴다(마스킹 라벨만 남는다).
⚠️ **Resend의 발송 기록은 앞당겨 지울 수 없다** — 보낸 지 30일에 스스로 사라진다(방침이 그렇게 말한다).

## 초대 메일 — Resend (2026-09-24)

**구성**: 도메인 `notify.mal-moi.com`(Resend 리전 **Tokyo** `ap-northeast-1`, 2026-09-23 Verified) · 발신 `Malmoi <invite@notify.mal-moi.com>`(`INVITATION_EMAIL_FROM` — Vercel 값도 이 표기인지 대시보드에서 확인한다) ·
open/click tracking **꺼짐**(추적 서브도메인을 구성하지 않았다 — 켜면 초대 URL이 추적 링크로 바뀌고 방침의 "no tracking"이 거짓이 된다) ·
TLS **Enforced**(2026-09-24 — Opportunistic이던 첫 발송 한 통이 SES→Gmail 구간을 평문 `ESMTP`로 가서 Gmail이 "암호화하지 않았습니다" 경고를 달았다.
같은 설정의 다른 발송은 `ESMTPS TLS1_3`이었다 — 발송마다 갈린다. Enforced는 TLS를 못 하는 수신 서버로의 발송을 실패시키고, 그것은 앱에 `email-rejected`/`unknown`으로 보인다).
확인은 받은 메일 원본의 `Received: from …amazonses.com … with ESMTPS … version=TLS1_3` 한 줄이다. DNS는 가비아다: `send.notify`의 MX·SPF(TXT), `resend._domainkey.notify`의 DKIM(TXT) — 값은 Resend 도메인 화면이
정본이다. DMARC는 따로 두지 않았다 — 루트 `_dmarc.mal-moi.com`(`p=none`)이 서브도메인에 적용된다.

**환경변수 셋 × 환경**(`lib/invitation-email/send.ts`가 읽는다 — `.env.example` 참고): `RESEND_API_KEY` · `INVITATION_EMAIL_FROM` ·
`INVITATION_EMAIL_ORIGIN`. production은 `https://mal-moi.com`, preview(dev 브랜치)는 `https://dev.mal-moi.com`, 로컬은 `http://localhost:3000`.
⚠️ **키는 환경마다 따로다** — Resend API Keys에서 Sending access · 도메인 `notify.mal-moi.com` 한정으로 `malmoi-prod`·`malmoi-preview`를
발급했고 로컬은 preview 키를 쓴다. 하나가 새도 다른 환경의 키를 회전하지 않아도 된다.

**키 회전**: ① Resend에서 같은 권한으로 새 키 발급 ② `vercel env rm RESEND_API_KEY <env> --yes` 후 `vercel env add RESEND_API_KEY <env>`(값은
프롬프트로 — `--value`는 `ps`에 남는다, preview는 `preview dev`) ③ `vercel env ls <env>`의 시각 열로 바뀐 것을 확인(성공 메시지는 근거가 아니다 —
CLAUDE.md) ④ 재배포 ⑤ 초대 한 통을 지정 수신자로 보내 접수를 확인한 뒤 옛 키를 Resend에서 revoke. ⚠️ **①~④ 사이에는 옛 키가 살아 있어야 한다** —
먼저 revoke하면 그 창 동안 모든 발급이 `email-rejected`(401)로 떨어지고, 이미 만든 초대는 메일 없이 Pending에 남는다(Resend로 복구).

**설정이 틀렸을 때의 증상**: 셋 중 하나라도 없거나 origin이 환경과 안 맞으면(`config.ts`의 `origin-mismatch`) **발급 전에** `email-unavailable`이고
화면은 *Email is unavailable right now*다 — 초대 행이 생기지 않는다. 키가 틀리면(401) 발급은 되고 메일만 `rejected`다.

**오류 확인**: 서버 로그의 `[invite-email] batch <rejected|unknown> <http-NNN|network> count=N` 한 줄이 전부다(주소·토큰·키·공급자 원문은
남기지 않는다). 그 시각으로 Resend 대시보드 **Emails**에서 같은 요청을 찾는다. `unknown`(timeout·5xx·불완전 응답)은 **일부가 나갔을 수 있다** —
다시 보내면 이전 링크가 만료된다.

**보존**: Resend는 보낸 메시지(수신 주소·제목, 그리고 링크·프로젝트 이름·썸네일 주소(있을 때)·역할이 든 본문)를 **30일** 보관한다(Free 플랜 값 — 요금제를 바꾸면 방침 `retention` 절도 확인한다).
방침 `third-parties`·`retention` 절이 이 사실을 공표한다.

**한도**: 앱 쪽은 같은 주소 60초 · 프로젝트 최근 1시간 20건 · 발급자 1인 전 프로젝트 합산 1시간 30건이고(`lib/invitation-email/limits.ts`), Resend 요금제 한도는 그보다 넓다고 가정한다 —
넘으면 429가 `email-rejected`로 보인다.

## 운영자 지정 — `OPERATOR_EMAILS` (2026-10-03, operator-account)

**무엇**: 운영자(사용자당 프로젝트 상한 면제 — PRODUCT §3·§4.2, 판정은 ARCHITECTURE §6.2.2)를 정하는 정적 allowlist다. 값은 쉼표로 구분한
**이메일 주소 전체**이고(`me@example.com,other@example.com`), 운영자가 **로그인한 계정의 주소**를 넣는다 — GitHub·Google 어느 쪽으로 들어와도
같은 `User`라 하나면 된다. 도메인 단위 지정은 없다. 비거나 없으면 운영자 0명이다(fail-closed — 다른 동작은 그대로).

⚠️ **값은 개인정보다** — Vercel에 **Sensitive**로 넣고, 로그·채팅·커밋에 값을 찍지 않는다(`cat`·`echo` 금지). `.env.example`에는 빈 값과 주석만 있다.

**넣기**:

1. **로컬**: 사람이 `.env.local`에 `OPERATOR_EMAILS="<주소>"`를 넣는다(에이전트는 이 파일을 편집하지 않는다 — "새 머신 셋업"). 두 머신 모두.
2. **Vercel — 환경별 변수로 하나씩**(Production·Preview를 한 변수로 묶으면 `vercel env rm … preview`가 Production까지 지운다 — CLAUDE.md "게이트웨이").
   값은 `.env.local`의 것을 **stdin으로** 넘긴다(`--value`는 `ps`에 노출된다):
   `grep '^OPERATOR_EMAILS=' .env.local | cut -d= -f2- | sed 's/^"//; s/"$//' | vercel env add OPERATOR_EMAILS production --sensitive`
   — `preview`도 같은 꼴(브랜치 지정 없이 Preview 전체). 이미 있으면 `vercel env rm OPERATOR_EMAILS <env> --yes` 후 다시 넣는다(`--force`를 믿지 않는다).
3. **확인**: `vercel env ls production`·`vercel env ls preview`에 `OPERATOR_EMAILS`가 각각 한 행씩 있고 시각 열이 방금이다.
   ⚠️ **`vercel env add`의 성공 메시지는 근거가 아니다**(위 "새 머신 셋업").
4. ⚠️ **env는 다음 배포부터 적용된다** — Preview는 dev push(`/push`) 전, Production은 `/merge` 전에 넣는다. 나중에 넣었으면 재배포한다.
   로컬은 `pnpm dev`를 재시작해야 읽는다.

**동작 확인 (한 문장)**: OWNER 활성 3개 상태에서 `/projects/new` ①이 리포 목록을 보이면 적용, `Project limit reached`면 주소 오기(로그인한 계정의 주소와 철자 대조).
Preview는 `https://dev.mal-moi.com`에서 본다(배포별 URL은 로그인이 안 된다).

**운영자를 빼기**: 값에서 주소를 지우고 위 2~4를 다시 한다. 그 계정이 이미 넷 이상 가진 활성 프로젝트는 그대로 남는다(데이터를 고치지 않는다) —
늘리는 요청(생성·복원·OWNER 승격·OWNER 초대 수락)만 다시 거부된다.

⚠️ **`EMAIL_LOOKUP_KEY` 회전 중**에는 운영자가 일시적으로 비운영자로 판정될 수 있다(저장 lookup이 아직 옛 키 — 회전이 끝나면 돌아온다, §2).

## 시간대 선별 목록에서 id 빼기 (2026-10-05, user-timezone)

`lib/time-zone/zones.ts`의 `TIME_ZONES`에서 id를 빼는 것은 마이그레이션 없이 되지만, **그 값을 저장한 사람의 화면이 조용히 UTC로 바뀐다**(읽을 때 `resolveTimeZone`이
목록 밖 값을 UTC로 떨어뜨린다 — ARCHITECTURE §5.1). 빼기 전에 dev·prod 둘 다 저장 건수를 본다: `select count(*) from "User" where "timeZone" = '<id>';`
0이 아니면 대체 id(같은 오프셋·같은 서머타임 규칙)를 목록에 두는지 먼저 정한다. 더할 때는 DB 확인이 없고, `lib/time-zone/__tests__/zones.test.ts`의 id별 1월·7월 오프셋 표에 행을 더한다(CI Node 24와 로컬 ICU 둘 다에서 green이어야 한다).

## HSTS preload 제출 — 오너 수동 절차 (2026-09-24)

응답 헤더가 `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`를 **선언**한다(`lib/security-headers.ts`).
**hstspreload.org 제출은 코드가 하지 않는다** — 오너가 손으로 하고, 한 번 목록에 실리면 브라우저 배포 주기를 따라
빠지기까지 **수개월**이 걸린다. ⚠️ **`includeSubDomains`가 `*.mal-moi.com` 전부를 HTTPS에 묶는다**(`dev.mal-moi.com` 포함) —
제출 전에 http로만 뜨는 하위 호스트가 없는지, 앞으로도 만들지 않을지 확인한다.

## Supabase 데이터 API 롤 — 스키마 USAGE 확인 (2026-09-27, sec-audit-3 #2·#3)

**언제**: 마이그레이션을 dev에 적용한 뒤(`/db` 5단계)와 **prod에 `db:deploy`한 뒤(`/merge` 1단계)**, 그리고 대시보드에서 테이블을 만든 뒤.
dev만 보고 끝내지 않는다 — 두 DB의 권한 이력이 달라 dev 결과가 prod를 증명하지 않는다(ARCHITECTURE §7).

```sql
-- ① 방어층: 네 칸 전부 false여야 한다.
SELECT r, has_schema_privilege(r, 'public', 'USAGE') AS usage, has_schema_privilege(r, 'public', 'CREATE') AS create
FROM unnest(ARRAY['anon','authenticated']) AS r;
-- ② 탐지 신호: 0건이 정상. 대시보드로 테이블을 만들었다면 0이 아닌 것이 정상이다(아래 ③이 그렇게 만든다) — ①이 false면 열리지는 않는다.
SELECT grantee, table_name FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee IN ('anon','authenticated');
-- ③ 남는 것: supabase_admin 소유 3행은 postgres로 못 지운다(permission denied). 있다는 것만 확인한다.
SELECT pg_get_userbyid(defaclrole) AS owner, defaclobjtype, defaclacl FROM pg_default_acl
WHERE defaclnamespace = 'public'::regnamespace;
```

**①이 `true`로 남으면** 상속부터 본다 — `SELECT nspacl FROM pg_namespace WHERE nspname = 'public'`. 마이그레이션은 두 롤의 직접 GRANT와
`PUBLIC`(`=U`)을 **둘 다** 걷으므로, 적용 뒤에도 `true`면 누군가 다시 GRANT했거나 두 롤이 USAGE를 가진 다른 롤의 멤버다. 걷는 것은
**새 마이그레이션으로** 한다 — 콘솔에서 손으로 치지 않는다(dev·prod가 다시 갈린다). ⚠️ **스키마 소유자는 `postgres`가 아니라
`pg_database_owner`다** — 런타임 롤 `postgres`는 직접 `U`와 `pg_database_owner` 멤버십(CREATE)으로 쓰므로 `PUBLIC`·두 롤 회수와 무관하다.
회수 전에 `nspacl`에 `postgres=U/…`(직접 GRANT)가 있는지 확인한다 — 없으면 앱이 이름 해석에서 막힌다. 대시보드 **Advisors → Security**가
0 errors인지도 같이 본다.

## Vercel WAF rate limit — 무인증 공개 진입점 (2026-09-28 · 2026-09-29)

**대상은 둘이다** — 인증이 없어 요청 하나가 서버 쪽 비용(함수 호출 · 외부 fetch · DB 쓰기)을 만드는 자리. 코드에 카운터·작업 큐를 두지 않고
플랫폼 규칙으로 막는다(ARCHITECTURE §6.06 "관측되면 Vercel Firewall부터"의 적용).

| 규칙 | 조건 | 한도 · 키 | 동작 | 상태 |
|---|---|---|---|---|
| Rate limit public entry points | `path starts with /api/images/` **OR** `path equals /oauth/authorize` | 600 req / 60s · `ip` | `log` | 2026-09-28 image proxy로 게시 → 2026-09-29 authorize를 OR 조건으로 합쳐 재게시(옛 이름 `Rate limit image proxy`) — 429 승격 대기 |

⚠️ **규칙이 하나인 것은 Hobby 플랜의 rate limit 규칙 상한(1개) 때문이다**(2026-09-29 대시보드 "Upgrade to pro to add up to 40 rate limit rules"). 그래서 두 경로가
**카운터 하나(IP당 600/60s)를 나눠 쓴다** — authorize만 보면 원래 계획한 60보다 느슨하다. Pro로 올리면 authorize를 60/60s 규칙으로 떼어 낸다.

**왜 authorize인가**: 무인증 GET 하나가 **남이 고른 URL의 CIMD 가져오기**(최대 5초 · 64 KiB)와 **요청 행 삽입**을 만든다(ARCHITECTURE §6.45.9).
한도 60의 근거: 정상 사용자는 연결 한 번에 2요청(쿼리 → `?request=` 정규화) + 로그인 왕복 복귀 1–2요청이다. 사무실 NAT 뒤 여럿이 동시에 연결해도 넉넉하다.

**변경 절차** — CLI로 초안을 만들고 게시는 사람이 한다:
1. 초안: `vercel firewall rules edit "Rate limit public entry points" --condition '{"type":"path","op":"pre","value":"/api/images/"}' --or --condition '{"type":"path","op":"eq","value":"/oauth/authorize"}' --yes`
   (조건은 통째로 바뀌므로 OR 그룹 둘을 매번 다 준다) → `vercel firewall diff`로 확인.
2. **게시(`vercel firewall publish --yes`)는 사람이 한다** — 에이전트는 초안까지만 만든다.
3. 게시 뒤 `Firewall → Traffic`에서 규칙 id(`rule_rate_limit_image_proxy_wlXSTS`)로 필터해 1–2주 본다. 정상 사용자가 안 걸리면
   `vercel firewall rules edit "Rate limit public entry points" --rate-limit-action rate_limit --yes` → 사람이 게시(429). 걸리는 정상 트래픽이 있으면 한도를 먼저 올린다.

⚠️ **WAF는 CDN 앞이라 캐시 HIT도 센다** · **카운터가 리전별이라** 분산 출처는 리전 수만큼 한도를 넘는다 — 막는 것은 단일 출처 증폭이다.
Hobby 플랜이라 `--duration`·system bypass를 못 쓴다. ⚠️ **`/oauth/token`·`/oauth/revoke`는 대상이 아니다** — 제출한 자격증명이 틀리면 DB 조회
하나로 끝나고, 정상 클라이언트의 refresh 폭주를 잘못 막으면 연결이 끊긴다(ARCHITECTURE §6.45.9의 30초 유예가 받는 부류다).

## 호스팅 플랜과 한도 (2026-09-19 확인)

| 무엇 | 플랜 | 따라오는 제약 |
|---|---|---|
| Vercel (`malmoi`) | **Hobby** | Cron **하루 1회**이고 **프로덕션 배포에서만** 돈다 — `vercel.json`의 `0 18 * * *` 하나가 전부다. 약관이 비상업 용도라 **사내 도구**라는 전제로 쓴다 — 사외 공개로 성격이 바뀌면 Pro로 올린다(그때 cron 빈도 전제와 온보딩 ④ 문구가 같이 바뀐다). |
| Supabase prod (`malmoi`, ref `xgsyyapzkpbdtkrprlmn`) | **Free** | **비활성 자동 일시중지가 켜져 있고 Free에서는 끌 수 없다.** PITR **없음** — 시점 복구가 불가능하다. |

⚠️ **일시중지를 막는 것이 야간 cron 하나뿐이고, 그것은 보장이 아니다.** `/api/pull`이 매일 DB를 조회하므로 비활성 카운터가 리셋되지만, cron은 **프로덕션 배포에만** 붙는다 — 프로덕션 배포가 멈추거나 cron이 실패로 돌지 않으면 그 keepalive도 같이 사라진다. **프로덕션이 실사용에 들어가기 전에 Supabase를 Pro로 올린다**(일시중지 제거 + PITR). 그때까지는 일시중지에서 깨어난 뒤 첫 요청이 느린 것을 장애로 오진하지 않는다.

⚠️ **백업 절차가 없다.** Free는 일 단위 백업만 제공하고 PITR이 없으므로, 키 회전(§2)이나 마이그레이션(`db:deploy`) 전에 되돌릴 지점이 필요하면 **손으로 덤프를 뜬다** — `pg_dump`를 `DIRECT_URL_PROD`(5432)로 돌린다. 암호화 키를 잃으면 덤프가 있어도 PII는 복구되지 않는다(§1).

## 5. 자격증명 전면 재발급

순서가 있다 (2026-09-03 실행). Supabase 비번 재설정 → `.env.local` → Vercel env → 재배포
(`vercel redeploy <최근 prod URL>`). 상세와 함정은 위 "새 머신 셋업" 절이다.

⚠️ **GitHub App 개인키는 여러 개를 동시에 가질 수 있지만, 지우면 그 키를 쓰던 네 곳이 동시에 끊긴다** —
로컬 `.env.local` · Vercel Production · Vercel Preview · 다른 머신. 2026-09-06에 옛 키 하나를 지웠다가
넷이 다 죽었고 **증상이 "App이 설치돼 있지 않다"로 보였다.** 지우기 전에 그 키를 누가 들고 있는지 세고,
넷을 전부 옮긴 뒤에 지운다.

## 셀프 호스팅 (2026-10-09, self-hosting)

**공식 지원은 Linux 단일 서버의 Docker Compose다**(앱 한 인스턴스 + 일반 Postgres 17 + 업로드 볼륨 + 야간 스케줄러, HTTPS reverse proxy 뒤 도메인 루트, 검증 플랫폼 `linux/amd64`). 지원 대상은 **최신 앱 태그 하나**이고 창구는 GitHub Issues의 best-effort다. 범위·비범위의 정본은 PRODUCT §4.1·§4.2, DB 롤 계약은 ARCHITECTURE §7 "self-hosted DB"다 — 이 절은 **다시 실행할 절차만** 든다. 명령은 전부 리포의 `deploy/` 디렉터리에서 돈다(`cd deploy`). 이미지는 매 앱 태그 `v<x.y.z>`마다 GHCR(`ghcr.io/sinhyeokkang/malmoi`)에 발행되고 태그는 action 태그(`malmoi-i18n-push-vN`)와 독립이다.

### 외부 앱 등록 — 설치 전에 운영자가 만든다

호스팅 서비스(mal-moi.com)의 OAuth App·GitHub App·Resend 도메인·키를 **복사하지 않는다** — 전부 운영자 자신의 것이다. `<ORIGIN>`은 `MALMOI_ORIGIN` 값이다.

| 무엇 | 만드는 곳 | 설정 | 얻는 값(→ `deploy/.env`) |
|---|---|---|---|
| **HTTPS 도메인** | DNS + 인증서 | 도메인 **루트**(하위 경로에 얹지 않는다) · A/AAAA를 서버로 · 80/443 개방 · 공개 CA 인증서를 `deploy/certs/fullchain.pem`·`privkey.pem`으로 · `deploy/nginx/malmoi.conf`의 `server_name`(두 곳)을 이 도메인으로 | `MALMOI_ORIGIN=https://<도메인>` — 경로·query·userinfo가 없어야 하고 IPv6 리터럴·IDN은 받지 않는다 |
| **GitHub OAuth App**(로그인) | GitHub Settings → Developer settings → OAuth Apps | Homepage `<ORIGIN>` · Authorization callback `<ORIGIN>/api/auth/callback/github` | `AUTH_GITHUB_ID` · `AUTH_GITHUB_SECRET` |
| **GitHub App**(리포 읽기·쓰기 + 계정 연결) | GitHub Settings → Developer settings → GitHub Apps | **Public**(다른 계정·조직이 설치하려면 필요 — private이면 소유 계정에만 설치된다) · Callback URL `<ORIGIN>/api/github/callback` · **Request user authorization (OAuth) during installation 켬** · **Redirect on update 켬** · Setup URL **비움** · Webhook 끔 · 권한: **Contents 읽기/쓰기, Pull requests 읽기/쓰기**(Metadata 읽기는 자동) | `GITHUB_APP_ID`(숫자) · `GITHUB_APP_CLIENT_ID`(`Iv…`, ID와 **다른 값**) · `GITHUB_APP_CLIENT_SECRET` · `GITHUB_APP_SLUG` · `GITHUB_APP_PRIVATE_KEY`(PEM을 **한 줄로**, 개행은 `\n`) |
| **Google OAuth** | Google Cloud Console → OAuth 동의 화면 · 사용자 인증 정보 | 동의 화면 **External + 게시(In production)** — Internal이면 조직 밖 계정이 `403 org_internal`로 막혀 초대 경로가 죽고, 테스트 모드면 등록된 테스트 사용자만 로그인된다 · 범위 `email`·`profile` · 승인된 리디렉션 URI `<ORIGIN>/api/auth/callback/google` · 개인정보처리방침 URL = `MALMOI_PRIVACY_URL` | `AUTH_GOOGLE_ID` · `AUTH_GOOGLE_SECRET` |
| **Resend 발신 도메인**(초대 메일, **필수**) | Resend → Domains · API Keys | 발신 도메인 Verified(SPF·DKIM) · **open/click tracking 끔**(켜면 초대 링크가 추적 링크로 바뀌고 방침의 "추적 없음"이 거짓이 된다) · 권장: TLS Enforced · API 키는 그 도메인 한정 Sending access | `RESEND_API_KEY` · `INVITATION_EMAIL_FROM="Malmoi <invite@<검증된 도메인>>"` |

- GitHub App 권한은 코드가 부르는 엔드포인트(git blob·tree·commit·ref, pulls, PR 코멘트)에서 뺀 최소 집합이다. 설치 범위(`Only select repositories`일 때의 리포 목록)는 GitHub 콘솔이 정본이다 — 목록에 없는 리포는 `not-installed`다(위 "GitHub App 콘솔 설정").
- **GitHub Actions에서 설치 주소에 닿아야 한다.** 대상 리포의 CI(GitHub-hosted 러너)가 `api-url`(= `MALMOI_ORIGIN`)로 HTTPS 요청을 보내므로, 방화벽·IP 허용 목록·VPN 뒤에 두면 push가 전부 실패한다. 인증서는 공개 CA가 발급한 것이어야 한다(자체서명·사설 CA는 러너가 거부). 폐쇄망·GitHub Enterprise는 지원 밖이다.
- **대상 리포의 CI는 상류 리포의 action 태그를 실행한다** — `uses: SinhyeokKang/malmoi/.github/actions/malmoi-i18n-push@malmoi-i18n-push-v3` 스텝에 그 프로젝트의 `PUSH_TOKEN`·`GITHUB_TOKEN`이 들어간다. 설치를 고정 버전에 두어도 이 태그는 설치 버전과 무관하게 움직일 수 있다. 받아들일 수 없으면 상류를 포크해 `uses:`를 포크의 커밋 SHA로 고정한다(docs/ACTIONS.md "self-hosted 설치"). 생성된 워크플로엔 `api-url`이 항상 있고 **지우지 않는다** — 빠지면 push 토큰 원문이 호스팅 서비스로 간다.
- **공개 가입의 결과**: 로그인은 GitHub·Google이 **검증한 이메일**만 요구하고 허용 목록이 없다. 누구나 로그인하면 `User` 행이 생기고(이름·이메일·사진이 암호화되어 이 DB에 저장된다 — 아래 수집 항목표), 초대받지 않아도 **프로젝트를 최대 3개** 만들 수 있다. 3개 상한을 풀 사람은 `OPERATOR_EMAILS`(쉼표 구분 이메일 주소 전체 — 위 "운영자 지정")이고, 비우면 운영자도 3개다. 인가는 여전히 `ProjectMember`뿐이라 운영자도 남의 프로젝트는 못 연다. 가입 자체를 막는 앱 기능은 없다.
- **`/changelog`의 "Latest"는 상류의 최신 릴리스를 보여 주므로 설치본의 버전이 아닐 수 있다.** 설치본의 버전은 `MALMOI_IMAGE` 태그다.
- `/privacy`는 `MALMOI_PRIVACY_URL`의 운영자 정책으로 이동한다 — 정책을 먼저 써 둔다(아래 "운영자 개인정보 재료"). 이 설치의 `/privacy`를 가리키면 preflight가 거부한다.

### 설치 체크리스트 — preflight 필수 항목

`pnpm preflight`(web 컨테이너 기동 때 자동)가 아래 이름의 누락·형식을 본다(`lib/deployment/preflight.ts`의 `SELF_HOSTED_ENV`). **운영자가 채우는 값은 `deploy/.env`**, **compose가 조립하는 값은 채우지 않는다.**

| 이름 | 채우는 쪽 | 비고 |
|---|---|---|
| `MALMOI_ORIGIN` | 운영자 | 위 표. nginx `server_name`과 같은 호스트 |
| `MALMOI_PRIVACY_URL` | 운영자 | HTTPS · 이 설치의 `/privacy`가 아님 · userinfo 없음 |
| `MALMOI_UPLOAD_DIR` | compose(`/data/uploads`) | 볼륨 `uploads`가 마운트 — 존재·쓰기 가능을 preflight가 확인 |
| `AUTH_URL` · `AUTH_TRUST_HOST` | compose(`${MALMOI_ORIGIN}` · `true`) | `AUTH_URL`은 `MALMOI_ORIGIN`과 같아야 한다 |
| `AUTH_SECRET` | 운영자 | `openssl rand -base64 32` |
| `AUTH_GITHUB_ID` · `AUTH_GITHUB_SECRET` · `AUTH_GOOGLE_ID` · `AUTH_GOOGLE_SECRET` | 운영자 | 둘 다 필수 — `auth.ts`가 두 공급자를 무조건 등록한다 |
| `APP_SIGNING_SECRET` | 운영자 | `node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))'` — `AUTH_SECRET`·암호화 키와 **다른 값** |
| `DATABASE_URL` | compose | 런타임 롤 `malmoi_app` + `RUNTIME_DB_PASSWORD` |
| `GITHUB_APP_ID` · `GITHUB_APP_PRIVATE_KEY` · `GITHUB_APP_CLIENT_ID` · `GITHUB_APP_CLIENT_SECRET` · `GITHUB_APP_SLUG` | 운영자 | slug는 `[a-z0-9-]`. 없으면 신규 사용자가 화면 안에서 설치를 못 한다 |
| `CRON_SECRET` | 운영자 | web과 scheduler가 **같은 값** — `openssl rand -hex 32` |
| `TOKEN_ENCRYPTION_KEYS` · `TOKEN_ENCRYPTION_ACTIVE_KEY_ID` · `PII_ENCRYPTION_KEYS` · `PII_ENCRYPTION_ACTIVE_KEY_ID` · `EMAIL_LOOKUP_KEY` · `EMAIL_LOOKUP_KEY_ID` | 운영자 | 형식이 셋으로 갈린다(위 §1) — keyring JSON은 작은따옴표로 감싼다: `TOKEN_ENCRYPTION_KEYS='{"k1":"<32바이트 base64>"}'`. 세 키 값은 서로 달라야 한다(`openssl rand -base64 32`) |
| `RESEND_API_KEY` · `INVITATION_EMAIL_FROM` | 운영자 | `re_`로 시작 · `이름 <주소>` 꼴 |
| `OPERATOR_EMAILS` | 운영자(선택) | 비우면 운영자 0명 |

그 밖에 compose가 보간하는 `MALMOI_IMAGE` · `POSTGRES_PASSWORD` · `MIGRATE_DB_PASSWORD` · `RUNTIME_DB_PASSWORD`는 `deploy/.env.example`이 정본이다. **DB 비밀번호 셋은 서로 다르게 `openssl rand -hex 32`로 만든다**(URL에 그대로 들어간다). `INVITATION_EMAIL_ORIGIN`·`VERCEL_ENV`·`BLOB_*`는 **넣지 않는다** — compose의 web `environment`는 명시 목록이라 `.env`에 넣어도 컨테이너에 전달되지 않는다. compose를 고쳐 넘기면 `INVITATION_EMAIL_ORIGIN`은 preflight가 `present`로 거부하고 `VERCEL_ENV`는 판정을 무효(`vercel-env-present`)로 만든다.

### 설치 (고정 버전)

1. **릴리스를 고른다** — 최신 앱 태그 `v<x.y.z>` 하나. 같은 태그의 리포를 받아 그 `deploy/`를 쓴다(`git clone --depth 1 --branch v<x.y.z> https://github.com/SinhyeokKang/malmoi.git`). 이미지 digest를 확인해 고정한다:
   `docker buildx imagetools inspect ghcr.io/sinhyeokkang/malmoi:v<x.y.z>` → `MALMOI_IMAGE=ghcr.io/sinhyeokkang/malmoi:v<x.y.z>@sha256:<digest>`.
2. `cd deploy && cp .env.example .env && chmod 600 .env` 후 값을 채운다. ⚠️ **`.env`는 키와 비밀번호 전부다** — 리포·메신저·백업 사본에 평문으로 두지 않는다. 값에 `$`가 있으면 작은따옴표로 감싼다.
3. 인증서를 `deploy/certs/`에 두고(`chmod 600 privkey.pem`) `nginx/malmoi.conf`의 `server_name`을 고친다. 방화벽은 80/443만 연다 — Postgres·앱 포트를 publish하지 않는다.
4. `docker compose config -q`(문법 · `:?` 필수 보간 누락) → `docker compose up -d`.
5. **기대 상태**: `docker compose ps`에서 postgres healthy → migrate **Exited (0)** → web healthy → proxy·scheduler running. `docker compose logs migrate`에 마이그레이션 적용과 bootstrap 무오류. web이 재시작을 반복하면 `docker compose logs web`의 `preflight: <이름> <사유>` 줄이 원인이다(아래 "장애 진단").
6. **첫 확인**: `https://<도메인>/`이 뜨고, GitHub·Google 로그인이 되고, 프로젝트를 만들어 생성된 워크플로에 `api-url: "https://<도메인>"`이 있는지 본다. 이미지 업로드(프로필 사진)와 초대 메일 한 통(테스트 수신자)도 본다.
7. **설치 직후 첫 백업을 만든다**(아래) — `.env`의 키 여섯이 DB와 쌍이다. 이 순간부터 키를 잃으면 가입자의 이름·이메일을 복구할 수 없다.

### 업데이트

**한 번에 한 릴리스, 순서 고정.** 건너뛴 릴리스를 가로지르는 업그레이드는 아직 실측하지 않았다(spec SH-11 이연) — 지원 대상은 최신 태그 하나다. 마이그레이션은 additive 순서로 나가므로 `migrate`가 **web을 재생성하기 전에** 끝나야 한다(POSTMORTEM 2026-09-14 — 낡은 Prisma 클라이언트가 새 스키마를 조회한 사고).

1. **백업**(아래 "백업")을 정지 구간에서 만든다.
2. 새 태그의 `deploy/`와 현재 `deploy/`를 비교해(`.env`는 건드리지 않는다) compose·nginx·scheduler 변경을 반영하고, `.env`의 `MALMOI_IMAGE`를 새 태그@digest로 바꾼다. `deploy/scheduler/`가 바뀐 릴리스면 `docker compose build scheduler`.
3. `docker compose pull --ignore-buildable` — 로컬 빌드 이미지(`malmoi-scheduler:local`)는 레지스트리에 없어서 `--ignore-buildable` 없이는 pull이 실패한다.
4. `docker compose run --rm migrate` — `prisma migrate deploy` 뒤 bootstrap이 다시 돈다(멱등: 롤이 있으면 만들지 않고 권한만 다시 건다). **과거 `up`의 migrate 성공을 재사용하지 않는다.**
5. `docker compose up -d --force-recreate --no-deps web proxy scheduler` — 같은 digest로 web을 재생성한다(`--no-deps`가 4단계에서 끝난 migrate를 다시 돌리지 않게 한다).
6. **smoke**: `docker compose ps`가 healthy · 로그인 · 번역 화면 · 업로드 이미지 · `docker compose logs web --since 5m`에 `EACCES`·`preflight:` 없음.
7. **실패하면** DB 호환성이 입증된 경우에만 `.env`의 이전 `MALMOI_IMAGE`로 되돌려 4~5를 다시 한다. 마이그레이션이 스키마를 이미 바꿨다면 **이전 DB·이전 이미지·이전 키 백업을 함께 복원한다**(아래) — down 마이그레이션은 없다.

### 백업

백업의 단위는 **DB dump + 업로드 볼륨 + `.env`(키)** 셋이고 **같은 정지 구간**에서 만든다. 어느 하나라도 시점이 다르면 복원본이 어긋난다(업로드 키는 DB 행이 가리키고, DB의 암호문은 그 시점의 키가 열어야 한다). 백업 디렉터리는 **리포 체크아웃 밖**에 두고 같은 호스트에만 남기지 않는다(오프호스트 사본). 접근 권한은 600/700이다.

```sh
STAMP=$(date -u +%Y%m%dT%H%M%SZ); B=/var/backups/malmoi/$STAMP; mkdir -p "$B" && chmod 700 "$B"
docker compose stop scheduler proxy web            # 신규 유입·쓰기를 멈춘다. postgres만 남는다
docker compose exec -T postgres pg_dump -U postgres -d malmoi -Fc > "$B/db.dump"
docker run --rm -v malmoi_uploads:/data:ro -v "$B":/backup alpine tar czf /backup/uploads.tar.gz -C /data .
cp .env "$B/env" && cp -r certs nginx "$B/" && chmod -R go-rwx "$B"
```

- **manifest(비밀 없음)**를 같은 디렉터리에 남긴다: 이미지 digest(`docker compose images` / `.env`의 `MALMOI_IMAGE`) · 마이그레이션 상태(`docker compose exec -T postgres psql -U postgres -d malmoi -Atc 'select count(*), max(migration_name) from _prisma_migrations'`) · 백업 시각(UTC) · 각 파일의 `sha256sum`.
- `docker compose up -d`로 재개한다.
- ⚠️ **키를 DB dump와 쌍으로 보관한다.** PII 키를 잃으면 이메일·이름을, 토큰 키를 잃으면 GitHub 연결 토큰을 복구할 수 없다. 키 회전 뒤에도 **옛 키를 지우지 않는다** — 보존된 백업이 요구한다.
- ⚠️ `log_statement`가 `ddl`/`all`이거나 `pg_stat_statements`(`track_utility`)가 켜져 있으면 서버 로그·통계에 `CREATE ROLE … PASSWORD`가 남는다. 기본 postgres 이미지는 둘 다 꺼져 있다 — 켰다면 bootstrap 동안 끈다.
- **백업 성공만으로 통과시키지 않는다** — 복원 검증이 있어야 백업이다. **다른 호스트**의 격리 스택(scheduler를 안 띄운다)에서 아래 복원을 한 번 해 본다 — 같은 호스트에서는 하지 않는다(아래 경고). 복원 환경에서 **실제 리포에 쓰는 일**(Publish·야간 pull)은 테스트 리포로 제한한다.

### 빈 볼륨 복원

새 서버(또는 `docker compose down -v` 뒤)에서 백업 셋으로 되살린다. **키는 백업 시점의 것이어야 한다** — 다른 키로는 암호문이 안 열린다.

⚠️ **복원 실습·격리 검증은 운영 스택이 없는 다른 호스트에서만 한다.** `deploy/compose.yaml`이 프로젝트명을 `malmoi`로 고정하므로 같은 호스트에서는 디렉터리를 복사해도 같은 `malmoi_pgdata`·`malmoi_uploads` 볼륨을 쓰고, 2·4단계가 운영 DB·업로드 위에서 돌며 `down -v`는 운영 볼륨을 지운다. 굳이 같은 호스트에서 해야 하면 모든 compose 명령에 `-p <다른 이름>`을 붙이고, 4단계의 볼륨명을 `<그 이름>_uploads`로 바꾸고, proxy의 80/443 포트를 다른 값으로 바꾼다 — 하나라도 빠지면 운영 스택을 친다.

1. 같은 태그의 `deploy/`를 받고 백업의 `env`를 `deploy/.env`로, `certs/`·`nginx/`를 되돌린다(`MALMOI_IMAGE`는 백업 시점 digest 또는 호환이 확인된 더 새 태그).
2. `docker compose up -d postgres` — 빈 볼륨이라 initdb가 DB와 마이그레이션 롤을 만든다(`MIGRATE_DB_PASSWORD`는 `.env`의 값).
3. 마이그레이션 롤로 dump를 올린다(소유자·ACL은 가져오지 않는다 — 소유자는 마이그레이션 롤이 되고 권한은 5단계 bootstrap이 다시 건다 — `REVOKE USAGE ON SCHEMA public FROM PUBLIC`도 `--no-acl`이 잃으므로 5단계가 필수다):
   `docker compose exec -T postgres pg_restore -U malmoi_migrate -d malmoi --no-owner --no-acl < "$B/db.dump"`
   — 끝의 `errors ignored on restore: N`을 읽는다. 빈 DB에 이미 있는 `public` 스키마의 `already exists`류만 허용하고, 그 밖의 오류가 하나라도 있으면 중단한다(부분 복원 위에서 migrate를 돌리지 않는다).
4. 업로드 볼륨: `docker volume create malmoi_uploads && docker run --rm -v malmoi_uploads:/data -v "$B":/backup alpine sh -c 'tar xzf /backup/uploads.tar.gz -C /data && chown -R 1000:1000 /data'` (앱 사용자 `node` uid 1000).
5. `docker compose run --rm migrate` — 복원된 `_prisma_migrations`가 최신이면 `migrate deploy`는 no-op이고, bootstrap이 런타임 롤을 만들고 권한을 걸며 PUBLIC의 USAGE를 다시 거둔다. **복원 뒤에는 이 단계를 반드시 다시 돈다** — 건너뛰면 복원된 DB만 PUBLIC USAGE를 가진 채 남는다.
6. `docker compose up -d web proxy` — **scheduler는 올리지 않는다**(8단계). smoke: 로그인 · 프로젝트 번역 값 · 업로드 이미지 · `docker compose logs web`에 복호화 오류(`credential-…`) 없음.
7. ⚠️ **과거 시점이 되살아난다 — 점검한다.** 백업 이후에 폐기된 MCP 개인 토큰·OAuth 연결, 로그아웃한 세션, 취소된 초대가 되살아난다. 세션은 `docker compose exec -T postgres psql -U postgres -d malmoi -c 'DELETE FROM "Session"'`로 전원 재로그인시키고, 사용자에게 `/mcp`의 토큰·연결 목록 확인을 알린다. 백업 이후의 번역 편집·Publish는 잃는다 — 대상 리포의 PR 상태와 대조한다.
8. 격리 검증이 끝나기 전에는 scheduler를 올리지 않는다. 검증이 끝나 이 스택이 새 운영이 되는 것이면 `docker compose up -d`로 scheduler까지 올린다.

### 키 회전

절차의 뼈대는 위 "2. 키 회전"과 같다(전체 차단·drain → check-only → `--apply` → `verify`). 달라지는 것은 **명령이 컨테이너 안에서 돌고 DB URL이 `DIRECT_URL`(마이그레이션 롤)** 이라는 점이다. `DIRECT_URL`(DDL 자격증명)과 키 여섯은 compose의 어느 서비스도 **함께** 받지 않는다(web은 DDL이 없고 migrate는 키가 없다) — 그래서 `DIRECT_URL`을 셸에서 따로 넘긴다. ⚠️ **비밀번호를 argv에 쓰지 않는다**(`-e DIRECT_URL=<값>`은 셸 이력·`ps`에 남는다) — 값은 셸 변수로만 두고 `-e DIRECT_URL`(값 없이)로 넘긴다.

1. **백업**을 만든다(회전 전 백업은 옛 키와 쌍이다).
2. `deploy/.env`에서 keyring에 **옛 키를 둔 채** 새 키를 더하고 `*_ACTIVE_KEY_ID`를 새 키 이름으로 바꾼다(검색 키는 `EMAIL_LOOKUP_KEY`·`_KEY_ID`를 새 값으로 — 옛 키 없이도 된다). 새 키 값은 서로 다르다.
3. **트래픽 차단·drain**: `docker compose stop proxy scheduler web` — proxy가 서 있지 않으면 외부 유입(브라우저·대상 리포 CI·MCP·OAuth callback)이 전부 막히고, scheduler가 서 있지 않으면 야간 pull이 없다. postgres만 남긴다.
4. `DIRECT_URL`을 셸에 둔다(이력에 안 남게):
   `read -rs P && export DIRECT_URL="postgresql://malmoi_migrate:${P}@postgres:5432/malmoi" && unset P`
   (`MIGRATE_DB_PASSWORD`. TLS를 생략해도 되는 것은 호스트가 정확히 `postgres`일 때뿐이다 — DB를 다른 호스트에 두었다면 `?sslmode=verify-full`이 필수다. `sslmode` 말고 다른 query는 거부된다.)
5. check-only → 적용 → 검증. `--no-deps`가 migrate 재실행을 막는다:
   ```sh
   RUN='docker compose run --rm --no-deps -e DIRECT_URL web pnpm credentials:self-hosted'
   $RUN --mode=rotate-token                                              # check-only
   $RUN --mode=rotate-token --apply --traffic-blocked --writers-drained
   $RUN --mode=rotate-pii   --apply --traffic-blocked --writers-drained
   $RUN --mode=reindex      --apply --traffic-blocked --writers-drained  # 검색 키를 바꿨을 때만
   $RUN --mode=verify
   ```
   출력은 JSON 한 줄이다. `verify`의 `oldTokenKey`·`oldPiiKey`가 각각 0이어야 새 active kid를 앱에 켠다. 실패하면 `credential-conversion-failed: keep traffic blocked` 한 줄뿐이고 값은 안 찍힌다 — 원인은 바로 앞 stderr의 `[credentials] … credential-env: missing environment variable <이름>`이 말한다(active kid가 비었거나 keyring에 없을 때). **부분 교체 상태에서 서비스를 재개하지 않는다.**
6. `unset DIRECT_URL` → `docker compose up -d --force-recreate --no-deps web proxy scheduler`(web이 새 `.env`를 읽는다) → 로그인·초대 확인.
7. 옛 키를 `.env`의 keyring에서 지우지 않는다(보존된 백업이 요구한다).

- **마이그레이션 상태 확인**: `pnpm credentials:finalize:self-hosted`(같은 `RUN` 꼴, 기본 `--mode=backfill`)는 **읽기만 하는 확인**이다(먼저 `verify` 변환을 읽기로 돌린다) — 자격증명 저장 마무리 마이그레이션(`20260910060000_finalize_credential_storage`)이 적용됐는지를 보고 `{"target":"self-hosted","pending":false,"applied":false}`를 찍는다. 새 설치·정상 업그레이드는 `migrate` 서비스가 모든 마이그레이션을 적용하므로 항상 `pending:false`다. `--apply`는 `prisma migrate deploy`를 `DIRECT_URL`로 직접 치는 길이라 **일반 절차가 아니다**(업그레이드는 `docker compose run --rm migrate`). 실패하면 `credential-finalization-failed` 한 줄이고 트래픽을 막은 채 둔다.
- **서명·세션·Cron 비밀**: `APP_SIGNING_SECRET`(차단 불필요 — 진행 중 연결 왕복·샘플 확인값이 한 번 실패한다)과 `AUTH_SECRET`(진행 중 로그인 왕복만 깨진다)은 `.env`를 바꾸고 `docker compose up -d --force-recreate web`. `CRON_SECRET`은 web과 scheduler가 **같은 값**이어야 하므로 `--force-recreate web scheduler` 둘 다(scheduler만 다르면 야간 pull이 401).
- **DB 비밀번호**: `MIGRATE_DB_PASSWORD`·`RUNTIME_DB_PASSWORD`는 첫 기동 뒤 `.env`만 바꿔서는 안 바뀐다(initdb·bootstrap은 있는 롤의 비밀번호를 건드리지 않는다). `docker compose exec postgres psql -U postgres -d malmoi` 안에서 `\password malmoi_app`(또는 `malmoi_migrate`) — psql이 클라이언트에서 해시해 보내므로 평문이 서버 로그에 남지 않는다 — 한 뒤 `.env`를 바꾸고 `--force-recreate web`(migrate 롤이면 다음 `run --rm migrate`부터 적용).

### 장애 진단

**기동이 안 될 때 — preflight.** web 컨테이너는 `pnpm preflight && next start`로 뜬다. 실패하면 stderr에 `preflight: <이름> <사유>` 줄만 찍고(값은 안 찍는다) exit 1이며, `restart: unless-stopped`라 재시작을 반복하고 scheduler는 올라오지 않는다. `docker compose logs web`으로 본다.

| 사유 | 뜻 | 고칠 곳 |
|---|---|---|
| `missing` | 필수 이름이 없거나 비어 있다 | `deploy/.env` (compose가 조립하는 이름이면 compose의 `environment`) |
| `invalid-format` | 모양이 틀림 — `RESEND_API_KEY`는 `re_…`, `INVITATION_EMAIL_FROM`은 `이름 <주소>`/`주소`, `GITHUB_APP_SLUG`는 `[a-z0-9-]`, `AUTH_TRUST_HOST`는 `true`만 | 해당 값 |
| `malformed` · `not-https` · `userinfo` · `path` · `query` · `fragment` · `ipv6` · `idn` | `MALMOI_ORIGIN`(또는 `MALMOI_PRIVACY_URL`)의 모양 결함 — 공백·역슬래시 / `http://` / `user:pw@` / 경로 / `?` / `#` / IPv6 리터럴 / 비ASCII 도메인 | `https://<도메인>` 형태로 |
| `auth-url-mismatch` | `AUTH_URL`이 `MALMOI_ORIGIN`과 다르다(끝 슬래시만 무시) | compose가 묶는 값을 임의로 덮지 않았는지 |
| `privacy-cycle` | `MALMOI_PRIVACY_URL`이 이 설치의 `/privacy`다 — 그 페이지가 자기에게 redirect한다 | 운영자 정책 페이지(다른 사이트)로 |
| `relative-path` | `MALMOI_UPLOAD_DIR`이 절대 경로가 아니다 | compose는 `/data/uploads` |
| `not-found` | 업로드 경로가 없다(볼륨이 마운트되지 않음) | compose의 `uploads` 볼륨 |
| `not-directory` | 경로가 있지만 디렉터리가 아니다 — 파일이거나 symlink | 마운트 대상 |
| `not-writable` | 앱 사용자(`node`, uid 1000)가 못 쓴다 | 볼륨 소유자·권한(`chown -R 1000:1000`) |
| `present` | `INVITATION_EMAIL_ORIGIN`이 설정돼 있다 — self-hosted는 `MALMOI_ORIGIN`에서 파생해 정본이 둘이 되지 않게 거부한다 | 변수를 지운다 |
| `vercel-env-present` | `VERCEL_ENV`와 `MALMOI_ORIGIN`이 함께 있다 — 판정이 무효(fail-closed) | `VERCEL_ENV`를 지운다 |

**migrate가 실패할 때.** `docker compose logs migrate`. `bootstrap: <코드>` 한 줄이면 `deploy/bootstrap.sql`의 선판정이다 — `runtime-role-missing`·`migrate-role-missing`·`password-missing`·`password-empty`(변수 누락: `RUNTIME_DB_PASSWORD` 등) · `runtime-role-is-migrate-role`(두 롤 이름이 같다) · `runtime-role-privileged`(이미 있는 런타임 롤이 superuser·CREATEROLE·CREATEDB·BYPASSRLS — 앱이 DDL 자격증명으로 도는 길을 막는다) · `cannot-create-role`(롤이 없는데 실행 롤이 CREATEROLE이 아니다 — 빈 볼륨이 아닌 데서 initdb 스크립트가 안 돈 경우). 그 앞의 Prisma 오류는 `MIGRATE_DB_PASSWORD`가 볼륨 초기화 때의 값과 다를 때(initdb는 빈 볼륨에서만 돈다 — 변경은 `ALTER ROLE`)다.

**초대 메일이 안 나갈 때.** 두 갈래다.
- 발급 전 `email-unavailable`(화면: *Email is unavailable right now*)은 설정 결함이다 — 서버 로그에 `[invite-email] config unavailable reason=<코드>`: `missing`(키·발신자 없음) · `invalid-from`(발신자 모양) · `invalid-origin`(`MALMOI_ORIGIN` 무효).
- 발급 뒤 `email-rejected`는 Resend가 거부한 것이다 — 로그의 `[invite-email] batch <rejected|unknown> <http-NNN|network> count=N` 한 줄이 전부다(주소·키·공급자 원문은 남기지 않는다). 그 시각으로 Resend 대시보드 **Emails**에서 같은 요청을 찾는다. 대개 `http-401` = API 키 오류·폐기, `http-403` = 발신 도메인 미검증 또는 발신 주소가 키의 도메인 밖, `http-422` = 발신/수신 주소 형식, `http-429` = Resend 한도. `unknown`(`network`·timeout·5xx)은 **일부가 나갔을 수 있다** — 다시 보내면 이전 링크가 만료된다. preflight는 형식만 보고 **키의 유효성·도메인 검증은 못 본다** — 그래서 이 오류는 기동이 아니라 첫 초대 때 나온다(설치 6단계에서 한 통 미리 보낸다).

**proxy 뒤에서.**
- 로그인 후 `redirect_uri` 불일치 · "Try again later" · 서버 액션이 안 됨 → Host가 앱까지 안 온 것이다. 예제는 `Host $host`로 전달한다 — **`MALMOI_ORIGIN`에 비기본 포트(예: `:8443`)가 있으면 `$host`는 포트를 떼므로** `deploy/nginx/proxy-common.conf`의 `Host`·`X-Forwarded-Host`를 `$http_host`로 바꾸고, 80→443 redirect(`return 301 https://$host…`)도 포트를 포함하게 고친다. 다른 proxy로 옮길 때도 앱이 받는 `Host`는 `MALMOI_ORIGIN`의 host(+비기본 포트)와 정확히 같아야 한다.
- 큰 `/api/push`가 대상 리포 CI에서는 504인데 서버는 적재를 끝냈다 → nginx `proxy_read_timeout`(기본 60초)이 먼저 끊은 것이고 앱은 계속 처리한다. 프로젝트의 동기화 기록을 확인하고 재실행한다(`client_max_body_size`는 5m).
- 앞단에 LB·CDN을 더 두면 nginx의 `$binary_remote_addr`가 그 장비의 주소라 **모든 사용자가 rate limit 카운터 하나를 나눠** `/api/images/`·`/oauth/authorize`가 429로 막힌다 — `real_ip_header`·`set_real_ip_from`을 그 장비에 맞게 설정한다.
- `/api/images/*`가 404면 업로드 볼륨 권한(`EACCES` 로그)부터 본다.

**야간 pull.** `docker compose exec scheduler /usr/local/bin/nightly-pull`로 즉시 1회 불러 본다. scheduler 로그의 `curl: (22) … 401`은 `CRON_SECRET`이 web과 scheduler에서 다른 것이다(둘 다 재생성). 결과는 `docker compose logs web`의 `[pull] targets= published= …` 요약 줄(`summarizeNightly`)이 정본이다 — curl은 HTTP 오류만 실패로 남기고 재시도·따라잡기는 없다.

**GitHub.** 새 계정에서 설치가 안 되면 GitHub App이 **Public**인지 먼저 본다. `not-installed`는 App 설치의 Repository access 목록을 본다(위 "GitHub App 콘솔 설정").

### 운영자 개인정보 재료

**방침을 쓰는 것은 운영자다.** 이 설치의 `/privacy`는 `MALMOI_PRIVACY_URL`로 이동하고, 호스팅 서비스의 방침 본문(연락처 `ox501501@gmail.com`·30일 응답·Vercel/Supabase 서술)은 **이 설치의 정책이 아니다** — 복사하지 않는다. 아래는 정책의 **재료**다: 이 설치의 DB가 실제로 담는 것(코드에서 파생)과 쿠키·전송처·삭제 절차. 방침이 코드와 어긋난 사고(POSTMORTEM 2026-09-19)를 피하려고 수집 항목표는 `lib/privacy/collected.ts`의 등재부와 **필드 단위로 일대일**이다(아래 표의 필드 합집합 = `CLASSIFIED`의 123개 필드). 앱이 새 개인정보 필드를 얻을 때마다 그 등재부가 바뀌므로 **업데이트할 때 이 표를 다시 대조한다.**

#### 수집 항목

분류 열의 뜻 — `collected`: 수집 항목으로 밝혀야 하는 값 · `retention`: 보관 기간(만료)을 정하는 값 · `cookies`: 쿠키가 나르는 값 · `not-personal`: 이 모델 안에서 사람을 기술하지 않는 값(번역 작업 데이터·행 부기). 이메일·이름·사진과 GitHub 토큰은 봉투 암호화로 저장되고(키는 DB 밖의 `.env`) 이메일 색인은 HMAC이다. 세션·초대·MCP 토큰은 해시만 저장한다.

| 모델 | 무엇 | 수집 항목(`collected`) | 보관 기간을 정함(`retention`) | 쿠키가 나름(`cookies`) | 개인정보 아님(`not-personal`) |
|---|---|---|---|---|---|
| `User` | 로그인한 사람. 이름·이메일·사진은 GitHub·Google이 준 값이고 봉투로 암호화한다(PII 키). 이메일 색인은 그 주소의 HMAC. 화면 설정 셋과 Inbox 열람 시각은 계정 설정 | `id`, `name`, `email`, `emailLookup`, `emailVerified`, `image`, `createdAt`, `uiLocale`, `timeZone`, `colorScheme`, `attentionSeenAt` | — | — | — |
| `Account` | 로그인 수단(GitHub·Google) 연결. 공급자 계정 id와, 프로젝트에 리포를 연결할 때 받는 GitHub App 사용자 토큰(암호화 — 토큰 키)과 만료 | `userId`, `installRequestedAt`, `provider`, `providerAccountId`, `refresh_token`, `access_token`, `expires_at` | — | — | `type` |
| `Session` | 로그인 세션. 쿠키 값의 digest만 저장하고 마지막 활동 뒤 24시간에 만료 | — | `expires` | `sessionToken`, `userId` | — |
| `VerificationToken` | 계정 연결·세션 폐기 challenge. `identifier`가 사용자 id와 공급자 계정 id를 한 JSON 문자열로 담는다. 5~10분 | `identifier`, `token` | `expires` | — | — |
| `ProjectMember` | 프로젝트 멤버십과 역할 | `userId`, `role`, `createdAt`, `updatedAt` | — | — | `projectId` |
| `ProjectInvitation` | 초대. 주소는 봉투(PII 키)+색인, 토큰은 해시. 7일 뒤 만료하되 행은 남는다(주소 포함) | `createdAt`, `email`, `emailLookup`, `role`, `tokenHash`, `acceptedAt`, `invitedBy` | `expiresAt` | — | `id`, `projectId` |
| `ApiToken` | MCP 개인 토큰. 토큰 해시와 사용자가 고른 권한·범위·사용 시각 | `userId`, `grants`, `allProjects`, `projectIds`, `tokenHash`, `createdAt`, `lastUsedAt` | `expiresAt` | — | — |
| `OAuthConnection` | MCP OAuth 연결(Claude Code·Codex 등). 앱이 스스로 밝힌 이름·주소, 토큰 해시, 권한·범위, 사용 시각 | `id`, `userId`, `clientId`, `clientName`, `redirectUri`, `grants`, `allProjects`, `projectIds`, `accessTokenHash`, `accessExpiresAt`, `refreshTokenHash`, `createdAt`, `lastUsedAt` | `expiresAt` | — | `issuer`, `resource` |
| `OAuthRefreshHistory` | 위 연결이 이미 쓴 refresh 토큰의 해시. 연결과 함께 사라진다 | `tokenHash`, `connectionId`, `usedAt` | — | — | — |
| `OAuthCode` | 동의 직후 60초짜리 교환 스냅샷. 교환되면 지운다 | `codeHash`, `clientId`, `clientName`, `redirectUri`, `userId`, `grants`, `allProjects`, `projectIds`, `connectionExpiresAt`, `usedAt` | `expiresAt` | — | `requestId`, `codeChallenge`, `issuer`, `resource` |
| `Translation` | 번역 값 자체는 개인정보가 아니고, 마지막 편집자와 시각만 사람을 가리킨다 | `updatedAt`, `updatedBy` | — | — | `id`, `projectId`, `surfaceId`, `keyId`, `localeCode`, `value`, `description`, `placeholders`, `needsReview`, `pendingEditToken` |
| `SyncRun` | 동기화(Publish·적재) 실행 기록. 요청자와 시각 | `trigger`, `startedAt`, `finishedAt`, `requestedBy` | — | — | `id`, `projectId`, `status`, `errorCode`, `prUrl`, `changed`, `changedValues`, `warnings`, `withheld` |
| `ProjectEvent` | 활동 기록. 행위자·시각, 멤버 사건의 마스킹 라벨·번역 전후 값을 `payload`에 담는다. 지우지 않는다 | `occurredAt`, `finishedAt`, `actorKind`, `actorUserId`, `payload`, `searchText` | — | — | `id`, `ref`, `projectId`, `kind`, `subtype`, `result`, `surfaceIds`, `surfaceScope`, `syncRunId`, `runToken` |

- **사람을 기술하지 않는 모델**(필드 전부 `not-personal`): `Project` · `TranslationSurface` · `Locale` · `StringKey` · `KeyRef` · `DeliveryConfirmation` · `TranslationBaseline` · `OAuthAuthorizationRequest`. 리포 좌표·키·번역 작업 상태이고 생성자 컬럼이 없다.
- **번역 값**은 프로젝트의 산출물이고 사람을 기술하지 않는다 — 저자 정보만 위 `Translation`·`ProjectEvent` 행이다.
- 프로필 사진: 사용자가 올린 파일은 192px 이내 WebP로 다시 인코딩해(원본·메타데이터 폐기) 업로드 볼륨의 `avatars/<userId>/`에 둔다. GitHub·Google 사진은 URL만 저장하고 브라우저가 그쪽에서 직접 받는다.
- **방문 집계는 없다** — self-hosted는 Analytics를 렌더하지 않는다. 앱이 보내는 외부 호출은 아래 전송처뿐이고, 운영자가 앞단(proxy·LB)에서 남기는 접근 로그(IP 등)는 운영자의 몫이다.

#### 쿠키

접두 `__Host-`·`__Secure-`는 https에서 붙는다(아래는 접두를 뗀 이름). 광고·분석·추적 쿠키는 없다. `malmoi-sidebar-collapsed`만 스크립트가 읽고 쓰며 나머지는 전부 HttpOnly다.

| 쿠키 | 수명 | 하는 일 |
|---|---|---|
| `authjs.session-token` | 마지막 활동 뒤 24시간 | 로그인 유지 |
| `authjs.csrf-token` | 브라우저를 닫을 때까지 | 로그인 요청이 이 사이트에서 시작됐는지 확인 |
| `authjs.callback-url` | 브라우저를 닫을 때까지 | 로그인 뒤 돌아갈 페이지 |
| `authjs.state` · `authjs.pkce.code_verifier` | 15분 | 공급자 응답이 시작한 로그인 왕복의 것임을 증명 |
| `malmoi-gh-state` | 10분 | 같은 증명 — 리포 연결 왕복 |
| `malmoi-account-connect` · `malmoi-connect-state` · `malmoi-login-link` · `malmoi-link-state` · `malmoi-session-revocation` · `malmoi-revocation-state` | 5~15분 | 같은 증명 — 같은 주소에 로그인 수단 추가, 다른 세션 폐기 |
| `malmoi-ui-locale` · `malmoi-color-scheme` | 마지막 선택·로그인 뒤 1년 | 이 브라우저에서 고른 화면 언어·테마(로그아웃 상태 포함). 로그인하면 계정 값을 복사해 온다 |
| `malmoi-sidebar-collapsed` | 마지막 접기·펴기 뒤 1년 | 사이드바 접힘 상태 |

시간대는 쿠키가 아니라 계정에만 저장된다.

#### 전송처

self-hosted의 전송처는 **셋**이다 — 호스팅 서비스의 Supabase·Vercel(호스팅·Blob·Analytics)은 이 설치에 없다.

| 전송처 | 무엇이 가나 | 왜 |
|---|---|---|
| **GitHub** | 로그인(OAuth) 때 받는 프로필·검증된 이메일 주소. 운영자의 GitHub App으로 리포 읽기와 브랜치·커밋·PR 쓰기(커밋은 App 명의이고 사용자 개인 명의가 아니다). 연결한 사용자의 GitHub App 사용자 토큰은 **읽기(GET)만** | 로그인 · 리포 연결·Publish |
| **Google** | 로그인을 Google로 하면 프로필·검증된 이메일 | 로그인 |
| **Resend** | 초대받는 주소와 메시지(초대 링크·프로젝트 이름·프로젝트 사진 주소·역할 — 초대자는 안 쓴다). open/click 추적은 끈다 | 초대 메일. Resend는 발송 기록을 **자기 플랜의 기간 동안**(Free 30일) 보관한다 — 운영자의 플랜을 확인해 정책에 적는다 |

- GitHub·Google 프로필 사진은 브라우저가 그쪽 서버에서 직접 받는다(앱이 그쪽에 보내는 것은 없다).
- 초대 메일의 로고·프로젝트 사진은 이 설치의 origin(`MALMOI_ORIGIN`)에서 받는다.
- 사용자가 MCP로 AI 에이전트를 연결하면 그 에이전트가 읽은 내용(번역·활동·멤버, 요청 시 push 토큰)이 그 에이전트와 쓰는 AI 서비스로 간다 — 사용자가 고르고 운영하는 것이고 이 설치는 따로 보내지 않는다. 연결 화면의 앱 이름을 보이려고 앱이 제시한 주소의 공개 설명을 읽는다(요청에 사용자 정보 없음).
- `/changelog`는 상류 리포의 GitHub Releases를 읽는다(사용자 정보 없는 요청).

#### 계정 삭제 절차 (self-hosted DB)

방침이 약속한 열람·정정·삭제 요청에 대한 **수동 절차**다(셀프서비스 화면은 없다 — PRODUCT §4.2). hosted의 "개인정보 삭제 요청"과 같은 순서이고, 이유는 같다: `ProjectMember.user`·`ProjectInvitation.invitedByUser`가 `onDelete: Restrict`라 `User`부터 지우면 던진다. 나머지(`Account`·`Session`·`ApiToken`·`OAuthConnection`·`OAuthRefreshHistory`·`OAuthCode`)는 `User` 삭제가 cascade하고, `SyncRun.requestedBy`·`ProjectEvent.actorUserId`는 `SetNull`이다. **번역 값은 남기고 저자만 끊는다.**

0. **백업을 먼저 만든다**(삭제는 되돌릴 수 없다). 본인 확인은 운영자의 정책이 정한다.
1. 대상 `User.id` 찾기 — 이메일이 봉투라 SQL로 못 찾으므로 **조회 색인(HMAC)** 을 계산한다. 주소는 argv가 아니라 환경변수로 넘긴다(`EMAIL_LOOKUP_KEY`는 web 서비스 env에 이미 있다). `PROJECT_IDS`는 2단계의 초대를 찾을 때 쓴다:
   ```sh
   read -r SUBJECT_EMAIL; export SUBJECT_EMAIL
   PROJECT_IDS=$(docker compose exec -T postgres psql -U postgres -d malmoi -Atc 'SELECT id FROM "Project"' | tr '\n' ' ')
   docker compose run --rm --no-deps -e SUBJECT_EMAIL -e PROJECT_IDS web node -e '
   const c=require("crypto"),k=Buffer.from(process.env.EMAIL_LOOKUP_KEY,"base64"),kid=process.env.EMAIL_LOOKUP_KEY_ID;
   const e=process.env.SUBJECT_EMAIL.trim().toLowerCase();
   const h=s=>"hmac:v1:"+kid+":"+c.createHmac("sha256",k).update(JSON.stringify(["malmoi/email-lookup","v1",s,e])).digest("hex");
   for(const s of ["user",...process.env.PROJECT_IDS.split(/\s+/).filter(Boolean).map(p=>"invitation:"+p)])console.log(s+"\t"+h(s))'
   unset SUBJECT_EMAIL
   ```
   첫 줄(`user`)의 값으로: `SELECT id FROM "User" WHERE "emailLookup" = '<hmac>';` — 이 `id`가 아래 `:uid`다. 한 줄도 없으면 이 주소의 계정이 없다(회전 중이라 `kid`가 옛 값인 행이 있으면 reindex 뒤에 다시 한다).
2. 그 사람 **앞으로 온 미수락 초대**의 색인은 위 출력의 `invitation:<projectId>` 줄들이다 — `ProjectInvitation."emailLookup"`이 프로젝트마다 다른 색인이라 줄마다 따로다.
3. 업로드한 프로필 사진: `docker compose exec web rm -rf /data/uploads/avatars/<uid>` (디렉터리가 없으면 없는 것이다).
4. 한 트랜잭션으로 지운다. `docker compose exec postgres psql -U postgres -d malmoi -v ON_ERROR_STOP=1 -v uid=<uid>`로 접속해 실행하고 **각 줄이 돌려준 행 수를 확인한 뒤에만 `COMMIT`** 한다(이상하면 `ROLLBACK`):
   ```sql
   BEGIN;
   -- 마지막 OWNER면 멈춘다 — 한 행이라도 나오면 ROLLBACK하고 소유권을 먼저 넘긴다
   SELECT m."projectId" FROM "ProjectMember" m
    WHERE m."userId" = :'uid' AND m."role" = 'OWNER'
      AND NOT EXISTS (SELECT 1 FROM "ProjectMember" o WHERE o."projectId" = m."projectId" AND o."role" = 'OWNER' AND o."userId" <> m."userId");
   DELETE FROM "ProjectMember" WHERE "userId" = :'uid';
   DELETE FROM "ProjectInvitation" WHERE "invitedBy" = :'uid';                  -- 그 사람이 보낸 초대
   DELETE FROM "ProjectInvitation" WHERE "acceptedAt" IS NULL AND "emailLookup" IN ('<2단계의 invitation 색인들>');  -- 그 사람에게 온 미수락 초대
   DELETE FROM "VerificationToken" WHERE "identifier" LIKE '%"' || :'uid' || '"%';   -- 계정 연결·세션 폐기 challenge
   UPDATE "Translation" SET "updatedBy" = NULL WHERE "updatedBy" = :'uid';       -- FK가 없어 손으로 끊는다
   DELETE FROM "User" WHERE "id" = :'uid';                                       -- Account·Session·ApiToken·OAuth* cascade, SyncRun·ProjectEvent SetNull
   COMMIT;
   ```
5. 남는 것: **번역 값**(프로젝트의 산출물 — 저자 연결만 끊긴다) · **활동 기록(`ProjectEvent`)의 마스킹 라벨**(행위자 연결은 끊기고 사건은 지우지 않는다) · **이 사람 앞으로 왔다가 이미 수락된 초대 행**(위 SQL은 미수락만 지운다 — 주소 봉투가 남으므로 정책에 적거나, 같은 색인으로 `"acceptedAt" IS NULL AND` 조건만 빼고 지운다) · **Resend의 발송 기록**(앞당겨 지울 수 없다 — 보관 기간에 스스로 사라진다) · **백업**(백업이 폐기될 때까지 남는다 — 정책에 적는다).

## 셀프 호스팅 실습 기록

SH-10 등 [수동] 항목의 실행 증거를 남기는 자리다(**릴리스 검증 배치가 채운다**). 기록할 것: 날짜 · 이미지 **digest** · Postgres 버전 · migration 상태 · 중단/복원에 걸린 시간 · 결과(성공/실패/미실행). ⚠️ **비밀(키·비밀번호·토큰·`.env` 내용)은 기록하지 않는다.** 미실행 항목을 통과로 적지 않는다 — 안 한 것은 "미실행"으로 남긴다. 계정 삭제 절차(위)가 실습 DB에서 한 번 수행된 기록, 백업·빈 볼륨 복원의 기록이 이 표에 생기면 이 절 머리의 ⚠️ 경고를 지운다.

| 날짜 | 항목 | 이미지 digest | Postgres | migration 상태 | 걸린 시간 | 결과 |
|---|---|---|---|---|---|---|
| 2026-10-09 | 이미지 빌드 — env 없이(`env -i PATH HOME docker build --platform linux/amd64`) · 비밀 검사(`docker history` grep 0줄, 컨테이너 FS에서 로컬 `.env.local` 비밀 값 24개 대조 0건) · 도구(psql·pg_isready 15.19, pnpm 10.33.0, node v24.21.0, uid 1000, `/app` 쓰기 거부, `.next/cache`·`/data/uploads` 쓰기, 오프라인 pnpm) | `sha256:cfb37a8f…4e52b84`(로컬 빌드 `linux/amd64`, 레지스트리 digest 아님) | — | — | 빌드 2분 34초(Colima vz+Rosetta) | 성공 |
| 2026-10-09 | 첫 설치 `docker compose up -d`(`config -q` 통과 · `nginx -t` ok) — postgres healthy → migrate Exited 0 → web healthy → proxy·scheduler · 런타임 롤 `malmoi_app` super/createrole/createdb/bypassrls 전부 f · PUBLIC USAGE f · `docker compose port` postgres·web 빈 값, 호스트 5432·3000 닫힘 | `sha256:cfb37a8f…4e52b84`(로컬 빌드 `linux/amd64`, 레지스트리 digest 아님) | 17.6 | 42개 적용(마지막 `20261005090000_add_user_attention_seen_at`) | 43초 | 성공 |
| 2026-10-09 | 빈 볼륨 첫 설치 반복 `down -v && up -d` ×5(+2회 첫 요청 측정) | `sha256:cfb37a8f…4e52b84`(로컬 빌드 `linux/amd64`, 레지스트리 digest 아님) | 17.6 | 매번 42개 적용 | 회당 15~17초 | 성공 — migrate 5/5 exit 0, 첫 요청은 리슨 전 연결 실패 1회 뒤 200(502 없음) |
| 2026-10-09 | 실패 경로 — `MIGRATE_DB_PASSWORD` 틀림(P1000, web·proxy·scheduler Created에서 멈춤) · `RESEND_API_KEY` 빈 값(`preflight: RESEND_API_KEY missing`만, 25초에 재시작 8회, proxy·scheduler 미기동) · `http://` origin + 잘못된 키(`not-https`·`invalid-format`) | `sha256:cfb37a8f…4e52b84`(로컬 빌드 `linux/amd64`, 레지스트리 digest 아님) | 17.6 | — | — | 성공(값 미출력) |
| 2026-10-09 | proxy — HSTS 정확히 1개 `max-age=63072000`(200·301 대상·404·429·502·정적 자산) · 80→443 301(query 유지) · 429(`/api/images/` 800회 중 556, 병렬 뒤 `/oauth/authorize`도 429 — zone 공유) · web만 재생성 뒤 proxy 무재생성 5초 안 200 · 위조 `Host`·`X-Forwarded-Host`·`X-Forwarded-Proto` 무시(well-known·Auth.js redirect_uri 설정 origin 유지, 직접 web에 위조 Host면 404) · Server Action Origin 일치 200 / 불일치 거부 | `sha256:cfb37a8f…4e52b84`(로컬 빌드 `linux/amd64`, 레지스트리 digest 아님) | 17.6 | — | — | 성공 |
| 2026-10-09 | 공개 응답 — robots `Disallow: /` · 페이지 `X-Robots-Tag: noindex` · `/sitemap.xml`·`/llms.txt`·`/llms-full.txt` 404 · `/privacy` 307 → `MALMOI_PRIVACY_URL` · Analytics 스크립트 0 · `/signin` 동의 링크 새 탭 | `sha256:cfb37a8f…4e52b84`(로컬 빌드 `linux/amd64`, 레지스트리 digest 아님) | 17.6 | — | — | 성공(canonical·og·JSON-LD는 설계대로 hosted origin) |
| 2026-10-09 | 두 origin(`a.malmoi.localhost`·`b.malmoi.localhost`, 같은 이미지 ID) — issuer·token endpoint·protected-resource·Auth.js callback·signin redirect·80→443이 각자 origin, 교차 Host 404 | `sha256:cfb37a8f…4e52b84`(로컬 빌드 `linux/amd64`, 레지스트리 digest 아님) | 17.6 | — | — | 성공 |
| 2026-10-09 | 업로드 볼륨(스크립트 — 화면 왕복은 OAuth 없어 미실행) — `putImage`→`/api/images/…` 200(uid 1000 소유)·경로 탈출 키 거부·`deleteImage` 뒤 404 · web+postgres 재생성 뒤 유지 · sharp 정규화 800×600 PNG → 192×144 WebP | `sha256:cfb37a8f…4e52b84`(로컬 빌드 `linux/amd64`, 레지스트리 digest 아님) | 17.6 | — | — | 성공(UI 업로드 미실행) |
| 2026-10-09 | 스케줄러 — 즉시 호출 → web `[pull] targets=…` 줄 · 틀린 `CRON_SECRET` → `curl: (22) … 401` · 매분 crontab으로 자동 1회 · 두 컨테이너 동시 호출 둘 다 200 · `ps`에 비밀 없음 | `sha256:cfb37a8f…4e52b84`(로컬 빌드 `linux/amd64`, 레지스트리 digest 아님) | 17.6 | — | — | 성공(대상 프로젝트 0개 — 프로젝트별 동시 결과는 미실행) |
| 2026-10-09 | 키 운영 — `docker compose run --rm --no-deps -e DIRECT_URL web pnpm credentials:self-hosted`가 db 망에서 접속 · `verify` · 토큰 키 회전(check-only `oldTokenKey:1` → `--apply` → `verify` 0) · `credentials:finalize:self-hosted`(`--apply` 포함) `pending:false` | `sha256:cfb37a8f…4e52b84`(로컬 빌드 `linux/amd64`, 레지스트리 digest 아님) | 17.6 | 42 | 차단~복귀 28초 | 성공(`--apply`의 `migrate deploy` 실행은 pending이 없어 미관측) |
| 2026-10-09 | 업데이트 — `pull --ignore-buildable`(scheduler 건너뜀; 로컬 태그 앱 이미지는 레지스트리에 없어 거부) · `run --rm migrate`(No pending, bootstrap 멱등) · 새 태그로 `up -d --force-recreate --no-deps web proxy scheduler` 2초 안 200, `EACCES`·`preflight:` 0 | `sha256:cfb37a8f…4e52b84`(로컬 빌드 `linux/amd64`, 레지스트리 digest 아님) | 17.6 | 42 그대로 | — | 성공(레지스트리 pull은 미실행) |
| 2026-10-09 | 백업 → `down -v` → 빈 볼륨 복원(이 절 절차 그대로, 운영 스택 없는 머신) — pg_restore 오류 0 · 행 수 동일(User 2·초대 2·Account 1) · bootstrap이 런타임 롤 생성·PUBLIC USAGE f · 업로드 이미지 200 · PII·토큰 복호화(회전된 키 포함) · `verify` 0 | `sha256:cfb37a8f…4e52b84`(로컬 빌드 `linux/amd64`, 레지스트리 digest 아님) | 17.6 | 42 = 42 | 정지~백업 17초 · 복원 1~6단계 약 30초 | 성공 |
| 2026-10-09 | 계정 삭제 절차 — HMAC 색인 스니펫이 대상 `User`·미수락 초대를 찾음 · 트랜잭션: OWNER 판정 0행 → 멤버 1·보낸 초대 1·받은 초대 1·User 1 삭제, Account cascade | `sha256:cfb37a8f…4e52b84`(로컬 빌드 `linux/amd64`, 레지스트리 digest 아님) | 17.6 | 42 | — | 성공 |
| — | 로그인(GitHub·Google)·프로젝트 생성·생성 워크플로 `api-url`·초대 메일·MCP 연결·`/projects` 스트리밍·GHCR 발행 | — | — | — | — | 미실행(외부 OAuth·App·메일 없음) |

실습에서 본 것(절차·동작 차이, 2026-10-09):
- 빈 볼륨 복원 4단계의 `docker volume create malmoi_uploads` 뒤로 모든 compose 명령이 `volume "malmoi_uploads" already exists but was not created by Docker Compose` 경고를 낸다(동작 무관, `down -v`는 그 볼륨도 지운다).
- 복원 6단계 `up -d web proxy`는 `depends_on` 때문에 migrate를 한 번 더 돈다(멱등이라 무해).
- 백업 manifest는 `chmod -R go-rwx` 뒤에 만들어지면 644로 남는다 — manifest까지 쓴 뒤 권한을 건다.
- nginx 기본 access log가 `/invite/<토큰>`과 `?code=…&state=…`를 원문으로 남긴다(web 로그는 0건) — proxy 로그 보존·공유는 토큰을 다루듯 한다.

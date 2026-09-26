# sec-audit-3 — 출시 전 보안 보완 (spec)

2026-09-27 `/audit` 보안 감사(인증·인가 / 테넌시·DB / 시크릿·런타임 경계 / 입력·인젝션 4축)의 발견
**18건(🔴1 · 🟡4 · ⚪13)을 전부** 닫는다. 번호는 감사 리포트의 연번을 그대로 쓴다 — 태스크·커밋·
정본 문서가 같은 번호로 추적된다.

## 사용자

- **대상 리포 소유자(개발자)** — 1번이 지키는 쪽이다. 읽기 권한만 가진 협력자가 우리 설치 토큰을
  빌려 자기 리포의 CI를 실행시킬 수 없어야 한다.
- **번역 편집자(비개발자)** — 4번이 지키는 쪽이다. 입력한 값이 소비자 런타임에서 다른 타입으로
  읽히면 안 된다.
- **운영자(나)** — 2·3·9·10·14번. 운영 절차·문서가 실물과 같아야 한다.

## 문제 (관측된 사실)

| # | 등급 | 사실 |
|---|---|---|
| 1 | 🔴 | `isPathSafeLocale`은 경로 안전성만 본다. push 토큰 보유자가 `locales:["package"]` + `pathTemplate:"{locale}.json"`을 보내면 pull/Publish가 설치 토큰으로 `package.json`을 재생성해 sync 브랜치에 커밋한다. `planRepoConnect`는 리포가 설치 목록에 **보이는 것**만 요구하므로 **읽기 전용 협력자**가 프로젝트를 만들어 토큰을 받는다(ARCHITECTURE §5.5.05가 인정). |
| 2 | 🟡 | prod `public` 스키마: `supabase_admin`의 `pg_default_acl` 3행이 새 테이블·시퀀스·함수를 `anon`·`authenticated`에 전 권한으로 열고, 두 롤이 스키마 USAGE를 가진다. 대시보드로 만든 테이블은 즉시 anon key로 열린다. |
| 3 | 🟡 | dev는 스키마 USAGE부터 없고 prod는 있다 — `/db` 5단계가 dev만 보면 prod에 대해 아무것도 증명하지 않는다. |
| 4 | 🟡 | `yaml-catalog`의 `flowString`이 YAML 1.2 판정으로 PLAIN을 고른다. `No`·`on`·`12:30`이 인용 없이 나가 Psych·PyYAML(1.1)에서 bool·정수로 읽힌다. |
| 5 | 🟡 | PRODUCT §7.1(383행)은 보관 뒤 이름·이미지 Action을 허용한다고, §7.9(789행)는 거부한다고 쓴다. 코드는 §7.9다. |
| 6 | ⚪ | `deleteProjectImage(slug)`만 slug를 스키마로 검증하지 않는다 — 비문자열이면 거부 값 대신 500. |
| 7 | ⚪ | 보관된 프로젝트에서 `startGithubConnect`가 통과한다(PRODUCT §7.9 "보관 = Restore만"과 불일치). |
| 8 | ⚪ | 초대 수락의 "이미 멤버인가"가 트랜잭션 밖이다 — 동시 수락의 둘째가 P2002 → `unavailable`. |
| 9 | ⚪ | `action.yml` 주석이 "말모이 리포가 private"라고 쓴다(2026-09-18에 public). |
| 10 | ⚪ | `push-local`의 `--url`이 http를 받는다 — `PUSH_TOKEN`이 평문으로 나갈 수 있다. |
| 11 | ⚪ | CSP script·style에 `'unsafe-inline'`. |
| 12 | ⚪ | `img-src`의 `*.public.blob.vercel-storage.com`이 남의 Blob 스토어까지 연다. |
| 13 | ⚪ | 샘플 확인 서명 토큰에 만료가 없다. |
| 14 | ⚪ | `AUTH_SECRET` 하나가 Auth.js·GitHub 연결 state·샘플 확인을 겸한다 — 회전이 셋을 함께 무효로 만든다. |
| 15 | ⚪ | 초대 발송 한도가 프로젝트 단위(20/h)뿐 — 사용자 단위 한도가 없다. |
| 16 | ⚪ | `listBranches`·`openRepoReader`가 설치 토큰을 `repositoryIds`로 좁히지 않는다(쓰기 경로만 좁힘). |
| 17 | ⚪ | permalink `path`가 push `refs`에서 와 `../..`로 github.com의 다른 경로를 가리킬 수 있다. |
| 18 | ⚪ | `placeholders: z.unknown()` — 깊게 중첩된 JSON이 저장·렌더 재귀를 넘칠 수 있다. |

## 완료 조건 (검증 가능한 문장)

1. **1번**
   - (a) 리포에 **push 권한이 없는** 사용자는 프로젝트 생성·Reconnect·Add surface에서 `repo-forbidden` 계열
     거부를 받는다. `planRepoConnect` 단위 테스트가 `permissions.push=false`를 거부로 고정한다.
   - (b) `/api/push`가 로케일 모양이 아닌 코드(`package`·`index`·`README`·`config`)를 400으로 거부하고,
     `resolveLocalePaths`도 같은 코드로 저장된 행을 `fail`로 거부한다(2층). 실측 로케일
     (`en`·`pt_BR`·`zh-Hant-TW`·`es-419`·`sr-Latn`·`fil`)은 통과한다.
   - (c) prod `Locale.code`의 distinct 값이 새 규칙을 전부 통과함을 배포 전에 확인한다(0건 거부).
2. **2번** prod·dev 모두 `has_schema_privilege('anon','public','USAGE')`와 `authenticated`가 `false`다.
   변경은 마이그레이션 파일로 추적되고, 두 롤이 없는 격리 PostgreSQL(`test:projects:postgres`)에서도 적용이 성공한다.
3. **3번** `/db` 5단계가 prod 확인을 필수로 명시하고, 스키마 USAGE 확인 SQL을 포함한다.
4. **4번** 원본에 `%YAML` 지시자가 없는 파일에서 `No`·`yes`·`on`·`off`·`y`·`n`·`~`·`12:30`·`0x1F`류 값이
   인용되어 나가고, 1.1·1.2 어느 파서로 읽어도 문자열이다. 값이 모호하지 않으면 원본 PLAIN 표현이 유지된다(§1.4).
5. **5번** PRODUCT §7.1이 §7.9와 같은 판정을 쓴다.
6. **6번** `deleteProjectImage`에 비문자열 slug를 넘기면 `{ ok:false }` 값이 돌아온다.
7. **7번** 보관된 프로젝트에서 `startGithubConnect`가 `archived` 거부를 돌려준다.
8. **8번** 같은 사용자의 동시 수락 둘 중 진 쪽이 `already-member`를 받는다.
9. **9번** `action.yml` 주석에 private 전제가 없다.
10. **10번** `push-local`이 `localhost`·`127.0.0.1`·`[::1]` 밖의 `http:` URL을 exit 2로 거부한다.
11. **11번** 프로덕션 응답의 CSP `script-src`에 `'unsafe-inline'`이 없다(결정 B — `style-src`의 `'unsafe-inline'`은 잔여로 남긴다).
12. **12번** `img-src`가 그 환경의 Blob 스토어 호스트 하나만 연다.
13. **13번** 샘플 확인 토큰이 발급 후 TTL을 넘으면 검증에 실패한다.
14. **14번** GitHub 연결 state·샘플 확인이 `AUTH_SECRET`이 아닌 별도 키로 서명된다 — `AUTH_SECRET` 회전이 그 둘을 무효로 만들지 않는다.
15. **15번** 한 사용자가 전 프로젝트 합산 시간당 한도를 넘는 초대를 발급하면 거부 값이 돌아온다.
16. **16번** `listBranches`·`openRepoReader`의 설치 토큰이 해당 리포 id 하나로 좁혀진다.
17. **17번** `refs[].path`가 `isPathSafeRepoPath`를 통과하지 못하면 push가 400이고, `buildPermalink`는 저장된 불량 행에 `null`을 돌려준다.
18. **18번** `placeholders`가 깊이·직렬화 크기 상한을 넘으면 push가 400이다.
- 공통: `pnpm typecheck`·`pnpm test` green, 영향 범위 규칙에 따라 `pnpm test:projects:postgres` green.
  정본 문서(PRODUCT·ARCHITECTURE·OPERATIONS·ACTIONS·`/db` 스킬·`.env.example`)가 코드와 같은 상태다.

## 비목표

- **RLS 활성화·최소권한 런타임 롤 이관** — CLAUDE.md가 "RLS를 실제로 켜는 시점"으로 미룬 결정이다. 2번은 GRANT·USAGE로 닫는다.
- **`realtime` 스키마 RLS 점검·Supabase Advisors 화면 확인** — 감사가 보지 않은 범위다. 이번엔 운영 체크(태스크 T2.3)로만 남기고 코드 변경 대상은 아니다.
- **초대된 OWNER가 리포 쓰기 권한 없이 토큰을 회전하는 경로** — 쓰기 권한자가 OWNER로 초대해 위임한 것으로 본다(1번 잔여, design에 기록).
- **1번 (b)가 못 막는 3글자 단어**(`app`·`api` 형 파일명) — (a)가 근본 방어이고 (b)는 심층 방어다. 잔여로 기록한다.
- 감사 범위 밖(결정성·부채 차원)의 정리.

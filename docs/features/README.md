# docs/features — 기능 문서 인덱스

`/feature`가 만든 산출물이 사는 곳이다. 디렉터리 하나가 기능 하나이고 안에 `spec.md`(무엇을 왜) ·
`design.md`(어떻게) · `tasks.md`(순서와 검증)가 있다. 넷째 종류로 **외부 검토·감사 원문**이 있다
(`saas-review.md`, `tenant-auth/audit-2026-09-06-codex.md`) — 근거로 보관하고 실행 계획으로 읽지 않는다.
다섯째로 **`user-stories.md`**(화면별 사용자 스토리 — `translation-ui/`에만 있다)가 있고, **완료돼도
남긴다**: `docs/DESIGN.md`가 "화면별 구성은 그쪽"이라고 **정본에서 가리키므로** 지우면 그 참조가 죽는다.

여섯째로 **`findings.md`**(우리가 돌린 감사의 발견 목록 — `sec-audit/`·`sec-audit-2/`에 있다), 일곱째로
**`operations.md`**(운영 전환·복구 절차 — `credential-storage/`에 있다. ⚠️ **완료돼도 지우지 않는다**:
키 회전·백업 복원처럼 **나중에 다시 실행할 절차**라 tasks와 수명이 다르고, SAAS 본문과 CLAUDE.md가
직접 가리킨다), 여덟째로 **`review.md`**(리뷰 범위를 고정한 기록 — `credential-storage/`에 있고 그 디렉터리는 `spec`·`design`도 **함께** 갖는다)가 있다. **`findings.md`를 가진 디렉터리**는
**`spec.md`·`design.md` 대신 감사 근거를 가진다** — 설계할 기능이 아니라 이미 있는 코드에서 찾은 결함이라,
근거가 "왜 그 선택을 했나"가 아니라 **"무엇이 어떻게 뚫렸고 무엇은 봐서 깨끗했나"**다. `findings.md`는
**완료돼도 남긴다**(다음 감사가 같은 비용을 다시 쓰지 않게 하는 것이 그 문서의 절반이다). `tasks.md`는
규칙대로 닫히면 지운다. 넷째(외부 감사 원문)와 다른 점은 **실행 계획이 붙어 있다는 것**이다.

✅ **7단계 `sync-runs/`가 프로덕션까지 나갔다** (2026-09-10, PR #26 → `d0e8688` — 아래 표).
🔵 **8단계 `ui-rework/`가 진행 중이다** — 8-1이 프로덕션(`718db80`), 8-2(셸)·8-3(프로젝트 목록)과 **2026-09-11 폴리싱 라운드**(패널 머리 고정 · 목록 검색·상태 필터 · `Tooltip` 제거 · 화면 제목이 사이드바 라벨 키 공유 · `lib/tone.ts`), 그리고 **8-4(번역 화면 — 표의 축을 로케일 = 행으로 재작성)**가 dev다.
태스크와 완료 게이트는 SAAS §8에 있다.

**2026-09-12 — 나머지 화면의 톤앤매너 통일**:
[ui-rework/page-patterns](./ui-rework/page-patterns/spec.md)에 공통 패턴·예외·배송별 검증을 정리했다.
초기 후보 둘과 Dialog 겹침 순서를 수정하고 두 해상도 런타임 비교를 완료했다. 기존 정보 구조·동작을 유지하며 시각 표현을 맞추는 8-5~ 계획이다.
새 본문 시안은 선행 조건이 아니며 구조 재설계·피드백 방식 변경·8-P는 포함하지 않는다.

⚠️ **`ui-rework/`는 2단 구조다** — 축이 커서 디렉터리 안에 **배송별 하위 디렉터리**를 두고
(`signin-auth/` · `translations/` — 뒤엣것이 8-4다), **아홉째 종류인 `README.md`**가 배송 순서와 **작업 규약 아홉**을 든다(SAAS §8과
CLAUDE.md가 규약 8을 직접 가리킨다). 배송마다 `spec`·`design`·`tasks`가 필요한 것은 아니고,
8-2·8-3처럼 시안이 곧 스펙인 배송은 그 `README.md`의 절 하나로 근거를 남긴다.
(6단계 `translation-ui/`는 2026-09-07에 디렉터리가 생겼고 **2026-09-09에 프로덕션까지 닫혔다** — 아래 표. 5단계
`project-onboarding/`은 2026-09-07에 생기고 같은 날 T1~T8이 프로덕션까지 갔다.)

**여기 있는 문서는 스펙이 아니다.** 정본은 셋 — `docs/SAAS.md`(현재 단계 — 무엇을 만드는가),
`docs/MVP.md`(PoC — 닫힘), `docs/ARCHITECTURE.md`(불변식·함정) — 이고, 이 디렉터리는 **그 결론에
도달한 과정**을 남긴다. 기능이 끝나면 결론은 정본으로 올라가고 여기는 근거로 남는다.

**셋의 수명이 다르다** (2026-09-05 정리):

- **`spec.md`·`design.md`는 완료돼도 지우지 않는다.** "왜 그 선택을 했나"를 담고 있어서, 되살릴 때
  재작성 비용을 없애고 나중에 묻는 사람에게 답한다.
- **`tasks.md`는 닫히면 지운다.** 순서와 검증 체크리스트라 전부 `[x]`가 된 시점에 남는 정보가 없다 —
  결론은 정본으로 올라갔고 "왜"는 앞의 둘에 있다. 실제로 완료된 셋(adapter-generality ·
  key-order-preservation · format-preservation, 841줄)을 밖에서 참조하는 문서가 하나도 없었다.
- **예외는 체크리스트 밖의 기록이 붙은 경우다.** `pull-to-pr/tasks.md`는 §4에 실물 검증 7시나리오가
  있고 MVP §9와 TASKS가 그것을 직접 참조하므로 남긴다. **`tenant-auth/tasks.md`도 같은 이유로
  남긴다** — §6.1이 preview 실물 검증 5항목과 **거기서만 잡힌 결함 넷**을 들고 있고, 그건 체크박스가
  아니라 "자동 검증이 원리적으로 못 보는 것이 무엇인가"의 기록이다. **보류 중인 문서(`key-separator-contract`)의
  `tasks.md`는 애초에 이 규칙의 대상이 아니다** — 닫히지 않았고, 되살릴 때 볼 검수 미반영 항목이 거기
  §후속에 있다. **`github-connect/tasks.md`도
  같다** — T5가 실물 10시나리오와 거기서만 잡힌 결함(malmoi#7)을, 그리고 **못 밟은 둘이 왜 못
  밟혔는지**를 든다. 뒤쪽이 특히 지워지면 안 된다: 다음 사람이 같은 벽에 다시 부딪힌다.
  **`translation-ui/tasks.md`도 남긴다**(96개 전부 `[x]`인데 T7 재측정 기록이 붙어 있다) · **`sync-runs/tasks.md`도 남긴다**(T10 동시성 실물). ⚠️ **둘은 아래 표 칸에만 근거가 있었다** — 규칙을 읽는 사람이 삭제 대상으로 본다.
  **`project-onboarding/tasks.md`도 남긴다** — T8이 실물 검증 14행 표와 **전환 계획의 전제 둘이 틀렸다는
  실측**(l10n 워크플로가 붙은 리포는 하나 / prod는 여섯 행에 한 리포 두 프로젝트)을 들고 있고, 그 둘은
  다른 어디에도 없다.

## 상태

| 기능 | 상태 | 결과가 사는 곳 | 남은 것 |
|---|---|---|---|
| [pull-to-pr](./pull-to-pr/) | ✅ 완료 (2026-09-01) | MVP §3.3 · ARCHITECTURE §2·§3 · TASKS §6 | 없음 — `tasks.md` §4는 실물 검증 기록이라 남겼다 |
| [adapter-generality](./adapter-generality/) | ✅ 완료 (2026-09-02) | **ADAPTER-COVERAGE.md** · TASKS §8 | 없음 — **단 코퍼스 파일은 살아 있는 입력이다**(아래) · `tasks.md` 삭제 |
| [key-order-preservation](./key-order-preservation/) | ✅ 완료 (2026-09-03) | ADAPTER-COVERAGE §10·§11 · MVP §4.1 · ARCHITECTURE §1.1 | 없음 · `tasks.md` 삭제 |
| [format-preservation](./format-preservation/) | ✅ 완료 (2026-09-04) | ADAPTER-COVERAGE §14·§15·§16 · MVP §4.1 · ARCHITECTURE §1.1 | 완료 조건 ③ **판정 불가**(계측 없음) · `tasks.md` 삭제 |
| [key-separator-contract](./key-separator-contract/) | ⏸️ **보류 — SaaS화 이후** | — | 문서 전체. 검수 미반영 항목부터 본다 |
| [tenant-auth](./tenant-auth/) | ✅ 완료 (2026-09-06, 프로덕션 반영까지) | **SAAS.md §5·§6·§8 2단계** · ARCHITECTURE §5.1·§6~§6.3 · CLAUDE.md(차단 두 층·세션) | 없음 · `tasks.md` **남긴다**(§6.1이 실물 검증 기록이다) · `audit-2026-09-06-codex.md`는 배포 뒤 Codex 정적 감사 9건 — **9/9 전부 닫혔다**: 7건은 `194fb91`(PR #6 squash)이, #4(동시 초대 발급)와 #8(CI 경고가 프로젝트별 sync 브랜치를 안 봤다 — `289ec22`)이 같은 날 |
| [github-connect](./github-connect/) | ✅ 완료 (2026-09-07, 실물 검증까지) | **SAAS.md §5.4·§5.7·§8 4단계** · CLAUDE.md(자격증명 셋·`lib/github-connect/`) · MVP §7(비범위 정정) | 없음 · `tasks.md` **남긴다**(T5가 실물 검증 10시나리오와 **거기서만 잡힌 결함 하나**를 들고 있다 — malmoi#7, `redirect_uri` 누락) · **둘은 끝내 못 밟았다**: App 제거(폐기용과 프로덕션이 같은 설치를 공유) · 다른 User의 GitHub 계정으로 연결 시도(세션 둘 필요) |
| [project-onboarding](./project-onboarding/) | ✅ **완료 (2026-09-07, 프로덕션 반영까지)** | ✅ **올라갔다**: 워크플로 판정 → SAAS §10 · 후보 순위 → §7.3 · 조회 방향 → §7.8 · 3개 제한 → §8 7단계 · `StateDest` → §5.4.1 · 2패스 탐지와 첫 적재 → ARCHITECTURE §3.1 · 잎 모듈 규칙 → §6.35 | ✅ **없음** — 마지막 잔여였던 Vercel 옛 env(`ACTIVE_PROJECT_SLUG`·`PUSH_TOKEN`) 삭제가 2026-09-07 리뷰 ⚪16에서 끝났다(**두 스코프였다** — Development엔 없었다). ⚠️ T8이 전제 둘을 뒤집었다: **토큰 발급은 `order-check` 하나**(l10n 워크플로가 붙은 리포가 그것뿐이고 쓰는 곳 없는 토큰은 발급하지 않았다)이고, **prod `Project` 행은 여섯**이다(`i18n-format-check` 하나에 프로젝트가 둘 — SAAS §7.1의 "표면이 둘"이 실재한다) |
| [translation-ui](./translation-ui/) | ✅ **닫혔다** (SaaS **6a 닫힘** — ship 1~4 프로덕션 `46df51a`/#12 · `add099a`/#14 · `ef9da44`/#15 · `695e441`/#16. **6b-1** 2026-09-08 · **6b-2** `a00d380` · **6b-3** `7c975c0`/#21 · **6b-4** `70e393b`/#22 · **6b-5**·**6b-6** `0d68d71`/#23 (2026-09-09) — ✅ **6단계 완료, 프로덕션까지**) | **SAAS.md §8 6단계 · §7.7(IA 정본)** · DESIGN §3.1·§6.4·§6.5·§6.6·§6.64·§6.65·§6.66·§6.67·§6.8·§7 · ARCHITECTURE §1.35·§3·§5.5·§5.5.16·§6.1·§6.3·§6.35·§6.4 · CLAUDE.md(`messages/`·`lib/i18n`·`lib/routes`·`lib/shell`·`components/shell`·`components/ui`·`middleware.ts`) · POSTMORTEM 9건(2026-09-08 4 · 2026-09-09 5) | ✅ **없다 — 2026-09-09에 잔여 둘이 닫혔다.** ① 완료 조건이던 **첫 착지 < 2초**: 원인이 백로그가 든 수단 셋이 아니라 **함수 리전**이었다(엣지는 `icn1`인데 함수가 `iad1`, DB는 도쿄). `vercel.json`에 `hnd1`을 박아 **3.30 → 0.44~0.54초**(FCP 3회), 필터 없는 907키 화면도 4.66 → 1.20초 — 아래 백로그에 숫자가 있다. ② **Publish 다섯 갈래 중 "일부 미기록"(warning)**: writer가 값을 버리는 상황이 필요한데 그건 **수술적 어댑터**에서만 나고 ship 3이 쓴 `order-check`은 재생성이라 못 밟았던 것을, `/l10n-roundtrip`이 `bugshot-i18n-test`(ts-dict)로 밟았다 — amber Alert · `<details>`의 `whitespace-pre-wrap` · PR 링크 확인. ⚠️ **적재 전에 비리터럴을 심으면 push가 red다**(read 에러가 치명적이다) — 이 갈래는 **적재 뒤 코드가 바뀐** 순서에서만 난다. ⚠️ **2026-09-09 `/doc-check`이 이 칸의 옛 "없음"을 통과시켰다** — 표와 백로그만 대조하고 근거 문서의 게이트 절을 안 봤다. 라우트 여덟 중 `logs` 하나만 남았고 그것은 **7단계**다. `user-stories.md`는 완료돼도 남긴다(DESIGN이 참조한다). ⚠️ `tasks.md`도 남긴다 — 체크리스트 밖에 **재측정 기록**(ship 3의 3.30/4.66/3.29초와 그 뒤의 리전 재측정)이 있고 CLAUDE.md·SAAS.md·이 파일이 그것을 참조한다 |
| [sync-runs](./sync-runs/) | ✅ **완료 (2026-09-10, 프로덕션 + 실물 검증까지)** — PR #26 → `d0e8688` | ✅ **올라갔다**: 동시 실행 계약·stale·오류 코드 태깅·보관 갈래·cron 정렬 → ARCHITECTURE §5.6 · 7단계 체크리스트와 §7.9(보관) → SAAS · sync 배지 4종·settings-block 여섯·`logs` 화면·보관 화면 → DESIGN §6.2·§6.6·§6.68·§6.69·§6.8 · CLAUDE.md(`lib/sync/`·`SyncRun`·`archivedAt`·`logs` 라우트) | ✅ **없다.** `pnpm db:deploy` 완료(prod 14개, 새 테이블의 `anon` 권한 0 실측) · **T10이 프로덕션에서 닫혔다** — 두 탭 **11ms** 간격에 행 하나·커밋 하나 · `too-soon`까지(계획 밖으로 더 밟았고, 그것이 "`lastSettled`가 SKIPPED도 센다"의 증거다) · 보관된 프로젝트가 cron `results`에서 빠지고 대조 넷엔 `CRON` 행이 남았다 · 보관 중 CI push가 `409 {"error":"archived"}`로 red. ⚠️ **`tasks.md`를 남긴다** — T10이 **자동 테스트가 원리적으로 못 닫는 것**(하네스 `$transaction`에 직렬화가 없다)의 유일한 근거이고, 이 계약을 다시 건드리면 그 절차를 그대로 다시 밟아야 한다. 후속 넷은 그 파일 맨 아래(`Home`을 `SyncRun`으로 · push를 이 테이블에 · `needs_configuration` · 보존 기간) |
| [sec-audit](./sec-audit/) | ✅ **프로덕션 반영** (2026-09-09, PR #25 → `bc3615c`) | ARCHITECTURE §1.1·§5.1·§5.5.05·§6.05·§8 · DESIGN §6.65 · CLAUDE.md(컨벤션·CI·게이트웨이·`lib/locale-code.ts`·`next.config.ts`) · ACTIONS.md · `/db` 5단계 · POSTMORTEM 4건(2026-09-09) | ✅ **프로덕션까지 갔다** (2026-09-09, PR #25 → `bc3615c`) — 태그 `l10n-push-v1`을 끊고 소비자 리포(`i18n-order-check` **하나**다, 넷이 아니었다)를 옮겨 **발견 3까지 닫혔다**(그 참조로 run green). ✅ **잔여 없다** — 프로덕션 9라우트에서 **CSP Report-Only 위반 0건**을 실측했다(2026-09-09, CDP `Log.entryAdded`의 `source: "security"`. DOM 이벤트로는 안 잡힌다 — 검사가 위반을 집는 것을 먼저 증명하고 0을 읽었다). **enforce로 올리는 것이 다음 후보**이고, 그 판단의 근거가 이제 있다. **수용 넷**(발견 7·16·27·28)과 **사람이 지울 `.env.local` 항목 셋**(발견 22)은 `tasks.md` 맨 아래에 있다. ⚠️ **수동 확인 하나가 아직 미수행이다** (`tasks.md:232` T9) — `pnpm dev`에서 `/projects/<slug>/members`의 응답 본문에 원문 `@`가 들지 않는지 실물로 보는 것이고, 나머지 열린 체크박스 다섯은 `/push → /merge` 부기다 |
| [sec-audit-2](./sec-audit-2/) | ✅ 프로덕션 반영 (2026-09-10, PR #27 → `ff5e8a4`) | ARCHITECTURE §9 · SAAS §11 · [작업 기록](./sec-audit-2/tasks.md) | #37은 **사용자 결정으로 제외**(가시성 기반 정책 유지). #38은 session-revocation으로 배송 |
| [credential-storage](./credential-storage/) | ✅ **dev·prod 전환 완료** (2026-09-10, PR #28 → `9e6854e` · #29 → `f6933d7`) | [spec](./credential-storage/spec.md) · [design](./credential-storage/design.md) · [operations](./credential-storage/operations.md) · SAAS 저장 보호 · ARCHITECTURE §5.1·§6.6 | **실질 잔여는 리허설 둘** — 키 회전(P7) · 차단·drain(T11). ⚠️ **`tasks.md`의 열린 체크박스는 아홉이고 그 수가 잔여가 아니다** — **P2(nullable `emailLookup` additive migration)는 이미 배송됐고**(`prisma/migrations/20260910050000_add_email_lookup`) 나머지(T12·P2/P6·T4/T5/P3·P3/P4·P4/P5·T11 전환 경험)는 배송분의 미정리 항목이다. 체크박스를 세지 말고 이 칸을 본다 |
| [session-revocation](./session-revocation/) | ✅ 프로덕션 반영 (2026-09-10, PR #28 → `9e6854e`) | SAAS 전체 세션 회수 · ARCHITECTURE §6.1.1 · [spec](./session-revocation/spec.md) | GitHub 왕복·두 세션 회수·타 사용자 보존은 실물 확인. 남은 것은 Google 왕복·취소 경로·키보드/포커스(S7) |
| [account-linking](./account-linking/) | 🔵 **dev — 실물 왕복(T7)만 남았다** (2026-09-12) | SAAS §4.3 ④·§5.5·§7.7 · ARCHITECTURE 계정 병합 절 · DESIGN `EntityCard` · [spec](./account-linking/spec.md) · [design](./account-linking/design.md) | T1~T6·T8 완료. ⚠️ **SAAS가 두 자리에서 비범위로 두었던 것을 사용자 재량으로 대체했다** — 2차 개방 조건(provider 접근 상실)을 충족한 것이 **아니고**, 연 근거는 **초대 단절**이다. ⚠️ **`safePrismaAdapter.linkAccount`는 한 줄도 안 바뀌었다** — 게이트 옆에 문이 하나 났고 그 인가 조건이 셋이다. ⚠️ **T7은 실물 OAuth 계정 둘이 필요해 자동화가 안 된다** — 시나리오 열하나가 [tasks.md](./account-linking/tasks.md)에 있고 dev(로컬)에서 돈다 |
| [ui-rework](./ui-rework/) | 🔵 **진행 중** (8-1 프로덕션 `718db80` · 8-2·8-3·8-4 + 폴리싱 dev) | SAAS §8 · DESIGN §0·**§6.1**·§6.5·§6.55·§6.62·§6.63 · [배송·규약](./ui-rework/README.md) | ✅ **8-4의 T12가 닫혔다** (2026-09-12 — 수동 검증 넷이 전부 `[x]`다). 마지막이던 **903키 `?ns=*` 2초**를 로컬 프로덕션 빌드 + dev DB의 `perf-903`(907키)으로 쟀고 **FCP 0.3초대**로 통과했다. ⚠️ **그 회차가 게이트 밖을 함께 쟀다** — `?ns=*`의 `loadEventEnd`가 **3.9초**(textarea 2,721 · 노드 34,624 · 1.44MB)이고 FCP는 스트리밍이라 그것을 안 본다. 가상화는 **넣지 않았다**(판정 조건이 게이트 미달이고 `?ns=*`는 기본 경로가 아니다). 숫자는 [translations/tasks.md](./ui-rework/translations/tasks.md) 실측 기록. ⚠️ **국기 SVG 에셋은 잔여가 아니다** — `public/flags/` 253개가 `af6acc7`로 **커밋됐다**(`public/brand/` 옆의 원본). ⚠️ **8-1의 `signin-auth/tasks.md`는 12/52만 체크된 채 남아 있다** — 배송은 프로덕션(`718db80`)이고 체크박스만 미정리라, 그 파일을 미완으로 읽지 않는다 / 나머지 페이지별(Home·언어·멤버·이력·설정·온보딩·계정) · 8-P 패널 diff |
| [saas-review.md](./saas-review.md) | 📄 **근거 문서** (기능 디렉터리가 아니다) | **SAAS.md** | 없음 — 원문 보관 |

⚠️ **`saas-review.md`는 예외적으로 파일 하나다.** `/feature` 산출물이 아니라 2026-09-04에 Codex가 낸
종합 검토이고, 결론이 `SAAS.md`로 올라갔다. 헤더에 **이미 닫힌 부분과 그 문서가 놓친 결함**을 달아
뒀으니 실행 계획으로 읽지 않는다.

## 백로그와 종료 근거

앞의 **다섯**은 `docs/ADAPTER-COVERAGE.md`에서 왔고(§6 후속 표 셋 · §13.3 · §15.3·§16.4) **`lib/adapters/**`를 쳐서
재측정 트리거가 각각 붙는다** (`/push` 4d). 그 아래는 tenant-auth 검수·2026-09-06 리뷰의 이월과 **실사용 실측**의 이월이다.

| 항목 | 근거 | 왜 아직 안 했나 |
|---|---|---|
| **`yaml-catalog` 범위 기반 치환** | ADAPTER-COVERAGE §13.3 — `doc.toString()`이 1키 편집에 redmine 1,585줄 중 816줄을 바꾼다 | 옵션으로 닫을 수 있는 축은 닫았고, 나머지는 스칼라 `range`로 원본 문자열을 직접 갈아끼워야 한다. 완료 조건은 **1키 편집 → 1 hunk** |
| **키 구분자 계약** | 손실 2건 중 siyuan 하나로 줄었다 (§13.1) | 문서는 [key-separator-contract](./key-separator-contract/)에 있고 **보류 판정**이 났다 — 도입 대상 bugshot-2가 `ts-dict`라 효과 0이다 |
| **로케일 디렉터리의 네임스페이스 여러 개** | ADAPTER-COVERAGE §6 순위 6 — Ghost 5개·automa 4개·Folo 10개 (**관측 3리포** — 5+4+10은 그 셋의 네임스페이스 합계다) | 한 프로젝트가 하나만 덮는다. ⚠️ **5단계가 답하지 않고 이월했다** (2026-09-07): `(repoOwner, repoName)`에 unique가 없어 같은 리포로 프로젝트를 두 번 만드는 것이 막히지 않고, 안내를 넣으려면 "표면이 둘"을 탐지가 먼저 알아야 하는데 그 판정 규칙이 없다. 온보딩은 후보 목록 + "더 있을 수 있어요"까지만 간다 |
| **단일 로케일 리포 지원 여부** | ADAPTER-COVERAGE §6 순위 4 — arkadiyt/zoom-redirector 1개 | "로케일 2개 이상" 규칙의 대가다. ⚠️ **5단계가 규칙을 바꾸지 않고 진단 문구까지만 갔다** (2026-09-07): `no-candidates`가 이유를 말한다("언어가 2개 이상인 로케일 파일이 필요해요"). 규칙을 바꾸면 어댑터 재측정이 따라오고 근거가 아직 리포 1건이다 |
| **minify된 파일** | HeaderEditor 1.000 (§15.3·§16.4, **관측 1리포**) | 루트를 `compactPaths`에서 제외한 설계 + 한 줄 여백 미관측이 겹친 자리. **관측 상태를 늘릴 근거가 리포 1건뿐이다** |
| **한 리포의 두 번째 표면으로 가는 길이 수동 지정뿐이다** | 2026-09-11 실측(bugshot-2를 붙였더니 로케일 3개 · **키 4개**) · SAAS §7.1·§7.3 · ADAPTER-COVERAGE 판정 ③ | 자동 탐지가 `public/_locales/{locale}/messages.json`(4키, 스토어 메타데이터)를 1순위로 내고, 실제 번역 표면인 `src/i18n/namespaces/*.ts`(903키)는 **`ts-dict`가 자동 탐지에서 빠져 있어 후보 목록에 아예 없다**. 사용자에게는 "키를 4개밖에 못 읽는다"로 보인다 — §7.3이 이 리포를 근거로 "키 수를 후보마다 보인다"까지 갔지만 **보이지 않는 후보는 키 수로도 구제되지 않는다.** ✅ **2026-09-11에 절반만 닫았다**: 수동 지정의 Path 힌트·placeholder가 어댑터 `layout`으로 갈려(`{locale}` ↔ `*` 글롭 + 포맷별 실제 예시) `ts-dict`를 고를 때 틀린 안내를 하지 않는다(`components/__tests__/manual-format-hint.test.ts`). **남은 것은 발견성이다** — 수동 지정을 펼치지 않는 사용자에게 두 번째 표면은 존재하지 않는다. 후보: ① `ts-dict`를 자동 탐지에 되살린다(`tsDictDetectByContent`가 보관돼 있다 — 어댑터 재측정이 따라오고 판정 ③을 뒤집을 근거가 필요하다) ② 후보 목록 아래 "다른 포맷도 보였어요" 진단 한 줄(탐지는 하고 추천은 안 하는 층 — 위 네임스페이스 행이 요구한 "표면이 둘"을 아는 규칙이 여기서도 전제다). ⚠️ **일괄 선택 + 사용자가 빼는 안은 기각됐다**(2026-09-11): `Project`가 포맷 트리플을 하나씩만 들고 `/api/push` 페이로드도 포맷 하나라(`lib/push/plan.ts:56`) `Project 1:N Surface` + `StringKey.surfaceId` + composite action·`checkFormat` 409 재계약이 묶여 오고, 그것은 **SAAS §7.1을 뒤집는 것**이다. 표면이 둘이면 프로젝트를 둘 만드는 것이 이미 설계된 경로다 |
| **한 리포에 프로젝트가 둘일 때 Actions secret 배선** | project-onboarding T8 실측 · SAAS §7.1 | 토큰이 프로젝트를 정하므로 `PUSH_TOKEN` secret 하나로 둘을 먹일 수 없다 — 워크플로에 스텝 둘 + secret 둘이 필요하다. prod에 실재한다(`i18n-format-check` → `format-check-code`·`format-check-yaml`). **워크플로를 붙일 때 결정할 자리라** 미결로 둔다 |
| **관리 콘솔의 자동 진단을 읽는 루틴이 없다** | POSTMORTEM 2026-09-09 (Supabase advisor가 DB 전면 노출을 알려줬다) · **[sec-audit](./sec-audit/) §6**(2026-09-09 보안 감사가 Vercel 설정과 GitHub App 스코프를 **CLI·자격증명 부재로 못 봤다** — 근거가 하나 늘었다) | Supabase **Advisors → Security**가 CRITICAL 둘을 계속 띄우고 있었는데 한 번도 열지 않았다 — 주간 메일이 유일한 통보 경로였다. Vercel·GitHub Dependabot도 같다. **grep으로 잡히는 부류가 아니라 주기적으로 열어야 하는 목록**이고 지금 그 목록이 어디에도 없다. 후보: `/audit`에 "콘솔 셋을 열어 확인" 단계를 넣거나(그 스킬은 리포트 전용이라 맞다), 별도 `/console-check`. ⚠️ **자동화가 안 되는 부분이 있다** — Advisors는 로그인이 필요하고 ego-browser로 열 수 있지만 세션이 매번 있다고 보장되지 않는다 |
| ~~**Publish의 "일부 미기록"(warning) 갈래 실물 검증**~~ ✅ 닫힘 (2026-09-09) | translation-ui `tasks.md` T7 게이트 절 (2026-09-08) | 다섯 갈래 중 넷은 `order-check`로 밟았는데 이 하나는 **수술적 어댑터**(값을 버리는 writer)에서만 나고 그 리포는 재생성이다. `pullMessage`의 갈래는 단위 테스트가, tone→variant 배선과 `<details>` 목록은 소스 스캔이 들고 있어 2026-09-09 `bugshot-i18n-test` 왕복에서 amber Alert·상세 목록·PR 링크를 확인했다(위 translation-ui 행) |
| **`lib/scan` 경고 단언의 해상도** | POSTMORTEM 2026-09-08 재발 방지 grep | `lib/scan/__tests__/scan.test.ts:124`의 `toMatch(/리터럴/)`가 `lib/scan/ast.ts`의 세 경고 중 **둘**(키 인자·namespace 인자)에 걸려 갈래를 구별하지 못한다 — 리팩터가 갈래를 바꿔도 green이다. `lib/scan`은 화면에 안 가서 오류 코드화 대상이 아니지만(translation-ui design §3.1.4) **단언 해상도는 별개 축**이다. 6b-1 범위 밖이라 미뤘다 — 고치면 사건별 부분 문자열을 단언하거나 경고에 `kind`를 붙인다 |
| ~~**번역 화면의 고정 3.3초**~~ ✅ **닫혔다** (2026-09-09, `hnd1`) | translation-ui T7 재측정 (2026-09-08 프로덕션) | 기본 착지 LCP 3.30초인데 **24키 프로젝트도 3.29초**다 — 행 렌더가 아니라 키 수와 무관한 고정 비용이고, 필터 없는 화면은 12.7 → 4.66초로 이미 2.7배 줄었다. **가상화도 조회 좁힘도 이걸 못 줄인다.** 수단 셋(표를 `Suspense`로 감싸 셸을 먼저 그리기 · 순차 DB 왕복 병합 · 폰트 CSS의 렌더 블로킹 해제)이 전부 번역 화면 밖이라 T7에 넣지 않았다. ✅ **쟀다** (2026-09-09 — 로컬 프로덕션 빌드 → dev DB, 같은 도쿄 pooler. 서버 타이머를 임시로 박고 웜 3회). **왕복 하나가 ~85ms이고 레이아웃·페이지가 병렬로 도는 구간은 pooler가 직렬화해 ~155ms로 늘어난다.** 요청당 왕복 **일곱**(레이아웃 2 + 페이지 5)이고 **page total이 4키 175~232ms · 24키 215ms로 같다** — 행 수가 아니라 홉 개수라는 프로덕션 관측이 재현됐다. ⚠️ **줄일 자리 둘을 계측이 찾았다**: `readSession`이 **한 요청에서 두 번** 돈다(레이아웃 + 페이지의 `requireProjectAccess`→`requireUser`, 둘 다 실제 DB. React `cache()`가 안 걸려 있다) · `getProjectAccess`와 `loadProject`가 **둘 다 `Project`를 읽는다**(앞이 slug로 찾고 뒤가 그 id로 같은 행을 다시 읽는다). 둘을 합치면 페이지 사슬이 **5홉 → 3홉**이다. 나머지 수단 둘(`Suspense`·폰트)은 클라이언트 축이라 별개다. ⚠️⚠️ **그런데 원인은 셋 중 어느 것도 아니었다** (같은 날 프로덕션 실측): `x-vercel-id: icn1::iad1::…` — 엣지는 서울인데 **함수가 `iad1`(워싱턴)에서 돌고 DB는 도쿄**다. TTFB는 8~77ms인데 **본문이 끝나는 데 1.5~3.4초**이고 문서는 8KB다(대역폭이 아니다). 홉당 ~375ms — 태평양 RTT 그대로다. **`vercel.json`에 `regions: ["hnd1"]`을 박았다**(PR #24 → `7b029b8`). 프로덕션 재측정(FCP 3회): 기본 착지 **3,300 → 436·472·536ms** · 필터 없는 907키 화면 **4,660 → 1,196·1,204ms** · `/projects` 1,420 → 270~792ms. **2초 목표를 기본 착지뿐 아니라 최악 경로에서도 통과했다.** ⚠️ **홉 병합 둘은 하지 않았다** — 이제 홉당 비용이 태평양이 아니라 도쿄 안이라 근거가 사라졌고, 필요해지면 위 두 자리(`readSession` 중복 · `Project` 이중 조회)부터 본다 |
| ~~**`translation-input` 저장 상태 `role=status`·실패 시 포커스 복귀**~~ ✅ **닫혔다** (2026-09-08 ship 3) | tenant-auth 검수(CDO) → **`translation-ui/tasks.md` T7**(ship 3) | `components/translations/announcer.tsx`(표 하나의 live region) + `lib/keys/refocus.ts`의 `shouldRefocus`로 들어갔다. 확정됐던 해법 그대로다 — 표 **하나**에 시각 숨김 `aria-live="polite"` 영역(셀마다 두면 903행×3로케일에 2,700개다) + 실패 시 `document.activeElement`가 `body`이거나 같은 셀일 때만 `focus()`, 아니면 상태줄 `[Retry]`(비동기 저장이라 응답이 올 때 사용자는 이미 다음 셀을 치고 있을 수 있다) |
| ~~**GitHub 계정 해제가 `project:settings` 뒤에 있다**~~ ✅ **닫혔다** (2026-09-07 리뷰 🟡9) | github-connect code-review 🟡3 (2026-09-07) · design §3.4 | `disconnectGithub`이 `projects/actions.ts`로 가고 인가가 `requireUser`가 됐다(인자 없음). `/projects`에 계정 섹션(6b-4에서 `/account`로 옮겼다). ⚠️ **미룬 사유가 낡았던 것이 앞당긴 이유다** — "OWNER 강등 경로가 실사용에 없다"였는데 5단계가 연결을 사용자 수준으로 열면서 **프로젝트를 하나도 안 만든 사용자**가 같은 잠금에 걸리게 됐고, 그 사람에겐 설정 화면이 없다 |

## ⚠️ `adapter-generality/`의 파일 넷은 생성물이 아니라 입력이다

```
repos.txt            학습 코퍼스 109개 — pnpm adapter-survey의 인자
repos-heldout.txt    홀드아웃 20개 — 일반화 판정 전용
verdicts.json        학습 정답 경로 — 오탐률의 분자를 사람이 정한 기록
verdicts-heldout.json 홀드아웃 정답 경로
```

**기능이 끝났어도 이 넷은 계속 쓰인다.** `lib/adapters/**`·`lib/survey/**`를 고치면 두 코퍼스를
**둘 다** 돌린다 — **3차(홀드아웃 검증)** 에서 수정 4건 중 2건이 수정이 만든 회귀였고 그중 하나는
학습에서만 나타났다 (ADAPTER-COVERAGE §0 3차, TASKS §8). 한쪽만 돌리면 못 본다.

`repos.md`는 대상 리포의 선정 근거와 구간 분류이고, 코퍼스를 늘릴 때 여기부터 읽는다.

## 문서를 새로 만들 때

`/feature`가 만들고 `/feature-review`가 4관점(CPO·CDO·CTO·QA)으로 크로스체크한다. **TASKS의 한
단계가 설계 문서를 요구할 만큼 클 때만** 부른다 — 작은 변경은 `/tdd` → `/implement`가 낫다.

기능이 끝나면 이 파일의 표에 한 줄을 옮기고, **결론을 정본(SAAS·ARCHITECTURE, PoC 시절엔 MVP)으로 올린다.**
올리지 않으면 정본이 낡고, 이 디렉터리가 스펙처럼 읽히기 시작한다.

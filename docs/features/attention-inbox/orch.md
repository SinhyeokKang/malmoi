# attention-inbox — orchestration

원본: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md). 이 문서는 지휘 계획·상태만 든다.

- 시작 dev: `efe216e8` (2026-10-05)
- **디자인 정본(시안)**: https://claude.ai/design/p/b99d54cd-3034-44f1-8446-0a864da9d767?file=Attention+Inbox.dc.html
  (spec.md:5 — 프레임 H1–H3 · D1–D7). 퍼블리싱 배치 B가 구현 기준으로 쓰고, 통합 뒤 `/design-sync`(T9)가 대조 기준으로 쓴다.

## 결정 기록

1. (2026-10-05 사용자) **Codex 워커 위임 허가 — 적합한 배치에 한해**(토큰 분산 목적, 전부 Codex로 하지 않는다).
   범위: 배치 A(백엔드 — 순수 함수·스키마·껍데기·Action, 테스트로 판정이 닫힌다)만 Codex `gpt-6-astra`.
   UI(B)·리뷰·QA·design-sync는 Claude Code(Opus 5.5) — DesignSync가 Claude Code 전용이고 시안 대조가 필요하다.
2. 제품·설계 결정은 design.md "닫힌 결정" 1–11이 전부다. 새 🔒 없음.
4. (2026-10-05 사용자) `/guide-shots`: 셸이 든 컷 전부 + README hero·logs + 새 `#inbox` 컷 재촬영(QA 끝, 직렬).
5. (2026-10-05 사용자) **랜딩 목업(`components/landing/mockup/`) stale 전부 수정** — 헤더 Inbox 반영 + 검색 버튼 높이 등 현재 앱 셸과 다른 곳. B가 R-B 수정 라운드와 함께 맡는다.
3. T9 design-sync: 통합 뒤 main 체크아웃 Claude QA 워커가 시안 프레임별로 실측(computed style + AX 트리) → 결함은 BugShot → B가 고친다
   (메모리: 정본이 준비된 변경은 design-sync를 건너뛰지 않는다).
6. 보조줄 표기: **지휘자 판단 — keep**(`{소스} · {Locale.name}`, Home `title()` 공유). 실데이터 name=code라 시안과 시각 차이 0, 바꾸면 Home과 같은 개념이 갈린다(DESIGN §2.4).
7. (2026-10-05 사용자) **범위 변경 — 공개 셸 헤더에도 Inbox**(로그인 `ok`일 때). 지휘자 판단: 배치 `[GitHub] | [Inbox] [avatar]`(편집 셸과 같은 형) · 같은 컴포넌트 · Action을 `app/inbox/actions.ts`로 이동(공개 호출 Action 선례 `app/search/`·`app/ui-locale/`). B round 3.
8. 지휘자 판단 — #191: spec 완료 조건 7 우선(marked로 닫으면 캐시 목록의 unread도 지운다). #190: 첫 구현은 시안이 정본 → Inbox 행 시각은 짧은 상대 시각 형(`relativeTime` 옵션, Home은 긴 형 유지). #189: 목업 빈 입력 64로.
9. (2026-10-05 사용자) **가이드 IA 개편** — `account.md`·`language.md`를 한 장으로: `Account and preferences`(account/README.md) > `Account`(account/profile.md) · `Preferences`(account/preferences.md). 장 제목 en `Account and preferences`(사용자 확정) · ko `계정 및 환경설정`(사용자 확정) · es `Cuenta y preferencias` — LNB 라벨 두 낱말 규칙(하위 페이지도 LNB 라벨: 계정·환경설정 / Cuenta·Preferencias). 옛 URL·절 id는 넘김 처리(`SECTION_LEGACY_ANCHORS` 선례). Q3 인계 뒤 가이드 배치.
10. (2026-10-05 사용자) **가이드 FAQ** — `Malmoi`(README.md) 아래 `faq.md`(en FAQ · ko 자주 묻는 질문 · es Preguntas frecuentes). 형식 참고 https://bug-shot.com/en/docs/faq, 내용은 정본만.

## 배치

| 배치 | 항목 | 워커 | 소유 파일(요지) | 선행 | 상태 |
|---|---|---|---|---|---|
| A | T1 · T2 · T3 · T4 · T5 · T6 · T10 · T11 | Codex `gpt-6-astra` medium(Astra 상한 — 2026-10-05 사용자) — 명세·테스트 목록이 닫혀 기계적 | `lib/home/**` · `lib/inbox/**` · `lib/routes.ts` · `components/home/attention-card.tsx` · `components/projects/project-list.tsx`(import만) · Home `page.tsx` · `lib/keys/query.ts` + 테스트 · `prisma/**` · `lib/privacy/**` · `app/(edit)/inbox/actions.ts` · `app/__tests__/entry-points.test.ts` · PRODUCT · ARCHITECTURE · CLAUDE.md | — | 대기 |
| B | T8a → (WAITING FOR A) → T7 · T8b · T12 · T13 · T14 | Claude Opus 5.5 high — 시안 대조·포커스/로빙 함정·프리미티브 이관 | `components/ui/{list-row,list-group,dropdown-menu,command}.tsx` + 테스트 · `components/shell/{attention-inbox,header}.tsx` · `components/__tests__/shell-header.test.tsx` · `messages/{en,ko,es}.tsx` · `/privacy` 본문(사전 방침 절) · DESIGN · DIRECTORY · `guide/**` · `public/guide/**` | T8b는 A가 dev에 들어간 뒤 | 대기 |
| R-A / R-B | 독립 리뷰 | Claude Opus 5.5 high, 리포트 전용 | — | 각 배치 인계 | — |
| Q | T9 `/design-sync` + `/runtime-test`(인계 (b) 목록) + 레이아웃 QA | Claude Opus 5.5 high, main 체크아웃 | — | A·B 통합 | — |

겹침: A↔B 파일 겹침 없음(B의 T8b가 A의 `actions.ts`·`plan.ts` 형을 import할 뿐) → T8a·T7은 병렬, T8b는 A 통합 뒤 `git rebase dev`.
`messages/*`는 B 단독 소유 — A는 사전을 건드리지 않는다(T1 문장 함수 이관은 `m`을 인자로 받는다).

## 마이그레이션

A가 `prisma migrate diff`(더미 `DIRECT_URL`)로 SQL만 만든다 → 지휘자가 dev DB `migrate deploy` · `db:status` · anon 권한 0 확인. prod `db:deploy`는 `/merge` 1단계.

## 진행


- 2026-10-05 A 재시작: Astra high → medium(사용자, dispatch `ctx_8ab8edafcf13`). B dispatch `ctx_a41dfdd47b86`.
- 2026-10-05 T13 A → B 이관: 방침 본문이 `messages/*`(B 소유)에 있다. A는 인계에 "방침에 들어갈 사실"만 남긴다.
- 2026-10-05 A 완료(`a0e5b899..d3bfcf3c`, 커밋 10, gate ok — Node 26). R-A(Opus high): 🔴0 🟡4 🟢7. fix1(🟡1–3 · 🟢1·2·5) → A dispatch `ctx_f6793875abc1`. 🟡4는 B T8b DOM 테스트로 전달.
  보류: 🟢3(배지 경로가 review/actors 조회도 돈다 — 측정 뒤 판단) · 🟢4(관계 필터 groupBy 빈도 증가 측정 — Q) · 🟢7(방침 공백 — A·B를 같은 push로 낸다 → **A만 먼저 push하지 않는다**).
- 2026-10-05 A fix1(`effb5882..d9d2bb56`) 지휘자 확인 → A 전체 로컬 dev 통합(`..be5c8ec3`, push 안 함 — 🟢7). dev DB `20261005090000_add_user_attention_seen_at` 적용 · db:status clean · anon/authenticated USAGE·CREATE false · GRANT 0. `pnpm gate` ok(Node 26). B에 "A is in dev".
- 2026-10-05 B 완료(`b054a86e..ebcadac3`, 커밋 7, gate ok). 결정 1(오류 줄 CommandStatus polite vs 시안 role=alert)은 design.md 닫힌 결정 11대로 polite 유지. R-B(Opus high) dispatch `ctx_b2cf4bc77a29`.
  남은 일: CLAUDE.md 프리미티브 51→52(지휘자 문서 신선도) · `/guide-shots` 셸 컷 전체 재촬영 범위(사용자 판단) · T9 design-sync · 런타임 (b).
- 2026-10-05 R-B(Opus high): 🔴0 🟡2 🟢6, 인계 1–8 전부 accept. B fix1(🟡1 골격 행간 · 🟡2 로딩/빈 상태 live region · 🟢1 배지 가드) + **랜딩 목업 stale 전부**(Inbox 복제 · 검색 캡슐 높이 · 프레임 전수) → B dispatch `ctx_139885f4fcec`. 🟢4 CLAUDE.md 51→52는 통합 때 지휘자. 🟢6(보조줄 `web · ko` vs `{소스} · {언어}`)은 design-sync에서 확인.
- 2026-10-05 B fix1(`71ffa118` 인박스 🟡1·🟡2·🟢1 · `d6cb86b8` 목업 셸 · `10380a5c` DESIGN) 확인 → B 전체 dev 통합 + CLAUDE.md 52. `pnpm gate` ok. A·B 함께 push(🟢7 해소). 목업 씬 내용 미대조 → B fix2 dispatch `ctx_77d29a4c3214`.
- 2026-10-05 B fix2(`2ad100b7` 목업 씬 전수 · `dd63b826` DESIGN · `c8815c93` DIRECTORY) 통합, gate ok. 지휘자 판단 — 별도 리뷰 생략(목업 한정 변경이고 값마다 실물 대비 테스트로 고정, 시각은 Q가 본다). `da4eb19d` CI success.
- 2026-10-05 push `97b60ed0`. Q1(Opus high, main 체크아웃) dispatch `ctx_da688d8f2d49` — design-sync 감사(수정 없음) + runtime (b) + 레이아웃 + Action 지연 1회. **Q1 동안 지휘자는 cherry-pick·build 금지.** Q2 `/guide-shots`는 UI 결함 수정이 끝난 뒤.
- 2026-10-05 범위 변경(공개 셸 Inbox) → B round 3 dispatch `ctx_42a5d3a096af`. Q1은 그대로 진행, fix3은 Q1 인계 뒤 통합 + 재확인 QA.
- 2026-10-05 B fix3(`bc4e1dd4..77fcc896`) R-B3: 🔴0 🟡1(공개 페이지 테스트가 실제 배지 Action→getPrisma) 🟢5. route 표 변화 0. B fix4 dispatch `ctx_83bd51a750ab`(🟡 + 문서 🟢 + 7949fbd1 squash).
- 2026-10-05 Q1 완료: 이슈 #189 [landing] · #190 [design-sync] · #191 [inbox](모두 B 소유) · 보조줄 keep · 미검증: 실제 스크린리더 · prod 배지 호출 수(dev StrictMode 2회) · 지연 badge 450–770ms / open 485–546ms(dev). dev DB 원복. → B fix5(fix4 뒤 이어서).
- 2026-10-05 B fix3+4 dev 통합(`f9dfbecb..776fd0f7` 재적용). gate **FAILED at test:projects:postgres** — `search-performance.integration.ts` 중앙값 385ms > 300(검색 코드 변경 0, load 5–8, B gate 동시 실행). push 보류 — fix5 통합 뒤 낮은 부하에서 재실행. B fix5 dispatch `ctx_28a45db577c8`.
- 2026-10-05 B fix5(`1b52f245..7ed495da`: 첫 그룹 선 · Refs #191 #190 #189 · DESIGN/design) 통합. fix5 dispatch `ctx_28a45db577c8`는 바쁜 터미널에 붙다 failed — 인계·커밋으로 수락. gate 재실행 ok(load 1.9) → 앞선 search-performance red는 부하 흔들림으로 판단.
- 2026-10-05 push `ce8e8e61`. Q2(Opus high, main 체크아웃) dispatch `ctx_0d2c80d902da` — design-sync 재측정(그룹 경계선 포함) · #189–#191 재확인/닫기 · 공개 헤더 Inbox. Q1 터미널 닫음. 다음: Q3 `/guide-shots` 전부 재촬영.
- 2026-10-05 사용자 보고(prod): `/projects` 배너 `Review ›` 쉐브론 세로 정렬 어긋남(`project-list.tsx:402` inline-flex에 items-center 없음) → A fix2 dispatch `ctx_f9ffb7430c0d`(Codex medium).
- 2026-10-05 A fix2(`a6f470e6`: 배너 쉐브론 items-center · Select 설명형 체크 첫 줄 · 후보 68곳 판정) — Q2 인계 뒤 통합. 재측정: Projects 배너 · Members 초대 역할 메뉴.
- 2026-10-05 Q2 완료: design-sync 차이 0(그룹 경계선·골격·짧은 시각 포함, 라이트·다크) · #189 #190 #191 닫힘 · 공개 헤더 Inbox 통과(로그아웃 POST 0). 미검증: rAF 애니메이션(창 스로틀) · prod 배지 POST 수 · 실제 스크린리더. A fix2 통합, gate ok.
- 2026-10-05 push `f41f79a8`. Q3 dispatch `ctx_6bd71136b78c` — 가이드 컷 전부 재촬영 + 새 `inbox-open` + 쉐브론·Select 재측정. Q2 터미널 닫음.
- 2026-10-05 Q3 완료: 재촬영 29(셸 컷 27 + README hero·logs) + 새 `inbox-open`(en·ko·es #inbox 참조) · 재측정 통과(쉐브론 Δ0.16px · Select Δ0) · README alt 셋 정정(지휘자 문서 신선도). 남음: `create-ready`(프로젝트 생성 필요 — 벽 절차). gate ok. 다음: 가이드 배치 G(IA 개편 + Malmoi 아래 FAQ, 사용자 2026-10-05).
- 2026-10-05 push `aa5bc413`. G(Opus medium — 사실 대조·옛 URL 넘김 판단) dispatch `ctx_df455c87f95f`: IA 개편 + FAQ.
- 2026-10-05 G 완료(`5ed077c5`: 계정 장 3페이지 · FAQ 15문항 · `/docs/account#id` SECTION_LEGACY_ANCHORS · `/docs/language` LEGACY_PAGES permanentRedirect). R-G(Opus medium) dispatch `ctx_9046feb59eed`. 남음: 리다이렉트 런타임 확인(preview) · 루트 README의 `/docs/language` 링크(지휘자).
- 2026-10-05 R-G: 🔴0 🟡2(README 링크 — 지휘자 수정 · 308 런타임 — preview) 🟢3. G 통합 + README 링크 `/docs/account/preferences`. gate ok.

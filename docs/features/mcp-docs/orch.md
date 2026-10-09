# mcp-docs — orch

원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md) (feature-review 반영 `e549aad5`). 이 문서는 지휘 계획과 진행 상태만 든다.

- 착수: 2026-10-10 · 시작 dev `e549aad5`
- 끝: dev push까지. `/merge`는 부르지 않는다. 마이그레이션 없음 → prod `db:deploy` 불필요.

## 결정 기록

- 설계 결정 7건(Overview `page: ""` 허용 · 가이드 전용 `not-found` 문장 · 사용자 둘 · 웹 차단 근거는 추정 표시 · 낱말 guide+Docs · 토큰 0개 query 거부 · 목차 도입부 제외 · 참조 링크 0건 가드)은 `/feature-review`에서 받았다 — design.md가 정본.
- 지휘자 판단 — 배치를 A(T1–T6 구현+정본 문서)·B(T7 가이드) 둘로 나눈다. 파일 겹침 0이고 B는 도구 이름(`read_docs`)만 알면 되어 병렬로 띄운다.
- 지휘자 판단 — T6(정본 문서)는 A가 같이 든다. 구현을 아는 세션이 쓰는 것이 문서 드리프트가 적다. 문서별 커밋.
- 지휘자 판단 — 워커는 Claude Code 패밀리만(교차 허가 없음). A = Opus 5.5 medium(순수 함수 동치·트레이싱 판단이 있으나 범위가 작다), B = Sonnet 5.5 medium(표 행 하나 세 언어). QA = Sonnet 5.5 medium.
- 지휘자 판단 — T5 빌드 산출 판정(`route.js.nft.json`)은 A가 자기 워크트리의 `pnpm gate`(build 포함) 뒤에 확인한다. preview 런타임 판정만 QA(b)다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort | 상태 |
|---|---|---|---|---|---|
| A | T1–T6 | `lib/seo/llms.ts`(+테스트) · `lib/mcp/docs.ts` · `lib/mcp/tools/docs.ts` · `lib/mcp/tools/index.ts` · `lib/mcp/catalog.ts` · `lib/mcp/**/__tests__/*` · `messages/en.tsx` · `next.config.ts` · `lib/guide/__tests__/tracing.test.ts` · `docs/{ARCHITECTURE,PRODUCT,DIRECTORY}.md` | — | Opus 5.5 · medium | 완료 r1 · 통합 |
| B | T7 | `guide/{en,ko,es}/ai-agents/permissions.md` (필요 시 `prompts.md`) | — (도구 이름만 의존) | Sonnet 5.5 · medium | 완료 r0 · 통합 |
| Q | 런타임 (b) | 코드 수정 없음 · main 체크아웃 | A·B dev push | Sonnet 5.5 · medium | 대기 |

- 겹침: A·B 파일 0. `messages/*`는 A만(en만 — ko·es 무변경). B가 게이트에서 `read_docs` 미존재로 red면 `WAITING FOR A` 후 rebase.
- 출시 차단: 없음(dev까지).

## 검증 게이트

- 워커: `pnpm gate --base dev`(파이프 금지). A는 `lib/mcp/` 트리거라 PG 스위트가 붙는다.
- 통합: main 체크아웃 cherry-pick → `pnpm gate` → `git push` → 그 커밋의 dev CI 결론.
- 런타임(Q): preview `https://dev.mal-moi.com/api/mcp` — `x-vercel-protection-bypass`(로컬 env `VERCEL_AUTOMATION_BYPASS_SECRET`) + dev 개인 토큰으로 `read_docs` 세 갈래 · `not-found` · 302/SSO HTML은 실패.

## 진행

- Run `run_38f144043e4a`. A = task_3fb0b9b50619 / dispatch ctx_2bd44cb8d57b (worktree `mcp-docs-a`, Opus 5.5 medium). B = task_6d8dade8ed34 / dispatch ctx_c7fc1eeb5db5 (worktree `mcp-docs-b`, Sonnet 5.5 medium). 둘 다 working 확인.
- B 완료(1 라운드): `1f646ebd docs(guide): add read_docs to the MCP tools table` — 세 언어 `#tools` 표 행 11·11·11, `gate: ok`(PG 트리거 없음), prompts.md 무변경. 지휘자 판단 — 독립 리뷰 워커 생략: diff가 표 행 세 줄이라 지휘자가 직접 읽어 확인(행 위치·코드 꼴 동형). 워커 해제. 통합은 A와 함께.
- A 완료 r0: `5f7cd3dc` test → `1381362e`·`1b08e71a` feat → `a45e7b92`·`4fc1b210`·`942d791d` docs. `gate: ok`(PG 포함). `/llms-full.txt` sha 전후 동일 `39bb7619…`. nft: `guide/en` 36 + SUMMARY(관측: ko·es·AUTHORING·SHOOTING도 이미 실림). 편차 4건(0건 summary 형 — terminology C23, 예시 page `translate/publish`, 색인은 목차·검색 갈래에서만, 조각이 H2 줄 포함) → 독립 리뷰(Opus) 판정 대기. 워커 retain.
- A 독립 리뷰(Opus): 🔴 0 · 🟡 1(새로 쓴 트레이싱 문장 넷이 nft 관측과 모순 — "트레이서가 못 따라간다"·"en만") · ⚪(동치 테스트를 치환본으로도). 편차 (a)–(c) 수용, (d) 수정 필요. 기존 `/docs` 트레이싱 문장(`next.config.ts:24`·`tracing.test.ts:11`·§8.1 force-static 줄)도 관측과 어긋나나 범위 밖 — 후속 후보. → fix1 dispatch ctx_a8ff8592137d (같은 터미널 재사용) working 확인.
- A fix1 완료: `6a571a7c` docs · `45fa6b89` fix · `08715055` test — 지휘자가 문장 diff 직접 확인(🔴 0 유지). 통합: B·A cherry-pick → `c574ca8c`..`8f7d09d6`, main 체크아웃 `pnpm gate` → `gate: ok · db:generate → typecheck → test → test:projects:postgres → build → sync:agents:check`. `/push` 4단계 판정 — 정본 문서는 A가 갱신, PRODUCT §4.2의 "읽기 14 · 쓰기 14"는 개방 당시 수치를 기록한 문장이라 유지(지휘자 판단), 개인정보 방침 영향 없음(새 데이터·전송처·쿠키 없음).

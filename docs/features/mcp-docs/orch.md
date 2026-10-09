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
| A | T1–T6 | `lib/seo/llms.ts`(+테스트) · `lib/mcp/docs.ts` · `lib/mcp/tools/docs.ts` · `lib/mcp/tools/index.ts` · `lib/mcp/catalog.ts` · `lib/mcp/**/__tests__/*` · `messages/en.tsx` · `next.config.ts` · `lib/guide/__tests__/tracing.test.ts` · `docs/{ARCHITECTURE,PRODUCT,DIRECTORY}.md` | — | Opus 5.5 · medium | 대기 |
| B | T7 | `guide/{en,ko,es}/ai-agents/permissions.md` (필요 시 `prompts.md`) | — (도구 이름만 의존) | Sonnet 5.5 · medium | 대기 |
| Q | 런타임 (b) | 코드 수정 없음 · main 체크아웃 | A·B dev push | Sonnet 5.5 · medium | 대기 |

- 겹침: A·B 파일 0. `messages/*`는 A만(en만 — ko·es 무변경). B가 게이트에서 `read_docs` 미존재로 red면 `WAITING FOR A` 후 rebase.
- 출시 차단: 없음(dev까지).

## 검증 게이트

- 워커: `pnpm gate --base dev`(파이프 금지). A는 `lib/mcp/` 트리거라 PG 스위트가 붙는다.
- 통합: main 체크아웃 cherry-pick → `pnpm gate` → `git push` → 그 커밋의 dev CI 결론.
- 런타임(Q): preview `https://dev.mal-moi.com/api/mcp` — `x-vercel-protection-bypass`(로컬 env `VERCEL_AUTOMATION_BYPASS_SECRET`) + dev 개인 토큰으로 `read_docs` 세 갈래 · `not-found` · 302/SSO HTML은 실패.

## 진행

(통합 커밋·검증 결과·라운드를 여기에 쌓는다)

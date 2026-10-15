# agent-readiness — orch

원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md). 이 문서는 지휘 상태만 든다.

- 착수: 2026-10-15 · 시작 dev `7be5ecde`(로컬, origin/dev `d871487f` 위에 이 기능의 문서 커밋 1개)
- 끝: dev push까지. `/merge`는 부르지 않는다. 스키마 변경 없음 → prod `db:deploy` 없음.

## 결정 기록

1. **구현은 워커 하나(A)가 tasks §0–§3과 §5 문서를 순서대로 한다** — 지휘자 판단. §3이 §1·§2의 함수를 부르고 §0 실측이 §3의 rewrite·route를 먼저 넣고 잰다(실패하면 되돌린다). 남는 병렬 후보는 §1∥§2뿐인데 두 절 모두 작아 워크트리를 하나 더 여는 비용이 더 크다.
2. **§0 실측은 A 워크트리에서 자기 포트로 built server를 띄워 잰다** — 지휘자 판단. 미존재 경로·`/llms.txt`·`/docs`는 DB 없이 응답한다(`.env.local` 없음 = hosted 모드). §0가 실패하면 A는 Markdown 갈래(fallback rewrite·`not-found.md` route·관련 문서)를 멈추고 `ask`로 보고한다 — 계속할지는 사용자가 정한다.
3. **§4 built server 실측은 별도 QA 워커(Q1)가 main 체크아웃에서 한다** — 지휘자 판단. `/`·`/sitemap.xml` 무변경 비교와 비로그인 307 경계는 `.env.local`(dev DB)이 있어야 실물과 같다. curl 전용이라 ego 세션을 쓰지 않는다.
4. **§6 배포 확인은 preview(`dev.mal-moi.com`)까지만 이 런에서 한다** — prod 확인은 `/merge` 뒤라 범위 밖이다. Q1이 push 뒤 이어서 한다.
5. **기능 디렉터리 삭제(tasks §5 마지막 항목)는 이 런에서 하지 않는다** — 지휘자 판단. §6의 prod 확인이 `/merge` 뒤에 남아 tasks가 아직 쓰인다(선례: session-absolute-timeout 디렉터리도 push 뒤 남아 있다). 리포트에 남긴다.
6. DS 행 없음 — design-brief·신규 화면이 없다(무화면 응답 셋). 가이드 영향 없음(화면이 바뀌지 않는다).

## 배치

| 배치 | 항목 | 소유 파일 | 선행 | 모델·effort | 위치 | 상태 |
|---|---|---|---|---|---|---|
| A | tasks §0 실측 · §1 커밋 A · §2 커밋 B · §3 커밋 C · §5 문서(ARCHITECTURE·PRODUCT·ACTIONS·DIRECTORY, 문서별 커밋) | `messages/en.tsx` · `lib/seo/agent-errors.ts`(+테스트) · `lib/push/payload.ts` · `lib/openapi/`(+스냅샷) · `next.config.ts` · `app/not-found.md/` · `app/api/[[...path]]/` · `app/openapi.json/` · `app/__tests__/*`(EXEMPT 등 요구가 생기는 것) · 관련 테스트 · `docs/{ARCHITECTURE,PRODUCT,ACTIONS,DIRECTORY}.md` | — | Opus 5.5 medium — Next 라우팅 순서·Zod→JSON Schema·entry-point 게이트 판단 | 워크트리 | 대기 |
| R | A 독립 리뷰 | 없음(리포트 전용) | A `worker_done` | Opus 5.5 medium | A 워크트리 읽기 | 대기 |
| Q1 | tasks §4 built server 실측(hosted·self-hosted) → push 뒤 §6 preview 반복·캐시 혼선 점검 | 없음(리포트·이슈 전용) | A dev 통합(§6은 push 뒤) | Sonnet 5.5 high — 명령이 tasks에 정해져 있고 판정 기준이 명시적이다 | main 체크아웃 | 대기 |

겹침: A 하나가 모든 코드·문서 파일을 소유한다. R·Q1은 코드를 고치지 않는다. Q1이 main 체크아웃에서 built server를 돌리는 동안 통합(cherry-pick·build)을 하지 않는다.

tasks ↔ 배치 대조: §0→A · §1→A · §2→A · §3→A · §4→Q1 · §5 문서 넷→A · §5 POSTMORTEM 무변경→A(diff 0 확인) · §5 디렉터리 삭제→범위 밖(결정 5) · §6 preview→Q1 · §6 prod→범위 밖(결정 4). 주인 없는 항목 0.

## 진행

- (착수 전)

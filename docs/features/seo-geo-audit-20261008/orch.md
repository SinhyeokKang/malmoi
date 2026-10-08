# SEO·GEO 감사 후속 지휘 계획

원본: [수정된 감사 리포트](./report.md). 이 문서는 실행·결정·검증 증거만 기록한다.

## 시작점·권한

- 시작 dev: `b793ca8178aef0c1860e13df6634170f37da6033` (Claude의 감사 보정 커밋 포함).
- 시작 origin/dev: `1f96456f0afef65e40b1551c0cb912bb76a0c4f2`.
- 사용자: 수정된 리포트 그대로 `source-command-orchestrate` 실행 요청. 코드 구현·리뷰·dev push·CI·QA까지. main 머지·prod DB 변경 없음.
- 지휘자: Codex. 구현은 Orca Task/Dispatch 워커, 모델 패밀리는 Codex Sol/Astra만. Astra effort는 medium 이하.
- 작업 트리: 인테이크 시 clean. 동일 저장소의 다른 구현 세션은 관찰되지 않았다.
- 리포트 번호 17은 결번, 7은 10·22에 흡수한다. 8은 측정 후 결정이지 무조건 최적화가 아니다.

## 결정 기록

| ID | 결정 | 근거·상태 |
| --- | --- | --- |
| D1 | 공개 셸 모바일 대응 | 사용자 답변 대기. 6번은 PRODUCT의 1280px 승인 정책을 바꾸므로 종속 구현 미착수 |
| D2 | 경쟁사 이름은 새 FAQ에 넣지 않음 | 지휘자 판단 — PRODUCT §2의 대체품 프레이밍 회피와 리포트 10번에 따름 |
| D3 | 무료·MIT는 현재 사실만, hero.body 고정 | 지휘자 판단 — AUTHORING이 과금 없음 FAQ 허용; 미래 약속 금지 |
| D4 | 저자 실명·author/founder·dateModified 신규 노출 없음 | 지휘자 판단 — 기존 화면 노출 정책 유지, 결정적 날짜 출처 없음. README/LICENSE 기존 표기는 유지 |
| D5 | 이름 유래는 ko 가이드에 기존 CLAUDE 사실 한 줄 | 지휘자 판단 — 이미 승인된 이름 유래만 사용, 화면 브랜드 Malmoi 유지 |
| D6 | 검색·학습 봇 현행 허용 유지 및 정책 기록 | 지휘자 판단 — ARCHITECTURE §8.1에 이미 GPTBot·Google-Extended·ClaudeBot 허용 의도가 명시됨. 리포트의 미기록 주장은 보정; PRODUCT에 연결만 보완 |
| D7 | llms-full 링크는 AST 위치로 안전한 변환이 가능하면 수정 | 지휘자 판단 — 리포트 4 재검토 수행. 코드 스팬·펜스·외부 링크 보존, 기존 의도/테스트/정본 함께 갱신; 안전한 구현 불가 시 증거와 보류 |
| D8 | www는 실제 설정 조회 후 구체적 운영 변경안 작성 | 프로덕션 도메인 변경은 dev 배포 경계 밖. 실행 전 사용자에게 정확한 변경을 제시해야 함 |
| D9 | 정적 자산 TTL 1시간, SWR 1일을 시작안으로 검증 | 지휘자 판단 — 해시 없는 파일 immutable 금지, 신규 원본 반영 지연과 운영 절차 기록 |
| D10 | OG PNG는 픽셀을 보존하는 무손실 최적화만 | 지휘자 판단 — 300KB가 보편 표준 상한인 것은 아님; 시각 재생성 없이 기술적 최적화와 전후 치수/픽셀 확인 |
| D11 | 404 middleware 우회·Next 버전 변경은 제외 | 지휘자 판단 — B가 현 빌드의 404/noindex와 빈 초기 본문을 재현했으나 조기 slug 검사로 개선되지 않았다. CSP·라우팅을 넓히는 수동 HTML 응답보다 18번 미해결과 재현 증거를 남긴다. 독립 리뷰에서 제한 판정 검수 |

## 배치·파일 소유권

| 배치 | 항목 | 소유 파일 | 선행 | 모델 / effort 및 이유 | dev 완료 차단 | 상태 |
| --- | --- | --- | --- | --- | --- | --- |
| A 콘텐츠 | 1·5·7·10·11·12·13·14·22·23 이름 | `guide/{en,ko,es}/` 해당 원고, `messages/{en,ko,es}.tsx`, `app/page.tsx`, 관련 콘텐츠 테스트 | 결정 종료 | gpt-5.6-sol / high — 기존 패턴의 원고·사전·링크 수정 | 필수 | 계획 |
| B 기술 메타 | 2·3·18·20·21 메타 | `lib/seo/{json-ld,site}.ts`, 해당 테스트, `app/docs/[[...slug]]/page.tsx`, docs layout/not-found, 필요시 404 전용 파일·테스트, `public/og.png` | 결정 종료 | gpt-6-astra / medium — Next SSR 404 경계와 metadata 계약 | 필수 | 계획 |
| C LLM·캐시·이미지 | 4·9·15·19·23 봇 | `lib/seo/{llms,crawl}.ts`, llms routes/테스트, `components/docs/guide-markdown.tsx`·관련 테스트, `next.config.ts`·헤더 테스트 | A·B 통합 후 (메타/원고 변경을 소비) | gpt-6-astra / medium — AST 원문 보존·로딩·헤더 경계 | 필수 | 계획 |
| D 모바일 | 6 | 공개 셸/문서 내비/프레임/랜딩 stage 및 관련 테스트; 필요 사전 키 | D1·feature/review + A·B·C 통합 후 | gpt-6-astra / medium — 뷰포트·포커스·스크롤 계약 | 승인 시 필수 | 결정 대기 |
| E 운영 | 16 | 지휘자 운영 브리프·조회 결과만 | 설정 조회 후 승인 | 지휘자 — 프로덕션 변경은 별도 결정 | 미승인 시 미완 명시 | 조회 중 |
| R 독립 리뷰 | 각 배치 인계·diff | 읽기 전용, `.scratch/review-*.md` | 각 구현 완료 | gpt-6-astra / medium — 독립 위험 검토 | 필수 | 계획 |
| Q 런타임·측정 | 8 및 각 배치 b 항목 | main 체크아웃, 코드 수정 없음; QA 보고 | 모든 코드 통합·gate | gpt-6-astra / medium — ego-browser 측정/검증 | 가용 도구 범위 필수 | 계획 |

정본 문서(`PRODUCT`·`ARCHITECTURE`·`DESIGN`·`DIRECTORY`·`OPERATIONS`·`POSTMORTEM`)는 지휘자가 통합 단계에서 문서별로 갱신한다. 워커는 필요한 정확한 수정안을 인계에 남긴다. 보고 원본은 보존한다.

## 파일 겹침·실행 순서

| 조합 | 겹침/결정 | 실행 |
| --- | --- | --- |
| A / B | 직접 소유 파일 없음. B가 사전 키를 요구하면 기존 키를 사용하거나 지휘자에게 조율 | 병렬 별도 워크트리 |
| A / C | 원고를 C의 llms가 소비; tests/스냅샷 영향 가능 | A 먼저 통합 |
| B / C | 실제 파일 확인: B는 json-ld/site·metadata/landing 테스트, C는 llms·guide-markdown·security-headers 테스트. B의 404 설정 우회 제외로 next.config 겹침도 없음 | A 통합 후 병렬 허용, 서로 소유 테스트 수정 금지 |
| D / A·B·C | 사전·랜딩·docs 프레임/renderer 주변 겹침 | 마지막 직렬 |
| Q / 통합·build | dev 서버 출력 혼합 위험 | QA 중 통합·build 금지 |

첫 워커 전 이 파일을 dev 로컬 커밋한다. 각 브리프는 report.md와 orch.md를 읽도록 지정한다. 워커별 구현 후 독립 리뷰→필요 수정→cherry-pick. 다음 배치 전에 필요한 정본 변경을 얹는다.

## 공통 검증·인계

- `/ship bypass` 적용. 임시 브랜치는 dev 등가이며 11단계 `/push` 전에 멈춤. 워커 `git push`·`/merge`·`/sync`·`db:deploy` 금지.
- 스키마 변경 금지, `.env.local` 복사 금지. 테스트 먼저; 워커 최종 게이트 `pnpm gate --base dev` (출력 파이프 금지).
- `.scratch/handoff-<batch>.md`: 커밋 SHA, RED/GREEN 및 정확한 gate 결과, 변경 파일, 계획과 다른 점, 정본 수정안, 런타임 (b)만 및 그 이유.
- 독립 리뷰는 계획·실제 diff·인계 주장·관련 POSTMORTEM·테스트와 b 분류를 검증. 🔴는 모두 해소.
- 지휘자 통합 `pnpm gate`→`git push origin dev`→해당 HEAD CI 확인. red면 소유 워커 수정 전 다음 push 없음.
- QA는 main 체크아웃 한 서버, ego-browser. 해당 공개 경로 en/ko/es·light/dark, 1280/1440/1890 및 모바일 승인 시 360/390/768. 헤더·메타·실제 SSR·깨진 링크·첫 이미지·캐시·lab 비교 확인. 결함은 BugShot 제출 후 소유 워커에 반환.
- 실제 Search Console/CrUX/실기기/실제 봇 IP는 접근 없으면 미검증 표시. 숫자를 추정해 완료하지 않음.
- DB 변경 없음이 유지되면 `/merge`용 prod 마이그레이션도 없음.
- 워커 정리 전 추적 미커밋 0, `git cherry dev <branch>`의 `+` 0, 인계 결과 영속 기록. settled Dispatch는 즉시 재사용 또는 명시 해제.

## 실행 기록

- 2026-10-08: 수정 보고서 22개 항목 읽음. D1 질문 제출, Orca 1.4.220 가용·로컬 worker launch preferences 지원 확인.
- Run: `run_cafe9d9a7b40`, coordinator `term_f615f71a-30f9-4f6c-9ceb-55bcef23cc39`.
- 현재 모델 캐시에서 gpt-5.6-sol high / gpt-6-astra medium 지원 확인. 모든 launch 응답의 effective 모델을 다시 검사한다.
- D1은 D 배치만 막는다. 상위 협업 지침에 따라 답이 필요 없는 A/B의 준비·구현은 독립 진행한다. D 착수 전 답변 및 설계 리뷰는 생략하지 않는다.
- E 읽기 조회: malmoi 프로젝트에 apex·dev만 등록, www 없음. DNS는 Gabia(ns.gabia.co.kr/net, ns1.gabia.co.kr); Vercel API로 외부 DNS를 쓸 수 없다. 코드/원격 설정 변경 없음.
- A 시작: `task_1fc0fdde8b30` / `ctx_1fce737ccae3`, `seo-a-content`, Sol high effective 확인·working. B의 Astra medium 시도 둘(`ctx_fbaa5cbd1e89`, `ctx_9dea33889fcf`)은 agent_readiness timeout, 과업 미실행을 Orca가 확인했다. 터미널 해제 후 같은 B Task를 Sol high로 재시도한다. 이는 승인된 Codex 패밀리 내부 조정이며 Astra effort를 올리지 않는다.
- ego-browser TaskSpace `2`, `p1`를 이후 QA도 재사용한다. 변경 전 `/docs` 데스크톱 1440px 단발 측정 LCP 748ms, 최종 후보 IMG project-home.webp; loading lazy/priority auto. 도구 결과만이며 CrUX가 아니다.
- B 재시도 `ctx_9aeb503be36c` Sol high effective·working 확인. 이 런의 남은 C·독립 리뷰·QA도 정상 기동 경로인 Sol high를 사용한다(위 표의 Astra 우선안 대체). 같은 패밀리이며 독립 리뷰 분리는 유지한다.
- A 구현 인계: `c61cba17`(RED 테스트), `4d9d2e67`(구현), clean. `pnpm gate --base dev` 통과 보고와 실제 두 커밋 확인. 독립 리뷰 `task_5341241503d2` / `ctx_cef979d7d9dd`를 Sol high로 시작했고 구현 터미널은 완료 인계 뒤 해제했다. 아직 dev 통합 전이다.
- 공유 파일 보정: B의 WebSite 추가가 A 소유 `app/__tests__/landing-page.test.tsx` 기대값에도 영향을 준다. B는 그 파일 수정·최종 게이트 전에 A 통합을 기다리고 `git rebase dev` 뒤 계속한다. 다른 B 소유 파일 작업은 계속 가능하다. status와 터미널 입력을 함께 보냈고 B의 mailbox ack를 확인했다.
- 모바일 추가 기준선: production `/docs/faq`, CDP 390×844에서 `innerWidth=1280`, `scrollWidth=1280`, main 폭 1264px. 1280 정책의 현 상태 관측이며 D1 승인 전에는 변경하지 않는다.
- B 질문 `msg_9b1af48bb691`에 D11로 답변. [Next.js #97000](https://github.com/vercel/next.js/issues/97000)은 유사 증상 보고이며 invalid reproduction으로 자동 종료됐고 재현 조건도 다르므로 확정된 원인으로 인용하지 않는다. 요청 UA·런타임 조건·초기 HTML/Flight 분리 결과를 인계에 요구했다.
- A 독립 리뷰: red 0 / yellow 1(nav 이름) / white 1(ko 조사). 수정 `e96a8c6d`·`e97786af`의 정확한 diff와 새 DOM 단언을 지휘자가 확인했고 gate 원문 끝 `gate: ok` 확인. dev 통합 `5271f798`·`44325501`·`d7ad3f37`·`b760a665`; PRODUCT·DESIGN은 각각 별도 커밋으로 갱신. 배포 QA는 아직 미완.
- A fix Task `task_e77f6ad88afd` / `ctx_291d923a3f46` 완료·터미널 해제. B에 A 통합 신호를 status+터미널로 보냈고 공유 테스트 수정에 착수했다.
- C 선행 보정: 잠재 겹침을 실제 파일로 재검사한 결과 직접 겹침 없음. A 원고는 통합됐으므로 B 검증과 C 구현을 병렬로 진행한다. 위 배치 표의 C `A·B 통합 후` 선행은 이 기록으로 대체한다. B·C 모두 완료 뒤 통합 게이트를 함께 돈다.
- B 최종 gate 12,276 tests / 2 skipped와 build·미러 통과, 독립 리뷰 `task_21f1336fba2a` / `ctx_3b964fca8f70` red/yellow/white 0. dev 통합 `5c881ad7`·`63636ba4`·`6725f2f8`·`4d4ce74a`. 18번은 D11의 미해결로 유지한다. 원문 로그·probe는 main `.scratch/seo-b-archive/`에 복사하고 clean·patch-equivalence 확인 뒤 B 워크트리를 정리했다.
- B 로그 보존용 중복 gate에서 metadata 동적 import 5초 timeout이 한 번 발생했다. 코드/timeout 변경 없이 단독 테스트 4회와 순차 최종 gate가 통과했다. C와 동시 전체 테스트 시 load average 82.24, 252.54초였고 단독 최종 gate 테스트는 91.61초였다. 앞으로 전체 gate/build는 직렬, 구현/읽기 리뷰는 병렬이다. C의 동시 pre-gate 테스트에서도 T7 scan timeout 1건이 있었고 직렬 최종 gate로 해소됐다.
- C Task `task_47fb013de03e` / `ctx_877b789f2f67`: `c1b2a765`·`a554fc19`, gate 12,272 tests / 2 skipped 및 build·미러 통과. 독립 리뷰 `task_2b49e17c2ff4` / `ctx_0d16ecdd5080`에서 escaped reference label 훼손 red 1, 빈 inline destination 빌드 실패 yellow 1. `brief-c-fix1.md`로 C 소유 워커에 반환했다. C는 아직 dev 미통합이며 두 발견이 해소될 때까지 통합하지 않는다.

## 진행 현황 (2026-10-08 10:40 KST)

| 배치 | 현재 상태 | 남은 일 |
| --- | --- | --- |
| A | 구현·독립 리뷰·fix1·worker gate 완료, local dev 통합 | 통합 gate·push·CI·브라우저 QA |
| B | 구현·독립 리뷰·worker gate 완료, local dev 통합 | 공통 검증 및 18번 미해결 추적 |
| C | 독립 리뷰 red 1 / yellow 1 수정 중 | fix1·재검수·통합·공통 검증 |
| D | 공개 모바일 정책 사용자 답변 대기 | 승인 시 feature/review부터 |
| E | www 설정 조회·구체적 변경안 작성 완료, 원격 변경 없음 | 별도 production 승인·Gabia 접근 |
| Q | brief-qa.md 준비, TaskSpace 2 유지 | 코드 통합과 gate 후 직렬 QA |

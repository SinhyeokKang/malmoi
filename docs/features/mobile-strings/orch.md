# mobile-strings — orch

원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md). 이 문서는 지휘 상태만 든다.

- 착수: 2026-10-19 · 시작 dev `3b0af99e`(= origin/dev)
- 끝: dev push까지. `/merge`는 부르지 않는다 — 이 기능의 `/merge`는 android-strings T5에서 세 어댑터 스펙과 한 번이다.
- 스키마 변경 있음(M2b `TranslationSurface.basePath`) → dev DB 적용은 지휘자, prod `db:deploy`는 그 `/merge` 1단계.

## 결정 기록

1. **패밀리 교차 허용** (2026-10-19 사용자 — "패밀리 교차 허용. 필요하다면 Codex 사용해"). 범위: 구현·리뷰 워커 모두 Claude(Sonnet·Opus)와 Codex(`gpt-6-astra`, effort 상한 medium) 사이에서 고를 수 있다. 독립 리뷰는 구현과 다른 패밀리로 맡긴다 — 같은 모델의 맹점을 줄인다.
2. **M0 SHA 고정 핀 파일은 `docs/adapter-survey/`에 커밋한다** — 지휘자 판단. 기준선 보고서는 `.scratch/`(커밋 없음)이지만 핀이 없으면 다른 머신·뒤 스펙의 재측정이 같은 SHA로 돌 수 없다. 그 디렉터리는 원래 `pnpm adapter-survey`가 읽는 살아 있는 입력이다. 핀의 형식(목록 줄 `owner/repo@sha` 또는 별도 파일)은 A가 고르고 리뷰가 판정한다.
3. **기준선 보고서는 main 체크아웃의 `.scratch/adapter-survey-baseline/`에 둔다** — 지휘자 판단. 워크트리의 `.scratch/`는 정리 때 함께 사라지고, B·C가 회귀 비교에 같은 파일을 읽어야 한다.
4. **M1 정답 판정은 워커(Opus)가 원문을 읽고 한다** — 지휘자 판단. tasks의 "사람이 원문을 보고 판정"은 탐지기 출력을 정답으로 삼지 말라는 뜻이고 23차 관행도 같다. 판정 JSON은 `/merge` 전 사용자 검수 대상으로 리포트에 남긴다.
5. **M2와 M3는 직렬, 단 M3의 순수 잎은 앞당긴다** — 지휘자 판단. 두 배치가 `lib/adapters/types.ts`·`lib/pull/plan.ts`·`scripts/ingest.ts`·`scripts/format.ts`·`lib/survey/`를 같이 고친다. C는 겹치지 않는 몫(M3a 테스트 + `lib/file-encoding.ts` + `lib/githash.ts`)만 먼저 하고, 배선(M3b)은 B가 dev에 들어간 뒤 새 Dispatch로 받는다.
6. **`lib/survey/`는 A(M0)가 먼저 소유한다** — B의 survey 다섯 줄·C의 `run.ts:63` NUL 스킵 교체는 A가 dev에 들어간 뒤로 미룬다(인계의 "미룬 항목").
7. DS 행 없음 — design-brief·화면 변경이 없다(spec 비목표). 가이드 영향 없음. 런타임 QA는 인계의 (b) 목록이 생길 때만 둔다 — survey 재측정이 이 기능의 실물 검증이다.

## 배치

| 배치 | 항목 | 소유 파일 | 선행 | 모델·effort | 위치 | 상태 |
|---|---|---|---|---|---|---|
| A | M0 survey SHA 고정 배선(커밋 `feat(survey): pin corpus repos to recorded commits`) + 학습·홀드아웃 기준선 보고서 2회 | `lib/survey/**` · `scripts/adapter-survey.ts` · `docs/adapter-survey/` 핀 파일 | — | Claude Sonnet 5.5 medium — 범위가 좁고 기계적이다 | 워크트리 | 대기 |
| B | M2a 테스트 → M2b 마이그레이션 SQL(DB 없이 `migrate diff`) → M2c 배선 | `prisma/schema.prisma` · `prisma/migrations/<new>` · design §2의 `lib/`·`scripts/`·`app/` 서버 자리 · `lib/adapters/types.ts`(`DetectedFormat`) · `lib/push/` · 관련 테스트 | — (survey 다섯 줄만 A 뒤) | Claude Opus 5.5 high — 30곳 가까운 자리 전수와 불변식 판단 | 워크트리 | 대기 |
| C1 | M3a 테스트 + 순수 잎(`decodeFileBytes`·`encodeFileContent`·`blobSha(bytes)`) | `lib/file-encoding.ts`(+테스트) · `lib/githash.ts`(+테스트) · M3 소스 테스트 | — | Codex `gpt-6-astra` medium — 바이트 경계 판단, 패밀리 분산 | 워크트리 | 대기 |
| C2 | M3b 배선(리더 넷 · survey NUL 스킵 · GitHub blobs · GitLab base64 · `blobSha` 호출자 · 인코딩 상속) | `lib/github.ts` · `lib/gitlab/plan.ts` · `scripts/format.ts` · `lib/survey/run.ts` · `lib/pull/plan.ts` · `scripts/ingest.ts` · `lib/adapters/types.ts`(`AdapterFile`) | B dev 통합 · A dev 통합 | C1과 같은 터미널 재사용 | C 워크트리 | 대기 |
| D | M1 모바일 코퍼스(`repos-mobile*.txt` · 판정 JSON · 세 건수) | `docs/adapter-survey/repos-mobile*.txt` · `verdicts-mobile*.json` · `repos.md`의 모바일 절 | A dev 통합(핀 형식) | Claude Opus 5.5 medium — 원문 판정 | 워크트리 | 대기 |
| RA | A 리뷰 | 없음 | A | Codex `gpt-6-astra` medium | A 워크트리 읽기 | 대기 |
| RB | B 리뷰 | 없음 | B | Codex `gpt-6-astra` medium | B 워크트리 읽기 | 대기 |
| RC | C1+C2 리뷰 | 없음 | C2 | Claude Opus 5.5 high | C 워크트리 읽기 | 대기 |

겹침: A↔B·C는 `lib/survey/`(결정 6), B↔C는 결정 5의 파일들, A↔D는 `docs/adapter-survey/`(D는 A 뒤). 1파: A ∥ B ∥ C1. A 통합 → D 시작 + B·C에 survey 몫 전달. B 통합·push → C2.

push 순서: A 통합 뒤 push(M0) → B 통합 뒤 push(M2, tasks "자체 `/push`") → C 통합 뒤 push(M3). D는 문서라 다음 push에 얹는다.

tasks ↔ 배치 대조: M0→A · M1→D · M2a·M2b·M2c→B(M2b dev DB 적용은 지휘자) · M3a→C1 · M3b→C2 · 문서 절(정본 승격·폴더 정리)→범위 밖(각 어댑터 스펙 T5). 주인 없는 항목 0.

## 진행

- Run `run_eb594cbd815a`. 1파 시작(2026-10-19): A `ctx_adc4bec078e5`(워크트리 `ms-A`, claude-sonnet-5-5 medium) · B `ctx_11411e92fe49`(`ms-B`, claude-opus-5-5 high) · C1 `ctx_7ee58adca952`(`ms-C`, codex gpt-6-astra medium) — 세 `launch.effective`가 요청과 같다. 브리프: main `.scratch/orch-mobile-strings/`.

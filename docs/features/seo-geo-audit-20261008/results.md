# SEO·GEO 감사 후속 실행 결과

기준: [Claude 보정 감사](./report.md), [결정·실행 기록](./orch.md). 원본 감사는 보존하고 실행 결과를 이 문서에 분리한다.

## 미완·미검증

- **6 / D 모바일:** 사용자 후속 방향에 따라 별도 responsive 작업 이후 재대응한다. 모바일 구현·축소 해소를 완료로 세지 않으며, 구체적 범위·정책은 responsive 설계에서 확정한다.
- **16 / E www:** Vercel 도메인·Gabia DNS 조회와 [구체적 변경안](./operations-www.md)까지만 완료. 프로덕션 도메인 승인·Gabia 접근이 필요하다.
- **18 / docs 404:** 404/noindex는 맞지만 초기 HTML의 가시 본문이 비고 제목이 `Malmoi Docs · Malmoi`인 현상은 미해결. 원하는 UI는 Flight에만 존재한다. 조기 slug 검사로 개선되지 않아 해당 시도는 되돌렸고, CSP·middleware 우회나 Next 버전 변경은 하지 않았다. 유사 Next 이슈는 원인이 확인된 근거가 아니다.
- 실제 Search Console·CrUX/INP·검색 순위·AI 인용률·실제 봇 IP·Safari/실기기·Rich Results Test는 미검증이다. 로컬 파싱·lab 관측을 이 검증의 대체물로 보지 않는다.
- ego-browser의 화면 캡처/CDP가 반복 timeout으로 실패했고 paint/LCP 항목도 생성되지 않았다. 비트맵 시각 검수·LCP 비교는 미완이다. Vercel CDN의 최종 헤더 병합·캐시 및 실제 소셜 미리보기도 미검증이다.
- 가이드 촬영 stale 후보 13컷/20매핑은 기존 상태이며 이번 배치에서 재촬영하지 않았다. 원고 내용 검증과 이미지의 최신성은 별개다.

## 항목별 반영

| 감사 번호 | 결과 | 범위·제한 |
| --- | --- | --- |
| 1·5·10·11·12·13·14·22 | 반영 | en/ko/es의 현재 무료·MIT 사실, 비범위, 사실형 도입문, 실제 지원 확장자, MCP·TMS 설명, 개인정보·하위 문서 링크. hero.body 유지, 미래 과금 약속 없음 |
| 2·3 | 반영 | 본문 언어와 TechArticle 언어 일치, FAQ breadcrumb 중복 제거. 영어 metadata 정책 유지 |
| 4·9 | 반영 | llms index의 도입 사실·Overview·Optional, llms-full의 실제 내부 문서 링크 목적지만 AST 위치로 절대 URL 치환. 코드·외부 링크·이미지·그 외 원문 바이트 보존 |
| 6 | 결정 대기 | 공개 모바일 정책 변경 |
| 7·17 | 별도 구현 없음 | 7은 10·22에 흡수, 17은 원본의 결번 |
| 8 | 측정 항목 | 씬 구조를 바꾸지 않음. 목업의 aria-hidden/inert와 lab 관측을 검토하며 실사용 INP 개선으로 주장하지 않음 |
| 15 | 로딩 우선순위 반영 | 첫 가이드 이미지 eager/high, 후속 lazy. 2560px 원본과 intrinsic dimensions는 유지; 반응형 이미지 변환·전송량 감소는 구현하지 않음 |
| 16 | 운영안만 완료 | 승인 전 프로덕션 설정 변경 없음 |
| 18 | 미해결 | 위 재현·제한 참조 |
| 19 | 반영 | fonts/guide만 max-age=3600, stale-while-revalidate=86400. 무해시 파일이라 immutable 없음. 원본 교체 반영은 약 25시간까지 지연 가능 |
| 20·21 | 반영 | WebSite name/url, og:locale, Twitter image alt, 긴 도입문 단축. OG PNG 311,412→288,253바이트, 1200×630 RGBA 픽셀 동일 |
| 23 | 결정·기록 완료 | 신규 저자 실명·추정 수정 날짜는 넣지 않음. 한국어 가이드에 이름 유래. 이미 승인된 검색·학습 봇 허용 정책을 PRODUCT에서 연결 |

## 구현·독립 리뷰·검증

| 배치 | 통합 커밋 | 리뷰·수정 |
| --- | --- | --- |
| A 콘텐츠 | `5271f798`, `44325501`, `d7ad3f37`, `b760a665` | 독립 리뷰 yellow 1(nav 접근성 이름)·white 1(한국어 조사), fix1 후 해소 |
| B 메타 | `5c881ad7`, `63636ba4`, `6725f2f8`, `4d4ce74a` | 독립 리뷰 red/yellow/white 0. 18번은 별도 미해결로 명시 |
| C LLM·자산 | `9c51cafc`, `ab3f94b7`, `0073e3d3` | 독립 리뷰 red 1(escaped reference label)·yellow 1(빈 링크 목적지). fix1 회귀 테스트 및 독립 재검수 red/yellow 0 |

- 구현·리뷰는 서로 다른 Orca Dispatch에서 수행했다. Astra medium의 과업 시작 전 readiness 실패 두 번 뒤, 승인된 Codex 패밀리의 Sol high로 실행했다. 지휘자는 배치 코드를 직접 수정하지 않았다.
- 통합 코드 `b414d54a5937540302c7a88ef802ca079a97e7d6`: `pnpm gate` 통과. db:generate → typecheck → test → build → sync:agents:check. **765파일 통과/1 skipped, 12,279테스트 통과/2 skipped**. `gate: ok` 확인.
- [해당 커밋 dev CI](https://github.com/SinhyeokKang/malmoi/actions/runs/37715062610) 성공. [Vercel preview](https://vercel.com/ox501501-1046s-projects/malmoi/H6KbZJ5Mbip6dbkGy1KdmnsadUhm) 성공 상태 확인. 배포 성공은 화면 QA나 프로덕션 반영을 뜻하지 않는다.
- 초기 병렬 전체 테스트 중 B metadata import·C T7 scan timeout이 발생했다. 코드·timeout을 바꾸지 않고 전체 gate를 직렬화한 뒤 각 최종 gate와 통합 gate가 통과했다. 실제 assertion 회귀를 숨기는 재시도는 하지 않았다.
- PRODUCT·ARCHITECTURE·DESIGN·POSTMORTEM을 갱신했다. schema/migration·환경변수·의존성 변경 없음. prod `db:deploy` 준비물 없음.

## 런타임 QA

`b414d54a`의 기존 production build, Next 16.3.3, `pnpm start --hostname 127.0.0.1 --port 3000`, ego-browser TaskSpace 2에서 공개 비로그인 범위만 확인했다. QA 워커 인계 `.scratch/handoff-Q.md`를 지휘자가 읽고 서버 종료·포트 비점유를 확인했다. 새 Malmoi 결함과 BugShot 이슈는 0건이다. **캡처 실패 때문에 DOM·접근성 트리·계산된 스타일·실제 포인터 클릭에 한정한 검증**이다.

| 검증 | 관측 |
| --- | --- |
| 화면 범위 | 홈, docs 루트·FAQ·formats·limits·ai-agents·browser, privacy, changelog, 없는 docs slug |
| 다국어·테마·너비 | 실제 언어 메뉴 en→ko→es, light/dark, 1280·1440·1890×900. 126개 조합에서 가로 넘침·잘림·헤더/푸터 상호작용 요소 겹침 0 |
| 링크·제목 | 새 랜딩 링크 3개 실제 포인터 이동 성공. 내부 URL 80개 모두 2xx·앵커 존재. 27개 문서의 heading level 건너뜀 없음. changelog의 기존 여러 h1 정책 유지 |
| 메타·JSON-LD | 홈 WebSite·OG locale·Twitter alt, docs self-canonical·실제 본문 언어·localized breadcrumb 확인. FAQ Docs→FAQ 중복 없음 |
| docs 404 | 초기 HTTP 404/noindex, 잘못된 title·빈 body 재현. hydration 후 올바른 localized 404 본문·title. 수정 완료 아님 |
| llms | index 6,200B의 사이트 목적지 34개, full 78,720B의 목적지 39개 모두 로컬 200·앵커 존재. 원문 코드의 MCP endpoint는 링크로 오분류하지 않음 |
| 캐시 경계 | guide 이미지 115,908B·폰트 샘플 35,184B는 max-age=3600/SWR=86400. OG 288,253B는 max-age=0, docs HTML은 private/no-store. 로컬 built-server 관측이며 CDN 증명은 아님 |
| 이미지 요청 | 첫 이미지 eager/high, 이후 lazy. 멀리 있는 후속 이미지는 미요청, 가까운 lazy 이미지는 Chromium preload margin 안에서 요청. 2560×1600 원본 유지 |
| robots | VERCEL_ENV가 없는 로컬 환경은 의도된 fail-closed `Disallow: /`. 프로덕션 robots의 검증 결과로 사용하지 않음 |

로컬 lab 조건: 1440×900, light, CPU rate 1, 네트워크 스로틀 없음, 각 3회 중앙값. cold-bypass는 브라우저 캐시 비활성화, warm은 활성화다.

| 경로·캐시 | response start | load | HTML encoded / decoded | resource transfer |
| --- | ---: | ---: | ---: | ---: |
| 홈 cold-bypass | 36.5ms | 316.8ms | 약 50.7KB / 491,735B | 약 394.8KB |
| 홈 warm | 33.1ms | 299.6ms | 약 50.7KB / 491,735B | 약 10.6KB |
| docs cold-bypass | 64.1ms | 224.5ms | 약 13.0KB / 67,209B | 약 544.9KB |
| docs warm | 49.9ms | 182.9ms | 약 13.0KB / 67,209B | 약 43.1KB |

홈 DOM 2,190요소, docs 245요소로 목업 비용은 남는다. 그러나 비교 가능한 LCP·CPU 스로틀 TBT/INP 실험은 확보하지 못했다. 기존 production 단발 LCP 748ms와 이 로컬 결과를 비교하지 않으며, 8번 구조 최적화의 효과·완료를 주장하지 않는다.

QA는 DB·환경변수·코드를 변경하지 않았다. owned 서버 종료, QA 터미널 해제, TaskSpace 2 finish 완료. 추가 워크트리 0, 모든 settled worker 터미널 12개 해제, reclaimable 0이다.

## 가이드 후속 후보

`pnpm guide:check` exit 0, 기존 stale 13컷: translation-editor, publish-preview, project-home, members, home-publish, publish-result, home-paused, revert-confirm, account, create-repository, create-files, create-name, create-ready. `/guide-shots` 후속 대상으로 남긴다. 이번 콘텐츠 배치의 가이드 사실 변경은 en/ko/es 함께 반영했고 테스트로 확인했다.

## 배포 경계

이 실행은 dev·preview까지다. main 머지·프로덕션 배포·프로덕션 DNS·DB 변경은 수행하지 않았다. `/merge`는 사용자의 별도 호출 대상이다.

## 후속 순서 — responsive 이후 재대응

2026-10-08 사용자 결정: 이 폴더의 감사·실행 문서를 보존하고, 별도 responsive 작업 이후 남은 SEO/GEO 항목을 다시 검토한다. 완료된 기능 문서 정리 대상에서 이 폴더를 제외한다.

1. responsive 작업에서 공개 페이지의 범위·최소 폭·내비게이션 정책을 확정한다. 이번 기록만으로 편집 앱까지 범위를 확대하지 않는다.
2. 반영 뒤 6번 모바일을 360·390·768px 및 기존 데스크톱 너비, en/ko/es·light/dark로 재검증한다. 가로 넘침·본문 크기·탭/포커스·메뉴·가이드 이미지와 표를 확인한다.
3. 8·15번은 변경 전후 동일한 빌드·장치·네트워크·CPU·캐시 조건으로 측정한다. 이미지 표시 폭·전송량·LCP 및 목업의 CPU 비용을 보고 추가 최적화 여부를 정한다. 이번 로컬 수치를 모바일 개선의 기준값으로 재사용하지 않는다.
4. 메타·canonical/noindex·JSON-LD·내부 링크·llms와 자산 캐시 경계를 회귀 검증한다. 화면이 바뀐 가이드 컷은 당시 `pnpm guide:check` 결과로 재촬영 범위를 정한다.
5. 16번 www와 18번 docs 404는 responsive와 원인이 독립적이다. 후속 재검토 목록에는 남기되, responsive로 해결된 것으로 처리하지 않는다. www는 별도 프로덕션 승인·DNS 접근, 404는 초기 HTTP HTML 재현을 기준으로 대응한다.

검색 성과·AI 인용·CrUX는 실제 배포와 관측 자료가 확보된 뒤 평가한다. 이번 연기는 미해결 항목의 완료 처리나 프로덕션 변경 승인이 아니다.

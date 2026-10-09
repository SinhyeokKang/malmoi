# mcp-docs — spec

MCP 커넥터에 **사용자 가이드 읽기 도구 하나**(`read_docs`)를 더한다. 에이전트가 Malmoi 작업 중 막혔을 때 같은 프로토콜로 가이드를 참조한다.

## 사용자

- **개발자 쪽**: MCP로 Malmoi를 다루는 CLI·코딩 에이전트(Claude Code·Codex)와 그 운전자 — 거부 문장(`not-ready`, `reconfirm`)·설정·Publish 보류를 이해하려고 부른다.
- **번역 편집자 쪽**: OAuth로 붙은 claude.ai 에이전트(PRODUCT §4.1 — OAuth는 셸 환경변수가 막히는 번역 편집자의 경로다) — 번역 화면 사용법·역할 같은 개념을 물을 때 부른다.
- 두 쪽 요구가 상충하지 않는다 — 응답 범위가 SUMMARY 전체(`translate/*` 포함)라 구현은 하나다. 도구 설명의 "언제 부르나" 문장이 거부 코드 어휘만 가정하지 않게 쓴다(개념·사용법 질문도). 화면은 바뀌지 않는다.

## 문제 (관측)

- MCP 도구 30개(`lib/mcp/catalog.ts`)는 전부 프로젝트·키·번역·멤버·Sync/Publish 작업이고 **가이드를 읽는 길이 없다.** 리소스·프롬프트·server `instructions`도 없고(`lib/mcp/server.ts`), `lib/mcp`·`en.mcp` 어디에도 가이드 링크가 0건이다.
- **셀프 호스팅 설치에는 기계 판독 가이드가 없다.** `/llms*.txt`는 self-hosted에서 404다(`lib/seo/public-response.ts` `CRAWL_FILES` — PRODUCT §4.1 "self-hosted용 sitemap·llms 산출물"은 하지 않는다). 웹으로 `https://mal-moi.com/docs`를 가져오면 **설치 버전과 다른 최신 가이드**를 읽는다. 이미지에는 설치 버전의 원고(`guide/`)가 들어 있다(`Dockerfile` `COPY . .`).
- hosted에서도 `/llms-full.txt`의 링크는 `SITE_ORIGIN` 고정이다.
- (추정) 웹 가져오기가 없거나 막힌 클라이언트에서는 MCP 밖 참조가 불가능하다 — 관측 사례는 없다.
- 가이드는 이미 공개 원고(`guide/en/**`)이고 `/llms-full.txt`·`/api/search-index/en`으로 기계 판독 변환이 있다 — **새 원천 없이 같은 원고를 MCP로 낼 수 있다.**

## 완료 조건 (검증 가능한 문장)

1. `tools/list`에 `read_docs`가 **읽기 16번째**(카탈로그 읽기 묶음의 끝)로 서고 `readOnlyHint: true`·`destructiveHint: false`다. 도구 수는 31(읽기 16 · 쓰기 15).
2. **grant 없는 토큰·범위가 `Chosen projects` 0개(`projectIds: []`)인 토큰**으로도 성공한다 — 프로젝트 역할·grant 조건이 둘 다 `null`이다.
3. 입력 `{}` → 가이드 목차: SUMMARY 순서의 페이지마다 `{ page, title, url, sections: [{ anchor, title }] }`. `sections`는 id 있는 H2만이다(도입부는 넣지 않는다 — 페이지의 `title`·`url`이 대표한다).
4. 입력 `{ page }`(목차의 `page` 값, 예 `sync/publish`, Overview는 `""`) → 그 페이지 원고 markdown 전문. **목차의 모든 `page` 값이 그대로 되받혀진다.** SUMMARY에 없는 값(`/sync/publish`·`sync/publish/`·`docs/…`·`.md` 접미·SUMMARY 밖 파일 포함)은 `not-found` 거부이고, 거부 문장은 가이드 전용("No guide page with that name. Call read_docs with no arguments to list pages." 형)이다 — 프로젝트 문장이 아니다.
5. 입력 `{ query }` → 검색(⌘K Docs 그룹과 같은 `scoreEntry` 순위)으로 상위 **5개 절**, 절마다 `{ page, title, section, url, markdown }`. 0건이면 성공 + 빈 배열(거부 아님). **검색 토큰이 0개인 query(공백만)는 `invalid-input` 거부.**
6. `page`와 `query`를 함께 주면 `invalid-input` 거부.
7. markdown 안의 **내부 문서 링크는 origin을 알면 절대 URL**이다 — 요청 origin이 허용 호스트면 그 origin(셀프 호스팅 설치는 `MALMOI_ORIGIN`), 모르면 앱 경로 그대로(`appUrl` 규칙). 코드·이미지·제목·외부 링크 바이트는 원고 그대로다.
8. 응답은 **영어 원고(`guide/en`)만**이다 — MCP는 영어 고정 표면이다(PRODUCT §4.1 · ARCHITECTURE §6.355).
9. 같은 원고 + 같은 입력 → 같은 출력(결정적). 정렬은 SUMMARY와 순위 하나.
10. **Vercel 함수에서 원고를 읽는다** — preview(`https://dev.mal-moi.com/api/mcp`)에 `x-vercel-protection-bypass` 헤더를 따로 싣고(ARCHITECTURE §6.45.8) `read_docs {}`를 부르면 500 없이 `pages` 배열이 온다. **302·SSO HTML은 실패로 센다.** 로컬 `next start`는 리포 파일을 그대로 읽어 트레이싱 누락을 못 잡는다.

## 비목표

- **ko·es 원고** — MCP 응답은 영어 고정이다. 요청자 화면 언어를 따르지 않는다.
- **MCP 리소스(`resources/list`)·프롬프트·server `instructions`로 내기** — 클라이언트 지원이 갈리고 `listChanged` 함정(§6.45 — 끝나지 않는 SSE)이 있다. `instructions`가 `/llms-full.txt`를 가리키는 대안은 self-hosted 404와 웹 불가 클라이언트에서 실패한다. 도구 하나로 끝낸다.
- **도구 여러 개**(`search_docs`·`get_doc` 분리) — 도구 설명이 클라이언트 컨텍스트에 상시로 실린다. 한 도구의 세 갈래로 묶는다.
- **`{ page }` 응답 분할·커서** — 가장 큰 페이지가 `self-hosting/troubleshooting.md` 20.5KB(약 5k 토큰), 전체 36파일 약 126KB다. 한 응답에 들어간다.
- **CLAUDE.md·`docs/*.md`(개발 문서)** — 서빙하는 사용자 가이드(SUMMARY 등재 페이지)만이다. AUTHORING·SHOOTING은 SUMMARY 밖이라 자연히 빠진다.
- **Changelog·Privacy** — 가이드 원고가 아니다.
- **스크린샷 이미지 전달** — markdown의 이미지 참조는 원문 그대로 남긴다(경로 치환 안 함).
- 화면(`/mcp`) 변경 — 카탈로그를 화면이 읽지 않는다(`app/(edit)/mcp/page.tsx` — 정본은 가이드). 가이드의 도구 표 갱신은 `/guide` 몫이다(tasks T7).

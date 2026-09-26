# docs-guide — 공개 사용 가이드(`/docs`)를 리포 안 Markdown으로

## 사용자

**둘 다다 — 그리고 이번엔 둘이 같은 문서에서 다른 장을 읽는다.**

| 독자 | 읽는 장 |
|---|---|
| 개발자(프로젝트 OWNER) | 프로젝트 생성·Sources·워크플로 부착·허용 action·보관·포맷·상한·Revert/Sync |
| 번역 편집자(비개발자 동료, EDITOR) | 초대 수락·번역 화면·Publish |
| 공통 | 개요·동기화 원리·Logs·계정·상한 |

**지금 `/docs`로 들어오는 링크는 다섯이고 전부 같은 개요(`routes.docs()`)로 간다**: 랜딩 히어로(`app/page.tsx:41`) · 공개 헤더(`components/public-shell/header.tsx:40`) · 공통 푸터(`lib/links.ts:23` — 랜딩·`/privacy`·`/signin`·초대·계정 병합) · 셸 사이드바(`lib/shell/nav.ts:210`) · 설정 `hookHint`(`components/settings/ci-card.tsx:40` → `#workflow`). ⚠️ 온보딩 ④와 초대 메일에는 링크가 없다 — ④ 문장은 야간 PR의 약속을 말할 뿐이고(PRODUCT :177), 메일은 `routes.invite(token)` 하나다.

**둘의 요구가 한 링크에서 부딪친다** — 사이드바 Docs는 역할과 무관하게 개요로 간다. **셸이 역할을 읽지 않고, 개요 첫 화면이 독자 두 갈래(Set up / Translate)를 준다**(2026-09-26 사용자).

## 문제 (관측된 사실)

1. **편집자용 문서가 0이다.** 지금 `/docs`는 개발자 문서 한 장이다(절 일곱 — how-it-works · workflow · allowed-actions · formats · limits · merging · nightly). 셸 사이드바의 Docs를 누른 편집자는 GitHub Actions 설정 문서를 받는다.
2. **본문이 `messages/en.tsx`의 TS 사전에 산다**(`m.publicDocs.docs.sections`). 페이지를 늘리고 이미지를 넣으면 장문을 TS 블록 구조로 쓰는 비용이 커진다.
3. **이미지가 없다.** "Actions 설정에서 허용 목록에 넣는다"를 글로만 설명한다 — 그 화면은 GitHub 쪽이라 malmoi 사용자에게 가장 낯설다.
4. **문서 최신화 장치가 절반뿐이다.** `docs-content.test.tsx`가 수(상한·action 넷·포맷 다섯·마커)는 정본 상수와 대조하지만 **화면 라벨**과 **이미지**는 아무것도 보지 않는다.
5. 참고한 bugshot-2는 `guide/{ko,en}/**.md` + `SUMMARY.md` + `AUTHORING.md`·`SHOOTING.md` + 스킬 둘(`/guide`·`/guide-shots`)로 푼다. 라벨·이미지 stale 판정은 사람과 스킬 몫이고, 이미지 stale은 **커밋 시각** 비교다 — ⚠️ 이 리포는 dev→main **squash** + `/sync` hard reset이라 그 비교가 머지마다 눈이 먼다(소스와 이미지가 같은 커밋 시각이 된다). 렌더링은 별도 리포가 tarball로 받아 처리한다 — malmoi는 같은 앱이라 그 배관이 필요 없다.

## 결정된 전제 (2026-09-26 사용자)

- **본문은 리포 안 Markdown** — `guide/**.md` + `guide/SUMMARY.md`(IA 정본). 작성·촬영 매뉴얼(`guide/AUTHORING.md`·`SHOOTING.md`)은 **한국어**이고 서빙되지 않는다.
- **en 단일** — UI·`/privacy`와 같다.
- **이미지는 실제 화면 스크린샷** — ego-browser로 찍고 마스킹한다. **촬영은 시안 확정 뒤**다(칼럼 폭이 치수를 정한다 — 2026-09-26 확정: 원본 크롭 폭 ≤ 850 CSS px).
- **디자인 정본은 Claude Design `Docs.dc.html` 1a–1d다**(2026-09-26 확정) — ④는 `/design-sync`로 대조한다. 개요·장 개요의 카드와 행은 SUMMARY + 각 페이지 도입 문단에서 생성한다(design §5).
- **md 파서는 mdast 한 벌** — 게이트와 렌더러가 같은 AST를 본다.
- **이미지 stale은 blob SHA 비교** — 촬영 때 매핑 소스의 SHA를 기록하고 현재 값과 다르면 stale.
- **외부 화면(GitHub) 라벨도 굵게** — 게이트는 사전 ∪ AUTHORING 허용 목록을 읽는다.
- **md 표의 접근 이름은 가장 가까운 상위 헤딩** — 한 페이지 안 중복 0.
- **옛 해시(`/docs#formats` 등 일곱)는 살린다** — 개요가 조각을 보고 새 페이지로 보낸다.
- **2.4 이후 사전 본문은 동결** — 정본은 md다. 급한 사실 오류만 양쪽에 같이 고친다.

## 완료 조건

**① 구성 (IA)**
- [ ] `guide/SUMMARY.md`의 모든 경로가 존재하고, SUMMARY 밖 `.md`는 `AUTHORING.md`·`SHOOTING.md` 둘뿐이며, 둘은 slug로 해소되지 않는다(`pnpm test` — 단위).
- [ ] 모든 페이지가 독자(개발자/편집자/공통) 하나에 배정되어 있다(AUTHORING IA 표).
- [ ] 지금 `/docs`의 절 일곱이 전부 새 페이지·앵커로 이관되고, 그 표가 **코드 데이터**(옛 id → 새 경로)로 있다(`pnpm test`).

**② 본문**
- [ ] 모든 페이지에 H1이 하나, **모든 H2에 `{#id}`**(`[a-z0-9-]`, 페이지 안 중복 0), 플레이스홀더 0(`pnpm test`).
- [ ] 지금 `docs-content.test.tsx`의 정본 상수 대조가 **같은 강도로 md에 대해** 돈다.
- [ ] 굵게 쓴 스팬이 전부 `messages/en.tsx`의 문자열(`publicDocs` 서브트리 제외) 또는 AUTHORING 외부 라벨 허용 목록에 있다(`pnpm test`).
- [ ] 편집자 장은 **EDITOR 계정이 보는 화면**만 약속한다(AUTHORING 규칙 · 원고 검토). `Needs review`는 플래그로만 서술한다(PRODUCT §4.2).
- [ ] 개요 첫 화면에 독자 두 갈래(Set up / Translate) 링크가 있다(`pnpm test` — 링크 해소).
- [ ] `no-korean-ui`·`brand-spelling`·`terminology` 게이트가 서빙되는 md를 훑는다(`pnpm test` — 픽스처).
- [ ] 내부 링크(페이지·앵커)가 전부 해소된다(`pnpm test`).

**③ 이미지**
- [ ] 이미지 참조가 전부 `public/guide/`의 실제 파일로 해소되고, 고아 에셋 0, alt 필수, 치수가 SHOOTING 표의 에셋별 기록과 일치한다(`pnpm test`).
- [ ] 모든 에셋이 SHOOTING 매핑 표에 소스 경로·그 blob SHA와 함께 있고, 경로가 존재한다(`pnpm test`).
- [ ] 마스킹 표의 원본 문자열이 md 본문·alt에 0이다(`pnpm test`). 픽셀 속 문자열은 촬영 때 사람이 확인한다(수동).
- [ ] 표시 폭 기준 이미지 속 글자가 SHOOTING §1의 최소 크기 이상이다(수동 — 촬영 때 확인).

**④ 라우팅·렌더링** (시안 확정 — Claude Design `Docs.dc.html` 1a–1d)
- [ ] `/docs`는 개요, `/docs/<slug>`가 각 페이지, 없는 slug·`AUTHORING`·`SHOOTING`은 404다(`pnpm test` 단위 + 로컬 수동).
- [ ] 옛 해시 `/docs#<old>`가 새 페이지로 간다(로컬 수동 · 매핑 표는 `pnpm test`).
- [ ] 앱 안 문서 링크 다섯이 생성기 `routes.docs(page?, anchor?)`를 지나고, 인자가 리터럴이며 대상 페이지·앵커가 존재한다(`pnpm test`).
- [ ] `m.publicDocs.docs.sections`·복귀 링크·`PublicDoc`이 사라지고 사전엔 `m.publicDocs.docs.title`(셸 사이드바 라벨) 등 셸 라벨만 남는다(`git grep` 0).
- [ ] 로그인 없이 열린다(`entry-points.test.ts` `EXEMPT`·`PUBLIC` 갱신).
- [ ] 빌드 산출 트레이스에 `guide/**/*.md`가 들어 있다(`pnpm build` 뒤 `.nft.json` 확인) · preview에서 열린다(브라우저 수동 — SSO라 curl 불가).
- [ ] `/design-sync`가 시안과 일치를 판정한다.

**⑤ 최신화 하네스**
- [ ] `guide/AUTHORING.md`·`guide/SHOOTING.md`가 정본으로 선다. SHOOTING에 **진행 상태** 절이 있다(여러 세션에 걸친 촬영의 재개 지점 — 없으면 다음 세션이 같은 벽에서 다시 막힌다).
- [ ] `pnpm guide:check`가 "기록된 blob SHA ≠ 현재 SHA"인 에셋을 목록으로 낸다(읽기 전용, 결과가 어떻든 exit 0 · 히스토리 불필요).
- [ ] 스킬 둘 — `/guide`(Codex 미러 대상), `/guide-shots`(ego-browser 전용, 미러 제외). 둘 다 stale 판정을 복제하지 않고 `pnpm guide:check` 출력을 인용한다(`pnpm sync:agents:check`).
- [ ] `/push` 4단계가 diff에 매핑 소스·사실 대조 소스가 걸리면 경고하고(차단 안 함), `/implement` 보고에 "가이드 영향" 플래그가 있다 — `/guide`의 진입 신호다(스킬 문서 diff 검토).
- [ ] CLAUDE.md 스킬 수·미러 제외 목록·권장 흐름·명령 표·문서 지도가 갱신된다.

## 비목표

- **ko 문서** — PRODUCT §10이 먼저다.
- **폰 최적화** — 시안이 반응형을 주면 따르고, 안 주면 `/privacy`처럼 공개 셸의 `min-w-[1280px]`를 수용한다.
- **역할별 Docs 링크** — 셸이 역할을 읽지 않는다. 갈래는 개요가 준다.
- **문서 검색** · **별도 docs 사이트** · **영상·GIF** · **이미지 픽셀 비교 게이트** · **MDX·HTML 원문 렌더** · **CI 자동 촬영**.
- **PRODUCT §4.2 "스크린샷 첨부"와 무관하다** — 그것은 번역 키에 화면을 붙이는 제품 기능이다. 범위 게이트 통과(`/docs`는 PRODUCT §7.7 IA에 있다).

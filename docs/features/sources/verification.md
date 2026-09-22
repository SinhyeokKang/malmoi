# Sources — 구현 검증과 인계 (2026-09-22)

구현 A/B 완료. C1/C3/C4의 자동 검증·문서 작업 완료. **C2 전체 실브라우저 검증과 정식 시안 대조는 미완료**이며 Claude Code에 인계한다. 따라서 feature 문서는 검증 근거와 함께 유지한다.

## 게이트

- `pnpm typecheck`: 통과.
- `pnpm test`: 350파일, 4,999건 통과(33.61초).
- `pnpm test:projects:postgres`: 9파일, 172건 통과(145.88초). 새 sources-progress integration 2건 실제 수집.
- `pnpm sync:agents:check`: 최신.
- `git diff 02c93c6 -- components/ui/modal.tsx`: 0줄. 스키마·마이그레이션·환경변수 변경 없음.
- 4관점 구현 검토: 실패 적재 후 상세 재조회 누락을 회귀 테스트와 함께 해소. 카드의 적재 전 성공 아이콘도 info로 정정. 커밋된 코드의 후속 정적 검토에서 추가 조치 없음.
- `/refactor`: 커밋 후 발견 없음. `/db`: 스키마 영향 없음. `/postmortem`: 기존 버그 수정 배송이 아닌 신규 기능이며 추가 후보 없음. POSTMORTEM 수정 없음.
- `/ship bypass`: 규모 가드만 생략. `pnpm build`·원격 push·정식 `/design-sync`는 Claude Code 단계로 남는다. 프로덕션 미배포.

## spec §9의 13개 조건

| # | 조건 | 근거와 판정 |
|---|---|---|
| 1 | 두 역할·EDITOR 비공개 projection·진행률 | `lib/sources/__tests__/query.test.ts`, `components/__tests__/sources-screen.test.tsx`. OWNER 실브라우저 확인, EDITOR 실브라우저는 남음 |
| 2 | OWNER 쓰기 셋 | `state.test.ts`, `sources-screen.test.tsx`, `sources-page.test.tsx`, 기존 repository-settings 인가 테스트. 빈 목록 두 역할 DOM 포함 |
| 3 | 선언·이벤트·재검증 예외 | `app/(edit)/__tests__/repository-settings.test.ts`, `base-language-form.test.tsx`. 기존 tx 이동, revalidate 예외에도 성공 |
| 4 | 최초/이후 실패·연결·역할 | `lib/import/__tests__/surface-status.test.ts`, `lib/sources/__tests__/state.test.ts`, `settings-sources.test.tsx` |
| 5 | 원본 SHA 시각·UTC·null | `sources-screen.test.tsx`, `source-detail-modal.tsx` 정적 대조. OWNER 실제 Source commit+UTC 확인 |
| 6 | 84%·0분모·고아·격리·clamp | `lib/keys/__tests__/sources-progress.integration.ts`, `lib/sources/__tests__/state.test.ts`. 실제 PG 통과 |
| 7 | 저장 중 이탈·포커스 | 저장 중 X/Close/Open 둘 DOM 통과. 실제 Esc 닫기→진입 행 포커스 통과. 저장 중 Esc/배경·거부 Save 포커스·진입 행 소멸 fallback 실브라우저는 남음 |
| 8 | 1024/864·동일 블록·높이 | OWNER 실제 1024×800/864×800, 낮은 창864×504, 가로 overflow0. 로딩864×504 확인. 고아/오류 높이의 실브라우저 대조는 남음 |
| 9 | Open의 전체 namespace·실제 키 | 두 링크 코드/DOM `ns=*`. 언어 en Open 실제4키 확인. 바닥 Open의 실제 착지는 남음 |
| 10 | 추가 세 결과·refresh 보존 | `settings-sources.test.tsx`, `add-surface.test.tsx`, `sources-screen.test.tsx` |
| 11 | Settings4·legacy/OAuth | `settings-layout.test.tsx`, `sources-page.test.tsx`, `add-surface-page-log.test.tsx`, `routes.test.ts`. 실제 옛 Locales 두 URL Sources 착지 확인. 실제 OAuth 왕복은 남음 |
| 12 | 타입·단위·PG | 위 게이트 전부 통과. build 미실행은 C1에서 예정한 잔여 RSC 경계 위험 |
| 13 | C2 전체 실브라우저 | **미완료**. 아래 인계 체크리스트를 실제 상태에서 관측해야 함 |

## 실제 브라우저 관측

기존 `bugshot-i18n-test-qa`를 OWNER로 읽었다. 프로젝트·파일·번역·기준 언어를 변경하거나 삭제하지 않았다.

- 1440×900: 패널1024×800, y50..850.
- 960×900: 패널864×800, y50..850. 가로 overflow0.
- 960×600: 본체와 로딩 패널864×504, y48..552, Close y488..528.
- 상세 열기/닫기 URL·history.length4 유지. Esc 뒤 활성 요소는 진입 `[data-source-row]`.
- 전체 reload는 목록으로 착지. 프로젝트/표면 옛 Locales URL 둘 다 Sources로 redirect.
- 언어 en Open은 `?ns=*&locales=en`, 실제 편집 키4개.
- 로컬 캔버스와 카드 구획·connection grid·footer를 대조해 수정. 정식 `/design-sync` 통과로 세지 않는다.
- 캡처: `/tmp/malmoi-sources-owner-cards.png`, `/tmp/malmoi-sources-960-detail.png`, `/tmp/malmoi-sources-960x900.png`.
- 브라우저 확장의 `data-brie-extend` hydration 경고는 제품 DOM 변경으로 우회하지 않았다.

남은 C2: EDITOR 실접속, 소스0개 두 역할, 최초/이후 실패·대기 변경·ja/고아 안내 두 폭,
OAuth 실제 왕복, 긴 목록 스크롤 복구·행 소멸 헤더 fallback, 저장 중 Esc/배경,
저장 거부 Save 포커스, 읽기 failed/rejected 오류 높이·하단 도달, 바닥 Open 실제 착지.
`/bugshot-qa`·`/design-sync`로 확인하고 성공으로 추정하지 않는다.

## C3 문서 대조

검색식: ``Locales|/locales|다섯 카드|소스 카드|Translation sources|sources-card|locale-meter|components/locales|locales는|locales`가|locales 사용|Translations·Locales``.
README 첫 단락 두 줄은 별도 점검했다. 아래는 **수정 전 줄 번호**이며, 검색에 잡힌 어댑터 예시·경로는 화면 소유권이 아니므로 유지했다.
PRODUCT §3의 EDITOR 노출 제한은 유지, Sources 상세로 기준 언어 위치만 갱신. Logs 필터 `Sources & locales` 유지 근거는 PRODUCT §7.7·DESIGN §6.66에 적었다.

- docs/PRODUCT.md: 8줄 발견, 수정 8, 유지 0.
- docs/DESIGN.md: 13줄 발견, 수정 10, 유지 3.
- docs/DIRECTORY.md: 3줄 발견, 수정 3, 유지 0.
- docs/ARCHITECTURE.md: 12줄 발견, 수정 4, 유지 8.
- README.md: 2줄 발견, 수정 2, 유지 0.

| 문서·옛 줄 | 발견 문장 | 판정 |
|---|---|---|
| docs/PRODUCT.md:103 | updateRepositorySettings가 Project.baseBranch를 **즉시** 쓰고, 기준 로케일은 /locales의 | 수정 — Sources 소유권/경로/공유 소비자 반영 |
| docs/PRODUCT.md:330 | 기본 표면은 Project.defaultSurfaceId로 저장한다. 기존 translations/locales URL은 그 표면으로 redirect한다. | 수정 — Sources 소유권/경로/공유 소비자 반영 |
| docs/PRODUCT.md:341 | 설정은 General·Repository·Translation sources·CI integration·Archive 다섯 카드다. 소스별 상태는 | 수정 — Sources 소유권/경로/공유 소비자 반영 |
| docs/PRODUCT.md:482 | /projects/:slug/locales        → **기본 표면으로 redirect** (옛 URL 껍데기) | 수정 — Sources 소유권/경로/공유 소비자 반영 |
| docs/PRODUCT.md:484 | /projects/:slug/surfaces/:surface/locales       ✅ 로케일 목록 + 기준 로케일 지정 ← 6b-5 → multi-surface B | 수정 — Sources 소유권/경로/공유 소비자 반영 |
| docs/PRODUCT.md:492 | routes.surfaceTranslations·routes.surfaceLocales·routes.addSurface이고, 표의 앞 두 줄은 | 수정 — Sources 소유권/경로/공유 소비자 반영 |
| docs/PRODUCT.md:493 | defaultSurface로 던지는 **redirect 껍데기**다(routes.translations·routes.locales가 계속 | 수정 — Sources 소유권/경로/공유 소비자 반영 |
| docs/PRODUCT.md:575 | 4. ✅ **기준 로케일은 locales가 소유한다** (2026-09-09, 6b-5) — 로케일 목록과 base 지정이 한 | 수정 — Sources 소유권/경로/공유 소비자 반영 |
| docs/DESIGN.md:566 | ／ **DropdownMenuCheckboxItem** ／ 8-4 신설 — 번역 화면의 Select locales가 유일한 소비자다. ⚠️ **dropdown-menu.tsx의 export이지 새 프리미티브가 아니다** — 이 리포는 **파일 단위로** 센다(… | 유지 — 어댑터/실제 파일 예시 또는 과거 근거; Sources 소유권 변경 대상 아님 |
| docs/DESIGN.md:601 | ／ **개수 배지** ／ ⚠️ **Projects 하나에만 붙는다** (8-3). 그 값은 셸이 **이미 조회한** 멤버십 배열의 길이라 왕복이 0이다. 시안의 나머지 셋(Locales·Translations·Members)은 프로젝트별 집계라 **모든 페이지… | 수정 — Sources 소유권/경로/공유 소비자 반영 |
| docs/DESIGN.md:605 | ／ 프로젝트 축 항목 ／ **Home**(House) · **Locales**(Globe) · **Translations**(Languages) · **Members**(Users) · **Logs**(History) · **Project settings**(… | 수정 — Sources 소유권/경로/공유 소비자 반영 |
| docs/DESIGN.md:606 | ／ 활성 판정 ／ ⚠️ **규칙이 축이 아니라 항목에 붙는다** (6b-6 — NavItem.exact). **접두인 것 셋**: Locales·Translations·Members·Project settings 중 하위 경로가 있는 것들. **정확히 일치인 … | 수정 — Sources 소유권/경로/공유 소비자 반영 |
| docs/DESIGN.md:690 | 활성 프로젝트는 **General → Repository → Translation sources → CI integration → Archive project**다. | 수정 — Sources 소유권/경로/공유 소비자 반영 |
| docs/DESIGN.md:695 | border-divider, 행↔행은 border-border다. 제목 없는 locales 사용은 헤더와 aria-labelledby를 생략한다. | 수정 — Sources 소유권/경로/공유 소비자 반영 |
| docs/DESIGN.md:702 | ／ Translation sources ／ 행마다 이름·활성 키/언어 수·mono 경로·상태. not-imported / importing / failed-first / failed-after / imported 다섯 갈래이며 실행 중이 과거 오류보다 우선한다… | 수정 — Sources 소유권/경로/공유 소비자 반영 |
| docs/DESIGN.md:1278 | ### 6.66 언어 (/projects/[slug]/locales) — 표 + 폼 (2026-09-09, 6b-5) | 수정 — Sources 소유권/경로/공유 소비자 반영 |
| docs/DESIGN.md:1323 | locales는 제목 없는 PanelCard다. 옛 Card 두 소비자(locales·settings)를 모두 옮긴 뒤 파일을 삭제했다. | 수정 — Sources 소유권/경로/공유 소비자 반영 |
| docs/DESIGN.md:1461 | ／ 사이드바 — 프로젝트 구역 ／ Home House · Locales Globe · Translations Languages · Members Users · Logs History · Project settings Settings (8-3이 이름과 순서를 시… | 수정 — Sources 소유권/경로/공유 소비자 반영 |
| docs/DESIGN.md:1485 | Translations·Locales의 **패널 머리**에만 둔다. Home·Settings·사이드바에는 두지 않는다. | 수정 — Sources 소유권/경로/공유 소비자 반영 |
| docs/DESIGN.md:1489 | 같은 이름의 apps/*/locales도 경로로 구별한다. 항목별 미발송 수는 배지다. 접근 이름은 Translation surface. | 유지 — 어댑터/실제 파일 예시 또는 과거 근거; Sources 소유권 변경 대상 아님 |
| docs/DESIGN.md:1490 | 선택기는 번역 툴바·칩과 같은 pending·이동 함수를 공유한다. 유효한 ns/locales/q는 보존하고 | 유지 — 어댑터/실제 파일 예시 또는 과거 근거; Sources 소유권 변경 대상 아님 |
| docs/DIRECTORY.md:62 | surfaces/[surfaceSlug]/locales/  로케일·base 선언 + actions.ts(updateBaseLocale 하나). | 수정 — Sources 소유권/경로/공유 소비자 반영 |
| docs/DIRECTORY.md:187 | settings/             general-card · repository-card/repository-form · sources-card/add-sources-modal · | 수정 — Sources 소유권/경로/공유 소비자 반영 |
| docs/DIRECTORY.md:209 | projects/locale-meter.tsx | 수정 — Sources 소유권/경로/공유 소비자 반영 |
| docs/ARCHITECTURE.md:234 | **--adapter ts-dict / TranslationSurface.adapterName = "ts-dict" 명시 지정은 그대로 동작한다** — 워크플로 YAML은 이 포맷을 포함해 모든 확정 어댑터를 명시한다. 자동 탐지의 1순위가 저장된 포맷이라는 … | 유지 — 어댑터/실제 파일 예시 또는 과거 근거; Sources 소유권 변경 대상 아님 |
| docs/ARCHITECTURE.md:248 | localeFromPath가 템플릿의 {locale} 앞뒤를 접두·접미로 쪼개는 방식이라 **세 모양 모두 코드 변경 없이 역산된다**(/를 품으면 거부하므로 로케일 디렉터리 형태도 안전하다). chrome-locales가 애초에 둘째 모양의 특수 사례(_lo… | 유지 — 어댑터/실제 파일 예시 또는 과거 근거; Sources 소유권 변경 대상 아님 |
| docs/ARCHITECTURE.md:273 | - **templateShapeRank** — 다른 신호가 같으면 맨 로케일 파일 > 로케일 디렉터리 > 접두사. rubygems.org의 config/locales/avo.{locale}.yml이 앱 카탈로그를 이긴 것이 근거다(마지막 tiebreak인 경로… | 유지 — 어댑터/실제 파일 예시 또는 과거 근거; Sources 소유권 변경 대상 아님 |
| docs/ARCHITECTURE.md:274 | - **liftAncestors** — 1순위의 **조상 디렉터리**에 있는 후보를 앞으로 끌어올린다. DMPRoadmap/roadmap의 config/locales/contact_us/contact_us.{locale}.yml(17로케일 · 11키)이 con… | 유지 — 어댑터/실제 파일 예시 또는 과거 근거; Sources 소유권 변경 대상 아님 |
| docs/ARCHITECTURE.md:276 | **고치지 못한 것 하나**: discourse의 plugins/discourse-cakeday/config/locales/client.{locale}.yml(27키)이 정본을 누른다. 플러그인 쪽 로케일 파일이 하나 더 많고(50 vs 49) 다른 서브트리라… | 유지 — 어댑터/실제 파일 예시 또는 과거 근거; Sources 소유권 변경 대상 아님 |
| docs/ARCHITECTURE.md:449 | 실물에서 드러났다**: bugshot-2에서 4키 _locales가 903키 딕셔너리를 가렸고, 그 상황을 PRODUCT §7.3이 | 유지 — 어댑터/실제 파일 예시 또는 과거 근거; Sources 소유권 변경 대상 아님 |
| docs/ARCHITECTURE.md:710 | 후자는 confirmed.format.locales를 순회하고 그 locales는 **성공한 blob에서 나온 값**이라, 못 받은 | 유지 — 어댑터/실제 파일 예시 또는 과거 근거; Sources 소유권 변경 대상 아님 |
| docs/ARCHITECTURE.md:777 | [slug]/locales/page.tsx · [slug]/translations/page.tsx · [slug]/surfaces/new/page.tsx · | 수정 — Sources 소유권/경로/공유 소비자 반영 |
| docs/ARCHITECTURE.md:778 | [slug]/surfaces/[surfaceSlug]/locales/page.tsx · **[slug]/surfaces/[surfaceSlug]/translations/page.tsx**. **새 Action 화면을 만들 때마다 선언한다** — 안 하면 기본값… | 수정 — Sources 소유권/경로/공유 소비자 반영 |
| docs/ARCHITECTURE.md:1024 | orphanedLocales)을 꺼내려면 그 순서를 알아야 하므로 인덱스를 조건별로 세어 계산한다. | 유지 — 어댑터/실제 파일 예시 또는 과거 근거; Sources 소유권 변경 대상 아님 |
| docs/ARCHITECTURE.md:1058 | - ✅ **이 상태를 설명하는 화면이 생겼다** (2026-09-09, 6b-5 — 지금 경로는 **/projects/[slug]/surfaces/[surfaceSlug]/locales**이고, 옛 /projects/[slug]/locales는 defaultS… | 수정 — Sources 소유권/경로/공유 소비자 반영 |
| docs/ARCHITECTURE.md:1857 | - ⚠️ **문구 모듈 둘이 명부에서 빠져 있었다** (2026-09-11 등재): **lib/settings/message.ts**(RepositorySettingsError → 문구. @/lib/i18n 하나만 문고 lib/auth/message.ts와 같… | 수정 — Sources 소유권/경로/공유 소비자 반영 |
| README.md:5 | 편집 URL은 /projects/:slug/surfaces/:surfaceSlug/translations·locales이며 | 수정 — Sources 소유권/경로/공유 소비자 반영 |
| README.md:6 | 옛 URL은 저장된 기본 표면으로 이동한다. OWNER는 Settings에서 표면을 추가할 수 있고, | 수정 — Sources 소유권/경로/공유 소비자 반영 |

# 대상 리포 — 어댑터 범용성 측정 실험

**태스크 0의 산출물이다.** 오픈소스 리포를 GitHub 코드 검색과 알려진 프로덕션 리포에서 모아 **blobless partial clone으로 전수 실물 확인**했다 (`git clone --depth 1 --filter=blob:none --no-checkout` → `git ls-tree -r`). 존재하지 않거나 클론 실패한 리포는 없다(109/109).

**109개 전부를 대상으로 한다.** 완료 조건은 50개 이상인데 표본을 임의로 줄이면 그 자체가 선정 편향이고, design.md §함정이 경고한 "자기 리포 4개로 판단한 것과 같은 실수"의 반복이다. 클론이 리포당 1초·200KB라 줄일 이유도 없다.

## 수집 방식 — blobless partial clone (2026-09-02 실측으로 확정)

tasks.md의 `git clone --depth 1` 결정을 실측으로 한 겹 좁혔다: **`--filter=blob:none --no-checkout`을 더한다.**

| | `--depth 1` | `--depth 1 --filter=blob:none --no-checkout` |
|---|---|---|
| 받는 것 | 스냅샷 전체 (blob 포함) | **트리·커밋만** |
| 실측 크기 | 리포당 수십~수백 MB (immich·mastodon 급) | **132~200KB** |
| 실측 시간 | 수십 초 | **0.9초** |
| 파일 내용 | 전부 로컬 | `git cat-file blob HEAD:<path>`로 **필요할 때만** 지연 fetch (실측 0.6초) |

**이 형태가 설계와 정확히 맞는다** — design.md의 껍데기 계약이 "경로 목록 먼저 → `selectSurveyFiles`가 고른 것만 물리화"인데, partial clone이 그 두 단계를 git 수준에서 그대로 준다. GitHub API `probe` 콜백이 "블롭 읽기가 비싸서 후보만 확인"하는 것과 같은 구조이기도 하다.


## 분포 (태스크 0 검증 조건)

| 조건 | 요구 | 실측 |
|---|---|---|
| 리포 수 | 50개 이상 | **109개** |
| 포맷 종류 | 5종 이상 | **5종** — json-catalog 39, ts-per-locale (미지원 형태) 12, chrome-locales 34, 없음 7, yaml (미지원) 17 |
| 스타 구간 | 3구간 각 5개 이상 | A(>2k) **43** / B(100~2k) **55** / C(<100) **11** |
| 스타터·템플릿 | 절반 이하 | **0개** — 전부 실사용 프로덕션·라이브러리 리포다 |
| 포맷 2종 이상 공존 | (관측치) | **24개** — 어댑터 간 오탐(spec 완료 조건 ②)의 실제 표본이다 |

## 목록

**"예상 포맷"은 경로 패턴만 본 사전 라벨이다** — 실제 판정은 `pnpm adapter-survey`가 내리고, 정답 카탈로그 경로는 `verdicts.json`에 따로 기록한다. 이 라벨을 오탐 판정의 근거로 쓰지 않는다 (경로가 맞아도 내용이 카탈로그가 아닐 수 있다).

| 리포 | 구간 | ★ | 파일 수 | 예상 포맷 (경로 신호) |
|---|---|---|---|---|
| [immich-app/immich](https://github.com/immich-app/immich) | A | 113,193 | 3,455 | `json-catalog` 89로케일 `i18n/{locale}.json`<br>`yaml (미지원)` 2로케일 `.github/workflows/{locale}.yml`<br>`ts-per-locale (미지원 형태)` 2로케일 `packages/plugin-sdk/src/{locale}.ts` |
| [ant-design/ant-design](https://github.com/ant-design/ant-design) | A | 99,346 | 5,040 | `ts-per-locale (미지원 형태)` 73로케일 `components/locale/{locale}.ts`<br>`json-catalog` 2로케일 `.dumi/theme/locales/{locale}.json` |
| [hoppscotch/hoppscotch](https://github.com/hoppscotch/hoppscotch) | A | 80,143 | 2,448 | `json-catalog` 34로케일 `packages/hoppscotch-common/locales/{locale}.json`<br>`ts-per-locale (미지원 형태)` 3로케일 `packages/hoppscotch-common/src/platform/{locale}.ts` |
| [AppFlowy-IO/AppFlowy](https://github.com/AppFlowy-IO/AppFlowy) | A | 76,175 | 4,597 | `json-catalog` 36로케일 `frontend/resources/translations/{locale}.json` |
| [strapi/strapi](https://github.com/strapi/strapi) | A | 73,059 | 6,559 | `json-catalog` 35로케일 `packages/core/admin/admin/src/translations/{locale}.json`<br>`ts-per-locale (미지원 형태)` 14로케일 `packages/plugins/graphql/server/src/services/builders/filters/operators/{locale}.ts` |
| [gorhill/uBlock](https://github.com/gorhill/uBlock) | A | 67,478 | 1,056 | `chrome-locales` 71로케일 `platform/mv3/extension/_locales/{locale}/messages.json` |
| [usememos/memos](https://github.com/usememos/memos) | A | 62,714 | 1,292 | `json-catalog` 44로케일 `web/src/locales/{locale}.json` |
| [mastodon/mastodon](https://github.com/mastodon/mastodon) | A | 50,262 | 10,003 | `json-catalog` 106로케일 `app/javascript/mastodon/locales/{locale}.json`<br>`yaml (미지원)` 106로케일 `config/locales/{locale}.yml` |
| [huginn/huginn](https://github.com/huginn/huginn) | A | 49,876 | 835 | — (경로 신호 없음) |
| [siyuan-note/siyuan](https://github.com/siyuan-note/siyuan) | A | 46,103 | 3,362 | `json-catalog` 21로케일 `app/appearance/langs/{locale}.json`<br>`ts-per-locale (미지원 형태)` 2로케일 `app/src/menus/{locale}.ts` |
| [payloadcms/payload](https://github.com/payloadcms/payload) | A | 44,534 | 8,996 | `ts-per-locale (미지원 형태)` 40로케일 `packages/plugin-form-builder/src/translations/languages/{locale}.ts`<br>`json-catalog` 5로케일 `examples/localization/src/i18n/messages/{locale}.json` |
| [vuetifyjs/vuetify](https://github.com/vuetifyjs/vuetify) | A | 41,042 | 3,023 | `ts-per-locale (미지원 형태)` 43로케일 `packages/vuetify/src/locale/{locale}.ts`<br>`json-catalog` 2로케일 `packages/docs/src/data/{locale}.json` |
| [directus/directus](https://github.com/directus/directus) | A | 37,665 | 4,630 | `yaml (미지원)` 69로케일 `app/src/lang/translations/{locale}.yaml`<br>`ts-per-locale (미지원 형태)` 4로케일 `api/src/utils/{locale}.ts` |
| [chatwoot/chatwoot](https://github.com/chatwoot/chatwoot) | A | 36,373 | 9,124 | `json-catalog` 57로케일 `app/javascript/widget/i18n/locale/{locale}.json`<br>`yaml (미지원)` 57로케일 `config/locales/{locale}.yml` |
| [element-plus/element-plus](https://github.com/element-plus/element-plus) | A | 27,727 | 2,704 | `ts-per-locale (미지원 형태)` 67로케일 `packages/locale/lang/{locale}.ts` |
| [quasarframework/quasar](https://github.com/quasarframework/quasar) | A | 27,204 | 4,500 | — (경로 신호 없음) |
| [iv-org/invidious](https://github.com/iv-org/invidious) | A | 23,759 | 370 | `json-catalog` 63로케일 `locales/{locale}.json` |
| [forem/forem](https://github.com/forem/forem) | A | 22,774 | 7,135 | `yaml (미지원)` 4로케일 `.github/workflows/{locale}.yml` |
| [darkreader/darkreader](https://github.com/darkreader/darkreader) | A | 22,314 | 980 | `ts-per-locale (미지원 형태)` 3로케일 `src/utils/{locale}.ts` |
| [gildas-lormeau/SingleFile](https://github.com/gildas-lormeau/SingleFile) | A | 22,293 | 190 | `chrome-locales` 17로케일 `_locales/{locale}/messages.json` |
| [tusen-ai/naive-ui](https://github.com/tusen-ai/naive-ui) | A | 18,523 | 3,690 | `ts-per-locale (미지원 형태)` 4로케일 `src/typography/src/{locale}.ts` |
| [primefaces/primevue](https://github.com/primefaces/primevue) | A | 14,457 | 4,843 | — (경로 신호 없음) |
| [ajayyy/SponsorBlock](https://github.com/ajayyy/SponsorBlock) | A | 13,725 | 217 | — (경로 신호 없음) |
| [bitwarden/clients](https://github.com/bitwarden/clients) | A | 13,718 | 8,763 | `chrome-locales` 63로케일 `apps/browser/src/_locales/{locale}/messages.json`<br>`json-catalog` 2로케일 `apps/web/config/{locale}.json`<br>`yaml (미지원)` 2로케일 `.github/ISSUE_TEMPLATE/{locale}.yml`<br>`ts-per-locale (미지원 형태)` 2로케일 `libs/importer/src/importers/spec-data/onepassword-1pux/{locale}.ts` |
| [diaspora/diaspora](https://github.com/diaspora/diaspora) | A | 13,652 | 1,949 | `yaml (미지원)` 95로케일 `config/locales/diaspora/{locale}.yml` |
| [element-hq/element-web](https://github.com/element-hq/element-web) | A | 13,416 | 5,227 | `json-catalog` 41로케일 `apps/desktop/src/i18n/strings/{locale}.json` |
| [Kareadita/Kavita](https://github.com/Kareadita/Kavita) | A | 11,598 | 3,609 | `json-catalog` 42로케일 `Kavita.Server/I18N/{locale}.json` |
| [misskey-dev/misskey](https://github.com/misskey-dev/misskey) | A | 11,310 | 3,137 | `yaml (미지원)` 42로케일 `locales/{locale}.yml`<br>`ts-per-locale (미지원 형태)` 3로케일 `packages/backend/src/server/api/endpoints/i/registry/{locale}.ts` |
| [hackmdio/codimd](https://github.com/hackmdio/codimd) | A | 10,138 | 416 | `json-catalog` 24로케일 `locales/{locale}.json` |
| [violentmonkey/violentmonkey](https://github.com/violentmonkey/violentmonkey) | A | 8,806 | 267 | `chrome-locales` 31로케일 `_locales/{locale}/messages.yml` |
| [dequelabs/axe-core](https://github.com/dequelabs/axe-core) | A | 7,466 | 2,043 | `json-catalog` 19로케일 `locales/{locale}.json` |
| [redmine/redmine](https://github.com/redmine/redmine) | A | 6,024 | 2,297 | `yaml (미지원)` 50로케일 `config/locales/{locale}.yml` |
| [home-assistant/frontend](https://github.com/home-assistant/frontend) | A | 5,645 | 3,637 | `ts-per-locale (미지원 형태)` 8로케일 `src/data/{locale}.ts` |
| [go-vikunja/vikunja](https://github.com/go-vikunja/vikunja) | A | 5,237 | 2,091 | `json-catalog` 37로케일 `frontend/src/i18n/lang/{locale}.json` |
| [lokalise/i18n-ally](https://github.com/lokalise/i18n-ally) | A | 4,896 | 1,150 | `yaml (미지원)` 32로케일 `examples/by-features/100-locales/locales/{locale}.yml`<br>`json-catalog` 17로케일 `locales/{locale}.json`<br>`ts-per-locale (미지원 형태)` 4로케일 `src/parsers/{locale}.ts`<br>`chrome-locales` 2로케일 `examples/by-frameworks/chrome-extension/_locales/{locale}/messages.json` |
| [stringer-rss/stringer](https://github.com/stringer-rss/stringer) | A | 4,130 | 429 | `yaml (미지원)` 17로케일 `config/locales/{locale}.yml` |
| [jellyfin/jellyfin-web](https://github.com/jellyfin/jellyfin-web) | A | 3,812 | 1,226 | `json-catalog` 107로케일 `src/strings/{locale}.json` |
| [arco-design/arco-design-vue](https://github.com/arco-design/arco-design-vue) | A | 3,106 | 2,671 | `ts-per-locale (미지원 형태)` 18로케일 `packages/web-vue/components/locale/lang/{locale}.ts` |
| [Shopify/dawn](https://github.com/Shopify/dawn) | A | 3,063 | 360 | `json-catalog` 30로케일 `locales/{locale}.json`<br>`yaml (미지원)` 2로케일 `.github/workflows/{locale}.yml` |
| [YunoHost/yunohost](https://github.com/YunoHost/yunohost) | A | 2,970 | 395 | `json-catalog` 45로케일 `locales/{locale}.json` |
| [Afilmory/afilmory](https://github.com/Afilmory/afilmory) | A | 2,607 | 2,022 | `json-catalog` 6로케일 `locales/app/{locale}.json`<br>`ts-per-locale (미지원 형태)` 3로케일 `apps/web/src/lib/{locale}.ts` |
| [lyqht/mini-qr](https://github.com/lyqht/mini-qr) | A | 2,381 | 348 | `json-catalog` 50로케일 `locales/{locale}.json`<br>`ts-per-locale (미지원 형태)` 2로케일 `src/utils/{locale}.ts` |
| [extesy/hoverzoom](https://github.com/extesy/hoverzoom) | A | 2,052 | 571 | `chrome-locales` 52로케일 `_locales/{locale}/messages.json` |
| [Alanrk/LazyCat-Bookmark-Cleaner](https://github.com/Alanrk/LazyCat-Bookmark-Cleaner) | B | 1,847 | 23 | `chrome-locales` 2로케일 `_locales/{locale}/messages.json` |
| [decidim/decidim](https://github.com/decidim/decidim) | B | 1,809 | 11,493 | `yaml (미지원)` 82로케일 `decidim-accountability/config/locales/{locale}.yml` |
| [rtorr/vim-cheat-sheet](https://github.com/rtorr/vim-cheat-sheet) | B | 1,734 | 69 | `json-catalog` 40로케일 `locales/{locale}.json` |
| [24pullrequests/24pullrequests](https://github.com/24pullrequests/24pullrequests) | B | 1,707 | 463 | `yaml (미지원)` 20로케일 `config/locales/{locale}.yml` |
| [mikebryant/ac-nh-turnip-prices](https://github.com/mikebryant/ac-nh-turnip-prices) | B | 1,550 | 49 | `json-catalog` 21로케일 `locales/{locale}.json` |
| [kkapsner/CanvasBlocker](https://github.com/kkapsner/CanvasBlocker) | B | 1,504 | 229 | `chrome-locales` 19로케일 `_locales/{locale}/messages.json` |
| [ZeusLN/zeus](https://github.com/ZeusLN/zeus) | B | 1,399 | 1,535 | `json-catalog` 34로케일 `locales/{locale}.json` |
| [FirefoxBar/HeaderEditor](https://github.com/FirefoxBar/HeaderEditor) | B | 1,286 | 189 | `chrome-locales` 6로케일 `public/_locales/{locale}/messages.json` |
| [okisdev/ChatChat](https://github.com/okisdev/ChatChat) | B | 1,269 | 209 | `json-catalog` 13로케일 `locales/{locale}.json` |
| [tyrasd/overpass-turbo](https://github.com/tyrasd/overpass-turbo) | B | 1,236 | 1,487 | `json-catalog` 48로케일 `locales/{locale}.json`<br>`ts-per-locale (미지원 형태)` 3로케일 `js/{locale}.ts` |
| [SchizoDuckie/DuckieTV](https://github.com/SchizoDuckie/DuckieTV) | B | 1,190 | 502 | `chrome-locales` 27로케일 `_locales/{locale}/messages.json`<br>`json-catalog` 20로케일 `_locales/{locale}.json` |
| [mcthesw/game-save-manager](https://github.com/mcthesw/game-save-manager) | B | 1,140 | 506 | `json-catalog` 7로케일 `locales/{locale}.json` |
| [NativeMindBrowser/NativeMindExtension](https://github.com/NativeMindBrowser/NativeMindExtension) | B | 1,129 | 596 | `chrome-locales` 14로케일 `public/_locales/{locale}/messages.json`<br>`json-catalog` 13로케일 `locales/{locale}.json`<br>`ts-per-locale (미지원 형태)` 5로케일 `utils/{locale}.ts` |
| [RoderickQiu/wnr](https://github.com/RoderickQiu/wnr) | B | 1,095 | 161 | `json-catalog` 6로케일 `locales/{locale}.json` |
| [sugarlabs/musicblocks](https://github.com/sugarlabs/musicblocks) | B | 876 | 4,059 | `json-catalog` 84로케일 `locales/{locale}.json` |
| [z-------------/CPod](https://github.com/z-------------/CPod) | B | 767 | 93 | `json-catalog` 16로케일 `locales/{locale}.json` |
| [Warma10032/VideoAdGuard](https://github.com/Warma10032/VideoAdGuard) | B | 751 | 60 | `chrome-locales` 2로케일 `_locales/{locale}/messages.json` |
| [GoogleChrome/chromium-dashboard](https://github.com/GoogleChrome/chromium-dashboard) | B | 743 | 1,012 | `json-catalog` 10로케일 `locales/release_notes/{locale}.json` |
| [anatolyzenkov/button-stealer](https://github.com/anatolyzenkov/button-stealer) | B | 733 | 53 | `chrome-locales` 22로케일 `_locales/{locale}/messages.json` |
| [Midnight-Lizard/Midnight-Lizard](https://github.com/Midnight-Lizard/Midnight-Lizard) | B | 732 | 287 | `chrome-locales` 51로케일 `_locales/{locale}/messages.json` |
| [jsxc/jsxc](https://github.com/jsxc/jsxc) | B | 732 | 510 | `json-catalog` 30로케일 `locales/{locale}.json` |
| [Smile4ever/Neat-URL](https://github.com/Smile4ever/Neat-URL) | B | 664 | 82 | `chrome-locales` 8로케일 `_locales/{locale}/messages.json` |
| [moebooru/moebooru](https://github.com/moebooru/moebooru) | B | 607 | 909 | `yaml (미지원)` 7로케일 `config/locales/{locale}.yml` |
| [zmh-program/next-whois](https://github.com/zmh-program/next-whois) | B | 589 | 157 | `json-catalog` 8로케일 `locales/{locale}.json`<br>`ts-per-locale (미지원 형태)` 2로케일 `src/lib/{locale}.ts` |
| [arkadiyt/zoom-redirector](https://github.com/arkadiyt/zoom-redirector) | B | 583 | 13 | — (경로 신호 없음) |
| [uppinote20/claude-dashboard](https://github.com/uppinote20/claude-dashboard) | B | 563 | 162 | `json-catalog` 2로케일 `locales/{locale}.json` |
| [jinliming2/Chrome-Charset](https://github.com/jinliming2/Chrome-Charset) | B | 541 | 72 | `chrome-locales` 47로케일 `_locales/{locale}/messages.json` |
| [esmBot/esmBot](https://github.com/esmBot/esmBot) | B | 505 | 373 | `json-catalog` 26로케일 `locales/{locale}.json` |
| [brandon1024/find](https://github.com/brandon1024/find) | B | 484 | 61 | `chrome-locales` 2로케일 `_locales/{locale}/messages.json` |
| [kee-org/browser-addon](https://github.com/kee-org/browser-addon) | B | 475 | 240 | `chrome-locales` 18로케일 `_locales/{locale}/messages.json` |
| [Growstuff/growstuff](https://github.com/Growstuff/growstuff) | B | 473 | 1,165 | `yaml (미지원)` 2로케일 `config/locales/{locale}.yml` |
| [yui540/comimi](https://github.com/yui540/comimi) | B | 454 | 118 | `json-catalog` 6로케일 `locales/{locale}.json` |
| [scratchblocks/scratchblocks](https://github.com/scratchblocks/scratchblocks) | B | 450 | 212 | `json-catalog` 78로케일 `locales/{locale}.json` |
| [fastladder/fastladder](https://github.com/fastladder/fastladder) | B | 420 | 410 | `yaml (미지원)` 3로케일 `config/locales/{locale}.yml` |
| [pietervanheijningen/clickbait-remover-for-youtube](https://github.com/pietervanheijningen/clickbait-remover-for-youtube) | B | 408 | 25 | `chrome-locales` 9로케일 `_locales/{locale}/messages.json` |
| [samueljun/tomato-clock](https://github.com/samueljun/tomato-clock) | B | 359 | 91 | `chrome-locales` 10로케일 `_locales/{locale}/messages.json` |
| [az0/linkgopher](https://github.com/az0/linkgopher) | B | 355 | 20 | `chrome-locales` 6로케일 `_locales/{locale}/messages.json` |
| [henices/Chrome-proxy-helper](https://github.com/henices/Chrome-proxy-helper) | B | 353 | 33 | `chrome-locales` 4로케일 `_locales/{locale}/messages.json` |
| [micz/ThunderAI](https://github.com/micz/ThunderAI) | B | 333 | 206 | `chrome-locales` 25로케일 `_locales/{locale}/messages.json` |
| [mastodon/joinmastodon](https://github.com/mastodon/joinmastodon) | B | 278 | 663 | `json-catalog` 54로케일 `locales/{locale}.json`<br>`ts-per-locale (미지원 형태)` 2로케일 `utils/{locale}.ts` |
| [nt1m/livemarks](https://github.com/nt1m/livemarks) | B | 259 | 65 | `chrome-locales` 19로케일 `_locales/{locale}/messages.json` |
| [bluecaret/carettab](https://github.com/bluecaret/carettab) | B | 249 | 200 | `chrome-locales` 15로케일 `_locales/{locale}/messages.json`<br>`json-catalog` 15로케일 `src/locales/{locale}.json` |
| [EYHN/Furigana](https://github.com/EYHN/Furigana) | B | 233 | 60 | `chrome-locales` 2로케일 `_locales/{locale}/messages.json` |
| [badsgahhl/pihole-browser-extension](https://github.com/badsgahhl/pihole-browser-extension) | B | 228 | 72 | `chrome-locales` 2로케일 `_locales/{locale}/messages.json` |
| [permacommons/lib.reviews](https://github.com/permacommons/lib.reviews) | B | 201 | 429 | `json-catalog` 40로케일 `locales/{locale}.json` |
| [olegcherr/Reedy-for-Chrome](https://github.com/olegcherr/Reedy-for-Chrome) | B | 190 | 68 | `chrome-locales` 2로케일 `_locales/{locale}/messages.json` |
| [mdolr/survol](https://github.com/mdolr/survol) | B | 163 | 82 | `chrome-locales` 35로케일 `_locales/{locale}/messages.json` |
| [Tardo/OdooTerminal](https://github.com/Tardo/OdooTerminal) | B | 149 | 430 | `chrome-locales` 3로케일 `_locales/{locale}/messages.json` |
| [ixrock/XTranslate](https://github.com/ixrock/XTranslate) | B | 148 | 263 | `chrome-locales` 20로케일 `_locales/{locale}/messages.json` |
| [arunelias/session-alive](https://github.com/arunelias/session-alive) | B | 140 | 50 | `chrome-locales` 6로케일 `_locales/{locale}/messages.json` |
| [WordPress/browser-extension](https://github.com/WordPress/browser-extension) | B | 131 | 147 | `chrome-locales` 3로케일 `_locales/{locale}/messages.json` |
| [refinery/refinerycms-news](https://github.com/refinery/refinerycms-news) | B | 122 | 77 | `yaml (미지원)` 21로케일 `config/locales/{locale}.yml` |
| [DMPRoadmap/roadmap](https://github.com/DMPRoadmap/roadmap) | B | 118 | 1,496 | `yaml (미지원)` 15로케일 `config/locales/{locale}.yml` |
| [g0v/newshelper-extension](https://github.com/g0v/newshelper-extension) | B | 107 | 22 | `chrome-locales` 2로케일 `_locales/{locale}/messages.json` |
| [raingart/AutoHideDownloadsBar-extension](https://github.com/raingart/AutoHideDownloadsBar-extension) | B | 104 | 41 | `chrome-locales` 8로케일 `_locales/{locale}/messages.json` |
| [codeforjapan/mapprint](https://github.com/codeforjapan/mapprint) | C | 85 | 211 | `json-catalog` 13로케일 `locales/{locale}.json` |
| [GSA/search-gov](https://github.com/GSA/search-gov) | C | 70 | 3,009 | `yaml (미지원)` 65로케일 `config/locales/{locale}.yml`<br>`json-catalog` 2로케일 `spec/fixtures/json/rtu_dashboard/{locale}.json` |
| [solidusio/solidus_i18n](https://github.com/solidusio/solidus_i18n) | C | 66 | 74 | `yaml (미지원)` 39로케일 `config/locales/{locale}.yml` |
| [Js-Monkey/datepicker](https://github.com/Js-Monkey/datepicker) | C | 64 | 107 | `ts-per-locale (미지원 형태)` 25로케일 `locale/{locale}.ts` |
| [jumodada/better-datepicker](https://github.com/jumodada/better-datepicker) | C | 59 | 174 | `ts-per-locale (미지원 형태)` 25로케일 `locale/{locale}.ts` |
| [CitizensFoundation/your-priorities](https://github.com/CitizensFoundation/your-priorities) | C | 33 | 1,657 | `yaml (미지원)` 62로케일 `config/locales/{locale}.yml` |
| [Zimomo333/unreal-ui-next](https://github.com/Zimomo333/unreal-ui-next) | C | 11 | 298 | — (경로 신호 없음) |
| [happy-func/next-official](https://github.com/happy-func/next-official) | C | 2 | 169 | `json-catalog` 2로케일 `locale/article/{locale}.json`<br>`ts-per-locale (미지원 형태)` 2로케일 `locale/{locale}.ts` |
| [EralChen/vike-vue-content](https://github.com/EralChen/vike-vue-content) | C | 1 | 328 | `ts-per-locale (미지원 형태)` 2로케일 `locale/lang/{locale}.ts` |
| [sitb-software/veigar](https://github.com/sitb-software/veigar) | C | 0 | 52 | — (경로 신호 없음) |
| [ylater/me-nuxt](https://github.com/ylater/me-nuxt) | C | 0 | 90 | `ts-per-locale (미지원 형태)` 2로케일 `locale/{locale}.ts` |

## 이미 드러난 것 (경로 스크리닝 단계에서)

측정 전인데도 스크리닝만으로 관측된 사실 넷. 지표로 세는 것은 survey CLI지만, 표본이 편향되지 않았다는 근거로 여기 남긴다.

- **`ts-per-locale`이 코드 딕셔너리의 다수파다** (12개 — ant-design 73로케일, element-plus 67, vuetify 43, payload 40, arco-design-vue 18). 우리 `ts-dict`는 **한 파일에 로케일이 여러 개**인 형태(bugshot-2)를 전제하는데, 실제 생태계는 **로케일당 파일 하나**가 훨씬 흔하다. 판정 ③(ts-dict 자동 탐지 제외)의 근거가 여기서 갈릴 수 있다.
- **YAML이 17개다.** Rails 계열(`config/locales/{locale}.yml`)이 대부분이고 misskey·directus 같은 프런트엔드도 쓴다. 어댑터가 없어 설계상 detect 실패이고, 지표 ①의 "전체 분모"가 이걸 센다.
- **`_locales`가 YAML인 크롬 확장이 있다** — violentmonkey(`src/_locales/{locale}/messages.yml`). 경로 신호는 chrome인데 확장자가 다르다.
- **로케일 디렉터리가 서브모듈인 리포가 있다** — ajayyy/SponsorBlock의 `public/_locales`가 gitlink다. depth-1 클론에서 빈 트리로 보이므로 "탐지 실패"와 구별해 기록해야 한다 (tasks.md 6의 계속 진행 목록).

## verdicts.json — 사람(실행 주체) 판정의 유일한 기록처

**오탐률(지표 ②)의 정답은 여기에만 있다.** 위 "예상 포맷" 라벨은 경로 신호일 뿐이라 판정 근거로 쓰지 않는다 — 관측된 오탐 전례(`public/search/{locale}.json`)가 **포맷은 맞고 경로가 틀린** 형태라 라벨 대조로는 원리적으로 못 잡는다.

```json
[
  {
    "repo": "usememos/memos",
    "correctCatalogPath": "web/src/locales/{locale}.json",
    "note": "44로케일. web/src/locales가 유일한 번역 카탈로그다"
  },
  {
    "repo": "bluecaret/carettab",
    "correctCatalogPath": "_locales/{locale}/messages.json",
    "note": "src/locales/{locale}.json도 15로케일 잡히지만 그쪽은 빌드 입력이고 확장이 읽는 것은 _locales다"
  },
  {
    "repo": "misskey-dev/misskey",
    "correctCatalogPath": null,
    "note": "locales/{locale}.yml — YAML 어댑터가 없다. 정답이 존재하지만 우리가 지원하지 않는 포맷이므로 null이고, 지표 ①의 '전체 분모'에만 들어간다"
  }
]
```

- `correctCatalogPath` — 그 리포에서 **실제로 번역이 사는 곳**의 경로 템플릿. 우리가 지원하지 않는 포맷이면 `null`
- `note` — 그렇게 판정한 근거. **사후 감사용이다** (spec §실행 방식 — 무인 루프라 판정 주체가 실행 에이전트이고, 근거가 남아야 판정이 검증 가능하다)
- 1순위 오탐 여부·N순위 정답 여부는 이 경로와 survey의 후보 목록을 `summarize`가 대조해 **자동 계산**한다. detect를 고쳐 재실행해도 판정이 살아남는 이유다


---

## 3차 — 홀드아웃 20개 (2026-09-02 저녁)

**목록: [repos-heldout.txt](./repos-heldout.txt) / 정답: [verdicts-heldout.json](./verdicts-heldout.json)**

위 109개와 **겹치지 않는다**(`comm -12`로 확인). 어댑터를 109개에 맞춰 7라운드 고친 뒤라 그
숫자가 일반화를 증명하지 않으므로, **손대기 전에 먼저 한 번 돌리는 것**이 이 목록의 존재 이유다.

선정 기준: 지원할 만한 포맷과 미지원 포맷을 의도적으로 섞고, **모양이 다를 것 같은 리포를 우선**
골랐다(로케일 디렉터리·접두사 파일명·Fluent·properties·줄 단위 텍스트). 무작위 표집이 아니므로
전체 오픈소스 분포가 아니다 — `docs/ADAPTER-COVERAGE.md` §7에 그 한계를 적었다.

| 정답 경로 모양 | 개수 | 리포 |
|---|---|---|
| `{dir}/{locale}.{json,yml}` | 5 | rubygems.org, spree_i18n, excalidraw, mattermost, withastro/docs |
| `{dir}/{locale}/<name>.json` | 6 | grafana, open-webui, outline, Ghost, cal.com, zulip |
| `{dir}/{ns}/{locale}.json` | 2 | Folo, automa(로케일 디렉터리 안 네임스페이스) |
| `{dir}/<prefix><sep>{locale}.<ext>` | 3 | discourse, gitea, jitsi-meet |
| 지원 포맷 + 단일 로케일 | 1 | n8n (정책상 미탐지) |
| 미지원 | 3 | pdf.js(ftl), Stirling-PDF(properties), obsidian-translations(txt) |

**정답은 어댑터를 고치기 전에, 리포 트리를 직접 읽어 적었다.** 20개 전부 blobless clone으로
`git ls-tree`를 떠서 로케일 디렉터리와 파일명을 눈으로 확인했다 — 탐지 결과를 정답으로 되쓰면
오탐률이 정의상 0이 된다.

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


## 커밋 고정 (2026-10-19, mobile-strings M0)

위 수집은 매번 최신 HEAD를 받는다. 회귀 비교용으로 리포별 커밋 SHA를 사이드카 JSON에 고정했다 — `pins.json`(`repos.txt` 109개) · `pins-heldout.json`(`repos-heldout.txt` 20개). 목록 파일 자체는 그대로다.

```sh
pnpm adapter-survey docs/adapter-survey/repos.txt --verdicts docs/adapter-survey/verdicts.json --write-pins docs/adapter-survey/pins.json   # 기록(최신 HEAD)
pnpm adapter-survey docs/adapter-survey/repos.txt --verdicts docs/adapter-survey/verdicts.json --pins docs/adapter-survey/pins.json         # 고정 SHA로 재측정
```

고정한 SHA를 fetch하지 못하거나 체크아웃에 실패한 리포는 HEAD로 물러나지 않고 `failure`다(`--write-pins`에도 안 들어간다). pins에 없는 리포(목록에 새로 더한 것)는 최신 HEAD로 돈다 — 새 리포를 더하면 `--write-pins`로 다시 기록한다.

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


---

## 모바일 코퍼스 — 60개 (2026-10-19, mobile-strings M1)

**목록: [repos-mobile.txt](./repos-mobile.txt) 48개 / [repos-mobile-heldout.txt](./repos-mobile-heldout.txt) 12개 ·
정답: [verdicts-mobile.json](./verdicts-mobile.json) / [verdicts-mobile-heldout.json](./verdicts-mobile-heldout.json) ·
커밋: [pins-mobile.json](./pins-mobile.json) / [pins-mobile-heldout.json](./pins-mobile-heldout.json)**

arb·apple-strings·android-strings 세 어댑터 스펙이 같이 쓰는 코퍼스다. 위 두 코퍼스(109·20개)와 겹치지 않는다.

### 수집 방법

2026-10-19 보급률 표본(1,397개)의 원 리포 목록이 남지 않아 같은 기준으로 다시 모았다. 표본과 같은 리포는 아니다.

1. **후보** — 언어 5종 × 스타 3구간 × 2쪽(쪽당 50개, 스타순) 리포 검색. 1,470개가 나왔고 중복을 빼면 1,347개다.

   ```sh
   gh api -X GET search/repositories -f sort=stars -f per_page=50 -f page=<1|2> \
     -f q="language:<L> stars:<S> pushed:>=2026-04-01 fork:false archived:false"
   # L ∈ Dart · Swift · Kotlin · Java · Objective-C
   # S ∈ >2000 · 100..2000 · 10..99
   ```

   이름·설명·토픽에 template·starter·boilerplate·tutorial·example·sample·demo·course·learn·awesome·interview·exercise·homework·cheat·leetcode가
   있거나 GitHub 템플릿 리포인 것은 뺐다. 코드 검색(`path:`·`filename:`)은 스타·push 날짜로 거를 수 없고 결과가 1,000개에서 잘려 쓰지 않았다.
2. **보유 판정** — 리포마다 `git/trees/<기본 브랜치>?recursive=1`로 경로를 받아(잘린 트리 9개는 그대로 판정) 경로 정규식으로 분류했다.
   보유한 리포는 584개다.

   | 생태계 | 경로 정규식 |
   |---|---|
   | ARB | `(^\|/)[^/]+\.arb$` |
   | Apple | `\.lproj/[^/]+\.strings$` 또는 `\.xcstrings$` |
   | Android | `(^\|/)res/values(-[^/]+)?/strings\.xml$` |
3. **추출** — 생태계 × 구간마다 시드 `20261019`로 섞은 뒤 순서대로 뽑았다(ARB → Android → Apple, 앞에서 뽑힌 리포 제외).
   대부분은 **로케일 2개 이상인 묶음**(ARB 디렉터리 파일 2개 이상 · Base를 뺀 `.lproj` 로케일 2개 이상 또는 xcstrings · `values{,-*}` 2개 이상)이
   있는 리포에서 뽑았고, 생태계마다 몇 개는 그런 묶음이 없는 리포에서 뽑았다(Android 3 · Apple 5). 그 리포들은 미탐지가 정답인지 시험한다.
   보유만으로 뽑으면 Xcode 템플릿 `en.lproj/InfoPlist.strings` 하나뿐인 리포가 Apple의 다수가 돼서다.
   연습 프로젝트(설명에 "练习"·practice)와 데모 리포 하나(`load_more_flutter_BLoC_pattern_RxDart_and_RxRedux`)는 같은 구간의 다음 후보로 바꿨다.
4. **학습/홀드아웃** — 뽑힌 생태계별로 시드 `20261019`로 ~20%(ARB 2 · Android 4 · Apple 6)를 홀드아웃으로 먼저 떼었다. 탐지기 출력을 보기 전이다.

수집 스크립트와 중간 산출물(후보·트리 분류·추출)은 커밋하지 않았다(`.scratch/orch-mobile-strings/m1-collect/`).

### 분포

리포 하나가 여러 생태계를 보유하면 각 생태계에 한 번씩 센다(Flutter 앱의 `ios/Runner/*.lproj`·`android/.../values`가 대표 사례다).

| | 학습 | 홀드아웃 | 계 | 구간 A(>2k) / B(100~2k) / C(<100) |
|---|---|---|---|---|
| 리포 | 48 | 12 | **60** | 23 / 22 / 15 |
| ARB 보유 | 10 | 4 | **14** | 6 / 5 / 3 |
| Apple 보유 | 27 | 7 | **34** | 14 / 11 / 9 |
| Android 보유 | 22 | 8 | **30** | 9 / 13 / 8 |
| 두 생태계 이상 보유 | 9 | 5 | **14** | |
| 정답 `null` | 8 | 1 | **9** | |

ARB는 계획(9)보다 많다. Flutter 앱이 Android·Apple 쪽으로도 뽑혀서다. C 구간의 최저 스타는 67이다(검색 범위가 `10..99`라 C<10은 없다).

정답 포맷: Android XML 19 · ARB 14 · xcstrings 9 · `.strings` 8 · json-catalog 1(mit-cml/appinventor-sources — 모바일 파일은 부속뿐이다) · `null` 9
(`no-catalog` 5 · `vendored-only` 3 · `fixture-only` 1).

### 판정 규칙 (verdicts-mobile*.json)

기존 판정 파일과 필드가 같고 **Android만 `basePath`를 더한다** — `correctCatalogPath`가 `…/values-{locale}/strings.xml`, `basePath`가 `…/values/strings.xml`이다
(survey의 `basePath` 비교 배선은 android-strings T3.2). 정답은 리포 트리와 파일 원문을 보고 적었고 탐지기 출력을 정답으로 되쓰지 않았다.

- ARB는 파일명 접두사까지 템플릿에 넣는다(`lib/l10n/app_{locale}.arb`·`intl_{locale}.arb`). xcstrings는 로케일이 파일 안에 있어 파일 경로 자체가 정답이다.
- 표면이 여럿이면 앱 UI 카탈로그를 대표로 두고, 같은 로케일 집합의 진짜 카탈로그는 `alsoValid`에 둔다(멀티모듈 SDK·기능 모듈·InfoPlist 권한 문구).
  번역 도구 잔여물·빈 템플릿·변형 소스셋(`src/debug` 등)·샘플·픽스처·벤더 사본·빌드 산출물은 `alsoValid`에 넣지 않고 note에만 적는다.
- `null`은 기존 관례대로 **우리가 다룰 카탈로그가 없다**는 뜻이고 `unsupported`가 이유다: `no-catalog`(빈 템플릿·base만 있는 테스트 앱) ·
  `vendored-only`(Sparkle 같은 벤더 프레임워크 사본뿐) · `fixture-only`(테스트 픽스처뿐).

### 세 건수 (spec 완료 조건 2)

코퍼스 60개의 `.lproj/*.strings` 전수를 바이트로 읽고 xcstrings 전수를 JSON으로 읽었다(sparse checkout으로 받은 HEAD 기준 — `pins-mobile*.json`과 같은 커밋).

1. **UTF-16 `.strings` 리포 6개** — BOM `FF FE`·`FE FF`이거나 NUL이 바이트의 1/4을 넘는 파일. UTF-8 BOM 파일은 0개다.
   **정답 카탈로그가 UTF-16인 리포는 0개이고 6개 모두 부속 파일이다**:
   Hammerspoon(`Pods/Sparkle` 35) · gnachman/iTerm2(`ThirdParty/Sparkle.framework` 64 + CoreParse 1) · wanderingstan/Lifeslice(Sparkle 사본·템플릿 98) ·
   ResearchKit(`samples/ORKCatalog` 41) · TelegramMessenger/Telegram-iOS(`third-party/libjxl` 1) · Alinto/sope(템플릿 1).
   이 수는 survey가 아니라 위 바이트 검사로 셌다(M1 당시 survey는 NUL이 든 파일을 건너뛰었다). M3 뒤 같은 SHA로 241파일을 디코드하면 219파일이
   바이트까지 왕복하고, 22파일(Lifeslice)은 UTF-16이 아니라 바이너리 plist(`bplist00`)라 명시 실패한다 — NUL 비율 판별이 바이너리도 후보로 셌다.
2. **`Base.lproj/Localizable.strings` 리포 1개** — ResearchKit(`samples/ORKCatalog/…/Base.lproj/Localizable.strings`, 샘플 앱).
   `Base.lproj`에 다른 테이블이 있는 리포까지 세면 4개다(Hammerspoon·Lifeslice — Sparkle 사본 · openfoodfacts/smooth-app — `InfoPlist.strings`).
3. **xcstrings 원문 셀 없는 키 21.7%** — xcstrings 97개 파일(10개 리포, `sourceLanguage`는 전부 `en`)의 키 10,237개 중 2,218개가
   `localizations`에 원문 언어 셀이 없다. `shouldTranslate: false`인 24개를 빼면 2,210 / 10,213(21.6%)이다.
   리포별로 갈린다: 원문 셀이 전부 있는 곳은 iTerm2(7,072키)·Loop(429키) 둘이고, 대부분 비는 곳은 Shotnix 1,710/1,780 · Applite 259/269 · SwiftUIKit 6/6이다.
   키 자체가 원문이어서 셀을 비우는 Xcode 기본 동작이다.

### 이미 드러난 것

- **로케일 수가 가장 많은 묶음이 정답이 아닌 리포가 많다** — firebase/FirebaseUI-iOS(84로케일 `samples/`, 정답은 라이브러리 xcstrings) ·
  Hammerspoon·iTerm2·Lifeslice(Sparkle 30여 로케일) · ResearchKit(샘플 41 대 프레임워크 39) · aves·pixez(ARB가 정답인데 Android·Apple 묶음이 같이 있다).
  모바일 어댑터의 "가장 큰 묶음" 판정이 이 리포들에서 오탐을 낸다.
- **Compose Multiplatform 리소스가 `res/` 밖에 산다** — meshtastic/Meshtastic-Android의 41로케일 카탈로그가
  `core/resources/src/commonMain/composeResources/values-{locale}/strings.xml`이다. 보급률 표본의 경로 정규식(`res/values`)은 이 리포를 base만 있는 리포로 셌다.
- **Android 모듈이 `src/main` 없이 `<모듈>/res`를 쓴다** — stripe-android(전 모듈) · habitica-android(`Habitica/res`) · moedict-webkit(`android/res`).
- **`.strings`가 old-style 텍스트만은 아니다** — OMARVII/Shotnix의 `.strings` 6개는 XML plist이고 Lifeslice에는 바이너리 plist(`bplist`) 36개가 있다.
  둘 다 정답 카탈로그는 아니다(빌드 산출물·벤더 사본).
- **기존 어댑터 후보는 전부 오탐이었다** — 학습 5개·홀드아웃 3개 리포에서 json-catalog·yaml-catalog가 후보를 냈다. 정답이 json-catalog인
  appinventor는 3순위이고(앞의 두 후보는 `node_modules/**/yargs/locales`), 나머지 7개의 1순위는 카탈로그가 아닌 JSON·YAML이다 —
  설정(eros_fe `jsons/`) · 애니메이션(Telegram `Animations/`) · 테스트 응답(stripe `androidTest/resources`) · 공지(butler `motd/`) ·
  문서 사이트 데이터(CodenameOne `scripts/video-builder`·`docs/website`) · 벤더 워크플로(pixez `plugins/rhttp/.forgejo/workflows`) ·
  자체 덮어쓰기 형식(Shotnix `Localization/translations/` — 키→{언어:값} 다국어 객체).

### 검수 대기 판정 (기능 `/merge` 전 사용자 검수 — android-strings T5.6)

M1이 원문을 보고 정했지만 정답이 갈릴 수 있는 것들이다. 검수에서 바뀌면 판정 JSON을 고치고 재측정한다.

**2026-10-20 사용자 검수 — 아래 9건 모두 현재 판정 유지**(NewPipe composeResources `alsoValid` 포함, Meshtastic은 android-strings 결정 2로 해소). 판정 JSON 변경·재측정 없음.

- **mit-cml/appinventor-sources** — 모바일 파일은 Settings.bundle 1항목뿐이다. 정답을 블록 편집기 `messages_{locale}.json`(json-catalog, 21로케일)으로 뒀다. `null`(`no-catalog`)일 수도 있다.
- **OMARVII/Shotnix** — 정답 `Localization/Localizable.xcstrings`. `scripts/localize.py`가 `Localization/translations/*.json`(자체 형식)으로 덮어쓰므로 사람이 실제로 고치는 곳은 그 JSON일 수 있다.
- **TelegramMessenger/Telegram-iOS** — 정답 `Telegram/Telegram-iOS/{locale}.lproj/Localizable.strings`(en 하나, 13,386항목 — 번역은 서버 배포), 19로케일 `InfoPlist.strings`는 `alsoValid`.
- **meshtastic/Meshtastic-Android** — 정답이 `composeResources/values-{locale}/strings.xml`이다. Android 어댑터가 이 경로를 범위에 넣을지는 android-strings T3.4 전에 정한다.
- **대표가 애매한 멀티모듈** — stripe/stripe-android(`paymentsheet/res`, alsoValid 10) · d4rken-org/butler(`app`, alsoValid 13) · pass-with-high-score/universal-installer(`app` — 문자열은 tv·core가 더 많다) ·
  didi/DoKit(`Android/dokit`, alsoValid 5) · gnachman/iTerm2(5,020키 `xcstrings/Localizable.xcstrings`, XIB별 xcstrings 73개 중 alsoValid 2) · objective-see/LuLu(같은 꼴).
- **codenameone/CodenameOne** — `vendored-only`(Zooz 결제 SDK 번들 + base만 있는 호환 샘플).
- **deckerst/aves** — 정답 ARB, Android values(57로케일 · 9문자열 — 위젯·바로가기)는 `alsoValid`.
- **TeamNewPipe/NewPipe** — 정답 `app/src/main/res/values-{locale}/strings.xml`(112로케일). KMP로 옮기는 중인 `shared/src/commonMain/composeResources/values-{locale}/strings.xml`
  (110로케일)을 `alsoValid`로 더했다(android-strings orch 결정 16) — Android 탐지는 로케일 수로 그쪽을 1순위로 낸다. 진짜 카탈로그인지·대표가 바뀌어야 하는지 검수한다.

### 실행

```sh
pnpm adapter-survey docs/adapter-survey/repos-mobile.txt --verdicts docs/adapter-survey/verdicts-mobile.json --pins docs/adapter-survey/pins-mobile.json
pnpm adapter-survey docs/adapter-survey/repos-mobile-heldout.txt --verdicts docs/adapter-survey/verdicts-mobile-heldout.json --pins docs/adapter-survey/pins-mobile-heldout.json
```

2026-10-19 `--write-pins`로 기록한 뒤 `--pins`로 다시 돌렸다. 두 번 모두 clone 실패 0(48/48 · 12/12)이었다. 모바일 어댑터가 아직 없어 정답 포맷 탐지는 0이다.

| 리포 | 분할 | 구간 | ★ | 보유 | 정답 포맷 |
|---|---|---|---|---|---|
| [2dust/v2rayNG](https://github.com/2dust/v2rayNG) | 학습 | A | 64,236 | Android | Android XML |
| [android/security-certification-resources](https://github.com/android/security-certification-resources) | 학습 | C | 99 | Android | — (no-catalog) |
| [Baka-SU/BakaSU](https://github.com/Baka-SU/BakaSU) | 학습 | B | 1,922 | Android | Android XML |
| [begugla0/sni-pinger](https://github.com/begugla0/sni-pinger) | 학습 | C | 95 | Android | Android XML |
| [cake-tech/cake_wallet](https://github.com/cake-tech/cake_wallet) | 학습 | B | 1,982 | ARB | ARB |
| [codenameone/CodenameOne](https://github.com/codenameone/CodenameOne) | 학습 | B | 1,884 | Apple·Android | — (vendored-only) |
| [danielsaidi/SwiftUIKit](https://github.com/danielsaidi/SwiftUIKit) | 학습 | B | 1,753 | Apple | xcstrings |
| [deckerst/aves](https://github.com/deckerst/aves) | 학습 | A | 5,397 | ARB·Android | ARB |
| [didi/DoKit](https://github.com/didi/DoKit) | 학습 | A | 20,416 | Apple·Android | Android XML |
| [erosTeam/eros_fe](https://github.com/erosTeam/eros_fe) | 학습 | C | 88 | ARB·Apple·Android | ARB |
| [ethereal-developers/OpenScan](https://github.com/ethereal-developers/OpenScan) | 학습 | B | 1,842 | ARB·Android | ARB |
| [firebase/FirebaseUI-iOS](https://github.com/firebase/FirebaseUI-iOS) | 학습 | B | 1,591 | Apple | xcstrings |
| [g0v/moedict-webkit](https://github.com/g0v/moedict-webkit) | 학습 | B | 653 | Apple·Android | .strings |
| [gnachman/iTerm2](https://github.com/gnachman/iTerm2) | 학습 | A | 18,191 | Apple | xcstrings |
| [google/google-api-objectivec-client-for-rest](https://github.com/google/google-api-objectivec-client-for-rest) | 학습 | B | 860 | Apple | — (no-catalog) |
| [GopeedLab/gopeed](https://github.com/GopeedLab/gopeed) | 학습 | A | 27,001 | ARB | ARB |
| [gskinnerTeam/flutter-wonderous-app](https://github.com/gskinnerTeam/flutter-wonderous-app) | 학습 | A | 4,518 | ARB | ARB |
| [gunnerkidBT/TwitchAdBlock](https://github.com/gunnerkidBT/TwitchAdBlock) | 학습 | C | 99 | Apple | .strings |
| [HabitRPG/habitica-android](https://github.com/HabitRPG/habitica-android) | 학습 | B | 1,831 | Android | Android XML |
| [Hammerspoon/hammerspoon](https://github.com/Hammerspoon/hammerspoon) | 학습 | A | 16,297 | Apple | — (vendored-only) |
| [hari161008/Ever-Call-Recorder](https://github.com/hari161008/Ever-Call-Recorder) | 학습 | C | 98 | Android | Android XML |
| [HD838A/remote-mic-app](https://github.com/HD838A/remote-mic-app) | 학습 | B | 1,945 | Apple | .strings |
| [ianyh/Amethyst](https://github.com/ianyh/Amethyst) | 학습 | A | 16,294 | Apple | — (no-catalog) |
| [InteractionEngineer/PayForMe](https://github.com/InteractionEngineer/PayForMe) | 학습 | C | 95 | Apple | .strings |
| [itouch2/PhotoTweaks](https://github.com/itouch2/PhotoTweaks) | 학습 | B | 1,247 | Apple | .strings |
| [jesther-ai/open-u60-pro](https://github.com/jesther-ai/open-u60-pro) | 학습 | C | 96 | Apple·Android | Android XML |
| [krille-chan/fluffychat](https://github.com/krille-chan/fluffychat) | 학습 | A | 3,213 | ARB·Apple | ARB |
| [Kunzisoft/KeePassDX](https://github.com/Kunzisoft/KeePassDX) | 학습 | A | 7,498 | Android | Android XML |
| [LegadoTeam/legado](https://github.com/LegadoTeam/legado) | 학습 | B | 1,566 | Android | Android XML |
| [likelikeslike/ViPER4Windows](https://github.com/likelikeslike/ViPER4Windows) | 학습 | C | 88 | ARB | ARB |
| [meshtastic/Meshtastic-Android](https://github.com/meshtastic/Meshtastic-Android) | 학습 | B | 1,876 | Android | Android XML |
| [milanvarady/Applite](https://github.com/milanvarady/Applite) | 학습 | A | 7,090 | Apple | xcstrings |
| [mit-cml/appinventor-sources](https://github.com/mit-cml/appinventor-sources) | 학습 | B | 1,749 | Apple | json-catalog |
| [mrkai77/Loop](https://github.com/mrkai77/Loop) | 학습 | A | 11,807 | Apple | xcstrings |
| [objective-see/LuLu](https://github.com/objective-see/LuLu) | 학습 | A | 13,356 | Apple | xcstrings |
| [OMARVII/Shotnix](https://github.com/OMARVII/Shotnix) | 학습 | C | 94 | Apple | xcstrings |
| [openfoodfacts/smooth-app](https://github.com/openfoodfacts/smooth-app) | 학습 | B | 1,436 | ARB·Apple·Android | ARB |
| [pass-with-high-score/universal-installer](https://github.com/pass-with-high-score/universal-installer) | 학습 | B | 1,581 | Android | Android XML |
| [ResearchKit/ResearchKit](https://github.com/ResearchKit/ResearchKit) | 학습 | A | 5,751 | Apple | .strings |
| [rickytan/RTRootNavigationController](https://github.com/rickytan/RTRootNavigationController) | 학습 | A | 2,148 | Apple | — (no-catalog) |
| [StanfordBDHG/HealthGPT](https://github.com/StanfordBDHG/HealthGPT) | 학습 | B | 1,963 | Apple | xcstrings |
| [stripe/stripe-android](https://github.com/stripe/stripe-android) | 학습 | B | 1,549 | Android | Android XML |
| [swiftlang/swift-package-manager](https://github.com/swiftlang/swift-package-manager) | 학습 | A | 10,235 | Apple | — (fixture-only) |
| [team-spotube/spotube](https://github.com/team-spotube/spotube) | 학습 | A | 50,090 | ARB | ARB |
| [TeamNewPipe/NewPipe](https://github.com/TeamNewPipe/NewPipe) | 학습 | A | 40,188 | Android | Android XML |
| [tiann/KernelSU](https://github.com/tiann/KernelSU) | 학습 | A | 19,399 | Android | Android XML |
| [vanniktech/Emoji](https://github.com/vanniktech/Emoji) | 학습 | B | 1,643 | Android | Android XML |
| [wanderingstan/Lifeslice](https://github.com/wanderingstan/Lifeslice) | 학습 | C | 90 | Apple | — (vendored-only) |
| [Alinto/sope](https://github.com/Alinto/sope) | 홀드아웃 | C | 73 | Apple | — (no-catalog) |
| [b123400/xliffie](https://github.com/b123400/xliffie) | 홀드아웃 | C | 67 | Apple | xcstrings |
| [d4rken-org/butler](https://github.com/d4rken-org/butler) | 홀드아웃 | C | 97 | Android | Android XML |
| [exelban/stats](https://github.com/exelban/stats) | 홀드아웃 | A | 42,636 | Apple | .strings |
| [JHubi1/ollama-app](https://github.com/JHubi1/ollama-app) | 홀드아웃 | B | 1,816 | ARB | ARB |
| [jonjomckay/fritter](https://github.com/jonjomckay/fritter) | 홀드아웃 | B | 1,449 | ARB·Android | ARB |
| [libre-tube/LibreTube](https://github.com/libre-tube/LibreTube) | 홀드아웃 | A | 12,844 | Android | Android XML |
| [mueller-ma/NFCReader](https://github.com/mueller-ma/NFCReader) | 홀드아웃 | C | 97 | Android | Android XML |
| [Notsfsssf/pixez-flutter](https://github.com/Notsfsssf/pixez-flutter) | 홀드아웃 | A | 13,130 | ARB·Apple·Android | ARB |
| [nowubh/Mono-Dash](https://github.com/nowubh/Mono-Dash) | 홀드아웃 | C | 90 | ARB·Apple·Android | ARB |
| [rosuH/EasyWatermark](https://github.com/rosuH/EasyWatermark) | 홀드아웃 | B | 1,902 | Apple·Android | Android XML |
| [TelegramMessenger/Telegram-iOS](https://github.com/TelegramMessenger/Telegram-iOS) | 홀드아웃 | A | 9,260 | Apple·Android | .strings |

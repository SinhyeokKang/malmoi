# mit-license — design

## 영향 받는 흐름

push·편집 UI·pull의 **동작**에는 붙지 않는다. 바뀌는 것은 리포 메타데이터(`LICENSE`·`package.json`·README),
정적 자산(`public/flags/` 253개 + `LICENSE`), 주석(`lib/keys/flag.ts`·`flag-assets.test.ts`·`components/ui/table.tsx`),
문서(CLAUDE·DIRECTORY·DESIGN)다. 화면에 보이는 변화는 국기 색뿐이다.

## 범위 게이트

- PRODUCT §4.2·§4.3 어디에도 라이선스·공개 정책 항목이 없다 → **통과**. 제품 기능이 아니라 PRODUCT.md 갱신도 필요 없다.
- ARCHITECTURE §0 불변식과 무관 — 머지·동기화 로직을 만들지 않는다.

## 순수 함수로 분리 가능한 부분

**없다.** 인터페이스가 새로 생기지 않는다(CLAUDE.md "테스트 우선"은 신규 함수·헬퍼·어댑터 대상).
국기 교체의 자동 게이트는 기존 `flag-assets.test.ts`(목록 ↔ `public/flags/*.svg` 양방향 대조)가 그대로 맡는다.

⚠️ "LICENSE와 package.json이 같은가"를 고정하는 테스트는 **만들지 않는다** — 두 값이 갈릴 경로가 사람 손 하나뿐이고,
확장성 선반영 금지(CLAUDE.md 작업 원칙)에 걸린다.

## 파일 설계

### `LICENSE`

MIT 표준 전문, `Copyright (c) 2026 Sinhyeok Kang` — `~/code/bugshot-2/LICENSE`와 **바이트 동일**하게 둔다(저작권자·연도가 같다).

- ⚠️ **전문에 예외 조항을 덧붙이지 않는다** — licensee가 유사도로 판정하므로 문장을 더하면 `licenseInfo`가 `other`/`null`로 떨어진다.
- licensee는 **루트 파일만** 본다 — `public/flags/LICENSE`가 판정에 섞이지 않는다.

### `package.json`

`"license": "MIT"` 한 줄. `"private": true` 바로 아래. `"private"`는 **그대로 둔다** — 지우면 실수 `pnpm publish` 방어가 사라진다.

### `README.md` — `## License` 절

맨 끝(`## The name` 뒤). 초안:

```md
## License

[MIT](LICENSE). Country flags in `public/flags/` are from
[country-flag-icons](https://gitlab.com/catamphetamine/country-flag-icons) (MIT).
```

- ⚠️ **README의 사실 정본은 PRODUCT·가이드·`/privacy`이다**(CLAUDE.md 문서 지도) — 이 절은 LICENSE가 정본이고 README가 요약한다.
- shadcn 고지는 README가 아니라 **복사본 옆**(파일 헤더)에 둔다 — MIT는 "substantial portions"에 고지를 요구하고, README 크레딧은 그 요건이 아니다.

### 국기 교체 — `public/flags/`

| 항목 | 사실 (2026-09-27 전수 대조) |
|---|---|
| 현재 | Figma 커뮤니티 export(`clip-path` id, 루트 `width`/`height`). 작성자·라이선스 불명. 원본 세트에 `GE-AB`·`GE-OS`가 있었다(`flag.ts:24-25`) |
| 교체 원본 | `country-flag-icons@1.6.20` `3x2/` — MIT, `Copyright (c) 2020 @catamphetamine`. 2026-07-01 publish라 `minimumReleaseAge`와 무관 |
| 코드 대응 | 우리 253개 **전부** upstream에 있다(대문자 파일명). upstream SVG는 265개 — 12개(`bq-*`·`es-ct`·`gb-*` 4·`ic`·`xa`·`xc`·`xo`)는 안 들인다. `GE-AB`·`GE-OS`는 upstream에 없다(`XA`·`XO`로 바뀌었다) |
| 바이트 | 동일 파일 0개. 합계 1.1M → 1.0M |
| viewBox | 비율은 **전부 3:2**. 513×342는 191개이고 나머지는 `0 85.333 512 341.333`·`0 0 22.5 15`·`900 600` 등. 루트 `width`/`height` 없음 — viewBox로 고유 비율이 나와 `bg-cover`가 정상이다 |
| 색 | **약 90개가 공식 색에 가까운 팔레트로 바뀐다**(흰·검정 표기 차이만인 60여 개 제외). 대표 `gb` `#0052B4`/`#D80027` → `#012169`/`#C8102E`, `fr`·`it`(흰색 → `#F4F5F0`)·`ru`·`pl`·`pt`·`no`·`se`·`ro`·`in`. `kr`·`jp`·`us`·`np`는 같다. **2026-09-27 사용자 수용** |
| 렌더 경로 | `LocaleFlag`(`locale-badge.tsx` — `background-image` + `bg-cover bg-center`) 외에 **`components/publish-button.tsx:289`가 `<img src=/flags/…>`로 직접 그린다** — 비교 대상에 따로 넣는다 |

Figma 파일이 upstream 구버전의 파생일 가능성은 있지만(코드 체계·3:2 비율 일치) **증명할 수 없다** — 그게 교체 이유다.

- **복사 규칙**: 현재 `public/flags/*.svg`의 파일명을 대문자로 바꿔 `3x2/`에서 하나씩 가져온다. 디렉터리 통째 복사 금지 —
  `flags.css`·`flags.zip`은 `flag-assets.test.ts`가 `.svg`만 세서 **딸려 와도 green**이다.
- **의존성으로 추가하지 않는다** — `npm pack`으로 받아 파일만 복사한다(lockfile 불변).
- `public/flags/LICENSE`는 **upstream 원문 그대로**(`(The MIT License)` / `Copyright (c) 2020 @catamphetamine`). 버전을 이 파일에 쓰지 않는다 —
  출처·버전은 커밋 메시지와 `lib/keys/flag.ts` docstring에 둔다.
- 교체로 거짓이 되는 주석: `lib/keys/flag.ts:19-25`("2026-09-11 사용자 에셋", "`GE-AB`·`GE-OS`는 뺐다 — 원본 세트에 있지만"),
  `lib/keys/__tests__/flag-assets.test.ts:38-41`(같은 서술). 새 원본 기준으로 고쳐 쓴다 — 테스트 로직은 그대로.
- upstream README의 Wikipedia 복사 크레딧은 추가 의무를 만들지 않는다(단색 줄무늬류, 재배포 조건은 upstream MIT로 수렴).

### shadcn 고지 — `components/ui/`

| 파일 | 현재 | 할 일 |
|---|---|---|
| `table.tsx:6-7` | "shadcn/ui `new-york-v4` Table 기반" + 원본 URL | 헤더 주석에 `Portions Copyright (c) 2023 shadcn — MIT` 한 줄(허가 문구는 루트 LICENSE와 같은 MIT) |
| `empty-state.tsx:9` | "구조만 1:1" | 원본과 클래스 문자열 diff로 판정 — 복제면 같은 고지, 구조 참고면 없음 |
| `select.tsx:12` | "shadcn 형으로 리워크" | 같음 |

### `CLAUDE.md:19`

"사내 로컬라이제이션 관리 도구" → "로컬라이제이션 관리 도구". `AGENTS.md` 미러는 `pnpm sync:agents`로 따라온다.
`PRODUCT.md:22`의 "첫 번역 편집자는 사내 비개발자 동료"는 과거 사실 서술이라 둔다.

### 문서 등재

- `docs/DIRECTORY.md:613` — `LICENSE` 루트 등재, flags 줄의 "커밋된 원본"에 출처(`country-flag-icons@1.6.20` · `public/flags/LICENSE`) 한 마디.
- `docs/DESIGN.md:492` — "국기 SVG 253개 — 우리가 고른 색이 아니다"의 **규칙은 유지**하고 출처 한 마디를 붙인다. `:239`(radius 근거)는 그대로.

## 스키마 변경

없음.

## 새 환경변수

없음.

## 불변식 영향

없음. 국기는 export·blob SHA·인증 경로에 없다(소비자는 `LocaleFlag`의 `background-image`와 Publish의 `<img>`).
`public/flags/LICENSE`는 어떤 테스트도 깨지 않는다 — `flag-assets.test.ts:20-24`는 `.svg`만 걸러 세고,
`brand-spelling`·`no-korean-ui`는 `app`·`components`·`lib`·`messages` + 루트 `auth.ts`·`middleware.ts`만 훑는다.

⚠️ 대상 리포가 참조하는 `@malmoi-i18n-push-v1` 태그 트리에는 LICENSE가 없다(`git ls-tree -r` 확인). 태그를 옮기지 않는다 — spec 비목표.

## POSTMORTEM

`licen`·`flag`·`국기` grep 결과 관련 회고 없음.

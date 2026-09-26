# mit-license — spec

## 사용자

**리포 방문자·기여자**(제3자)와 **개발자(나)**. 번역 편집자에게는 **국기 색만** 바뀐다 — 국기 약 90개가
공식 색에 가까운 팔레트로 다시 칠해진 세트로 교체된다(대표: `gb` 남색이 어두워진다). 동작은 바뀌지 않는다.

## 문제 (관측된 사실)

- 리포가 2026-09-18부터 **public**인데 라이선스 파일이 없다 — `gh repo view --json licenseInfo` → `null`.
  라이선스가 없는 공개 코드는 기본값이 "모든 권리 보유"라, 방문자는 읽을 수만 있고 fork·수정·재사용할 법적 근거가 없다.
- `package.json`에 `license` 필드가 없다(`"private": true`만 있다).
- README에 라이선스 절이 없다.
- `public/flags/` 253개는 **Figma 커뮤니티 공개 파일**에서 받았고 작성자·라이선스가 기록돼 있지 않다(2026-09-27 사용자).
  Figma 커뮤니티 파일의 기본 조건은 CC BY 4.0(저작자 표시 의무)이라, 그대로 두면 MIT 선언 옆에 조건을 충족할 수 없는 자산이 남는다.
- `components/ui/table.tsx:6-7`이 shadcn/ui(MIT) `new-york-v4` Table 기반인데 저작권 고지가 없다.
- `CLAUDE.md:19`가 이 프로젝트를 "**사내** 로컬라이제이션 관리 도구"라 부른다 — 개인 프로젝트이고(2026-09-27 사용자) 개인 명의 LICENSE와 어긋난다.

## 완료 조건

1. 루트 `LICENSE`가 **MIT 표준 전문**, `Copyright (c) 2026 Sinhyeok Kang`이고 `diff ~/code/bugshot-2/LICENSE LICENSE`가 빈 출력이다.
   `/merge` 뒤 `gh repo view --json licenseInfo`가 `{"key":"mit",…}`을 돌려준다(default branch가 `main`이라 그 전에는 안 보인다).
2. `package.json`에 `"license": "MIT"`가 있다. `"private": true`는 유지된다.
3. README 맨 끝(`## The name` 뒤)에 `## License` 절이 있고 LICENSE로 링크하며, 국기 크레딧 한 줄을 단다.
4. `public/flags/`의 SVG 253개가 `country-flag-icons@1.6.20` `3x2/`(MIT)의 같은 코드 파일로 교체되고,
   `public/flags/`에 SVG 아닌 파일은 원문 그대로의 `LICENSE` 하나뿐이다. `flag-assets.test.ts` green.
5. 교체 뒤 수동 비교(랜딩 목업·Publish 미리보기·번역 표·온보딩 ③ × `gb`·`fr`·`kr`·`np`)에서
   **의도한 색 변화 외에** 깨짐·잘림·빈 배경이 없다.
6. `components/ui/table.tsx` 헤더에 shadcn/ui MIT 고지가 있고, `empty-state.tsx`·`select.tsx`의 shadcn 언급은
   복제인지 구조 참고인지 판정돼 있다(복제면 같은 고지).
7. `CLAUDE.md:19`에서 "사내"가 빠지고 `pnpm sync:agents:check`가 통과한다.
8. `docs/DIRECTORY.md`에 `LICENSE`가, `docs/DESIGN.md` 국기 항목에 출처가 등재돼 있다.
9. `pnpm typecheck && pnpm test` green.

## 비목표

- **CLA·DCO·CONTRIBUTING 문서** — 기여 절차는 이번에 안 정한다(혼자 작업, 외부 PR 흐름이 아직 없다).
- **소스 파일별 SPDX 헤더** — 1,400파일에 헤더를 박지 않는다. 루트 LICENSE로 충분하다.
- **의존성 라이선스 고지 생성(THIRD-PARTY-NOTICES 자동화)** — `node_modules`는 리포에 커밋되지 않는다(재배포 아님).
- **화면(footer·랜딩)에 라이선스 표기** — 제품 UI는 건드리지 않는다.
- **브랜드 자산 제외 조항** (2026-09-27 사용자 — "굳이") — 이름·로고·KV도 MIT 범위에 그대로 둔다. 상표 정책 문서도 없다.
- **composite action 태그 `@malmoi-i18n-push-v1`에 LICENSE 넣기** — 태그 트리에는 LICENSE가 없다. 태그를 옮기는 것은 릴리스라
  라이선스 때문에 공급망 경계를 움직이지 않는다. 다음 action 릴리스 때 자연히 포함된다.
- **git 히스토리 재작성** — 옛 Figma SVG는 #34(2026-09-11)부터의 커밋과 v1 태그 트리에 남는다. 공개 리포 히스토리를 다시 쓰지 않는다.
- **가이드·README 스크린샷 재촬영** (2026-09-27 사용자) — 국기는 16×11이라 차이가 작고, `guide:check`는 소스 blob을 보므로 stale로 잡지도 않는다.
- **upstream에만 있는 12개 국기**(`bq-*`·`es-ct`·`gb-eng`·`gb-nir`·`gb-sct`·`gb-wls`·`ic`·`xa`·`xc`·`xo`) — 목록은 기존 253개 그대로다.

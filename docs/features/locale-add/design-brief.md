# Add a language — Claude Design 브리프

> **신규 UI의 첫 구현 동안만 시안이 SoT이고, dev에 들어간 뒤로는 코드 + `docs/DESIGN.md`가 정본이다.**
> 기능 정의는 `spec.md`, 데이터·판정은 `design.md`가 정본이다 — 이 문서는 그릴 것만 든다.

## 한 줄

소스 상세 모달의 **Languages 카드 머리에 [Add language]**가 생기고, 누르면 작은 Dialog에서 언어 코드를 골라 추가한다. 추가된 언어는 리포에 파일이 생길 때까지 행에 **"Not in repository yet"** 상태를 단다.

## 놓이는 자리 (실측 — `components/sources/source-detail-modal.tsx`)

- 바깥: `LargeModal`(제목 = 소스 slug, 설명 = "N keys · M languages · 포맷"). 본문 `@container space-y-4`.
- Languages `Card`(177행): `title` "Languages" · `count` · `description` `languagesHelp`(지금 "Languages come from the repository. Add or remove the files there."). **`action` 슬롯이 비어 있다 — 여기에 버튼.**
- 행(`li`): `flex items-center gap-4 px-4 py-row-y`, 구분선 `border-border border-t`. 열 셋 — ① 150px(`@max-[850px]` 120px): `LocaleFlag` + 코드 `text-base` + base면 `Badge soft-neutral` · ② 300px: 퍼센트·"x of y" `text-xs` + `Meter` · ③ flex-1 `text-xs`: 상태(`StatusBadge removedFromRepository` · `Badge soft-amber` 검토 수 · base 안내) · 끝: [Open] `ButtonLink size="sm"`.
- orphaned 행은 깃발 `opacity-50`·코드 `text-muted-foreground`·Meter `dimmed`, 카드 바닥에 `border-divider` 띠("ja was removed from the repository.").
- 모달 안 Dialog 선례: `components/sources/remove-source-dialog.tsx`(`Dialog` + `DialogContent` + `DialogClose`).

## 프리미티브 (`components/ui/` — 새로 만들지 않는다)

`Button`(카드 action, `size="sm"`) · `Dialog`/`DialogContent`/`DialogClose` · `Input`(json-catalog 코드) · `Select`(chrome-locales 지원 목록) · `FormGroup`(라벨·도움말·오류) · `Facts` 또는 `code-block`(만들 파일 경로 미리보기 — 고르는 쪽이 시안 몫) · `StatusBadge`(새 상태 `notInRepositoryYet` — 기존 `removedFromRepository`와 같은 어휘 축) · `Alert`(거부·실패). 새 색이 필요하면 DESIGN §6.2 의미 토큰으로만 — 기대하지 않는다(중립 배지).

## 상태·항목·문구

| 자리 | 상태 | 문구(en — 새 키) |
|---|---|---|
| 카드 action | OWNER · 지원 포맷 | `Add language` |
| 카드 action | EDITOR | 같은 버튼 `aria-disabled` + sr-only 이유 `Only project owners can add languages.` |
| 카드 action | 수술적 포맷(ts-dict·yaml·code-dict) | 같은 버튼 비활성 + 이유 `Languages for this format are added in the repository.` |
| 카드 description | 공통 | `Add a language here; remove it in the repository.` |
| Dialog 제목·설명 | — | `Add a language` · `Translators can start right away. Publishing creates the file in the repository.` |
| 입력 라벨 | json-catalog | `Language code` · 도움말 `For example: ja, pt-BR, zh-Hant` |
| 입력 | chrome-locales | `Select` — Chrome 지원 목록 중 이 소스에 없는 코드(코드 + 영어 이름) |
| 경로 미리보기 | 입력 유효 | `File to create` + `locales/ja.json`(pathTemplate 치환) |
| 되살림 안내 | orphaned 코드 입력 | `ja was removed from the repository. Adding it again brings back its N translations.` |
| 오류(필드) | `invalid-code` · `exists` · `similar-exists` · `too-many-locales` | `Use a language code such as ja or pt-BR.` · `ja is already in this source.` · `pt_BR is already in this source — codes can't differ only by case or separator.` · `A source can have up to 200 languages.` |
| 오류(Alert) | `archived` · 실패 | 기존 문구 재사용(보관·일반 실패) |
| 버튼 | — | `Add language`(주) · `Cancel` |
| 행 상태 | 제안 | `StatusBadge notInRepositoryYet` — 라벨 `Not in repository yet` |
| 행 상태 | 제안 · 번역 0 | 위 배지 + 행 ③에 `Publishing creates the file once it has a translation.` |

## 그릴 프레임

| # | 프레임 |
|---|---|
| 1 | Languages 카드 기본(언어 3 · base 1) + [Add language] |
| 2 | Dialog 빈 상태(json-catalog, 코드 Input) |
| 3 | Dialog 유효 입력 + 경로 미리보기 + 저장 중(버튼 loading) |
| 4 | Dialog 필드 오류(`similar-exists`) |
| 5 | Dialog chrome-locales(`Select` 열림) |
| 6 | Dialog 되살림 안내(orphaned 코드) |
| 7 | 추가 뒤 카드 — 제안 행(0%, 배지, 번역 0 안내) |
| 8 | EDITOR · 수술적 포맷 — 비활성 버튼 |
| 9 | 좁은 폭(`@max-form`) — 카드·Dialog |
| 10 | 다크 — 1·3·7 |

## 동작 주석

- [Add language] → Dialog 열림, 포커스는 코드 Input(chrome은 Select 트리거). Esc·Cancel·바깥 클릭 = 닫기(입력 버림, 확인 없음 — 저장 전 상태라).
- Enter = 추가. 저장 중엔 닫기·재제출 막음. 성공 → Dialog 닫힘, 포커스는 새 행의 [Open]으로, 카드 count +1.
- 필드 오류는 입력 아래, 입력을 고치면 사라진다. 서버 거부도 같은 자리(코드별 문구).
- IME 조합 중 Enter는 제출하지 않는다(`use-ime-guard.ts`).
- 바깥 소스 모달에 미저장 기준 언어 초안이 있으면 Dialog를 열지 않는다(기존 `draft` 이탈 확인과 같은 축) — 시안은 1에서 버튼 상태만 보이면 된다.

## 그리지 않는 것

- 언어 삭제·제안 취소 버튼(철회는 Sync 확인 창이 말한다 — 별도 프레임 없음).
- 여러 소스 동시 추가 · 여러 언어 한 번에 추가.
- 번역 화면·Publish 모달의 변화(문구 한 줄 수준 — 코드가 기존 패턴으로 든다).
- 로케일 이름 편집 · 깃발 선택.

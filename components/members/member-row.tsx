"use client";

import type { ReactNode } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { BannerLine } from "@/components/ui/row-card";
import type { MemberIdentity } from "@/lib/auth/member-identity";
import { useMessages } from "@/components/i18n/messages-provider";
import { cn } from "@/lib/utils";

/**
 * 멤버 카드와 대기 초대 카드가 **공유하는 행 껍데기** (DESIGN §6.65).
 *
 * ⚠️ **`<tr>`이 아니라 `<li>` 안의 블록이다.** 행 아래 사유 띠가 전폭이고 들여쓰기 56인데, `<tr>`
 * 형제로 넣으려면 `colSpan`을 세야 하고 **열 수가 역할별로 갈린다**(EDITOR에게는 액션 열이 없다).
 *
 * ⚠️ **텍스트가 60에서 시작한다** — `pl-3`(12) + 아바타 **32** + `gap-4`(16). 띠의 `pl-15`(60)와 같은
 * x라야 그 띠가 이 행에 속한 것으로 읽힌다. ⚠️ **아바타 32는 핸드오프가 닫은 결정이다**(*"24는 두 줄
 * 텍스트 옆에서 작다"* · 28을 유니온에 넣지 않는 근거도 같은 자리에 있다) — 2026-09-19에 한 번 24로
 * 나갔다가 캔버스 대조에서 되돌렸다.
 *
 * ⚠️ **`aria-describedby` 배선을 껍데기가 든다** — 소비자가 컨트롤을 넘기면서 그 id를 직접 알면
 * 띠가 없는 갈래에서 빈 문자열을 남기기 쉽다. 그래서 `controls`가 **id를 받는 함수**다.
 */
export function MemberRow({
  id,
  identity,
  you = false,
  meta,
  controls,
  band = null,
  glyph,
  after = null,
}: {
  /** 행 고유 키 — 띠 id를 여기서 만든다. 같은 id가 둘이면 `getElementById`가 첫 행만 답한다. */
  id: string;
  identity: MemberIdentity;
  /** 자기 자신인가. ⚠️ **`planMemberIdentity` 밖이다** — 갈래 넷과 직교다. */
  you?: boolean;
  /** 가입일·만료 같은 우측 앞 메타. **폭은 소비자가 준다** — 캔버스의 고정 열(150)이 거기 산다. */
  meta?: ReactNode;
  /**
   * 아바타 자리를 대체한다 — 대기 초대 행이 **mail 칩**을 넣는다 (캔버스 `1a`).
   * 사람이 아닌 행에 이니셜 원을 그리면 "아직 사람이 아니다"라는 사실이 사라진다.
   */
  glyph?: ReactNode;
  /**
   * 오른쪽 군. 인자는 **사유 띠의 id**이고 띠가 없으면 `undefined`다 — 꺼진 컨트롤이 그대로 넘긴다.
   */
  controls?: (describedBy: string | undefined) => ReactNode;
  /**
   * 행 아래 사유.
   *
   * ⚠️ **한 행에 띠는 항상 하나다** — 못 읽음과 마지막 오너가 겹치면 **문장 둘을 한 띠에** 싣는다.
   * 둘로 나누면 `aria-describedby`가 어느 쪽을 가리킬지 화면마다 정하게 된다.
   */
  band?: ReactNode;
  /** 사후 거부 `Alert` — 띠와 같은 자리(행 아래)다. 어느 행이 거부됐는지가 정보다. */
  after?: ReactNode;
}) {
  const m = useMessages();
  const bandId = band === null ? undefined : `band-${id}`;

  return (
    <>
      {/* ⚠️ **왼쪽 padding만 12다** (`13 14 13 12` — 세로 13은 행 한 벌, 4-W3) — 글리프가 서는 쪽이라 한 단계 좁다. */}
      {/*
        ⚠️ **640 미만은 두 줄 grid다** (responsive-app A5 · 시안 AT2) — 글리프 · 이름이 첫 줄, 메타 · 동작이 이름 아래 둘째 줄(동작은
        오른쪽)이다. 컨테이너는 `CardList`가 선언한다(선언·질의 분리, POSTMORTEM 2026-09-15). 적층은 DOM 순서 그대로라 `order`가 없다.
      */}
      <div className="flex items-center gap-4 py-row-y pr-3.5 pl-3 @max-form:grid @max-form:grid-cols-[auto_minmax(0,1fr)_auto] @max-form:gap-x-4 @max-form:gap-y-2">
        <span data-avatar className="flex shrink-0">
          {/*
            ⚠️ **씨앗이 없으면 빈 문자열을 넘긴다 — 갈래를 늘리지 않는다** (캔버스 `1a` 넷째 행).
            `Avatar`가 빈 이름에서 `?` + `hueOf("")`(sky)를 이미 내므로, 그것이 그대로 답이다.
            1행이 마스킹 주소일 때 **그 첫 글자를 쓰면 안 되는** 이유는 그대로다: 이니셜이 `y`가 되어
            셸 아바타(표시 이름에서 온 글자)와 달라지고 같은 계정이 화면마다 다른 사람으로 보인다
            (`entity-card.tsx`가 밟은 함정). 푸는 방법이 "중립 원"이 아니라 **`?`**인 것이 캔버스의 답이다.
          */}
          {glyph ?? <Avatar name={identity.avatarSeed ?? ""} src={identity.avatarImage} size={32} />}
        </span>

        {/*
          ⚠️ **이름 칸이 300 고정이다** (캔버스). 늘어나게 두면 오른쪽 메타의 x가 행마다 달라져
          "오너가 몇인지"를 세로로 훑을 수 없다 — `/projects`의 이름 칸 420과 같은 장치다.
        */}
        <span data-name className="flex w-[300px] min-w-0 shrink-0 flex-col gap-0.5 @max-form:col-span-2 @max-form:w-auto">
          <span
            data-primary
            className={cn(
              // 좁은 폭에서는 감긴다 — 잘린 주소의 전문이 `title`(터치에서 안 보인다)에만 있지 않게(spec A-06).
              "truncate text-base @max-form:whitespace-normal @max-form:wrap-anywhere",
              identity.unnamed ? "text-muted-foreground" : "font-medium",
            )}
          >
            {identity.primary}
            {/* 자기 표식은 배지다(2026-09-30 사용자 — 괄호 친 `#a3a3a3` 글자에서 바꿨다). 이름 줄 안이라 굵기를 400으로 되누르지 않는다(배지 라벨은 500). */}
            {you && <Badge variant="soft-neutral" className="ml-2 align-middle">{m.members.you}</Badge>}
          </span>
          {/* ⚠️ **2행이 없으면 그 자리를 그리지 않는다** — 빈 줄은 행 높이만 늘리고 읽을 것을 안 늘린다. */}
          {identity.secondary !== null && (
            <span data-secondary className="text-muted-foreground truncate text-sm @max-form:whitespace-normal @max-form:wrap-anywhere">
              {identity.secondary}
            </span>
          )}
        </span>

        {/*
          메타 + 동작 묶음 — 넓은 폭에서는 `contents`라 두 자식이 그대로 행의 flex 항목이다(기존 한 줄 배치). 좁은 폭에서만 이름 열에서 시작하는
          둘째 줄이 되고, 넘치면 동작이 그 아래 줄 오른쪽으로 감긴다 — 숨기지 않는다.
        */}
        <span data-row-aside className="contents @max-form:col-span-2 @max-form:col-start-2 @max-form:flex @max-form:min-w-0 @max-form:flex-wrap @max-form:items-center @max-form:gap-x-4 @max-form:gap-y-2">
          {meta}
          {/* ⚠️ **오른쪽 군의 갭이 8이다** (시안) — 행 요소 사이 16과 다른 급이라 한 군으로 읽힌다. */}
          <span className="ml-auto flex shrink-0 items-center gap-2 @max-form:flex-wrap @max-form:justify-end">{controls?.(bandId)}</span>
        </span>
      </div>

      {/* ⚠️ **톤을 받지 않는다** — 이 카드의 띠는 전부 `muted`다 (2026-09-20 사용자: *"alert 계열 말고
          그냥 일반 계열"*). 마지막 오너는 **막힌 예외가 아니라 상시 상태**라(오너가 하나면 언제나 참)
          붉은 띠가 매번 서면 경고가 배경이 된다 — 같은 이유로 `bandTone`도 그때 지웠다. */}
      {/* 들여쓰기는 글리프 폭에서 온다(4-Y13) — 아바타 32는 60, 대기 초대의 28 칸은 행 규칙 56이다. */}
      {band !== null && (
        <BannerLine id={bandId} indent={glyph === undefined ? "avatar" : "row"}>
          {band}
        </BannerLine>
      )}
      {after}
    </>
  );
}

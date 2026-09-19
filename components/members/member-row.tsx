import type { ReactNode } from "react";

import { Avatar } from "@/components/ui/avatar";
import { BannerLine } from "@/components/ui/row-card";
import type { MemberIdentity } from "@/lib/auth/member-identity";
import { m } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * 멤버 카드와 대기 초대 카드가 **공유하는 행 껍데기** (DESIGN §6.65).
 *
 * ⚠️ **`<tr>`이 아니라 `<li>` 안의 블록이다.** 행 아래 사유 띠가 전폭이고 들여쓰기 56인데, `<tr>`
 * 형제로 넣으려면 `colSpan`을 세야 하고 **열 수가 역할별로 갈린다**(EDITOR에게는 액션 열이 없다).
 *
 * ⚠️ **텍스트가 56에서 시작한다** — `pl-4`(16) + 아바타 24 + `gap-4`(16). 띠의 `pl-14`(56)와 같은 x라야
 * 그 띠가 이 행에 속한 것으로 읽힌다.
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
  after = null,
}: {
  /** 행 고유 키 — 띠 id를 여기서 만든다. 같은 id가 둘이면 `getElementById`가 첫 행만 답한다. */
  id: string;
  identity: MemberIdentity;
  /** 자기 자신인가. ⚠️ **`planMemberIdentity` 밖이다** — 갈래 넷과 직교다. */
  you?: boolean;
  /** 가입일·만료 같은 우측 앞 메타 한 줄. */
  meta?: ReactNode;
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
  const bandId = band === null ? undefined : `band-${id}`;

  return (
    <>
      <div className="flex items-center gap-4 py-3.5 pr-3.5 pl-4">
        <span data-avatar className="flex shrink-0">
          {identity.avatarSeed === null ? (
            /*
              ⚠️ **이니셜 없는 중립 원이다.** 1행이 마스킹 주소이거나 자리 채움 문구인 갈래라, 그 첫
              글자(`j`·`N`·`C`)는 사람을 가리키지 않는다 — 색까지 거기서 뽑으면 같은 계정이 화면마다
              다른 사람으로 보인다 (`entity-card.tsx`가 밟은 함정).
            */
            <span aria-hidden className="bg-foreground/[0.06] size-6 rounded-full" />
          ) : (
            <Avatar name={identity.avatarSeed} size={24} />
          )}
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            data-primary
            className={cn("truncate text-sm", identity.unnamed && "text-muted-foreground")}
          >
            {identity.primary}
            {you && <span className="text-muted-foreground ml-2 text-xs">({m.members.you})</span>}
          </span>
          {/* ⚠️ **2행이 없으면 그 자리를 그리지 않는다** — 빈 줄은 행 높이만 늘리고 읽을 것을 안 늘린다. */}
          {identity.secondary !== null && (
            <span data-secondary className="text-muted-foreground truncate text-xs">
              {identity.secondary}
            </span>
          )}
        </span>

        {meta}
        {/* ⚠️ **오른쪽 군의 갭이 8이다** (시안) — 행 요소 사이 16과 다른 급이라 한 군으로 읽힌다. */}
        <span className="flex shrink-0 items-center gap-2">{controls?.(bandId)}</span>
      </div>

      {band !== null && (
        <BannerLine id={bandId}>{band}</BannerLine>
      )}
      {after}
    </>
  );
}

import type { ReactNode } from "react";

import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/**
 * "지금 다루는 대상 하나"를 보이는 자리 (account-linking design §7).
 *
 * ⚠️ **`kind`가 없다** (design ⑩) — 이 배송의 소비자는 병합 화면 하나다. 초대의 프로젝트 카드는
 * 형이 다르고(라운드 사각 · 글리프 폴백 · 우측 국기) `components/`의 화면 조각으로 남는다.
 * **둘이 진짜 같아지는 순간** 올린다 — 선례가 `LocaleFlag`다.
 *
 * ⚠️ **이 카드는 `Avatar`를 32로만 쓴다** — 40을 요구하던 소비자를 이 배송에서 뺐다.
 * ⚠️ **"그래서 `size` union을 넓힐 이유가 없다"가 여기 적혀 있었고 2026-09-13에 낡았다** —
 * `/account` 머리의 56이 그 이유가 됐고 유니온이 넷이 됐다. **이 카드의 소비자는 안 움직인다.**
 *
 * ⚠️ **기능 디렉터리를 import하지 않는다** — 프리미티브가 `components/translations/`를 물면
 * `ui/`가 잎에 가깝다는 성질이 깨진다(`client-graph.test.ts`는 무거운 모듈만 보므로 못 막는다).
 */
export function EntityCard({
  name,
  avatarName,
  image,
  secondary,
  meta,
  className,
}: {
  name: string;
  /**
   * 아바타가 쓸 이름 — **1행 텍스트와 갈라져 있다** (2026-09-12).
   *
   * ⚠️ **둘이 같은 값이면 셸과 다른 사람처럼 보인다**: 병합 화면의 1행은 **마스킹한 이메일**이라
   * 이니셜이 주소의 첫 글자(`o***@…` → `o`)가 되는데, 셸 아바타는 표시 이름에서 온다(`s`).
   * 같은 계정이 화면마다 다른 글자·다른 색으로 보이면 아바타가 사람을 가리키지 못하고 소음이 된다.
   */
  avatarName?: string;
  /** provider가 준 프로필 이미지. 없으면 `Avatar`가 이니셜 폴백을 그린다. */
  image?: string | null;
  secondary?: ReactNode;
  /** 우측 슬롯 — provider 마크 하나가 보통이다. */
  meta?: ReactNode;
  className?: string;
}) {
  return (
    // ⚠️ radius 12는 `rounded-lg`다 — `rounded-xl`은 16이라 같은 화면의 다른 카드와 어긋난다.
    <div className={cn("border-border flex w-full items-center gap-3 rounded-lg border p-3", className)}>
      <Avatar name={avatarName ?? name} src={image} size={32} />
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="truncate text-sm">{name}</span>
        {secondary !== undefined && <span className="text-muted-foreground truncate text-xs">{secondary}</span>}
      </div>
      {/* ⚠️ 브랜드 마크는 무채색 위계의 대상이 아니다 — `--foreground`를 그대로 받는다. */}
      {meta !== undefined && <div className="flex shrink-0 items-center gap-1">{meta}</div>}
    </div>
  );
}

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
 * ⚠️ **`Avatar`를 한 줄도 안 건드린다** — 40을 요구하던 소비자를 이 배송에서 뺐으므로 `size`
 * union을 넓힐 이유가 없다.
 *
 * ⚠️ **기능 디렉터리를 import하지 않는다** — 프리미티브가 `components/translations/`를 물면
 * `ui/`가 잎에 가깝다는 성질이 깨진다(`client-graph.test.ts`는 무거운 모듈만 보므로 못 막는다).
 */
export function EntityCard({
  name,
  secondary,
  meta,
  className,
}: {
  name: string;
  secondary?: ReactNode;
  /** 우측 슬롯 — provider 마크 하나가 보통이다. */
  meta?: ReactNode;
  className?: string;
}) {
  return (
    // ⚠️ radius 12는 `rounded-lg`다 — `rounded-xl`은 16이라 같은 화면의 다른 카드와 어긋난다.
    <div className={cn("border-border flex w-full items-center gap-3 rounded-lg border p-3", className)}>
      <Avatar name={name} size={32} />
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="truncate text-sm">{name}</span>
        {secondary !== undefined && <span className="text-muted-foreground truncate text-xs">{secondary}</span>}
      </div>
      {/* ⚠️ 브랜드 마크는 무채색 위계의 대상이 아니다 — `--foreground`를 그대로 받는다. */}
      {meta !== undefined && <div className="flex shrink-0 items-center gap-1">{meta}</div>}
    </div>
  );
}

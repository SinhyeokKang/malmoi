import type { ComponentType, ReactNode } from "react";

/**
 * 빈 상태 (DESIGN §6.4·§10): 제목은 마침표 없는 짧은 구, 설명은 완전 문장 하나, **액션은 버튼 하나.**
 * 일러스트는 없고 아이콘 하나만 허용한다 (§6.8).
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      {Icon !== undefined && <Icon className="text-muted-foreground size-6" aria-hidden />}
      <p className="text-base font-medium">{title}</p>
      {description !== undefined && (
        <p className="text-muted-foreground max-w-prose text-sm">{description}</p>
      )}
      {action !== undefined && <div className="mt-2">{action}</div>}
    </div>
  );
}

import type { ComponentType, ReactNode } from "react";

/**
 * 빈 상태 (DESIGN §6.4·§10): 제목은 마침표 없는 짧은 구, 설명은 완전 문장 하나, **액션은 버튼 하나.**
 * 일러스트는 없고 아이콘 하나만 허용한다 (§6.8).
 *
 * 구조는 shadcn `Empty`(media → title → description → content)와 1:1이다 — **CLI를 돌릴 이유가
 * 없다**: Radix가 없는 순수 마크업이라 이 파일이 그 형을 그대로 든다 (규약 4).
 *
 * ⚠️ **아이콘이 원형 칩 안에 있다** (8-3 시안). 맨 아이콘은 텍스트 블록에 붙어 제목의 일부처럼
 * 읽히는데, 칩이 그것을 **그림 자리**로 만든다. 칩은 48이고 아이콘은 16이다 — 시안은 20인데
 * 아이콘 크기를 셋(16·12·24)으로 고정한 규칙이 §6.8이다.
 *
 * ⚠️ **수직 중앙은 여기서 하지 않는다** — 호출부가 `flex-1`을 가진 자리에 놓는지가 화면마다 다르고
 * (목록은 패널 전체, 표 안의 빈 상태는 그 표 안), 여기서 `h-full`을 박으면 뒤의 것이 무너진다.
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
    <div className="flex flex-col items-center gap-1 py-12 text-center">
      {Icon !== undefined && (
        <span className="bg-foreground/5 mb-3 flex size-12 items-center justify-center rounded-full">
          <Icon className="text-muted-foreground size-4" aria-hidden />
        </span>
      )}
      <p className="text-base font-medium">{title}</p>
      {description !== undefined && (
        <p className="text-muted-foreground max-w-prose text-sm">{description}</p>
      )}
      {action !== undefined && <div className="mt-4">{action}</div>}
    </div>
  );
}

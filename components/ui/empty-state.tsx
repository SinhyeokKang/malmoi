import type { ComponentType, ReactNode } from "react";

import { cn } from "@/lib/utils";

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
  className,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** ⚠️ **여백만 조정하라고 연 자리다** — 모달 본문은 패널보다 낮아 `py-12`가 바닥을 밀어낸다. */
  className?: string;
}) {
  return (
    /**
     * ⚠️ **컨테이너에 `gap`이 없다** (2026-09-11 사용자). 칩과 액션이 각자 `mb-3`·`mt-4`를 들고
     * 있어서 gap이 **거기에 더해진다** — 세 간격이 서로 다른 수단으로 잡히고, gap을 건드리면
     * 의도치 않게 셋이 함께 움직인다. 간격의 출처를 margin 하나로 남긴다.
     */
    <div className={cn("flex flex-col items-center py-12 text-center", className)}>
      {Icon !== undefined && (
        <span className="bg-foreground/5 mb-3 flex size-12 items-center justify-center rounded-full">
          <Icon className="text-muted-foreground size-4" aria-hidden />
        </span>
      )}
      {/*
        ⚠️ **`text-lg`다** (2026-09-11 사용자 — `text-base`에서 한 단계 올렸다). 같은 날 `--text-base`가
        15px로 내려가면서 제목과 설명(`text-sm`, 14)의 차이가 1px이 됐고, 그러면 둘이 한 덩어리로
        읽혀 **어느 쪽이 답인지** 안 보인다. 이 블록은 화면에 그것 하나뿐이라 위계가 스스로 서야 한다.
      */}
      <p className="mb-1 text-lg font-medium">{title}</p>
      {/* ⚠️ **46ch다** — `max-w-prose`(65ch)는 한 문장을 세 줄로 흘려 칩·제목과 무게가 뒤집힌다 (시안). */}
      {description !== undefined && (
        <p className="text-muted-foreground max-w-[46ch] text-sm">{description}</p>
      )}
      {/*
        ⚠️ **래퍼가 flex다** (2026-09-13 사용자 실물). 액션 둘(검색 0건 — §6.4에 등재된 예외)을 호출부가
        `<>`로 넘기므로 **사이를 벌릴 자리가 여기밖에 없다**: `mt-4`만 들고 있으면 inline-flex 버튼
        둘이 간격 0으로 맞붙어 한 덩어리로 읽힌다. 버튼 하나일 때는 아무것도 바뀌지 않는다.
        ⚠️ **컨테이너 `gap` 금지 규칙과 충돌하지 않는다** — 그 규칙은 칩·제목·설명·액션 **사이**의
        수직 간격이 margin 하나에서 나와야 한다는 것이고, 여기 gap은 액션 **안**의 수평 간격이다.
      */}
      {action !== undefined && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{action}</div>
      )}
    </div>
  );
}

"use client";

import { CircleX } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./button";
import { EmptyState } from "./empty-state";

/** 조회 실패만 한 번 알린다. 빈 결과와 404는 기존 EmptyState 의미론을 유지한다. */
export function ErrorState({ title, description, retry, retryLabel }: {
  title: ReactNode;
  description: ReactNode;
  retry: () => void;
  retryLabel: string;
}) {
  return <div role="alert">
    <EmptyState icon={CircleX} title={title} description={description}
      action={<Button type="button" variant="primary" onClick={() => retry()}>{retryLabel}</Button>} />
  </div>;
}

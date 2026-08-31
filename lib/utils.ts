import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn 표준 헬퍼. 조건부 클래스 병합 시 Tailwind 충돌을 뒤쪽 우선으로 정리한다. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

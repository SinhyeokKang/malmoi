"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * URL 검색값과 작성 중 질의를 분리하고 IME 조합 확정은 제출하지 않는다.
 *
 * ⚠️ **`className`은 바깥 자리잡기용이고 입력 폭이 아니다** — `w-64`는 두 소비자(프로젝트 목록·
 * 번역 툴바)가 **같아야 하는** 값이라 프리미티브가 든다. 폭을 인자로 열면 툴바마다 검색창이
 * 달라지고, 그 차이는 두 화면을 나란히 놓기 전에는 안 보인다.
 *
 * ⚠️ **Enter의 조합 확정을 거른다** — IME에서 한글을 확정하는 Enter가 그대로 검색으로 나가면
 * 사용자가 아직 다 치지도 않은 질의로 URL이 바뀐다. `isComposing`과 `keyCode === 229`를 **둘 다**
 * 보는 것은 브라우저마다 하나씩만 주는 경우가 있어서다.
 */
export function SearchInput({ value, onSearch, label, placeholder = label, disabled, className, inputClassName = "w-64" }: {
  value: string | undefined;
  onSearch: (query: string) => void;
  label: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** 입력 폭 — 기본 256. 번역 작업 화면은 시안 `2a`가 320이라 넘긴다(다른 소비자는 기본값 그대로다). */
  inputClassName?: string;
}) {
  const [text, setText] = useState(value ?? "");
  useEffect(() => setText(value ?? ""), [value]);

  return (
    <div className={cn("relative", className)}>
      <Search className="text-muted-foreground pointer-events-none absolute top-2.5 left-2 size-4" aria-hidden />
      <Input
        type="search"
        value={text}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
          event.preventDefault();
          onSearch(text.trim());
        }}
        placeholder={placeholder}
        aria-label={label}
        className={cn(inputClassName, "pl-8")}
      />
    </div>
  );
}

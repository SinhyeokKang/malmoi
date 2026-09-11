"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";

/** URL 검색값과 작성 중 질의를 분리하고 IME 조합 확정은 제출하지 않는다. */
export function SearchInput({ value, onSearch, label, placeholder = label, disabled, className }: {
  value: string | undefined;
  onSearch: (query: string) => void;
  label: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(value ?? "");
  useEffect(() => setText(value ?? ""), [value]);

  return (
    <div className={className === undefined ? "relative" : `relative ${className}`}>
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
        className="w-64 pl-8"
      />
    </div>
  );
}

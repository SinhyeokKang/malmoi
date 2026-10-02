"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { m } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** `Copied`가 서 있는 시간(시안 1b). */
const COPIED_MS = 2000;

/**
 * 코드 블록 (DESIGN §6.4 · §6.61 · 시안 `Docs.dc.html` 1b) — 카드(선 · radius 12). `/docs` 원고의 펜스와 앱의 워크플로 YAML이
 * 같이 쓴다(2026-10-01 사용자 — 앱 쪽이 docs 형으로 맞췄다). **파일명이 있으면** 바 40(흰 면 ·
 * 아래 `--divider`) + Copy, **없으면 바 없이** Copy가 본문 오른쪽 위(8 · 8)에 늘 뜬다(본문 오른쪽 여백 88).
 * 문법 강조 없음 · 가로 스크롤 · 토스트 없음. 바깥 여백은 소비자가 `className`으로 준다(원고는 `mt-6`).
 *
 * `fill` — 남은 높이를 먹고 **블록 자신이 두 축으로 스크롤한다**(온보딩 ④·설정 모달). 본문이 스크롤하면 ④의 토큰 칩이
 * 화면 밖으로 밀려, 토큰을 옮기려는 사용자가 위로 되돌아가야 한다(핸드오프 1d).
 *
 * ⚠️ **알림은 버튼의 `aria-live`가 아니라 옆의 visually-hidden live region이다** — 버튼 이름이 바뀌는 것만으로는
 * 스크린리더가 안정적으로 읽지 않는다. region은 처음부터 DOM에 있어야 한다(나중에 붙은 live region은 무시된다).
 *
 * ⚠️ **`navigator.clipboard`가 실패할 수 있다**(권한 거부·비보안 컨텍스트) — `CopyButton`과 같이 실패를 라벨로 말한다.
 * 그 컴포넌트를 쓰지 않는 것은 되돌림(2초)과 live region 때문이다 — 소비자 다섯의 동작을 여기 맞춰 바꾸지 않는다.
 */
export function CodeBlock({ code, filename, fill = false, className }: {
  code: string;
  filename: string | null;
  fill?: boolean;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  /**
   * live region의 글자 — 상태와 따로 둔다. ⚠️ **다시 누르면 먼저 비운다** — 2초 안에 다시 누르면 `Copied` → `Copied`라
   * 글자가 안 바뀌고, 안 바뀐 live region은 다시 읽히지 않는다.
   */
  const [announcement, setAnnouncement] = useState("");
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const fail = () => {
    setState("failed");
    setAnnouncement(m.common.copyFailed);
  };
  const copy = () => {
    window.clearTimeout(timer.current);
    setAnnouncement("");
    // ⚠️ 비보안 컨텍스트에는 `navigator.clipboard`가 없다 — `writeText` 호출이 동기로 던진다(locale-panel과 같은 가드).
    if (navigator.clipboard === undefined) return fail();
    void navigator.clipboard.writeText(code).then(() => {
      setState("copied");
      setAnnouncement(m.common.copied);
      timer.current = window.setTimeout(() => {
        setState("idle");
        setAnnouncement("");
      }, COPIED_MS);
    }, fail);
  };

  const button = (
    <Button size="sm" onClick={copy} className="min-w-[66px]">
      {state === "copied" ? m.common.copied : state === "failed" ? m.common.copyFailed : m.common.copy}
    </Button>
  );

  return (
    <div className={cn("border-border relative overflow-hidden rounded-lg border", fill && "flex min-h-0 flex-1 flex-col", className)}>
      {filename === null ? (
        <div className="absolute top-2 right-2">{button}</div>
      ) : (
        <div className="border-divider flex h-10 shrink-0 items-center justify-between gap-3 border-b bg-background pr-2 pl-4">
          <span className="text-muted-foreground text-mono min-w-0 truncate">{filename}</span>
          {button}
        </div>
      )}
      {/* 가로 스크롤 블록이라 키보드가 받을 자리가 필요하다 — 표 region과 같은 이유(focus-ring.test.ts). */}
      <pre
        tabIndex={0}
        role="region"
        aria-label={filename ?? m.publicDocs.docs.code}
        className={cn(
          "text-mono m-0 py-4 pl-4 leading-prose focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset",
          fill ? "min-h-0 flex-1 overflow-auto" : "overflow-x-auto",
          filename === null ? "pr-[88px]" : "pr-4",
        )}
      >
        <code className="text-mono">{code}</code>
      </pre>
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}

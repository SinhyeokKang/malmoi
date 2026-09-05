"use client";

import { useState, useTransition } from "react";

import { createInvitation } from "@/app/(edit)/projects/actions";
import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { cn } from "@/lib/utils";

/**
 * 초대 링크 발급 — **OWNER에게만 보인다.**
 *
 * ⚠️ **임시 화면이다.** 멤버 관리 화면은 SAAS §8 6단계이고, 여기 있는 이유는 하나다:
 * 이게 없으면 `createInvitation`에 호출부가 없고, **spec 완료 조건 3(GitHub 계정 없이 번역)을
 * 손으로도 밟을 수 없다.** 만든 것이 실제로 호출되는지 묻지 않는 것이 이 리포의 반복 실패
 * 유형이다 (POSTMORTEM 2026-09-03).
 *
 * **메일을 보내지 않는다** (SAAS §4.3 ①) — OWNER가 링크를 슬랙·메신저로 직접 전달한다.
 */
export function InviteForm({ slug }: { slug: string }) {
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setLink(null);
    setError(null);
    startTransition(async () => {
      const result = await createInvitation({
        slug,
        email: String(formData.get("email") ?? ""),
        role: "EDITOR",
      });
      if (result.ok) {
        // 원문은 서버가 저장하지 않는다 — **이 화면을 벗어나면 다시 볼 수 없다** (SAAS §5.6).
        setLink(`${window.location.origin}/invite/${result.token}`);
        setEmail("");
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-2">
      <form action={submit} className="flex items-center gap-2">
        <input
          name="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="초대할 이메일"
          className="border-input bg-background focus-visible:ring-ring h-8 w-56 rounded-md border px-2 text-xs focus-visible:ring-[3px] focus-visible:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className={cn(
            "border-input hover:bg-accent h-8 shrink-0 rounded-md border px-3 text-xs",
            "focus-visible:ring-ring focus-visible:ring-[3px] focus-visible:outline-none",
            "disabled:text-muted-foreground disabled:cursor-not-allowed disabled:hover:bg-transparent",
          )}
        >
          {pending ? "만드는 중…" : "초대 링크 만들기"}
        </button>
      </form>

      {error !== null && <p className="text-destructive text-xs">{inviteFailureText(error)}</p>}

      {link !== null && (
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs">
            링크를 복사해 전달해 주세요. <strong>이 화면을 벗어나면 다시 볼 수 없어요.</strong>
          </p>
          {/* 링크는 식별자라 mono다 (docs/DESIGN.md §4.1) */}
          <div className="flex items-center gap-2">
            <code className="text-mono bg-muted min-w-0 flex-1 truncate rounded px-2 py-1">
              {link}
            </code>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(link)}
              className="border-input hover:bg-accent focus-visible:ring-ring h-8 shrink-0 rounded-md border px-3 text-xs focus-visible:ring-[3px] focus-visible:outline-none"
            >
              복사
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function inviteFailureText(error: string): string {
  if (isAccessError(error)) return accessErrorMessage(error);
  if (error === "already-member") return "그 이메일은 이미 이 프로젝트의 멤버예요.";
  return `초대를 만들지 못했어요: ${error}`;
}

"use client";

import { useId, useState, useTransition, type FormEvent } from "react";

import { connectGitLab } from "@/app/(edit)/account/actions";
import { useMessages } from "@/components/i18n/messages-provider";
import { Button } from "@/components/ui/button";
import { FormGroup } from "@/components/ui/form-group";
import { Input } from "@/components/ui/input";
import { Link as InlineLink } from "@/components/ui/link";
import { gitlabConnectErrorMessage } from "@/lib/gitlab-connect/message";

/**
 * GitLab 토큰 만들기 화면 — 레거시 PAT 화면으로 리다이렉트되며 이름·스코프가 채워진다(design §2 실측 · D13 `scopes=api` 하나).
 * 만료일 파라미터는 없다(GitLab 기본 30일).
 */
export const GITLAB_TOKEN_URL = "https://gitlab.com/-/user_settings/personal_access_tokens?name=Malmoi&scopes=api";

type Connected = Extract<Awaited<ReturnType<typeof connectGitLab>>, { ok: true }>["connection"];

/**
 * **PAT 입력 shell** (시안 G2a~d · G8b · design-brief "GitLab 탭 상태"). ①의 GitLab 탭·`/account`·토큰 교체가 같은 형이다 —
 * 라벨 + password 입력 + 도움말(스코프·역할) + [Connect] + 토큰 만들기 링크, 거부는 입력 아래 오류(`aria-describedby`·`aria-invalid`).
 *
 * ⚠️ **입력 중엔 서버로 보내지 않는다** — [Connect]만 보낸다(검증이 GitLab을 부른다). ⚠️ **성공하면 값을 비운다** — 붙여 넣은 원문은
 * 연결 뒤 다시 보이지 않는다(보여 주는 형은 `push-token-panel` 하나뿐이다). ⚠️ 일시 장애는 "무효"로 접지 않는다 — 같은 값으로 다시 누르면 된다.
 */
export function GitLabTokenForm({ submitLabel, onConnected, autoFocus = false }: {
  submitLabel: string;
  onConnected: (connection: Connected) => void;
  /** Dialog 안(토큰 교체)이면 입력이 할 일이라 첫 포커스다(`primitive-focus.test.tsx` — Dialog 소비자는 첫 포커스를 정한다). */
  autoFocus?: boolean;
}) {
  const m = useMessages();
  const id = useId();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = token.trim();
    if (value === "" || pending) return;
    startTransition(async () => {
      // ⚠️ 던지면 error boundary가 화면을 삼킨다 — 일시 장애와 같은 자리로 접는다.
      let result: Awaited<ReturnType<typeof connectGitLab>> | null;
      try { result = await connectGitLab({ token: value }); } catch { result = null; }
      if (result === null) { setError(m.errors.gitlab.unavailable); return; }
      if (!result.ok) { setError(gitlabConnectErrorMessage(m, result.error)); return; }
      setError(null);
      setToken("");
      onConnected(result.connection);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <FormGroup label={m.account.gitlab.form.label} htmlFor={id} help={m.account.gitlab.form.help} error={error ?? undefined}>
        {(describe) => (
          <div className="flex w-[480px] max-w-full items-start gap-2 @max-form:w-full">
            <Input
              width="full"
              id={id}
              type="password"
              autoComplete="off"
              autoFocus={autoFocus}
              spellCheck={false}
              value={token}
              readOnly={pending}
              aria-invalid={error !== null}
              aria-describedby={describe()}
              onChange={(event) => setToken(event.target.value)}
            />
            <Button type="submit" variant="primary" busy={pending} className="shrink-0">{submitLabel}</Button>
          </div>
        )}
      </FormGroup>
      {/* ⚠️ 오류가 도움말을 대신해도 이 링크는 남는다 — fine-grained·스코프 거부의 다음 행동이 "새 토큰 만들기"다(design-brief G2c). 새 탭이다(모달로 돌아와 붙여 넣는다). */}
      <p className="text-xs leading-prose"><InlineLink href={GITLAB_TOKEN_URL} target="_blank" rel="noreferrer">{m.account.gitlab.form.create}</InlineLink></p>
    </form>
  );
}

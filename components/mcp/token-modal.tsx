"use client";

import { unstable_rethrow } from "next/navigation";
import { useRef, useState, useTransition, type RefObject } from "react";

import { issueApiToken, type ApiTokenIssueResult } from "@/app/(edit)/mcp/actions";
import { CopyButton } from "@/components/onboarding/copy-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useLandAfter } from "@/components/ui/focus";
import { OnboardingModal } from "@/components/ui/modal";
import { m } from "@/lib/i18n";
import type { TokenGrant } from "@/lib/mcp/grant";

import { chosenProjectIds, GRANT_ORDER, initialGrantFields, TokenGrantFields, type GrantFieldsValue, type ScopeProject } from "./token-grant-fields";

/**
 * 토큰 생성·회전 모달 (핸드오프 `2a`–`2e` · `4a`). **`OnboardingModal` 2단계** — ① 폼 ② 값을 한 번 보여주기. ②에는 Back이 없다:
 * 토큰은 ①의 확정에서 이미 만들어졌다. 생성과 회전이 같은 Action(`issueApiToken`)이고 회전은 경고 한 장과 현재 값 채움만 다르다.
 *
 * ⚠️ **결과를 셋으로 가른다** (design §8): 명시적 거부는 입력을 유지한 채 폼 위 danger Alert(`4a` — 같은 버튼이 재시도), 호출 자체가
 * 끊긴 것은 **결과 미확인**이라 모달을 닫고 카드가 말한다(`4b` — 서버가 발급했는지 모른다). 자동 재시도는 없다.
 * ⚠️ **복사 성공만으로 닫지 않는다** — Done이 유일한 출구다(원문을 두 번 볼 길이 없다).
 */

export type TokenFormInitial = { grants: readonly TokenGrant[]; scope: "all" | "projects"; projectIds: readonly string[] };

export function TokenModal({
  mode,
  open,
  initial,
  projects,
  onClose,
  onIssued,
  onUnconfirmed,
  returnFocusRef,
  fallbackFocusRef,
}: {
  mode: "create" | "rotate";
  open: boolean;
  initial: TokenFormInitial;
  /** 현재 멤버십(보관 제외). 0이면 `Chosen projects`가 사유와 함께 꺼진다(`2b`). */
  projects: readonly ScopeProject[];
  onClose: () => void;
  /** 서버가 발급을 확정했다 — 카드가 완료를 알린다. 뒤 페이지는 Action의 재검증으로 이미 `1b`다. */
  onIssued: () => void;
  /** 응답을 잃었다 — 모달을 닫고 카드가 복구를 안내한다(`4b`). */
  onUnconfirmed: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
  fallbackFocusRef: RefObject<HTMLElement | null>;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [fields, setFields] = useState<GrantFieldsValue>(() => initialGrantFields(initial, projects));
  const [failed, setFailed] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const submitRef = useRef<HTMLButtonElement | null>(null);
  const doneRef = useRef<HTMLButtonElement | null>(null);

  // ⚠️ 거부 뒤 포커스는 확정 버튼에 남는다(`4a` — 단계 전이가 아니다). 진행 중 `disabled`가 포커스를 `body`로 떨어뜨리므로 커밋 뒤 되돌린다.
  useLandAfter(pending, () => (step === 1 ? submitRef.current : doneRef.current));

  const chosenIds = chosenProjectIds(fields, projects);
  const emptyChoice = fields.scope === "projects" && chosenIds.length === 0;

  function submit() {
    if (pending || emptyChoice) return;
    setFailed(false);
    startTransition(async () => {
      // `undefined`는 값 없이 끝난 호출이다(redirect가 reject 대신 resolve로 올 때의 방어) — 아무것도 단정하지 않고 폼을 그대로 둔다.
      let result: ApiTokenIssueResult | null | undefined;
      try {
        result = await issueApiToken({
          expiresInDays: fields.expires,
          grants: GRANT_ORDER.filter((g) => fields.grants.has(g)),
          scope: fields.scope === "all" ? { kind: "all" } : { kind: "projects", projectIds: chosenIds },
        });
      } catch (thrown) {
        // ⚠️ **세션 만료의 redirect는 되던진다** — `requireUser`가 `/signin`으로 보내는 신호이고, 삼키면 "결과 미확인"이 거짓으로 선다
        // (`profile-name-form.tsx`와 같은 형).
        unstable_rethrow(thrown);
        // 호출이 끊기면 서버가 발급했는지 모른다 — 성공으로도 실패로도 단정하지 않는다(재시도하면 두 번째 토큰이 첫째를 덮는다).
        result = null;
      }
      if (result === null) {
        onUnconfirmed();
        return;
      }
      if (result === undefined) return;
      if (result.ok) {
        setToken(result.token);
        setStep(2);
        onIssued();
        return;
      }
      setFailed(true);
    });
  }

  const title = step === 2 ? m.mcpConnector.result.title : mode === "rotate" ? m.mcpConnector.form.rotateTitle : m.mcpConnector.form.createTitle;
  const status = step === 2 ? m.mcpConnector.form.step(2) : emptyChoice ? m.mcpConnector.form.chooseOne : m.mcpConnector.form.step(1);

  return (
    <OnboardingModal
      open={open}
      onClose={onClose}
      title={title}
      transitionKey={String(step)}
      closeLabel={m.common.close}
      // ⚠️ **②는 Done만 닫는다** — Esc·바깥 클릭·X로 닫히면 원문을 잃는다(다시 볼 길이 없다). ①은 평소처럼 닫힌다.
      closeDisabled={pending || step === 2}
      returnFocusRef={returnFocusRef}
      fallbackFocusRef={fallbackFocusRef}
      footer={<span data-token-status>{status}</span>}
      actions={
        step === 1 ? (
          <>
            <Button type="button" size="lg" disabled={pending} onClick={onClose}>
              {m.common.cancel}
            </Button>
            {/* 회전은 옛 토큰을 즉시 죽인다 — push 토큰 회전 확정과 같은 `danger`다(🔴 L). 생성은 잃는 것이 없어 `primary`다. */}
            <Button ref={submitRef} type="button" variant={mode === "rotate" ? "danger" : "primary"} size="lg" loading={pending} disabled={emptyChoice} onClick={submit}>
              {mode === "rotate" ? m.mcpConnector.form.rotateConfirm : m.mcpConnector.form.create}
            </Button>
          </>
        ) : (
          <Button ref={doneRef} type="button" variant="primary" size="lg" onClick={onClose}>
            {m.mcpConnector.result.done}
          </Button>
        )
      }
    >
      {step === 2 && token !== null ? (
        <div data-token-result className="flex flex-col gap-3">
          <p className="text-sm">
            <strong className="font-normal">{m.mcpConnector.result.copyNow}</strong>
          </p>
          <div className="flex items-center gap-2">
            {/* ④ 토큰 칩과 같은 형(36 · radius 10 · muted) — 크기만 14다(핸드오프 §4). 전체 선택으로 손 복사가 된다. */}
            <code data-token-value className="border-input bg-muted flex h-9 min-w-0 flex-1 items-center truncate rounded-md border px-2.5 font-sans text-sm select-all">
              {token}
            </code>
            <CopyButton value={token} />
          </div>
          <p className="text-muted-foreground text-xs leading-prose">{m.mcpConnector.result.setEnv}</p>
        </div>
      ) : (
        <div data-token-form className="flex flex-col gap-6">
          {mode === "rotate" && <Alert variant="warning">{m.mcpConnector.form.rotateWarning}</Alert>}
          {failed && <Alert variant="danger">{m.mcpConnector.form.failed}</Alert>}

          <TokenGrantFields value={fields} onChange={setFields} projects={projects} disabled={pending} />
        </div>
      )}
    </OnboardingModal>
  );
}

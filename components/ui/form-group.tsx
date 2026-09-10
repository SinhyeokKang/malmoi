import type { ReactNode } from "react";

/**
 * label + help + error를 한 형으로 든다 (DESIGN §6.4).
 *
 * ⚠️ **error가 있으면 help를 대신한다** — 둘을 같이 보이면 무엇을 고쳐야 하는지가 두 줄로 갈린다.
 * `htmlFor`/`id`는 호출부가 맞춘다 — 자동 생성하면 서버·클라이언트 id가 갈릴 수 있다.
 */
export function FormGroup({
  label,
  htmlFor,
  help,
  error,
  optional = false,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  help?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
        {optional && <span className="text-muted-foreground font-light"> (optional)</span>}
      </label>
      {children}
      {error !== undefined ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : help !== undefined ? (
        <p className="text-muted-foreground text-xs">{help}</p>
      ) : null}
    </div>
  );
}

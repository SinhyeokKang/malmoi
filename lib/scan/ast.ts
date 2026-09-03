import {
  Project,
  SyntaxKind,
  type CallExpression,
  type Node,
  type SourceFile,
  type VariableDeclaration,
} from "ts-morph";

import type { KeyRef, ScanWarning, WrapperId } from "./types";

/** 비리터럴 호출을 명시 등록으로 통과시키는 지시자. */
const KEYS_DIRECTIVE = /^\s*\/\/\s*@l10n-keys\s+(.+)$/;

/**
 * `chrome.i18n.getMessage("key")` 직접 호출. 래퍼가 없는 리포에서도 사용처를 얻는다 —
 * 적재가 래퍼에 의존하지 않으므로 스캔도 의존하지 않아야 한다.
 */
const CHROME_CALL = "chrome.i18n.getMessage";

/**
 * 훅 반환을 구조분해할 때 찾는 프로퍼티 이름. **실측 관례다** — vue-i18n·react-i18next·
 * skillflo가 전부 `const { t } = useXxx()`다. 다른 이름을 쓰는 리포가 나오면 그때 옵션이 된다
 * (지금 옵션으로 열면 대상 리포마다 알아내야 하는 값이 하나 더 는다).
 */
const HOOK_RETURN_PROP = "t";

/**
 * 훅이 만든 지역 바인딩 하나. `t`가 파일 어디에서나 같은 것을 가리키지 않으므로
 * **스코프와 선언 위치를 함께 들고 다닌다** — 한 파일에 컴포넌트가 여럿이면 같은 이름의
 * `t`가 서로 다른 namespace를 갖는다(실측: bugshot-web).
 */
type HookBinding = {
  name: string;
  /** next-intl의 namespace. 붙으면 키가 `${namespace}.${arg}`가 된다. */
  namespace: string | undefined;
  declEnd: number;
  scopeStart: number;
  scopeEnd: number;
};

/**
 * **AST를 쓰는 이유**: 정규식은 주석 속 호출·문자열 리터럴 안의 `t(`·템플릿 조립을 구분하지
 * 못한다. ts-morph는 주석을 AST 노드로 만들지 않으므로 주석 속 호출은 애초에 순회 대상이 아니다.
 *
 * **래퍼는 모듈 경로 + export 이름으로 식별한다.** 이름만으로 매칭하면 대상 리포에 이미 있는
 * 다른 `t()`를 우리 것으로 착각한다 — bugshot-2가 정확히 그렇고(`t(key, params?)`), 이름만
 * 보면 기존 호출 1391건이 오탐이 됐다. 모듈 경로도 충돌할 수 있어(그 리포의 래퍼가 하필
 * `@/i18n#t`다) 호출부가 값을 넘긴다.
 *
 * **래퍼가 여럿이다**: bugshot-web은 한 리포에서 `next-intl#useTranslations()`(클라이언트)와
 * `next-intl/server#getTranslations()`(서버)를 함께 쓴다. 하나만 받으면 절반이 0건이 된다.
 */
export function extractRefs(
  path: string,
  code: string,
  wrappers: readonly WrapperId[],
): { found: Array<{ key: string; ref: KeyRef }>; warnings: ScanWarning[] } {
  // 타입 정보가 필요 없어(호출 형태만 본다) 컴파일러 옵션·lib을 로드하지 않는다 —
  // 수백 파일에서 이게 속도를 좌우한다.
  const project = new Project({
    useInMemoryFileSystem: true,
    skipFileDependencyResolution: true,
    compilerOptions: { allowJs: true, noLib: true },
  });
  const sourceFile = project.createSourceFile(path, code, { overwrite: true });

  const lines = code.split("\n");
  const found: Array<{ key: string; ref: KeyRef }> = [];
  const warnings: ScanWarning[] = [];

  // 이 파일이 래퍼를 import했는가. 안 했으면 여기 있는 t()는 남의 것이므로 손대지 않는다.
  const directNames = new Set<string>();
  const hookNames = new Set<string>();
  for (const wrapper of wrappers) {
    const local = wrapperLocalName(sourceFile, wrapper);
    if (local === undefined) continue;
    (wrapper.kind === "hook" ? hookNames : directNames).add(local);
  }

  const bindings = hookNames.size === 0 ? [] : collectHookBindings(sourceFile, hookNames, path, warnings);

  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression().getText();
    const start = call.getStart();

    // direct를 먼저 본다 — 같은 이름이 import와 훅 바인딩 양쪽에 있으면 import가 더 좁은 근거다.
    const isDirect = directNames.has(callee) || callee === CHROME_CALL;
    const binding = isDirect ? undefined : bindingFor(bindings, callee, start);
    if (!isDirect && !binding) continue;

    const line = lineOf(sourceFile, call);
    const key = literalOf(call.getArguments()[0]);

    if (key === undefined) {
      // 위쪽 @l10n-keys가 있으면 그 지시자가 이 호출의 키를 대신 신고한 것으로 본다.
      if (hasDirectiveAbove(lines, line)) continue;
      warnings.push({
        path,
        line,
        message:
          `${callee}()의 키 인자가 문자열 리터럴이 아니라 사용처를 특정할 수 없다. ` +
          `위 줄에 \`// @l10n-keys a, b\`로 명시 등록하면 잡힌다`,
      });
      continue;
    }

    // namespace 상대 키를 절대 키로 되돌린다 (next-intl: `getTranslations({namespace:"meta"})` + `t("title")`).
    const ns = binding?.namespace;
    found.push({ key: ns === undefined ? key : `${ns}.${key}`, ref: { path, line } });
  }

  // 지시자는 호출과 독립적으로 수집한다 — 해당 호출이 경고로 걸러졌거나 래퍼 import가 없어도
  // 명시 등록된 키는 사용처를 가져야 한다(그게 명시 등록의 목적이다).
  // **지시자의 키는 절대 키다** — 어느 바인딩 밑에 있는지에 따라 접두사가 달라지면
  // 같은 지시자가 파일 위치에 따라 다른 키가 되어 예측 불가능해진다.
  for (const [index, raw] of lines.entries()) {
    const m = KEYS_DIRECTIVE.exec(raw);
    if (!m?.[1]) continue;
    for (const name of m[1].split(",")) {
      const key = name.trim();
      if (key) found.push({ key, ref: { path, line: index + 1 } });
    }
  }

  return { found, warnings };
}

/**
 * 훅 호출의 반환을 받는 변수 선언을 모은다. 인식하는 형태는 둘이다:
 * `const t = useTranslations("ns")`(직접 대입)와 `const { t } = useI18n()`(구조분해, 별칭 포함).
 */
function collectHookBindings(
  sourceFile: SourceFile,
  hookNames: ReadonlySet<string>,
  path: string,
  warnings: ScanWarning[],
): HookBinding[] {
  const out: HookBinding[] = [];

  for (const decl of sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const call = hookCallOf(decl, hookNames);
    if (!call) continue;

    const line = lineOf(sourceFile, call);
    const ns = namespaceOfHookCall(call);
    if (ns === "unresolved") {
      // **접두사를 모르는 채로 잡으면 존재하지 않는 키가 refs에 실린다.** 0건이 낫다.
      warnings.push({
        path,
        line,
        message:
          `${call.getExpression().getText()}()의 namespace 인자가 문자열 리터럴이 아니라 ` +
          `이 바인딩의 키를 절대 키로 되돌릴 수 없다`,
      });
      continue;
    }

    const name = boundName(decl);
    if (name === "unsupported") {
      warnings.push({
        path,
        line,
        message: `${call.getExpression().getText()}()의 반환을 인식할 수 없는 형태로 받아 사용처를 잇지 못한다`,
      });
      continue;
    }
    // 구조분해에 `t`가 없으면 그 훅의 다른 값을 쓴 것이다 (`const { language } = useI18n()`) — 정상이다.
    if (name === undefined) continue;

    const scope = decl.getFirstAncestor((a) => a.isKind(SyntaxKind.Block) || a.isKind(SyntaxKind.SourceFile));
    out.push({
      name,
      namespace: ns,
      declEnd: decl.getEnd(),
      scopeStart: scope?.getStart() ?? 0,
      scopeEnd: scope?.getEnd() ?? Number.MAX_SAFE_INTEGER,
    });
  }

  return out;
}

/** 선언의 initializer가 훅 호출이면 그 호출. `await`는 벗긴다 (next-intl 서버 API가 async다). */
function hookCallOf(decl: VariableDeclaration, hookNames: ReadonlySet<string>): CallExpression | undefined {
  let init: Node | undefined = decl.getInitializer();
  if (init?.isKind(SyntaxKind.AwaitExpression)) init = init.getExpression();
  if (!init?.isKind(SyntaxKind.CallExpression)) return undefined;
  return hookNames.has(init.getExpression().getText()) ? init : undefined;
}

/**
 * 호출자가 될 지역 이름. 직접 대입이면 그 이름, 구조분해면 `t` 프로퍼티의 지역 이름
 * (`{ t: tr }`이면 `tr`). `t`가 없으면 `undefined`, 그 외 형태는 `"unsupported"`.
 */
function boundName(decl: VariableDeclaration): string | undefined | "unsupported" {
  const nameNode = decl.getNameNode();
  if (nameNode.isKind(SyntaxKind.Identifier)) return nameNode.getText();
  if (!nameNode.isKind(SyntaxKind.ObjectBindingPattern)) return "unsupported";

  for (const element of nameNode.getElements()) {
    const prop = element.getPropertyNameNode()?.getText() ?? element.getNameNode().getText();
    if (prop === HOOK_RETURN_PROP) return element.getNameNode().getText();
  }
  return undefined;
}

/**
 * 훅 호출 인자에서 namespace를 읽는다. 실측 형태 둘을 받는다:
 * `useTranslations("hero")`(문자열)와 `getTranslations({ locale, namespace: "meta" })`(객체).
 * 인자가 없거나 객체에 `namespace`가 없으면 namespace가 없는 것이고, 리터럴이 아니면 미해결이다.
 */
function namespaceOfHookCall(call: CallExpression): string | undefined | "unresolved" {
  const arg = call.getArguments()[0];
  if (!arg) return undefined;
  if (arg.isKind(SyntaxKind.StringLiteral)) return arg.getLiteralValue();
  if (!arg.isKind(SyntaxKind.ObjectLiteralExpression)) return "unresolved";

  const prop = arg.getProperty("namespace");
  if (!prop) return undefined;
  if (!prop.isKind(SyntaxKind.PropertyAssignment)) return "unresolved";
  const value = prop.getInitializer();
  return value?.isKind(SyntaxKind.StringLiteral) ? value.getLiteralValue() : "unresolved";
}

/**
 * 이 호출 위치를 담당하는 바인딩. **스코프 안이면서 가장 좁은 것**을 고른다 — 밖의 같은 이름은
 * 남의 것이고(props로 받은 `t`), 안쪽 선언이 바깥 선언을 가린다.
 */
function bindingFor(
  bindings: readonly HookBinding[],
  callee: string,
  callStart: number,
): HookBinding | undefined {
  let best: HookBinding | undefined;
  for (const b of bindings) {
    if (b.name !== callee) continue;
    if (callStart < b.declEnd) continue;
    if (callStart < b.scopeStart || callStart > b.scopeEnd) continue;
    if (!best || b.scopeEnd - b.scopeStart < best.scopeEnd - best.scopeStart) best = b;
  }
  return best;
}

function lineOf(sourceFile: SourceFile, node: Node): number {
  return sourceFile.getLineAndColumnAtPos(node.getStart()).line;
}

/**
 * 문자열 리터럴이면 값, 아니면 undefined. 템플릿 리터럴은 치환이 없어도 거부한다 —
 * 허용하면 "치환이 있는 경우"와 형태로 구분되지 않아 규칙이 흐려진다.
 */
function literalOf(arg: Node | undefined): string | undefined {
  if (!arg) return undefined;
  return arg.isKind(SyntaxKind.StringLiteral) ? arg.getLiteralValue() : undefined;
}

/**
 * 래퍼가 이 파일에서 불리는 이름. `import { t } from "@/i18n"`이면 `"t"`,
 * `import { t as translate }`면 `"translate"`. import가 없으면 `undefined`.
 *
 * 타입 정보 없이 import 선언만 본다 — 컴파일러를 돌리지 않으므로 수백 파일에서도 빠르다.
 */
function wrapperLocalName(sourceFile: SourceFile, wrapper: WrapperId): string | undefined {
  for (const decl of sourceFile.getImportDeclarations()) {
    if (decl.getModuleSpecifierValue() !== wrapper.module) continue;
    for (const spec of decl.getNamedImports()) {
      if (spec.getName() !== wrapper.export) continue;
      return spec.getAliasNode()?.getText() ?? spec.getName();
    }
  }
  return undefined;
}

/** 호출 줄 바로 위에서 위로 올라가며 지시자를 찾는다(빈 줄·다른 주석은 통과). */
function hasDirectiveAbove(lines: readonly string[], callLine: number): boolean {
  for (let i = callLine - 2; i >= 0; i--) {
    const raw = lines[i];
    if (raw === undefined) return false;
    if (KEYS_DIRECTIVE.test(raw)) return true;
    // 주석·빈 줄이 아니면 멈춘다 — 멀리 떨어진 지시자가 엉뚱한 호출에 붙는 걸 막는다.
    if (raw.trim() !== "" && !raw.trim().startsWith("//")) return false;
  }
  return false;
}

import { Project, SyntaxKind, type SourceFile } from "ts-morph";
import { looksLikeLocale } from "../adapters/shared";
import type { AdapterFile } from "../adapters/types";

/**
 * 코드 딕셔너리에서 **에러 없이 건너뛴 프로퍼티**를 센다.
 *
 * `ts-dict`의 `pairs()`는 두 갈래로 갈린다: 값이 문자열 리터럴이 **아닌** 경우는 `errors`에
 * 담기지만, 프로퍼티가 `PropertyAssignment`가 **아닌** 경우(spread `...base`, shorthand,
 * computed key, 메서드)는 조용히 `continue`한다. 뒤쪽이 위험한 쪽이다:
 *
 *   `errors`가 있으면 `pnpm push:local`이 exit 1로 push를 막는다 → orphaned까지 못 간다.
 *   무증상 skip은 그 게이트를 통과한다 → 부분 페이로드가 올라가고, 페이로드에 없는 키는
 *   `orphaned = true`가 되어 **정상 키가 export에서 빠진다**.
 *
 * 그래서 지표 ③의 에러 유형만으로는 유일하게 위험한 경로가 집계에서 원리적으로 빠진다
 *.
 *
 * ⚠️ **`localeObjects` 판정을 여기서 다시 구현한다.** `ts-dict`가 내부용으로 갖고 있고, 진단
 * 하나를 위해 프로덕션 모듈의 export를 늘리는 것은 이 실험이 선언한 변경 범위(detect 확장 +
 * 계약 주석) 밖이다. 판정 규칙이 바뀌면 두 곳을 함께 고쳐야 한다.
 */

export type TsShape = {
  /** 에러 없이 건너뛴 프로퍼티 수 (로케일 객체 안에서만). */
  silentSkips: number;
  /** 파일에 있는 문자열 리터럴 수. 읽힌 키 수와의 격차가 부분 읽기의 그물이다. */
  literalCount: number;
  /** 로케일 객체로 인정된 선언 수 — 0이면 위 두 숫자를 해석하면 안 된다. */
  localeObjectCount: number;
  /** 파싱이 throw한 파일 수. `ReadResult.errors`로는 오지 않는 경로다. */
  parseFailures: number;
};

function newProject(): Project {
  return new Project({
    useInMemoryFileSystem: true,
    skipFileDependencyResolution: true,
    compilerOptions: { allowJs: true, noLib: true },
  });
}

/** `ts-dict`의 `localeObjects`와 같은 규칙 — export되지 않은 로케일 이름 객체 리터럴. */
function localeObjectsOf(sourceFile: SourceFile) {
  const found = [];
  for (const decl of sourceFile.getVariableDeclarations()) {
    if (!looksLikeLocale(decl.getName())) continue;
    if (decl.getVariableStatementOrThrow().isExported()) continue;
    const init = decl.getInitializer();
    const inner =
      init?.isKind(SyntaxKind.AsExpression) || init?.isKind(SyntaxKind.SatisfiesExpression)
        ? init.getExpression()
        : init;
    if (inner?.isKind(SyntaxKind.ObjectLiteralExpression)) found.push(inner);
  }
  return found;
}

export function tsShape(files: readonly AdapterFile[]): TsShape {
  let silentSkips = 0;
  let literalCount = 0;
  let localeObjectCount = 0;
  let parseFailures = 0;

  for (const file of files) {
    if (!/\.tsx?$/.test(file.path)) continue;
    let sf: SourceFile;
    try {
      sf = newProject().createSourceFile(file.path, file.content, { overwrite: true });
    } catch {
      // ts-morph는 파싱 실패를 던진다 — 어댑터가 이걸 errors로 바꿔주지 않으므로 여기서 센다.
      parseFailures += 1;
      continue;
    }
    literalCount += sf.getDescendantsOfKind(SyntaxKind.StringLiteral).length;
    for (const obj of localeObjectsOf(sf)) {
      localeObjectCount += 1;
      for (const prop of obj.getProperties()) {
        if (!prop.isKind(SyntaxKind.PropertyAssignment)) silentSkips += 1;
      }
    }
  }

  return { silentSkips, literalCount, localeObjectCount, parseFailures };
}

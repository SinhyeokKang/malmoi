import { androidBasePath } from "@/lib/adapters/android-paths";
import { isLocaleShaped, isPathSafeLocale } from "@/lib/locale-code";

/** 기준 파일에는 언어 코드가 없으므로 관측된 번역 파일의 코드를 기준으로 재사용하지 않는다. */
export function validBaseInput(format: { basePath?: string | null; locales: readonly string[] }, code: string): boolean {
  return format.basePath != null
    ? isPathSafeLocale(code) && isLocaleShaped(code) && !format.locales.includes(code)
    : format.locales.includes(code);
}

/** 수동 지정도 자동 탐지와 같은 Android 경로 규칙(`android-paths.ts`)만 쓴다. 실재 여부와 내용은 서버 재탐지가 검증한다. */
export function manualBasePath(adapter: string, pathTemplate: string): string | undefined {
  return adapter === "android-strings" ? androidBasePath(pathTemplate) : undefined;
}

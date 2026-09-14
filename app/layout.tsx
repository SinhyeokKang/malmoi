import type { Metadata } from "next";
import { Toaster } from "sonner";

import "./globals.css";

export const metadata: Metadata = {
  title: "malmoi",
  description: "Localization management for your team",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /*
      ⚠️ **`lang="en"`이다** (2026-09-08 ship 4). 화면 문구가 전부 영어가 된 커밋이 이것이므로 여기서
      바꿨다 — 틀리면 스크린리더가 영어 문장을 한국어 음성 엔진으로 읽는다. ko를 열면 이 값도 같이
      바뀐다 (design §3.1 — 그때 바뀌는 파일이 `lib/i18n/index.ts`와 여기다).
    */
    <html lang="en">
      <head>
        {/*
          Pretendard 동적 서브셋. globals.css의 @import가 아니라 <link>로 넣는다 —
          CSS @import는 스타일시트 체인을 직렬화해 폰트 요청이 한 단계 늦게 시작된다.
          이 파일은 scripts/copy-fonts.mjs가 만드는 생성물이라 gitignore돼 있다.
        */}
        <link
          rel="stylesheet"
          href="/fonts/pretendard/pretendardvariable-dynamic-subset.css"
        />
      </head>
      <body>
        {children}
        {/*
          ⚠️ **`theme="light"`가 필수다** (8-1b). `sonner`는 테마를 **스스로 감지**하므로 이 값이
          없으면 OS 다크에서 토스트만 어두워지고, 라이트 단일(DESIGN §3)이 **그 컴포넌트에서만**
          깨진다. `globals.css`의 `@custom-variant dark`는 우리 `dark:` 유틸만 막지 남의
          패키지 내부 스타일은 못 막는다.

          ⚠️ **`classNames`로 우리 토큰에 묶는다** — 안 묶으면 `sonner`가 자기 배경·테두리·radius를
          주입해 규약 5("CSS는 Tailwind로") 밖의 **두 번째 CSS 출처**가 되고, `Alert`와 같은 뜻을
          다른 형으로 말한다.

          ⚠️ **루트에 둔다** — 8단계가 화면마다 토스트를 쓰므로 화면별로 두면 사본이 늘어난다.
        */}
        <Toaster
          theme="light"
          position="bottom-right"
          toastOptions={{
            classNames: {
              toast: "bg-background border-border text-foreground rounded-lg border shadow-sm",
              description: "text-muted-foreground",
              actionButton: "bg-primary text-primary-foreground",
              closeButton: "bg-background border-border text-muted-foreground",
            },
          }}
        />
      </body>
    </html>
  );
}

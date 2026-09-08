import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Malmoi",
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
      <body>{children}</body>
    </html>
  );
}

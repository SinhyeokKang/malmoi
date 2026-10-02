# Geist Sans asset

Unmodified regular variable WOFF2 from [Vercel Geist v1.7.2](https://github.com/vercel/geist-font/releases/tag/v1.7.2), commit `a73329da8fc62afc917f796555202e4997f79b7c`.

- Source: [`fonts/Geist/webfonts/Geist[wght].woff2`](https://github.com/vercel/geist-font/blob/a73329da8fc62afc917f796555202e4997f79b7c/fonts/Geist/webfonts/Geist%5Bwght%5D.woff2).
- SHA-256: `2ffebe993e969069a9789d15164b7715d42491b5835516c5e3b935d5f81b05f1`; 69,760 bytes; weight axis 100–900.
- License: SIL Open Font License 1.1; [upstream LICENSE.txt](https://github.com/vercel/geist-font/blob/a73329da8fc62afc917f796555202e4997f79b7c/LICENSE.txt) is retained beside the asset.

`app/layout.tsx` uses `next/font/local` to emit and preload this asset from the application origin. Automatic Arial fallback is disabled so the sans stack proceeds directly to the existing self-hosted Pretendard Variable dynamic subsets for unsupported glyphs, including Hangul. Monospace is unchanged. No external font request or new package is required at build or runtime.

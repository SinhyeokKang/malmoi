export type FileEncoding = "utf-8" | "utf-16le" | "utf-16le-bom" | "utf-16be" | "utf-16be-bom";

export class FileEncodingError extends Error {
  readonly code = "invalid-file-encoding";

  constructor(readonly encoding: FileEncoding, cause: unknown) {
    super(`Invalid ${encoding} file bytes`, { cause });
    this.name = "FileEncodingError";
  }
}

function detectEncoding(path: string, bytes: Uint8Array): FileEncoding {
  if (!path.endsWith(".strings")) return "utf-8";
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return "utf-16le-bom";
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return "utf-16be-bom";
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return "utf-8";

  let evenNuls = 0;
  let oddNuls = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0) {
      if (i % 2 === 0) evenNuls++;
      else oddNuls++;
    }
  }
  // NUL 하나로 오판하지 않도록 ASCII 구문의 상위 바이트가 한쪽에 반복될 때만 채택한다.
  if (oddNuls >= 2 && oddNuls > evenNuls) return "utf-16le";
  if (evenNuls >= 2 && evenNuls > oddNuls) return "utf-16be";
  return "utf-8";
}

export function decodeFileBytes(path: string, bytes: Uint8Array): { content: string; encoding: FileEncoding } {
  const encoding = detectEncoding(path, bytes);
  const body = encoding.endsWith("-bom") ? bytes.subarray(2) : bytes;
  const label = encoding.startsWith("utf-16le") ? "utf-16le"
    : encoding.startsWith("utf-16be") ? "utf-16be" : "utf-8";
  try {
    // BOM은 위에서 하나만 떼므로 UTF-8 BOM과 본문 U+FEFF를 디코더가 지우면 안 된다.
    const content = new TextDecoder(label, { fatal: true, ignoreBOM: true }).decode(body);
    return { content, encoding };
  } catch (cause) {
    throw new FileEncodingError(encoding, cause);
  }
}

export function encodeFileContent(content: string, encoding: FileEncoding): Buffer {
  if (encoding === "utf-8") return Buffer.from(content, "utf8");
  const body = Buffer.from(content, "utf16le");
  const bigEndian = encoding.startsWith("utf-16be");
  if (bigEndian) body.swap16();
  if (!encoding.endsWith("-bom")) return body;
  return Buffer.concat([Buffer.from(bigEndian ? [0xfe, 0xff] : [0xff, 0xfe]), body]);
}

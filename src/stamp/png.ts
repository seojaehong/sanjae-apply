// 최소 PNG 인코더 — 8비트 RGBA, 필터 0, zlib(fflate, 브라우저에서도 돈다). 의존성 없이 투명 도장 PNG 를 만든다.
import { zlibSync } from "fflate";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  const typeBytes = new TextEncoder().encode(type);
  out.set(typeBytes, 4);
  out.set(data, 8);
  const crcInput = new Uint8Array(4 + data.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, 4);
  dv.setUint32(8 + data.length, crc32(crcInput));
  return out;
}

export interface PngInfo {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
}

/** PNG 시그니처와 IHDR 을 읽는다. 아니면 던진다. 도장 PNG 가 시스템 경계(CLI 파일·MCP base64)에서 들어올 때 한 번 거른다 */
export function pngInfo(png: Uint8Array, maxSide = 4096): PngInfo {
  const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.length < 33 || SIG.some((b, i) => png[i] !== b)) throw new Error("도장 PNG 가 아니다(PNG 시그니처 없음)");
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  if (dv.getUint32(8) !== 13 || String.fromCharCode(png[12]!, png[13]!, png[14]!, png[15]!) !== "IHDR") throw new Error("도장 PNG 가 아니다(IHDR 없음)");
  const info = { width: dv.getUint32(16), height: dv.getUint32(20), bitDepth: png[24]!, colorType: png[25]! };
  if (info.width < 1 || info.height < 1 || info.width > maxSide || info.height > maxSide) throw new Error(`도장 PNG 크기 ${info.width}×${info.height} 는 1~${maxSide}px 여야 한다`);
  return info;
}

/** rgba: width*height*4 바이트(행 우선) */
export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  if (rgba.length !== width * height * 4) throw new Error(`rgba 길이 ${rgba.length} ≠ ${width}×${height}×4`);
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter none
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  const idat = zlibSync(raw, { level: 9 });
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const parts = [sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", new Uint8Array(0))];
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

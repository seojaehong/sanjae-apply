// 브라우저에서도 도는 채우기 — node 전용 모듈(md5·zlib)을 바꾼 뒤에도 출력이 같아야 한다(docs/웹편집기_설계.md 1단계)
import { createHash, randomBytes } from "node:crypto";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { describeForm } from "../src/fill/describe.js";
import { md5Base64 } from "../src/fill/md5.js";
import { loadAssets, loadHwpxAssets, loadMap, nodeAssets } from "../src/fill/registry.js";
import { encodePng } from "../src/stamp/png.js";

process.env.SANJAE_ROOT = process.cwd(); // src/ 에서 import 하면 세 단계 위가 레포 밖이다

describe("md5Base64 = node:crypto md5", () => {
  it("블록 경계(0·1·55·56·63·64·65·119·120·1000바이트)와 무작위 값에서 같다", () => {
    for (const n of [0, 1, 55, 56, 63, 64, 65, 119, 120, 1000]) {
      const b = new Uint8Array(randomBytes(n));
      expect(md5Base64(b), `${n}바이트`).toBe(createHash("md5").update(b).digest("base64"));
    }
  });
  it("알려진 값", () => {
    expect(md5Base64(new TextEncoder().encode("abc"))).toBe(createHash("md5").update("abc").digest("base64"));
  });
});

describe("describeForm", () => {
  it("요양급여: 칸 상세에 자리 수와 체크 묶음 앞말이 붙고, MCP 용 체크 표시는 옵션일 때만", () => {
    const map = loadMap("F_YOYANG_APPLY");
    const d = describeForm(map);
    expect(d.slots).toEqual(Object.keys(map.slots));
    expect(d.slot_details.find((s) => s.key === "rrn")).toMatchObject({ kind: "boxes", boxes: 13 });
    expect(d.slot_details.find((s) => s.key === "claim_kind_accident")).toMatchObject({ kind: "check", group: "신청 구분" });
    expect(d.slot_labels["claim_kind_accident"]).toBe("신청 구분: 업무상 사고");
    expect(describeForm(map, { checkHint: true }).slot_labels["claim_kind_accident"]).toBe("신청 구분: 업무상 사고 (체크: true)");
    expect(d.stamps).toEqual(Object.keys(map.stamps ?? {}));
  });
});

describe("nodeAssets", () => {
  const same = (a: Uint8Array, b: Uint8Array) => Buffer.from(a).equals(Buffer.from(b)); // 수 MB 글꼴을 toEqual 로 비교하면 느리다
  it("기존 로더와 같은 바이트·지도를 돌려준다", async () => {
    const id = "F_YOYANG_APPLY";
    expect(await nodeAssets.map(id)).toEqual(loadMap(id));
    expect(same(await nodeAssets.pdf(id), loadAssets(id).pdf)).toBe(true);
    expect(same(await nodeAssets.font(), loadAssets(id).font)).toBe(true);
    expect(same(await nodeAssets.hwpx(id), loadHwpxAssets(id).hwpx)).toBe(true);
    expect(await nodeAssets.hwpxMap(id)).toEqual(loadHwpxAssets(id).map);
  });
});

describe("encodePng", () => {
  it("IDAT 을 풀면 필터 0 스캔라인 = 입력 RGBA 다", () => {
    const w = 7;
    const h = 5;
    const rgba = new Uint8Array(randomBytes(w * h * 4));
    const png = encodePng(w, h, rgba);
    const idat: Uint8Array[] = [];
    for (let p = 8; p < png.length; ) {
      const len = new DataView(png.buffer, png.byteOffset + p).getUint32(0);
      if (new TextDecoder().decode(png.subarray(p + 4, p + 8)) === "IDAT") idat.push(png.subarray(p + 8, p + 8 + len));
      p += 12 + len;
    }
    const raw = inflateSync(Buffer.concat(idat));
    const want = new Uint8Array(h * (w * 4 + 1));
    for (let y = 0; y < h; y++) want.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
    expect(new Uint8Array(raw)).toEqual(want);
  });
});

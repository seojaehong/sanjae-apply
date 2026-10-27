// 벡터 → 비트맵 래스터라이저(넌제로 와인딩 스캔라인, 4× 슈퍼샘플링). 도장의 테두리·글자(글리프 윤곽)를 그린다.
// 좌표계: 픽셀, 원점 왼쪽 위, y 아래로.

export type Pt = [number, number];
export type Poly = Pt[]; // 닫힌 다각형(마지막 점은 첫 점으로 이어진다)

export class Canvas {
  readonly w: number;
  readonly h: number;
  readonly ss: number;
  private cov: Uint8Array; // (w*ss) × (h*ss) 커버리지 0/1

  constructor(w: number, h: number, ss = 4) {
    this.w = w;
    this.h = h;
    this.ss = ss;
    this.cov = new Uint8Array(w * ss * h * ss);
  }

  /** 다각형 묶음을 넌제로 와인딩으로 채운다(외곽 반시계 + 안쪽 시계 = 고리) */
  fill(polys: Poly[]): void {
    const S = this.ss;
    const W = this.w * S;
    const H = this.h * S;
    type Edge = { x0: number; y0: number; x1: number; y1: number; dir: number };
    const edges: Edge[] = [];
    let minY = Infinity;
    let maxY = -Infinity;
    for (const poly of polys) {
      const n = poly.length;
      if (n < 3) continue;
      for (let i = 0; i < n; i++) {
        const a = poly[i]!;
        const b = poly[(i + 1) % n]!;
        const ax = a[0] * S;
        const ay = a[1] * S;
        const bx = b[0] * S;
        const by = b[1] * S;
        if (ay === by) continue;
        if (ay < by) edges.push({ x0: ax, y0: ay, x1: bx, y1: by, dir: 1 });
        else edges.push({ x0: bx, y0: by, x1: ax, y1: ay, dir: -1 });
        minY = Math.min(minY, ay, by);
        maxY = Math.max(maxY, ay, by);
      }
    }
    if (!edges.length) return;
    const yStart = Math.max(0, Math.floor(minY));
    const yEnd = Math.min(H - 1, Math.ceil(maxY));
    const xs: { x: number; dir: number }[] = [];
    for (let y = yStart; y <= yEnd; y++) {
      const sy = y + 0.5;
      xs.length = 0;
      for (const e of edges) {
        if (sy < e.y0 || sy >= e.y1) continue;
        const t = (sy - e.y0) / (e.y1 - e.y0);
        xs.push({ x: e.x0 + (e.x1 - e.x0) * t, dir: e.dir });
      }
      if (xs.length < 2) continue;
      xs.sort((a, b) => a.x - b.x);
      let wind = 0;
      const row = y * W;
      for (let i = 0; i < xs.length - 1; i++) {
        wind += xs[i]!.dir;
        if (wind !== 0) {
          const xa = Math.max(0, Math.round(xs[i]!.x));
          const xb = Math.min(W, Math.round(xs[i + 1]!.x));
          for (let x = xa; x < xb; x++) this.cov[row + x] = 1;
        }
      }
    }
  }

  /** 굵게 — 다각형을 반지름 r 만큼 여러 방향으로 밀어 겹쳐 채운다(가는 글꼴로 인장체 두께를 흉내) */
  fillBold(polys: Poly[], r: number): void {
    this.fill(polys);
    if (r <= 0) return;
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const dx = r * Math.cos(a);
      const dy = r * Math.sin(a);
      this.fill(polys.map((p) => p.map(([x, y]) => [x + dx, y + dy] as Pt)));
    }
  }

  /** 슈퍼샘플을 평균해 RGBA(단색 + 알파)로 */
  toRgba(r: number, g: number, b: number): Uint8Array {
    const S = this.ss;
    const W = this.w * S;
    const out = new Uint8Array(this.w * this.h * 4);
    const n = S * S;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        let c = 0;
        for (let sy = 0; sy < S; sy++) {
          const row = (y * S + sy) * W + x * S;
          for (let sx = 0; sx < S; sx++) c += this.cov[row + sx]!;
        }
        const i = (y * this.w + x) * 4;
        out[i] = r;
        out[i + 1] = g;
        out[i + 2] = b;
        out[i + 3] = Math.round((255 * c) / n);
      }
    }
    return out;
  }
}

/** 타원 다각형(반시계). rx·ry 반지름, n 꼭짓점 */
export function ellipsePoly(cx: number, cy: number, rx: number, ry: number, n = 240): Poly {
  const out: Poly = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    out.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
  }
  return out;
}

/** 둥근 네모 다각형(반시계) */
export function roundedRectPoly(x0: number, y0: number, x1: number, y1: number, rad: number, seg = 12): Poly {
  const out: Poly = [];
  const corners: [number, number, number][] = [
    [x1 - rad, y0 + rad, -Math.PI / 2],
    [x1 - rad, y1 - rad, 0],
    [x0 + rad, y1 - rad, Math.PI / 2],
    [x0 + rad, y0 + rad, Math.PI],
  ];
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= seg; i++) {
      const t = start + (i / seg) * (Math.PI / 2);
      out.push([cx + rad * Math.cos(t), cy + rad * Math.sin(t)]);
    }
  }
  return out;
}

export function reversed(p: Poly): Poly {
  return [...p].reverse();
}

/** 고리(outer − inner). outer 반시계 + inner 시계 → 넌제로로 채우면 띠만 남는다 */
export function ring(outer: Poly, inner: Poly): Poly[] {
  return [outer, reversed(inner)];
}

export interface Transform {
  /** 배율 */
  s: number;
  /** 회전(시계 방향, 라디안, 화면 기준) */
  rot: number;
  /** 회전 중심(변환 후 좌표) */
  cx: number;
  cy: number;
  /** 변환 전 좌표에서 중심으로 쓸 점 */
  ox: number;
  oy: number;
  /** y 축 뒤집기(글꼴 좌표는 y 위로) */
  flipY: boolean;
}

export function applyTransform(p: Pt, t: Transform): Pt {
  let x = (p[0] - t.ox) * t.s;
  let y = (p[1] - t.oy) * t.s;
  if (t.flipY) y = -y;
  const c = Math.cos(t.rot);
  const sn = Math.sin(t.rot);
  return [t.cx + x * c - y * sn, t.cy + x * sn + y * c];
}

/** fontkit path.commands → 다각형 목록(곡선은 선분으로 펼침) */
export function pathToPolys(commands: { command: string; args: number[] }[], t: Transform): Poly[] {
  const polys: Poly[] = [];
  let cur: Poly = [];
  let last: Pt = [0, 0];
  const push = (p: Pt) => {
    cur.push(applyTransform(p, t));
    last = p;
  };
  for (const c of commands) {
    const a = c.args;
    switch (c.command) {
      case "moveTo":
        if (cur.length > 2) polys.push(cur);
        cur = [];
        push([a[0]!, a[1]!]);
        break;
      case "lineTo":
        push([a[0]!, a[1]!]);
        break;
      case "quadraticCurveTo": {
        const [x0, y0] = last;
        const [cx, cy, x1, y1] = [a[0]!, a[1]!, a[2]!, a[3]!];
        for (let i = 1; i <= 8; i++) {
          const u = i / 8;
          const v = 1 - u;
          push([v * v * x0 + 2 * v * u * cx + u * u * x1, v * v * y0 + 2 * v * u * cy + u * u * y1]);
        }
        break;
      }
      case "bezierCurveTo": {
        const [x0, y0] = last;
        const [c1x, c1y, c2x, c2y, x1, y1] = [a[0]!, a[1]!, a[2]!, a[3]!, a[4]!, a[5]!];
        for (let i = 1; i <= 12; i++) {
          const u = i / 12;
          const v = 1 - u;
          push([
            v * v * v * x0 + 3 * v * v * u * c1x + 3 * v * u * u * c2x + u * u * u * x1,
            v * v * v * y0 + 3 * v * v * u * c1y + 3 * v * u * u * c2y + u * u * u * y1,
          ]);
        }
        break;
      }
      case "closePath":
        if (cur.length > 2) polys.push(cur);
        cur = [];
        break;
    }
  }
  if (cur.length > 2) polys.push(cur);
  return polys;
}

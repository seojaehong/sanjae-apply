// 주소 → 관할 지방고용노동관서 + 산업재해조사표 접수 부서(전화·팩스)
//
// 관할 근거 = 「고용노동부와 그 소속기관 직제 시행규칙」 별표 1 (jurisdiction.json)
// 연락처    = 각 관서 moel.go.kr 부서 안내 화면 (labor_offices.json)
//
// findOffice(address, data, { construction }) 는 순수 함수다. data 는 loadData() 로 읽거나 직접 넘긴다.
// 상태:
//   confirmed  — 관서 하나로 정해짐
//   candidates — 시도가 빠져 같은 이름 시군구가 여럿이거나, 법령이 읍·면·리 단위로 가르는데 주소에 그 단위가 없음
//   none       — 시도·시군구를 읽지 못함
// 후보를 하나로 추정하지 않는다.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export function loadData(dir = HERE) {
  const jurisdiction = JSON.parse(readFileSync(join(dir, 'jurisdiction.json'), 'utf8'));
  const offices = JSON.parse(readFileSync(join(dir, 'labor_offices.json'), 'utf8'));
  return { jurisdiction, offices };
}

// 옛 광주광역시의 자치구 — 「광주시 북구」처럼 쓰면 광주광역시로 읽는다(그 밖의 「광주시」는 경기도 광주시)
const GWANGJU_METRO_GU = new Set(['동구', '서구', '남구', '북구', '광산구']);

function normalize(address) {
  return String(address ?? '')
    .replace(/\(\s*우\s*[:：]?\s*\d{5}\s*\)/g, ' ')
    .replace(/^\s*\[?\d{5}\]?\s+/, ' ')
    .replace(/[,·]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sigunguIndex(jur) {
  // 시군구 이름 → [시도...]  (시도를 생략한 주소용)
  const idx = new Map();
  for (const [sido, m] of Object.entries(jur.jurisdiction)) {
    for (const sgg of Object.keys(m)) {
      if (sgg === '*') continue;
      if (!idx.has(sgg)) idx.set(sgg, []);
      idx.get(sgg).push(sido);
    }
  }
  for (const [sido, m] of Object.entries(jur.sigungu_aliases ?? {})) {
    for (const oldName of Object.keys(m)) {
      if (!idx.has(oldName)) idx.set(oldName, []);
      if (!idx.get(oldName).includes(sido)) idx.get(oldName).push(sido);
    }
  }
  for (const mv of jur.sido_moves ?? []) {
    if (!idx.has(mv.sigungu)) idx.set(mv.sigungu, []);
    if (!idx.get(mv.sigungu).includes(mv.to_sido)) idx.get(mv.sigungu).push(mv.to_sido);
  }
  return idx;
}

// 시도 이름 첫머리(공백 없이 붙여 쓴 주소: 「서울특별시중구」)
function splitGluedSido(token, jur) {
  const names = Object.keys(jur.sido_aliases).sort((a, b) => b.length - a.length);
  for (const n of names) {
    if (n.length >= 3 && token.startsWith(n) && token.length > n.length) return [n, token.slice(n.length)];
  }
  return null;
}

export function parseAddress(address, jur) {
  const text = normalize(address);
  let tokens = text.split(' ').filter(Boolean);
  const notes = [];
  if (tokens.length && !jur.sido_aliases[tokens[0]]) {
    const glued = splitGluedSido(tokens[0], jur);
    if (glued) tokens = [...glued, ...tokens.slice(1)];
  }
  let sido = null;
  let i = 0;
  if (tokens[0] === '광주시') {
    // 「광주시」 = 경기도 광주시가 원칙. 다음 낱말이 광주광역시 자치구면 광주광역시로 본다.
    if (GWANGJU_METRO_GU.has(tokens[1])) {
      sido = '전남광주통합특별시';
      i = 1;
      notes.push('「광주시 ○구」를 광주광역시(현 전남광주통합특별시)로 읽음');
    }
  } else if (jur.sido_aliases[tokens[0]]) {
    sido = jur.sido_aliases[tokens[0]];
    if (sido !== tokens[0]) notes.push(`시도 이름 「${tokens[0]}」→「${sido}」(법령 별표 1 표기)`);
    i = 1;
  }
  let sigungu = null;
  let rawSigungu = null;
  const t = tokens[i];
  const gluedSiGu = t?.match(/^(.{1,4}?시)(.{1,4}구)$/); // 「수원시팔달구」
  if (gluedSiGu) {
    rawSigungu = t;
    sigungu = gluedSiGu[1];
  } else if (t && /[시군구]$/.test(t)) {
    rawSigungu = t;
    sigungu = t;
  } else if (t) {
    // 「수원시팔달구」처럼 붙여 쓴 경우: 시/군 까지만
    const m = t.match(/^(.+?[시군])(.+[구읍면동])$/);
    if (m) {
      rawSigungu = m[1];
      sigungu = m[1];
    }
  }
  const rest = tokens.slice(i + 1).join(' ');
  return { text, tokens, sido, sigungu, rawSigungu, rest, notes, sidoOmitted: !sido };
}

function officeById(data, id) {
  return data.offices.offices.find((o) => o.id === id) ?? null;
}

function contactFor(data, officeId, sido, construction) {
  const o = officeById(data, officeId);
  if (!o) return null;
  const override = (data.jurisdiction.contact_overrides ?? []).find((c) => c.office === officeId && c.sido === sido);
  if (override) {
    const unit = (o.units ?? []).find((u) => u.name === override.dept);
    if (unit) return { ...unit.accident_report, unit: unit.name, override_note: override.note };
  }
  const ar = o.accident_report ?? {};
  if (construction && ar.construction) return { ...ar.construction, kind: 'construction' };
  const general = { ...(ar.general ?? {}), kind: 'general' };
  if (construction) general.construction_note = '이 관서에는 건설산재 전담 과가 없어 산재예방감독과(팀) 연락처를 돌려준다';
  return general;
}

function summarize(data, officeId, sido, construction) {
  const o = officeById(data, officeId);
  if (!o) return { id: officeId, name: null };
  const reportTo = contactFor(data, officeId, sido, construction);
  // 지방청 직할 구역: 광역산재예방감독과도 법령상 「재해발생 상황파악」을 맡는다 — 함께 돌려준다
  const alt = reportTo?.kind === 'general' && !reportTo.unit ? o.accident_report?.regional_alt ?? null : null;
  return {
    id: o.id,
    name: o.name,
    kind: o.kind,
    parent: o.parent,
    parent_name: o.parent_name,
    address: o.address,
    main_phone: o.main_phone,
    main_fax: o.main_fax,
    report_to: reportTo,
    report_to_alt: alt,
    source_url: o.sources?.[0] ?? null,
  };
}

function resolveInSido(jur, sido, sigungu, rest) {
  // → { office } | { candidates:[{office, why}] } | null
  const m = jur.jurisdiction[sido];
  if (!m) return null;
  if (m['*']) return { office: m['*'], matched: { sido, sigungu: null } };
  if (!sigungu) return null;
  let sgg = sigungu;
  const alias = jur.sigungu_aliases?.[sido]?.[sgg];
  const notes = [];
  if (alias && !m[sgg]) {
    notes.push(`옛 이름 「${sgg}」→「${alias}」(같은 관서)`);
    sgg = alias;
  }
  const office = m[sgg];
  if (!office) return null;
  const ex = (jur.exceptions ?? []).filter((e) => e.sido === sido && e.sigungu === sgg);
  for (const e of ex) {
    // 예: 칠곡군 석적읍 중리 구미국가산업단지 → 구미지청 (나머지 칠곡군 = 대구서부지청)
    const [eup, ri] = e.area.split(' ');
    const r = rest ?? '';
    if (/국가산업단지|국가산단|구미국가/.test(r) && r.includes(eup)) {
      return { office: e.office, matched: { sido, sigungu: sgg }, notes: [...notes, `법령 예외: ${e.area}`] };
    }
    if (r.includes(eup)) {
      const riGiven = /\S+리(\s|$|\d)/.test(r.replace(eup, ''));
      if (riGiven && !r.includes(ri)) {
        return { office, matched: { sido, sigungu: sgg }, notes: [...notes, `${eup} 이지만 ${ri} 아님`] };
      }
      return {
        candidates: [
          { office: e.office, why: `${e.area} 안이면` },
          { office: e.default_office, why: `${e.area} 밖이면` },
        ],
        matched: { sido, sigungu: sgg },
        notes: [...notes, `법령이 「${e.area}」만 따로 관할 — 주소만으로 가를 수 없음`],
      };
    }
  }
  return { office, matched: { sido, sigungu: sgg }, notes };
}

export function findOffice(address, data, opts = {}) {
  const jur = data.jurisdiction;
  const construction = Boolean(opts.construction);
  const p = parseAddress(address, jur);
  const notes = [...p.notes];
  let sido = p.sido;
  let sigungu = p.sigungu;

  // 시도가 바뀐 시군구(경상북도 군위군 → 대구광역시)
  for (const mv of jur.sido_moves ?? []) {
    if (sido === mv.from_sido && sigungu === mv.sigungu) {
      notes.push(`${mv.from_sido} ${mv.sigungu} → ${mv.to_sido} (${mv.note})`);
      sido = mv.to_sido;
    }
  }

  if (sido) {
    const r = resolveInSido(jur, sido, sigungu, p.rest);
    if (!r) return { status: 'none', input: address, parsed: { sido, sigungu }, notes: [...notes, '시군구를 관할표에서 찾지 못함'] };
    if (r.candidates) {
      return {
        status: 'candidates',
        input: address,
        parsed: r.matched,
        candidates: r.candidates.map((c) => ({ ...summarize(data, c.office, sido, construction), why: c.why })),
        notes: [...notes, ...(r.notes ?? [])],
      };
    }
    return {
      status: 'confirmed',
      input: address,
      parsed: r.matched,
      office: summarize(data, r.office, sido, construction),
      notes: [...notes, ...(r.notes ?? [])],
    };
  }

  // 시도 생략: 시군구 이름으로만 찾는다(같은 이름이 여럿이면 후보)
  if (!sigungu) return { status: 'none', input: address, parsed: {}, notes: [...notes, '시도·시군구를 읽지 못함'] };
  const idx = sigunguIndex(jur);
  const sidos = idx.get(sigungu) ?? [];
  const hits = [];
  for (const s of sidos) {
    const r = resolveInSido(jur, s, sigungu, p.rest);
    if (r?.office) hits.push({ sido: s, office: r.office });
    if (r?.candidates) for (const c of r.candidates) hits.push({ sido: s, office: c.office, why: c.why });
  }
  const uniq = [...new Map(hits.map((h) => [h.office, h])).values()];
  if (uniq.length === 1 && hits.length === 1) {
    return {
      status: 'confirmed',
      input: address,
      parsed: { sido: uniq[0].sido, sigungu },
      office: summarize(data, uniq[0].office, uniq[0].sido, construction),
      notes: [...notes, '시도가 빠진 주소 — 시군구 이름이 하나뿐이라 확정'],
    };
  }
  if (uniq.length === 0) return { status: 'none', input: address, parsed: { sigungu }, notes: [...notes, '시군구를 관할표에서 찾지 못함'] };
  return {
    status: 'candidates',
    input: address,
    parsed: { sigungu },
    candidates: hits.map((h) => ({ ...summarize(data, h.office, h.sido, construction), sido: h.sido, why: h.why ?? `${h.sido} ${sigungu}` })),
    notes: [...notes, `시도가 빠졌고 「${sigungu}」가 ${sidos.length}곳에 있음 — 시도를 넣어 다시 찾기`],
  };
}

export default findOffice;

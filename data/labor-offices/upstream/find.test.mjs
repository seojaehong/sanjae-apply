// 실행: node --test find.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findOffice, loadData, parseAddress } from './find.mjs';

const data = loadData();
const id = (addr, opts) => {
  const r = findOffice(addr, data, opts);
  return r.status === 'confirmed' ? r.office.id : r.status;
};
const cands = (addr) => {
  const r = findOffice(addr, data);
  assert.equal(r.status, 'candidates', `${addr} → ${r.status}`);
  return r.candidates.map((c) => c.id).sort();
};

test('기본: 지방청 직할과 지청', () => {
  assert.equal(id('서울특별시 중구 삼일대로 363'), 'seoul');
  assert.equal(id('서울특별시 강남구 테헤란로 152'), 'seoulgangnam');
  assert.equal(id('경기도 수원시 팔달구 효원로 1'), 'gyeonggi');
  assert.equal(id('충청북도 청주시 상당구 상당로 82'), 'cheongju');
  assert.equal(id('경기도 수원시팔달구 효원로 1'), 'gyeonggi'); // 붙여 쓴 시·구
});

test('같은 이름 구 — 시도로 가른다', () => {
  assert.equal(id('서울특별시 중구 세종대로 110'), 'seoul');
  assert.equal(id('부산광역시 중구 중앙대로 2'), 'busan');
  assert.equal(id('대구광역시 중구 공평로 88'), 'daegu');
  assert.equal(id('울산광역시 중구 성안로 1'), 'ulsandongbu');
  assert.equal(id('대전광역시 중구 중앙로 100'), 'daejeon');
  assert.equal(id('서울특별시 강서구 화곡로 302'), 'seoulnambu');
  assert.equal(id('부산광역시 강서구 낙동북로 477'), 'busanbukbu');
  assert.equal(id('부산광역시 북구 금곡대로 1'), 'busanbukbu');
  assert.equal(id('대구광역시 북구 연암로 40'), 'daegu');
  assert.equal(id('울산광역시 북구 산업로 1'), 'ulsandongbu');
  assert.equal(id('대구광역시 서구 국채보상로 257'), 'daeguseobu');
  assert.equal(id('부산광역시 서구 구덕로 120'), 'busan');
  assert.equal(id('대구광역시 남구 이천로 51'), 'daeguseobu');
  assert.equal(id('울산광역시 남구 돋질로 233'), 'ulsan');
});

test('시도를 빼면 같은 이름 구는 후보로 돌려준다(추정 금지)', () => {
  const c = cands('중구 세종대로 110');
  assert.ok(c.includes('seoul') && c.includes('busan') && c.includes('daegu') && c.includes('ulsandongbu'));
  assert.deepEqual(cands('고성군 간성읍 고성중앙길 9'), ['gangneung', 'tongyeong']);
  assert.equal(id('김포시 사우중로 1'), 'bucheon'); // 하나뿐인 이름은 확정
});

test('세종특별자치시 — 시군구 없이 대전청', () => {
  assert.equal(id('세종특별자치시 한누리대로 2130'), 'daejeon');
  assert.equal(id('세종시 갈매로 388'), 'daejeon');
  assert.equal(id('세종 도움6로 11'), 'daejeon');
});

test('제주(행정시) — 광주청 관할, 연락처는 제주산재예방감독팀', () => {
  for (const a of ['제주특별자치도 제주시 청사로 59', '제주특별자치도 서귀포시 중앙로 105', '제주도 제주시 문연로 6']) {
    const r = findOffice(a, data);
    assert.equal(r.status, 'confirmed', a);
    assert.equal(r.office.id, 'gwangju');
    assert.equal(r.office.report_to.unit, '제주산재예방감독팀', a);
  }
  // 광주 본청 주소는 본청 산재예방감독과
  const g = findOffice('광주광역시 북구 첨단과기로 208번길 43', data);
  assert.equal(g.office.id, 'gwangju');
  assert.notEqual(g.office.report_to.unit, '제주산재예방감독팀');
});

test('일부 지역만 다른 관할 — 칠곡군 석적읍 중리 구미국가산업단지', () => {
  assert.equal(id('경상북도 칠곡군 왜관읍 군청1길 80'), 'daeguseobu');
  assert.equal(id('경상북도 칠곡군 석적읍 중리 구미국가산업단지 100'), 'gumi');
  assert.equal(id('경상북도 칠곡군 석적읍 남율리 123'), 'daeguseobu');
  assert.deepEqual(cands('경상북도 칠곡군 석적읍 석적로 955'), ['daeguseobu', 'gumi']); // 도로명이라 리를 모름
  assert.deepEqual(cands('경상북도 칠곡군 석적읍 중리 55'), ['daeguseobu', 'gumi']);
});

test('시도 경계를 넘는 관할(별표 1)', () => {
  assert.equal(id('강원특별자치도 철원군 철원읍 금학로 1'), 'uijeongbu');
  assert.equal(id('강원도 철원군 갈말읍 삼부연로 51'), 'uijeongbu');
  assert.equal(id('경기도 가평군 가평읍 석봉로 181'), 'gangwon');
  assert.equal(id('충청남도 공주시 봉황로 1'), 'daejeon');
  assert.equal(id('경상북도 경산시 남매로 158'), 'daegu');
});

test('상위청은 별표 3 — 부천지청은 중부청, 울산은 부산청', () => {
  const r = findOffice('경기도 부천시 길주로 210', data);
  assert.equal(r.office.id, 'bucheon');
  assert.equal(r.office.parent, 'jungbu');
  assert.equal(findOffice('울산광역시 남구 돋질로 233', data).office.parent, 'busan');
  assert.equal(findOffice('강원특별자치도 영월군 영월읍 단종로 8', data).office.id, 'yeongwol');
});

test('옛 이름 주소 — 광주광역시·전라남도·전라북도·강원도·경상북도 군위군·인천 중구/서구', () => {
  assert.equal(id('광주광역시 서구 내방로 111'), 'gwangju');
  assert.equal(id('광주 광산구 광산로 29'), 'gwangju');
  assert.equal(id('광주시 북구 우치로 77'), 'gwangju');
  assert.equal(id('전라남도 목포시 양을로 203'), 'mokpo');
  assert.equal(id('전남 순천시 장명로 30'), 'yeosu');
  assert.equal(id('전라남도 나주시 시청길 22'), 'gwangju');
  assert.equal(id('전라북도 전주시 완산구 노송광장로 10'), 'jeonju');
  assert.equal(id('강원도 춘천시 시청길 11'), 'gangwon');
  assert.equal(id('경상북도 군위군 군위읍 군청로 200'), 'daegu');
  assert.equal(id('인천광역시 중구 신포로 27'), 'jungbu');
  assert.equal(id('인천광역시 중구 운서동 2850'), 'jungbu'); // 영종(현 영종구)
  assert.equal(id('인천광역시 동구 송림로 23'), 'jungbu');
  assert.equal(id('인천광역시 서구 서곶로 307'), 'incheonbukbu');
  assert.equal(id('인천광역시 검단구 검단로 1'), 'incheonbukbu');
  assert.equal(id('인천광역시 제물포구 참외전로 1'), 'jungbu');
  assert.equal(id('인천광역시 남구 독정이로 95'), 'jungbu');
});

test('경기도 광주시 ↔ 광주광역시', () => {
  assert.equal(id('경기도 광주시 행정타운로 50'), 'seongnam');
  assert.equal(id('광주시 오포읍 문형산길 1'), 'seongnam');
  assert.equal(id('광주광역시 동구 서남로 1'), 'gwangju');
});

test('건설업 옵션 — 건설산재예방감독과가 있는 관서만 건설과로', () => {
  const g = findOffice('서울특별시 종로구 세종대로 209', data, { construction: true });
  assert.equal(g.office.report_to.kind, 'construction');
  const n = findOffice('서울특별시 강남구 테헤란로 152', data, { construction: true });
  assert.equal(n.office.report_to.kind, 'general'); // 강남지청은 건설과 없음
  assert.ok(n.office.report_to.construction_note);
});

test('지방청 직할 구역은 광역산재예방감독과를 함께 돌려준다(지청·제주·건설은 없음)', () => {
  const s = findOffice('서울특별시 종로구 세종대로 209', data);
  assert.equal(s.office.report_to.dept, '산재예방감독과');
  assert.equal(s.office.report_to_alt.dept, '광역산재예방감독과');
  assert.equal(findOffice('서울특별시 강남구 테헤란로 152', data).office.report_to_alt, null);
  assert.equal(findOffice('제주특별자치도 제주시 청사로 59', data).office.report_to_alt, null);
  assert.equal(findOffice('서울특별시 종로구 세종대로 209', data, { construction: true }).office.report_to_alt, null);
});

test('주소가 아니면 none', () => {
  assert.equal(findOffice('', data).status, 'none');
  assert.equal(findOffice('아무말', data).status, 'none');
  assert.equal(findOffice('서울특별시 없는구 1', data).status, 'none');
});

test('모든 관서에 조사표 접수 팩스 칸이 있다(값 또는 「미확인」 표시)', () => {
  for (const o of data.offices.offices) {
    const g = o.accident_report?.general;
    assert.ok(g, `${o.id} general 없음`);
    assert.ok(g.fax || g.fax_status === '미확인', `${o.id} fax 칸`);
  }
});

test('parseAddress 우편번호·괄호 정리', () => {
  const p = parseAddress('(우:04541) 서울특별시 중구 삼일대로 363(장교동)', data.jurisdiction);
  assert.equal(p.sido, '서울특별시');
  assert.equal(p.sigungu, '중구');
});

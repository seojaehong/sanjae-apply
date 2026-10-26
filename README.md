# sanjae-apply — 산재 신청 도우미 (MCP · CLI)

산재보험 보상 청구는 청구주의라 재해자나 대리인이 급여 종류마다 다른 서식과 첨부를 직접 챙겨야 합니다.
이 프로젝트는 **급여 종류와 재해 분기를 받아 필요한 서식·첨부·근거 조문·절차 안내를 돌려주고**,
근로복지공단 정본 PDF 위에 값을 얹어 **요양급여신청서(별지 제2호, 2026.7.7 개정)** 를 채워 줍니다.

- 승인 가능성·확률은 계산하지도 출력하지도 않습니다(코드 필터). `READY_TO_SUBMIT` 은 「제출 가능」이지 승인이 아닙니다.
- 입력값은 서버에 저장하지 않습니다. 결과만 돌려줍니다.
- 법령은 법제처 국가법령정보 Open API 를 직접 부릅니다(별도 MCP 불필요). 근거 조문은 받아 둔 조문 XML 과 시험으로 대조합니다.
- 서식 정본은 근로복지공단 서식자료실 파일만 씁니다. 좌표 지도는 정본 sha256 에 묶여 있어 서식이 바뀌면 시험이 깨집니다.

> 공인노무사법 제27조에 따라 청구의 대행·대리와 서류의 작성·확인은 공인노무사의 직무입니다. 이 도구는 그 일을 돕는 도구이지 대신하지 않습니다.

## 바로 쓰기 — 원격 MCP

```
claude mcp add --transport http --scope user sanjae-apply https://sanjae-apply.vercel.app/api/mcp/mcp \
  --header "Authorization: Bearer <발급받은 토큰>"
```

도구 3개: `list_required_forms` · `get_form_catalog` · `fill_yoyang_apply`(base64 PDF).
Claude Desktop·Cursor 등 MCP 클라이언트는 같은 URL 과 헤더를 설정에 넣으면 됩니다. 토큰은 운영자에게 받습니다.

## 직접 돌리기

```
git clone https://github.com/seojaehong/sanjae-apply && cd sanjae-apply
npm ci && npm run build && npm test

# 규칙만(CLI)
node dist/src/cli.js YOYANG --accident COMMUTE --third-party yes
node dist/src/cli.js JANGHAE --tags NOISE_HEARING_LOSS --json

# 서식 채우기(로컬)
node scripts/fill_local.mjs forms/maps/F_YOYANG_APPLY.json forms/bundled/F_YOYANG_APPLY.pdf \
  fonts/NanumGothic-Regular.ttf test/samples/F_YOYANG_APPLY.json out.pdf
python scripts/verify_fill.py out.pdf forms/maps/F_YOYANG_APPLY.json test/samples/F_YOYANG_APPLY.json out.jpg forms/bundled/F_YOYANG_APPLY.pdf
```

자체 호스팅(Vercel): 이 레포를 올리고 env `SANJAE_MCP_TOKENS`(쉼표 구분 토큰)을 넣으면 `/api/mcp/mcp` 가 열립니다. 법령 실시간 조회를 쓰려면 `LAW_GO_KR_OC`(법제처 인증키).

## 구조

```
src/core     규칙 코어 S-01~S-13 · 서식/첨부 카탈로그 · 금지어 필터 (순수, IO 없음)
src/fill     pdf-lib 오버레이 (text / boxes / check / multiline)
src/mcp      mcp-handler 서버 (Bearer)
src/laws     법제처 Open API 클라이언트
api/mcp      Vercel 함수
forms/       catalog.json(정본 대장) · maps/(좌표 지도) · bundled/(동봉 PDF) · raw/(미커밋, 공단 다운로드)
scripts/     comwel_forms.py(서식자료실 수집) · build_catalog.py · verify_fill.py · mcp_dryrun.mjs · fill_local.mjs
test/        vitest 68 (규칙 · 조문 대조 · 대장 대조 · 오버레이 · MCP)
docs/        패키징·배포·연결 가이드
```

## 상태

- 필요 서식·첨부 판정: 급여 9종 × 분기 전부.
- PDF 채우기: 요양급여신청서 1종(1쪽). 나머지 12종은 같은 방법으로 좌표 지도를 추가하면 됩니다.
- 온라인 접수(토탈서비스)는 하지 않습니다.

규칙은 산재 실무 메모(산재창고 블로그, 2025.1.14 기준)를 옮기고 법 조문으로 근거를 붙인 것입니다. 공단 내부 규정과는 대조하지 않았습니다. 사용 전 담당 노무사가 확인하십시오.

## 라이선스

MIT. 동봉 글꼴 나눔고딕은 SIL OFL 1.1(`fonts/OFL.txt`). 공단 서식 PDF 는 근로복지공단 공개 자료입니다.

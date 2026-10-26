# sanjae-apply — 산재 신청 도우미 (MCP · CLI)

산재보험 보상 청구는 청구주의라 재해자나 대리인이 급여 종류마다 다른 서식과 첨부를 직접 챙겨야 합니다.
이 프로젝트는 **급여 종류와 재해 분기를 받아 필요한 서식·첨부·근거 조문·절차 안내를 돌려주고**,
근로복지공단 정본 PDF 위에 값을 얹어 **청구·신청 서식 12종**(요양급여신청서 별지 제2호 2026.7.7 개정 등)을 채워 줍니다.

- 승인 가능성·확률은 계산하지도 출력하지도 않습니다(코드 필터). `READY_TO_SUBMIT` 은 「제출 가능」이지 승인이 아닙니다.
- 입력값은 서버에 저장하지 않습니다. 결과만 돌려줍니다.
- 법령은 법제처 국가법령정보 Open API 를 직접 부릅니다(별도 MCP 불필요). 근거 조문은 받아 둔 조문 XML 과 시험으로 대조합니다.
- 서식 정본은 근로복지공단 서식자료실 파일만 씁니다. 좌표 지도는 정본 sha256 에 묶여 있어 서식이 바뀌면 시험이 깨집니다.

> 공인노무사법 제27조에 따라 청구의 대행·대리와 서류의 작성·확인은 공인노무사의 직무입니다. 이 도구는 그 일을 돕는 도구이지 대신하지 않습니다.

## 가장 쉬운 방법 — 내 PC 에서(설치 없음, 토큰 없음)

Node.js 20 이상이 있으면 끝입니다. 서버에 아무것도 보내지 않습니다.

**Claude Desktop / Claude Code 에 붙이기(로컬 stdio MCP)**
```
claude mcp add --scope user sanjae-apply -- npx -y sanjae-apply mcp
```
Claude Desktop 은 `claude_desktop_config.json` 에:
```json
{ "mcpServers": { "sanjae-apply": { "command": "npx", "args": ["-y", "sanjae-apply", "mcp"] } } }
```
Cursor·Windsurf 등도 같은 command/args 를 MCP 설정에 넣습니다.

> npm 에 게시되기 전에는 `sanjae-apply` 자리에 릴리스 파일 주소를 씁니다:
> `npx -y https://github.com/seojaehong/sanjae-apply/releases/download/v0.2.0/sanjae-apply-0.2.0.tgz mcp`
> (`claude mcp add --scope user sanjae-apply -- npx -y https://github.com/seojaehong/sanjae-apply/releases/download/v0.2.0/sanjae-apply-0.2.0.tgz mcp`)

**명령줄로 쓰기**
```
npx -y sanjae-apply check YOYANG --accident COMMUTE --third-party yes     # 필요 서식·첨부·근거
npx -y sanjae-apply check JANGHAE --tags NOISE_HEARING_LOSS --json
npx -y sanjae-apply catalog F_YOYANG_APPLY                                # 서식 정본·채울 수 있는 칸
npx -y sanjae-apply fill F_YOYANG_APPLY values.json --out 신청서.pdf       # 공단 정본 위에 채우기
```
`values.json` 의 칸 이름은 `catalog <FORM_ID>` 의 `slots` 에 나옵니다. 서식이 갱신되면 `npx -y sanjae-apply@latest`.

MCP 도구 4개: `list_required_forms` · `get_form_catalog` · `fill_form`(form_id + 값 → base64 PDF) · `fill_yoyang_apply`(호환).

## 원격 MCP(운영자가 토큰을 주는 경우)

```
claude mcp add --transport http --scope user sanjae-apply https://sanjae-apply.vercel.app/api/mcp/mcp \
  --header "Authorization: Bearer <발급받은 토큰>"
```
같은 도구 4개가 원격으로 돕니다. 입력은 서버에 저장되지 않지만 네트워크를 거칩니다. 주민번호는 보내지 않아도 됩니다(빈칸으로 남습니다).

## 개발

```
git clone https://github.com/seojaehong/sanjae-apply && cd sanjae-apply
npm ci && npm test            # build + vitest (규칙·조문 대조·대장 대조·오버레이·MCP http/stdio·CLI)

# 채운 PDF 를 눈과 픽셀로 검사
python scripts/verify_fill.py out.pdf forms/maps/F_YOYANG_APPLY.json test/samples/F_YOYANG_APPLY.json out.jpg forms/bundled/F_YOYANG_APPLY.pdf
```
새 서식의 좌표 지도를 만드는 법은 `docs/좌표지도_작성법.md`.

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
- PDF 채우기: 12종(요양급여 · 출퇴근 합본 · 제3자 신고서+확인서 · 유족 · 본인부담 · 휴업 · 간병료이송비보조기 · 보조기 처방전(기타) · 미지급 · 장해 묶음(청구서·소음작업 확인서·선택 확인서) · 추가상병 · 재요양). 신청인이 쓰는 칸만 채우고 의사·사업주·공단 칸은 비워 둡니다.
- 온라인 접수(토탈서비스)는 하지 않습니다.

규칙은 산재 실무 메모(산재창고 블로그, 2025.1.14 기준)를 옮기고 법 조문으로 근거를 붙인 것입니다. 공단 내부 규정과는 대조하지 않았습니다. 사용 전 담당 노무사가 확인하십시오.

## 라이선스

MIT. 동봉 글꼴 나눔고딕은 SIL OFL 1.1(`fonts/OFL.txt`). 공단 서식 PDF 는 근로복지공단 공개 자료입니다.

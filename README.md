<div align="center">

# 🩹 sanjae-apply

**산재 신청 도우미 · MCP 서버 + CLI**

급여 종류와 재해 상황을 말하면 **필요한 서식·첨부·근거 조문**을 알려 줍니다.
근로복지공단 **정본 PDF 12종**도 그 자리에서 채워 줍니다.

[![release](https://img.shields.io/github/v/release/seojaehong/sanjae-apply?label=release&color=2ea44f)](https://github.com/seojaehong/sanjae-apply/releases)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-stdio%20%2B%20http-7c3aed)](https://modelcontextprotocol.io)
[![tests](https://img.shields.io/badge/tests-113%20passing-2ea44f)](test/)

</div>

---

## ✨ 무엇을 해 주나요

산재보험은 **청구주의**입니다. 재해자나 대리인이 급여 종류마다 다른 서식과 첨부를 직접 챙겨야 합니다.
이 도구는 그 「챙기는 일」을 돕습니다.

| 하는 일 | 설명 |
|---|---|
| 📋 **필요 서식 확인** | 급여 9종(요양·휴업·장해·유족·간병료 등) × 사고/출퇴근/질병 × 제3자 유무를 받아 `REQUIRED` / `CONDITIONAL` / `NOT_APPLICABLE` 로 돌려줍니다 |
| 📎 **첨부 점검** | 이미 가진 것은 `PROVIDED`, 없는 것은 `MISSING`, 다른 서류로 갈음되는 것은 `SUBSTITUTABLE` |
| ⚖️ **근거 조문** | 산재보험법·시행령·시행규칙 조문 번호와 제목을 함께 붙입니다(법제처 국가법령정보 Open API) |
| ❓ **남은 질문** | 아직 답이 없는 분기는 `open_confirmations` 로 되돌려 줍니다. 모르는 것을 지어내지 않습니다 |
| 🖨️ **PDF 채우기** | 공단 서식자료실 정본 PDF 위에 값을 얹어 돌려줍니다. 신청인 칸만 채우고 의사·사업주·공단 칸은 비웁니다 |

> [!IMPORTANT]
> **승인 여부는 다루지 않습니다.** 결과의 `READY_TO_SUBMIT` 은 「제출할 수 있는 상태」이지 승인이 아닙니다.
> 결과를 점치는 표현은 코드 필터가 출력 단계에서 막습니다.

> [!NOTE]
> **입력값을 저장하지 않습니다.** 로컬 설치는 PC 밖으로 아무것도 보내지 않습니다. 주민등록번호 같은 칸은 비워 두고 출력한 뒤 손으로 적어도 됩니다.

---

## 🚀 30초 설치 (내 PC, 토큰 없음)

Node.js 20 이상만 있으면 됩니다.

### Claude Code

```bash
claude mcp add --scope user sanjae-apply -- npx -y sanjae-apply mcp
```

### Claude Desktop

`claude_desktop_config.json` 에 추가합니다.

```json
{
  "mcpServers": {
    "sanjae-apply": { "command": "npx", "args": ["-y", "sanjae-apply", "mcp"] }
  }
}
```

<details>
<summary>🪟 Windows 에서 Claude Desktop 이 npx 를 못 찾을 때</summary>

`cmd /c` 로 감쌉니다.

```json
{
  "mcpServers": {
    "sanjae-apply": { "command": "cmd", "args": ["/c", "npx", "-y", "sanjae-apply", "mcp"] }
  }
}
```
</details>

<details>
<summary>🧩 Cursor · Windsurf · 그 밖의 MCP 호스트</summary>

같은 `command` / `args` 를 각 도구의 MCP 설정에 넣습니다. stdio 전송이면 전부 됩니다.
</details>

> [!TIP]
> npm 에 올라가기 전에는 `sanjae-apply` 자리에 릴리스 파일 주소를 씁니다.
> ```bash
> claude mcp add --scope user sanjae-apply -- npx -y https://github.com/seojaehong/sanjae-apply/releases/download/v0.3.0/sanjae-apply-0.3.0.tgz mcp
> ```

붙이고 나서 AI 에게 이렇게 말해 보세요.

> 「출퇴근 중 교통사고인데 상대 운전자가 있어요. 요양급여 신청하려면 뭐가 필요해요?」
> 「요양급여신청서에 이 값으로 채워서 PDF 로 줘.」

---

## 💻 명령줄로 쓰기

```bash
# 필요 서식·첨부·근거 조문
npx -y sanjae-apply check YOYANG --accident COMMUTE --third-party yes
npx -y sanjae-apply check JANGHAE --tags NOISE_HEARING_LOSS --json

# 서식 정본 대장과 채울 수 있는 칸 이름
npx -y sanjae-apply catalog F_YOYANG_APPLY

# 공단 정본 PDF 위에 채우기
npx -y sanjae-apply fill F_YOYANG_APPLY values.json --out 신청서.pdf
```

`values.json` 의 칸 이름은 `catalog <FORM_ID>` 결과의 `slots` 에 나옵니다. 서식이 갱신되면 `npx -y sanjae-apply@latest` 로 받습니다.

<details>
<summary>🔧 MCP 도구 4개</summary>

| 도구 | 하는 일 |
|---|---|
| `list_required_forms` | 급여·재해 분기 → 서식·첨부·조문·절차·남은 질문 |
| `get_form_catalog` | 공단 정본 대장(파일명·개정일·sha256·게시글 URL)과 채울 수 있는 서식·칸 이름 |
| `fill_form` | `form_id` + 값 → 채운 PDF(base64) |
| `fill_yoyang_apply` | v0.1 호환. `fill_form(form_id="F_YOYANG_APPLY")` 과 같습니다 |
</details>

---

## 📄 채울 수 있는 서식 12종

| 서식 | 칸 수 |
|---|---:|
| 요양급여신청서 (별지 제2호, 2026.7.7 개정) | 35 |
| 출퇴근 재해 합본 (신청서 + 발생신고서) | 79 |
| 제3자 재해 신고서 + 확인서 | 48 |
| 유족급여 청구서 | 75 |
| 본인부담 치료비 청구서 | 42 |
| 휴업급여 청구서 | 37 |
| 간병료·이송비·보조기 청구서 | 44 |
| 재활보조기구 처방전 (기타) | 12 |
| 미지급 보험급여 청구서 | 62 |
| 장해급여 묶음 (청구서 + 소음작업 확인서 + 선택 확인서) | 153 |
| 추가상병 신청서 | 25 |
| 재요양 신청서 | 39 |

- 정본은 **근로복지공단 서식자료실** 파일만 씁니다. 좌표 지도는 정본의 `sha256` 에 묶여 있어 공단이 서식을 바꾸면 시험이 먼저 깨집니다.
- 공단이 HWP 만 주는 서식은 한글에서 PDF 로 바꿔 동봉했습니다.
- 이 도구의 범위는 채운 출력물을 만드는 것까지입니다. 온라인 접수(토탈서비스)는 범위 밖입니다.

---

## 🌐 원격 MCP (운영자가 토큰을 주는 경우)

```bash
claude mcp add --transport http --scope user sanjae-apply https://sanjae-apply.vercel.app/api/mcp/mcp \
  --header "Authorization: Bearer <발급받은 토큰>"
```

같은 도구 4개가 원격으로 돕니다. 입력은 서버에 저장되지 않지만 네트워크를 거칩니다.

<details>
<summary>🏠 직접 호스팅하기(Vercel)</summary>

이 레포를 Vercel 에 올리고 환경변수를 넣으면 `/api/mcp/mcp` 가 열립니다.

| 변수 | 뜻 |
|---|---|
| `SANJAE_MCP_TOKENS` | 허용할 Bearer 토큰. 쉼표로 여러 개 |
| `LAW_GO_KR_OC` | 법제처 Open API 인증키. 조문 실시간 조회를 쓸 때만 |
</details>

---

## 🧪 검증 수준

| 층 | 내용 | 수 |
|---|---|---:|
| 규칙 | 급여 9종 × 분기, 금지어 필터 자기시험 | vitest |
| 조문 대조 | 코드의 근거 조문 ↔ 법제처에서 받은 조문 XML 제목 | 18건 |
| 서식 대장 | 코드의 서식 ↔ `forms/catalog.json` sha256 | 15종 |
| PDF 채우기 | 12종 전부 글자 위치 + **픽셀 비교**(백지 출력 사고 방지) + 육안 | 약 590칸 |
| MCP | http · stdio 양쪽 initialize / tools/list / tools/call | SDK 클라이언트 |
| 운영 드라이런 | Vercel 운영 끝점에 공식 SDK 로 26건 | 전부 통과 |

전부 **합성 값**으로만 돌렸습니다. 실제 사건으로는 검증하지 않았습니다.

```bash
git clone https://github.com/seojaehong/sanjae-apply && cd sanjae-apply
npm ci && npm test

# 채운 PDF 를 글자 위치 + 픽셀로 검사
python scripts/verify_fill.py out.pdf forms/maps/F_YOYANG_APPLY.json test/samples/F_YOYANG_APPLY.json out.jpg forms/bundled/F_YOYANG_APPLY.pdf
```

새 서식의 좌표 지도를 만드는 법은 [`docs/좌표지도_작성법.md`](docs/좌표지도_작성법.md), 배포·연결 전체는 [`docs/패키징_배포_연결_가이드.md`](docs/패키징_배포_연결_가이드.md).

---

## 🗂️ 구조

```
src/core     규칙 S-01~S-13 · 서식/첨부 카탈로그 · 금지어 필터(순수 TS, IO 없음)
src/fill     pdf-lib 오버레이(text / boxes / check / multiline)
src/mcp      도구 4개 · 원격(mcp-handler, Bearer) · 로컬(stdio)
src/laws     법제처 Open API 클라이언트
api/mcp      Vercel 함수
forms/       catalog.json(정본 대장) · maps/(좌표 지도 12) · bundled/(동봉 PDF 12)
scripts/     comwel_forms.py(서식자료실 수집) · verify_fill.py · probe_form.py · mcp_dryrun.mjs
test/        vitest 113
docs/        좌표지도 작성법 · 패키징·배포·연결 가이드
```

---

## ⚖️ 경계

- 공인노무사법 제27조에 따라 청구의 대행·대리와 서류의 작성·확인은 공인노무사의 직무입니다. 이 도구는 **그 일을 돕는 도구**이지 대신하지 않습니다.
- 규칙은 산재 실무 메모(산재창고 블로그, 2025.1.14 기준)를 옮기고 법 조문으로 근거를 붙인 것입니다. 공단 내부 규정과는 대조하지 않았습니다. **출력물은 담당 노무사가 확인한 뒤 쓰십시오.**
- 서식 개정은 공단이 예고 없이 합니다. `catalog` 로 개정일을 한 번씩 확인하세요.

---

## 🤝 기여

- 새 서식 좌표 지도는 [`docs/좌표지도_작성법.md`](docs/좌표지도_작성법.md) 를 따라 만들고 `test/samples/` 에 합성 값을 함께 넣어 주세요.
- 규칙(S-xx)을 고칠 때는 실패하는 시험을 먼저 추가합니다.
- 실제 사건의 값·실명·주민등록번호는 이슈·PR 어디에도 올리지 마세요.

## 📜 라이선스

MIT. 동봉 글꼴 나눔고딕은 SIL OFL 1.1([`fonts/OFL.txt`](fonts/OFL.txt)). 공단 서식 PDF 는 근로복지공단 공개 자료입니다.

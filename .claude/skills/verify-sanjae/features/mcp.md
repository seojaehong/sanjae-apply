# 원격 MCP

노무사 사무소 등이 Claude·Cursor 같은 AI 도구에 `https://sanjae-apply.vercel.app/api/mcp/mcp` 를 커넥터로 붙이면, 같은 판정(`list_required_forms`)·서식 목록(`get_form_catalog`)·채우기(`fill_form`, PDF·한글)·도장(`make_seal`)을 도구 호출로 쓴다. Bearer 토큰이 있어야 하고 입력을 저장하지 않는다. 이 기능은 안내 페이지 매뉴얼 「원격」 탭이 안내하는 경로다.

## Sub-features

- `mcp-connect` 공식 SDK StreamableHTTP 클라이언트로 연결, 서버 이름·버전.
- `mcp-tools` `tools/list` 의 도구 이름.
- `mcp-rules` `list_required_forms` 급여 9종 × 분기 사례.
- `mcp-fill` `fill_form` PDF·hwpx, 도장 3자리(applicant·delegation·consent), `make_seal` PNG.

## How to get to it (user POV)

- 안내 페이지 「연결 방법」(`#manual-install`)의 「원격」 탭(`#t-remote`)이 보여 주는 주소와 토큰 설정으로 AI 도구에 커넥터를 추가한다. 여기서는 그 연결을 `scripts/mcp_dryrun.mjs` 가 대신한다(같은 SDK 클라이언트).

## Driving it with verify.mts

Preconditions:

- `--base <배포 URL>`(로컬 정적 서버에는 `/api` 가 없다).
- 토큰 파일 `~/.config/sanjae-apply/mcp_token.txt`. 값은 어떤 증거에도 적지 않는다.

- **드라이런.** `node scripts/mcp_dryrun.mjs <base>/api/mcp/mcp <토큰 파일> <run>/mcp_dryrun_filled.pdf` 를 도우미가 실행한다. 로그 `mcp_dryrun.txt`(토큰 경로만, 값 없음).
- **판정.** exit 0, 마지막 줄 `실패 0 / 검사 N`(261028 운영 31/31).
- **명령.** `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON .claude/skills/verify-sanjae/scripts/verify.mts drive --feature mcp --base https://sanjae-apply.vercel.app`.

## Gotchas

- `--base` 없이 돌리면 **SKIP**(로컬 정적 서버에 MCP 함수가 없다). 토큰 파일이 없어도 **SKIP**. SKIP 은 FAIL 이 아니지만 검증도 아니다 — 보고에 「미검증」으로 적는다.
- 드라이런은 운영 버셀 함수를 실제로 부른다(채우기·도장 생성, 저장 없음). 읽기 전용 확인만 허락된 때(예: 운영은 doctor 만)에는 돌리지 않는다.
- 브랜치 프리뷰에는 Deployment Protection 이 걸릴 수 있다(미결). 401 이면 그대로 적는다.
- 기대 칸 수는 견본·지도에서 계산한다(`mcp_dryrun.mjs` 355684b). 지도를 바꾼 브랜치와 운영을 섞어 돌리면 어긋난다.
- stdio MCP(`npx sanjae-apply mcp`)는 이 지도 밖이다 → verify-sanjae-apply `features/mcp.md`.

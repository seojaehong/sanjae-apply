# MCP 연결

Claude Desktop·Claude Code 는 `npx -y sanjae-apply mcp` 로 stdio MCP 를 띄우고, 운영자가 토큰을 준 사용자는 원격 MCP(`https://sanjae-apply.vercel.app/api/mcp/mcp`)에 Bearer 로 붙는다. 두 경로 모두 도구 5개(`list_required_forms` · `get_form_catalog` · `fill_form` · `make_seal` · `fill_yoyang_apply`)를 낸다.

## Sub-features

- `mcp-stdio` 빌드된 CLI 를 `mcp` 로 띄워 SDK 클라이언트가 붙는다.
- `mcp-local-save` 로컬 서버만 `fill_form`·`make_seal` 의 `save_to`(절대 경로)로 파일을 바로 쓴다. 덮어쓰지 않는다(0.5.3~). 원격 스키마에는 없다.
- `mcp-unknown-keys` `fill_form` 결과의 `unknown_keys` 에 서식에 없는 칸 이름이 나온다(0.5.3~).
- `mcp-remote-auth` 토큰 없거나 틀리면 401.
- `mcp-remote-tools` tools/list 5 · 버전 = package.json.
- `mcp-remote-fill` `fill_form` 이 PDF·hwpx base64 를 돌려주고 도장이 찍힌다.

## How to get to it (user POV)

- Claude Code: `claude mcp add --scope user sanjae-apply -- npx -y sanjae-apply mcp`
- Claude Desktop: 설정 JSON 에 같은 명령.
- 원격: MCP 클라이언트에 URL + `Authorization: Bearer <토큰>`.

## Driving it with sanjae-apply CLI·scripts

Preconditions:

- `dist/src/cli.js` 있음, `$RUN` 있음.
- 원격은 `~/.config/sanjae-apply/mcp_token.txt` 와 인터넷. 운영 배포가 검사하려는 커밋인지 먼저 본다(`연결:` 줄의 버전).

- **stdio.** Run `npx.cmd vitest run test/stdio.test.ts 2>&1 | tee $RUN/stdio.txt`. `1 passed`. 이 시험이 Claude Desktop 과 같은 방식(`StdioClientTransport` 로 `node dist/src/cli.js mcp`)으로 initialize → tools/list 5 → `list_required_forms` → `fill_form` 을 돈다.
- **원격 드라이런.** Run `node scripts/mcp_dryrun.mjs > $RUN/remote.txt 2>&1; echo exit $?`. 종료 코드 0. 첫 줄 `연결: sanjae-apply <버전>`, 마지막 줄 `실패 0 / 검사 31`. 중간에 `make_seal 홍길동 PNG`, `fill_form stamp 3곳`, `fill_form hwpx stamp 3곳 + BinData` 가 PASS.
- **401.** Run `node scripts/mcp_dryrun.mjs https://sanjae-apply.vercel.app/api/mcp/mcp /dev/null 2>&1 | head -3`(빈 토큰). 연결 실패 또는 401 이 보인다.
- **버전 일치.** Run `node -e "console.log(require('./package.json').version)"` 와 `$RUN/remote.txt` 첫 줄의 버전이 같다. 다르면 배포가 뒤처진 것이다.
- **게시판 stdio(설정 그대로).** 저장소 밖 폴더에서 Run `MSYS_NO_PATHCONV=1 node <저장소>/scripts/e2e_mcp_stdio.mjs $RUN/stdio_pub cmd /c npx -y sanjae-apply mcp > $RUN/stdio_pub.txt`. 마지막 줄 `합계 전부 통과`. `save_to` 두 줄(저장·덮어쓰기 거부)이 PASS.
- **증거.** `$RUN/stdio.txt` · `remote.txt` · `stdio_pub.txt`.

## Gotchas

- 저장소 폴더 안에서 `npx sanjae-apply` 를 부르면 npx 가 저장소 자신의 bin 을 찾다가 「내부 또는 외부 명령이 아닙니다」로 실패한다(261027 실측). 게시판 시험은 저장소 밖 폴더에서 돈다.
- Git Bash 는 `cmd /c` 의 `/c` 를 `C:/` 로 바꿔 넘긴다. `MSYS_NO_PATHCONV=1` 없이 돌리면 초기화 60초 시간 초과로 보인다(261027 실측).

- 푸시 직후 원격 드라이런을 돌리면 이전 배포가 응답한다(261027 실측: 도구 4개로 실패). 1~2분 뒤 다시 돌리고 `연결:` 버전으로 판정한다.
- `mcp_dryrun.mjs` 의 검사는 `client.close()` 앞에 있어야 한다. 뒤에 붙이면 「Not connected」가 난다(261027 교정).
- 원격 서버의 디스크는 보이지 않는다. 「입력을 저장하지 않는다」는 원격에 대해서는 코드 검토(`api/mcp`)로만 말한다.
- 토큰 값은 어떤 증거 파일에도 적지 않는다. `remote.txt` 에 헤더가 찍히지 않는지 한 번 본다.
- `fill_yoyang_apply` 는 v0.1 호환 도구다. 새 클라이언트는 `fill_form` 을 쓴다.

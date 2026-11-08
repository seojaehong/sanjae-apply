# 게시 순서

npm 이 먼저다. 레지스트리는 npm 에 있는 버전만 받고, Dockerfile 은 npm 에 있는 버전을 설치한다.

1. `package.json`·`package-lock.json`(`npm.cmd version <판> --no-git-tag-version`), `server.json` 두 곳, `src/mcp/server.ts` 의 `SERVER_INFO` 를 올린다.
2. `npm.cmd run build:web` 로 랜딩 표기를 맞추고 `npx.cmd vitest run` 을 돌린다. PR 로 병합한다.
3. 병합된 master 에서 `npm.cmd publish --access public`. 2단계 인증이 필요해 직접 터미널에서 실행한다.
4. `npm.cmd view sanjae-apply version` 으로 확인하고 `scripts/e2e_published.mjs <설치본 cli.js> <출력 폴더>` 를 돌린다.
5. `mcp-publisher login github` 뒤 `mcp-publisher publish server.json`.
6. `Dockerfile` 의 고정 버전을 올려 병합하고, 원격 `initialize` 의 `serverInfo.version` 을 확인한다.

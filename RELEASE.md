# 게시 순서

npm 이 먼저다. 레지스트리는 npm 에 있는 버전만 받고, Dockerfile 은 npm 에 있는 버전을 설치한다.

1. `package.json`·`package-lock.json`(`npm.cmd version <판> --no-git-tag-version`), `server.json` 두 곳, `src/mcp/server.ts` 의 `SERVER_INFO` 를 올린다.
2. `npm.cmd run build:web` 로 랜딩 표기를 맞추고 `npx.cmd vitest run` 을 돌린다. PR 로 병합한다.
3. 병합된 master 커밋에 `v<판>` 태그를 달아 푸시한다(`git tag v0.6.2 <커밋> && git push origin v0.6.2`). `.github/workflows/publish.yml` 이 빌드·시험 → npm 신뢰 게시(출처 증명) → MCP 레지스트리 등록까지 한다. 토큰·2단계 인증·기기 코드가 필요 없다. 태그를 다시 달 때는 `git push origin :refs/tags/v<판>` 뒤 다시 푸시한다.
4. 실행이 초록색인지 보고, `npm.cmd view sanjae-apply version` 으로 확인한 뒤 `scripts/e2e_published.mjs <설치본 cli.js> <출력 폴더>` 를 돌린다.
5. (워크플로가 한다) 레지스트리 조회로 새 판이 보이는지만 확인한다.
6. `Dockerfile` 의 고정 버전을 올려 병합하고, 원격 `initialize` 의 `serverInfo.version` 을 확인한다.

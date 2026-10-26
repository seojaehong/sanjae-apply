# sanjae-apply — 산재 신청 도우미 엔진

급여 종류와 재해 분기를 받아 **필요한 서식·첨부·근거 조문**을 정하고 제출 패키지를 조립한다.
순수 코어(값 저장 없음) + CLI. 출구는 세 개 — MCP(일의 무늬 `/api/mcp`), CLI, 웹(B2C 무저장 페이지).

- 설계·결정·단계 = `~/dev/_산재서식_상용화_G0_261026.md`
- 승인 가능성·확률은 계산하지도 출력하지도 않는다. `READY_TO_SUBMIT` 은 「제출 가능」이지 「승인」이 아니다.
- 법령정보는 법제처 Open API 직접 호출(`src/laws/lawgo.ts`), 키는 `LAW_GO_KR_OC` env.
- 서식 정본은 근로복지공단 서식자료실. 파일은 `forms/raw/`(미커밋), 해시·버전 대장은 `forms/catalog.json`.

```
npm.cmd ci
npm.cmd test
```

---
name: verify-sanjae-apply
description: "sanjae-apply(산재 신청 도우미)를 사용자처럼 돌려 증거를 남기는 검증 스킬. 표면 = CLI(npx sanjae-apply) · 로컬 stdio MCP · 원격 MCP(Vercel). 서식 채우기(PDF·hwpx)·도장·필요 서식 확인·MCP 연결을 바꾼 뒤 「실제로 그렇게 나오나」를 증명할 때, 릴리스 전에, 공단 서식이 갱신됐을 때 쓴다. 기능 지도는 features/."
---

# verify-sanjae-apply

이 저장소는 서버가 아니다. 사용자가 만지는 것은 **CLI 한 번 실행**, **Claude Desktop 이 띄우는 stdio MCP**, **원격 MCP 호출** 셋이다. 그래서 「launch」는 빌드 한 번이고, 드라이브마다 새 프로세스를 띄운다. 모든 증거는 사용자 경로(`node dist/src/cli.js …` 또는 MCP 호출)로만 만든다. `src/` 를 import 하는 스크립트는 개발 편의지 증거가 아니다.

## 전제조건

- Node 20 이상, Python 3 + `pymupdf`(fitz) + `pillow`. 파이썬 의존성은 package.json 에 없다. `pip install pymupdf pillow`.
- **한글(hwpx) 렌더 증거는 윈도우 + 한글(HWPFrame.HwpObject) + pywin32 + `~/.claude/scripts/hwp_guard.py` 가 있는 머신에서만** 된다. 없으면 hwpx 는 zip 안 XML 검사(`scripts/verify_hwpx_fill.py --no-render`)까지만 하고 「렌더 미확인」으로 적는다.
- **한글 COM 은 PC 에 하나다.** `Get-Process Hwp` 가 비어 있지 않으면 한글 드라이브를 시작하지 않는다(다른 세션이 쓰는 중). 공유 인스턴스를 이중으로 몰지 않는다.
- 원격 MCP 는 `~/.config/sanjae-apply/mcp_token.txt` 의 Bearer 토큰이 있어야 한다. 토큰 값은 어떤 증거에도 적지 않는다.
- 합성 값만 쓴다(`test/samples/*.json`). 실명·주민번호·급여 원본은 넣지 않는다.

## Launch

```bash
cd <레포 루트>
npm.cmd ci && npm.cmd run build          # 맥·리눅스: npm ci && npm run build
node dist/src/cli.js catalog | head -5   # fillable 12 가 보이면 준비됨
```

준비됨 = `dist/src/cli.js` 가 있고 `catalog` 가 `fillable` 12 · `fillable_hwpx` 11 을 낸다. 빈 체크아웃에서 이 두 명령으로 끝난다(시드 데이터·DB 없음). 상시 프로세스가 없으니 teardown 도 없다. 한글 렌더 단계만 `hwp_guard.kill_own()` 이 자기가 띄운 한글을 끈다.

## Doctor

```bash
python .claude/skills/verify-sanjae-apply/verify_drive.py doctor            # 로컬
python .claude/skills/verify-sanjae-apply/verify_drive.py doctor --remote   # + 토큰 파일
```

보는 것: 레포 루트인가 · node ≥ 20 · `dist` 있음 · `SERVER_INFO.version` = package.json · catalog 12/11 · fitz·Pillow · (윈도우) 한글 프로세스 0개 · pywin32 · (원격) 토큰 파일. 무엇이든 이상하면 이것부터 돈다. 읽기 전용이다.

## 증거 위치

`.verify/<run_id>/` (레포 루트, `.gitignore` 에 있다). `run_id` 는 `YYYYMMDD-HHMM` 로 만든다. Cleanup 은 이 폴더를 지우지 않는다.

```bash
RUN=.verify/$(date +%Y%m%d-%H%M); mkdir -p $RUN
```

## Drive

기능별 정확한 명령은 `features/*.md` 에 있다. 공통 틀은 이렇다.

1. **부작용 스냅샷(전).** `python .claude/skills/verify-sanjae-apply/verify_drive.py snapshot $RUN/before.json`
2. **사용자 경로로 실행.** `node dist/src/cli.js fill F_YOYANG_APPLY test/samples/F_YOYANG_APPLY.json --out $RUN/yoyang.pdf --stamp 홍길동 | tee $RUN/fill.json`
3. **결과물 검사.** PDF 는 `python scripts/verify_fill.py <pdf> <map> <values> <jpg> <원본pdf>`(글자 위치 + 픽셀), 도장은 `verify_drive.py crop`, hwpx 는 `scripts/verify_hwpx_fill.py` / `scripts/verify_hwpx_stamps.py`.
4. **부작용 스냅샷(후).** `… snapshot $RUN/after.json --diff $RUN/before.json --allow $RUN` → 레포 안에 `--out` 밖 새 파일이 0건이어야 한다. 「입력을 저장하지 않는다」의 증거다.
5. **금지어.** `python .claude/skills/verify-sanjae-apply/verify_drive.py forbidden $RUN/*.json $RUN/*.pdf` → 「없음」.

MCP 는 두 경로다. **stdio** 는 `test/stdio.test.ts` 와 같은 SDK 클라이언트로 `node dist/src/cli.js mcp` 를 띄운다(`npx.cmd vitest run test/stdio.test.ts` 가 그 드라이브다). **원격** 은 `node scripts/mcp_dryrun.mjs > $RUN/remote.txt` 로, 마지막 줄 `실패 0 / 검사 N`.

## Evidence (증거 기준)

- 사용자 경로로 만든 것만 증거다. 명령·stdout(JSON)·종료 코드·결과 파일·크롭 JPEG·스냅샷 diff 를 `$RUN` 에 남긴다.
- 결과 파일을 **다시 열어** 본다. CLI 의 `written`·`stamped` 보고만으로는 부족하다. PDF 는 fitz 로 글자·그림 bbox 를 읽고, hwpx 는 zip 을 풀어 `BinData`·`content.hpf`·`<hp:pic>` 을 센다.
- 부작용 = 디스크. `--out` 외 새 파일 0건. 원격 MCP 의 서버 디스크는 클라이언트에서 보이지 않는다. 그것은 「확인 불가, 코드 검토(`api/mcp`, 저장 호출 없음)로만」이라고 적는다.
- 크롭 JPEG 는 300KB 아래로 둔다(이 환경의 Read 훅이 큰 이미지를 거부한다). `verify_drive.py crop` 은 품질 75 로 저장한다.
- 공단 서식이 바뀌면 `test/maps.test.ts` 의 sha256 대조가 먼저 깨진다. 그때는 좌표 지도부터 다시 만들고 이 스킬을 돈다.

## Cleanup

```bash
# 이 실행이 만든 것만 지운다. 증거($RUN)는 남긴다.
rm -f /tmp/sanjae-apply/*_sample.pdf 2>/dev/null   # maps.test 가 남기는 임시 PDF(선택)
powershell -NoProfile -Command "Get-Process Hwp -ErrorAction SilentlyContinue | Select Id,StartTime"   # 한글이 남아 있으면 hwp_guard 가 띄운 것만 끈다
```

프로세스 이름으로 죽이지 않는다. 한글은 `hwp_guard.kill_own()` 이 자기가 띄운 PID 만 끈다. 정리 뒤 `$RUN` 이 그대로 있는지 확인한다.

## Helpers

`verify_drive.py` 하나. 서브명령 `doctor` · `snapshot` · `forbidden` · `crop`. 호출 예는 위와 `features/` 에 있다. 그 밖의 검사기는 레포 `scripts/` 의 기존 도구를 그대로 쓴다(`verify_fill.py` · `verify_hwpx_fill.py` · `verify_hwpx_stamps.py` · `mcp_dryrun.mjs`).

## 증명 기록

- 261027 (커밋 bd0c9bc): 「PDF 채우기 + 날인」 한 기능을 이 스킬대로 처음부터 끝까지 돌렸다. 결과는 `features/fill-pdf.md` Gotchas 와 이 파일 끝의 표 참조.

| 단계 | 결과 |
|---|---|
| doctor | 통과 |
| fill F_YOYANG_APPLY --stamp 홍길동 | written 30 · stamped 3 · stamps_skipped 0 |
| verify_fill.py | 글자·픽셀 통과 |
| crop | 3자리 라벨 위, PDF 그림 객체 3 |
| snapshot diff | 레포 안 새 파일 0 |
| forbidden | 없음 |
| cleanup 뒤 $RUN | 보존 |

## 유지

앱이 바뀌면 `features/` 가 낡는다. UI·CLI 인자·도구 이름을 바꾼 PR 에서 같이 고친다. 절차는 `/maintain-verification-skill`(pstack).

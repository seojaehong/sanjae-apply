# 한글(hwpx) 채우기 + 날인

사용자가 `--out` 확장자를 `.hwpx` 로 주면 같은 값이 한글 문서로 나온다. 한글이 없는 머신에서도 만들어지고, 한글 2014 이상에서 열린다. 이름을 주면 도장이 서명란 문단에 떠 있는 그림으로 들어가 글자를 밀지 않는다.

## Sub-features

- `hwpx-fill` 값이 표 칸에 들어가고 체크가 찍힌다. 11종(처방전 제외).
- `hwpx-stamp` 도장이 `BinData/seal1.png` 로 들어가고 `<hp:pic>` 이 자리 수만큼 생긴다.
- `hwpx-pages` 한글 렌더 쪽수가 원본과 같다(쪽 밀림 0).
- `hwpx-open-plain` `forceopen` 없이 열어도 손상 경고가 없다.

## How to get to it (user POV)

- 터미널: `npx -y sanjae-apply fill <FORM_ID> values.json --out 신청서.hwpx [--stamp 이름]`
- MCP: `fill_form(form_id, values, format:"hwpx", stamp)` → base64 hwpx.

## Driving it with sanjae-apply CLI·scripts

Preconditions:

- `dist/src/cli.js` 있음, `$RUN` 있음.
- 렌더 단계는 윈도우 + 한글 + pywin32 + `Get-Process Hwp` 0개. 아니면 `--no-render` 로 zip 검사까지만.

- **채우기 + 날인.** Run `node dist/src/cli.js fill F_YOYANG_APPLY test/samples/F_YOYANG_APPLY.json --out $RUN/yoyang.hwpx --stamp 홍길동 | tee $RUN/fill_yoyang_hwpx.json`. `format` hwpx, `filled` 30, `stamped` `["applicant","delegation","consent"]`.
- **zip 검사.** Run `python -c "import zipfile,sys;z=zipfile.ZipFile('$RUN/yoyang.hwpx');n=z.namelist();print(n[0],'BinData/seal1.png' in n,z.read('Contents/section0.xml').decode().count('<hp:pic '),z.read('Contents/content.hpf').decode().count('id=\"seal1\"'))"`. 출력 `mimetype True 3 1`.
- **글자·글자색·렌더.** Run `python scripts/verify_hwpx_fill.py $RUN/yoyang.hwpx test/samples/F_YOYANG_APPLY.json forms/hwpx_maps/F_YOYANG_APPLY.json $RUN/yoyang_hwpx.jpg`(한글 없으면 끝에 `--no-render`). 글자·체크 수·검정 정체 통과, 렌더하면 쪽수 4.
- **날인 전건 실측(선택, 한글 필요).** Run `python scripts/verify_hwpx_stamps.py $RUN/hx`. 마지막 줄 「실패 0. 전건 통과」, `$RUN/hx/stamps_sheet0.jpg`·`stamps_sheet1.jpg` 를 열어 32자리를 본다.
- **손상 경고 없이 열림(한글 필요).** 한글 COM 으로 `hwp.Open(path, "HWPX", "")` 을 `forceopen` 없이 부른다(`subprocess` 타임아웃 90초). True 가 바로 돌아오고 `PageCount` 가 원본과 같다. 대화상자가 뜨면 COM 이 멈춰 타임아웃이 난다 → 「경고 뜸」.
- **금지어.** Run `python .claude/skills/verify-sanjae-apply/verify_drive.py forbidden $RUN/yoyang.hwpx`. 「없음」.
- **증거.** `$RUN/yoyang.hwpx` · zip 검사 출력 · `yoyang_hwpx.jpg` · (렌더 시) `hx/` 시트.

## Gotchas

- `forceopen:true` 로 연 결과는 손상 경고 유무를 말해 주지 않는다. 사용자가 더블클릭했을 때의 경험은 `forceopen` 없는 열기로만 안다.
- 한글 COM 은 PC 에 하나다. 다른 세션이 한글을 쓰면 `hwp_guard` 가 멈춘다. 병렬로 돌리지 않는다.
- 도장 앵커는 채운 뒤 XML 에서 n번째 「(서명 또는 인」 라벨을 센다. 값(경위문 등)에 그 문자열이 들어오면 번호가 밀려 다른 쪽에 찍힐 수 있다. 합성 값 11종에서는 안 밀렸다. 그런 값을 쓰면 `verify_hwpx_stamps.py` 로 다시 본다.
- 장해급여 서식은 라벨 1곳이 「(서명 또는 인」+「)」 두 run 으로 갈라져 있다. 라벨을 셀 때 닫는 괄호를 붙이면 수가 안 맞는다.
- 쪽수가 원본과 다르면 글자 축소가 안 먹은 것이다(칸보다 긴 값). `expect_pages` 는 `forms/hwpx_maps/*.json` 에 있다.

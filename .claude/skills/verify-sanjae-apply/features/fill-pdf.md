# PDF 채우기 + 날인

사용자가 값 JSON 을 주면 근로복지공단 정본 PDF 위에 글자·체크가 들어간 PDF 를 받는다. 이름을 주면 성명인 도장이 신청인 서명란에 찍힌다. 입력은 디스크에 남지 않는다.

## Sub-features

- `pdf-fill` 값이 칸에 들어가고 체크가 찍힌다. 12종.
- `pdf-stamp-name` `--stamp 이름` 으로 성명인을 만들어 신청인 자리 전부에 찍는다.
- `pdf-stamp-png` `--stamp-png` 로 가진 도장을 찍고 `--stamp-spot` 으로 자리를 고른다.
- `pdf-stamp-skip` 지도에 없는 자리는 건너뛰고 `stamps_skipped` 에 적힌다.
- `pdf-no-store` `--out` 외에 아무 파일도 생기지 않는다.

## How to get to it (user POV)

- 터미널: `npx -y sanjae-apply fill <FORM_ID> values.json --out 신청서.pdf [--stamp 이름 | --stamp-png 도장.png] [--stamp-spot a,b] [--stamp-shape circle|square|ellipse]`
- MCP: `fill_form(form_id, values, stamp:{name|png_base64, spot})` → base64 PDF.
- 칸·자리 이름: `npx -y sanjae-apply catalog <FORM_ID>` 의 `slots`·`stamps`.

## Driving it with sanjae-apply CLI·scripts

Preconditions:

- `dist/src/cli.js` 있음, `$RUN` 있음, python 에 fitz·Pillow.

- **스냅샷(전).** Run `python .claude/skills/verify-sanjae-apply/verify_drive.py snapshot $RUN/before.json`.
- **채우기 + 날인.** 요양급여 합성 값과 성명인. Run `node dist/src/cli.js fill F_YOYANG_APPLY test/samples/F_YOYANG_APPLY.json --out $RUN/yoyang.pdf --stamp 홍길동 | tee $RUN/fill_yoyang.json`. 종료 코드 0. `written` 30, `shrunk` `[]`, `stamped` `["applicant","delegation","consent"]`, `stamps_skipped` `[]`.
- **글자·픽셀 검사.** Run `python scripts/verify_fill.py $RUN/yoyang.pdf forms/maps/F_YOYANG_APPLY.json test/samples/F_YOYANG_APPLY.json $RUN/yoyang_fill.jpg forms/bundled/F_YOYANG_APPLY.pdf`. 마지막 줄이 통과(실패 0).
- **날인 자리 크롭.** Run `python .claude/skills/verify-sanjae-apply/verify_drive.py crop $RUN/yoyang.pdf forms/maps/F_YOYANG_APPLY.json $RUN/yoyang_stamps.jpg`. 「PDF 안 그림 객체 원본 2 → 결과 5 (+3, 자리 3)」(원본에 그림 2개가 이미 있다). 종료 코드 0. JPEG 를 열어 세 도장이 「(서명 또는 인)」 글자 위에 있는지 본다.
- **자리 선택·건너뜀.** Run `node dist/src/cli.js fill F_UNPAID_CLAIM test/samples/F_UNPAID_CLAIM.json --out $RUN/unpaid.pdf --stamp 홍길동 --stamp-spot applicant,consent | tee $RUN/fill_unpaid.json`. `stamped` `["applicant"]`, `stamps_skipped` `["consent"]`(미지급 청구서는 자리가 applicant 하나).
- **도장 파일로.** Run `node dist/src/cli.js seal --out $RUN/seal.png --name 홍길동` 뒤 `node dist/src/cli.js fill F_HUYEOP_CLAIM test/samples/F_HUYEOP_CLAIM.json --out $RUN/huyeop.pdf --stamp-png $RUN/seal.png | tee $RUN/fill_huyeop.json`. `stamped` `["applicant","delegation"]`.
- **스냅샷(후).** Run `python .claude/skills/verify-sanjae-apply/verify_drive.py snapshot $RUN/after.json --diff $RUN/before.json --allow $RUN`. 「새 파일(레포 안, 허용 밖): []」.
- **금지어.** Run `python .claude/skills/verify-sanjae-apply/verify_drive.py forbidden $RUN/fill_*.json $RUN/yoyang.pdf`. 「없음」.
- **증거.** `$RUN/yoyang.pdf` · `yoyang_fill.jpg` · `yoyang_stamps.jpg` · `fill_*.json` · `before/after.json`.

## Gotchas

- `verify_fill.py` 는 값 JSON 의 모든 키를 지도에서 찾는다. 다른 서식의 값 파일을 주면 「지도에 없는 키」로 멈춘다. 서식과 값 파일을 짝지어 쓴다.
- 도장 PNG 는 투명 배경이어야 한다. 흰 배경 PNG 를 `--stamp-png` 로 주면 서명란 글자가 가려진다. `seal` 명령 출력은 투명이다.
- `--stamp-spot` 을 비우면 지도에 있는 신청인 자리(applicant·delegation·consent) 전부다. 타인 서명란(confirm·commute_reporter 등)은 이름을 적어야 찍힌다.
- 재활보조기구 처방전(`F_DEVICE_PRESCRIPTION`)은 의료기관 작성이라 도장 자리가 없다. `--stamp` 를 줘도 `stamps_skipped` 로 돌아온다.
- 크롭 JPEG 가 300KB 를 넘으면 이 환경의 Read 훅이 거부한다. `crop` 은 자리 수가 많아도 2열로 묶어 품질 75 로 저장한다.
- 261027 증명 실행 결과: 위 레시피 그대로 통과(`SKILL.md` 증명 기록).

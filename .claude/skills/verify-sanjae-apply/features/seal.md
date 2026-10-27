# 도장 PNG

사용자가 이름을 주면 투명 배경의 적색 성명인 PNG 를 받는다. 법인명·중심 문자·부문자를 주면 법인형이 된다. 본인 또는 명의자 동의가 있는 이름만 쓰며 등록 인감 대용이 아니다.

## Sub-features

- `seal-name` 성명인 원형 기본. 2~4자.
- `seal-shape` `square` · `ellipse`.
- `seal-corp` `--arc 법인명 --center 중심문자 --bottom 부문자 --inner 두께`.
- `seal-mcp` `make_seal` 도구가 같은 PNG 를 base64 로 돌려준다.

## How to get to it (user POV)

- 터미널: `npx -y sanjae-apply seal --out 도장.png --name 홍길동 [--shape …] [--arc … --center … --bottom … --inner 2]`
- MCP: `make_seal(name | arc_text, center_text, bottom_text, shape, inner_ring)`.

## Driving it with sanjae-apply CLI·scripts

Preconditions:

- `dist/src/cli.js` 있음, `$RUN` 있음, python 에 Pillow.

- **성명인.** Run `node dist/src/cli.js seal --out $RUN/seal_name.png --name 홍길동 | tee $RUN/seal_name.json`. 종료 코드 0, `bytes` 가 2,000 이상, `note` 에 「등록 인감 대용이 아니다」.
- **법인형 타원.** Run `node dist/src/cli.js seal --out $RUN/seal_corp.png --shape ellipse --arc "주식회사 가나다" --center 대표이사 --bottom 123-45-67890 --inner 2 | tee $RUN/seal_corp.json`. 종료 코드 0.
- **PNG 가 투명·정사각인지.** Run `python -c "from PIL import Image;a=Image.open('$RUN/seal_name.png');b=Image.open('$RUN/seal_corp.png');print(a.mode,a.size,b.mode,b.size,a.getextrema()[3])"`. `RGBA (480, 480) RGBA (480, 345) (0, 255)`(알파에 0 과 255 가 모두 있어야 투명 배경 + 그림).
- **보기.** 두 PNG 를 열어 글자가 테두리 안에 있고 겹치지 않는지 본다(각 10KB 안팎이라 Read 가능).
- **잘못된 입력.** Run `node dist/src/cli.js seal --out $RUN/x.png`(이름 없음). 종료 코드 1, 사용법 안내.
- **MCP.** `features/mcp.md` 의 원격 드라이런에 `make_seal 홍길동 PNG` 검사가 들어 있다.
- **증거.** `$RUN/seal_*.png` · `seal_*.json` · PIL 출력.

## Gotchas

- 나눔고딕에 없는 글자(이모지·일부 한자)는 빈 글리프로 그려져 테두리만 남는다. 오류가 나지 않으니 PNG 를 열어 봐야 안다.
- 5자 이상 이름은 세로 1열로 쌓여 글자가 작아진다. 사람 이름 범위(2~4자)만 품질을 보증한다.
- 생성은 결정적이다. 같은 인자면 같은 바이트. 비교 증거로 sha256 을 쓸 수 있다.

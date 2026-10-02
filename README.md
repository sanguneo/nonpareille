# Nonpareille (논파레유)

**흩어진 점을, 하나의 그림으로.**

Nonpareille(논파레유)는 디저트 위에 뿌리는 작은 색 설탕 알갱이입니다. 이 프로젝트는 도트(픽셀) 그림을 만드는 엔진입니다. 모든 결과물은 팔레트 인덱스로 이루어진 격자(`DotGrid`)로 표현되고, 같은 입력과 같은 시드를 주면 언제나 같은 결과가 나옵니다. CLI(`nonpareille`), MCP 서버, TypeScript 라이브러리 세 가지 방식으로 쓸 수 있습니다.

## 네 가지 입력 경로

1. **AI 생성**: `nonpareille gen`이 이미지 모델(기본값 `codex-image`)에 프롬프트를 보내고, 받은 이미지를 격자에 맞춰 스냅한 뒤 팔레트로 정리합니다. `nonpareille prompt`로 프롬프트만 미리 볼 수도 있습니다.
2. **직접 그리기 / MCP**: `nonpareille new`로 빈 문서를 만들고 `.dot.json`이나 `.dot.txt`를 직접 편집합니다. Claude Code 같은 에이전트는 `nonpareille mcp`로 도구를 호출해 한 점씩 그릴 수 있습니다.
3. **이미지 변환**: `nonpareille convert`는 일반 사진이나 그림을 도트로 줄입니다. `nonpareille snap`은 AI가 그린 "가짜 픽셀아트"처럼 어긋난 격자를 찾아 깔끔한 원본 해상도로 되돌립니다.
4. **절차적 생성**: `nonpareille procgen`이 마스크와 시드로 우주선 같은 스프라이트를 무한히 찍어냅니다.

## 설치

```sh
bun install
```

Bun 1.4 이상이 필요합니다. 명령은 `bun cli/main.ts <명령>`으로 실행합니다. 아래에서는 짧게 `nonpareille`라고 씁니다.

## 빠르게 시작하기

```sh
# 16x16 빈 문서를 만들고 8배로 렌더
bun cli/main.ts new --size 16x16 --palette #1d2b53,#ff004d,#ffec27 -o hero.dot.json
bun cli/main.ts render hero.dot.json --scale 8 --gap 1 -o hero.png

# 사진을 64칸 폭, pico8 팔레트, 베이어 디더링으로 변환
bun cli/main.ts convert photo.jpg --dots 64 --palette pico8 --dither bayer4 -o photo.png

# 우주선 16개를 시트 한 장으로
bun cli/main.ts procgen --mask spaceship --seed 42 --count 16 --sheet --cols 8 -o ships.png

# 터미널에서 바로 보기
bun cli/main.ts render hero.dot.json --format ansi
```

대표 명령을 한꺼번에 돌려 보려면 `bun examples/run-all.ts`를 실행하세요. 결과는 `out/examples/`에 쌓이고, 하나라도 실패하면 0이 아닌 코드로 끝납니다.

## CLI 레퍼런스

각 명령의 `--help`가 보여 주는 사용법을 그대로 옮겼습니다. 종료 코드는 0(성공), 2(입력 오류), 3(프로바이더 오류)입니다.

| 명령 | 사용법 |
|---|---|
| `bom` | `nonpareille bom in.dot.json\|in.dot.txt [--material perler] [--json]` |
| `convert` | `nonpareille convert <in.png\|jpg\|webp> --dots 64 [--height auto\|N] [--fit cover\|contain\|stretch] [--sample kcentroid\|mode\|mean\|median\|dominant\|center\|contrast] [--palette pico8\|auto:16\|lospec:<slug>\|file.hex] [--dither none\|bayer2\|bayer4\|bayer8\|fs\|jjn\|stucki\|atkinson\|sierra\|yliluoma] [--outline-expand] [--orphans] [--outline black\|selout] [--scale 8] [--gap 0] [--json] -o out.(png\|svg\|dot.json\|dot.txt)` |
| `detect-grid` | `nonpareille detect-grid <image> [--expect 64x64] --json` |
| `gen` | `nonpareille gen --subject <text> --size 32x32 --palette pico8 --provider codex-image [--ref a.png,b.png] [--retries 0] [--seed N] [--view side] [--outline none\|black\|selout] [--scale 8] [--json] -o out.dot.json\|out.png` |
| `mcp` | `nonpareille mcp` (stdin이 닫힐 때까지 stdin/stdout으로 MCP 통신) |
| `mosaic` | `nonpareille mosaic target.png --tiles chipset.png --tile 16 [--k 2] [--reuse-radius 2] -o out.png` |
| `new` | `nonpareille new --size 32x32 [--palette #rrggbb,#rrggbb,...] -o hero.dot.json\|hero.dot.txt` |
| `palette` | `nonpareille palette extract <in.png> -k 16 [-o f.hex]`<br>`nonpareille palette fetch <lospec-slug> [-o f.hex]`<br>`nonpareille palette convert <a.gpl> <b.hex>`<br>`nonpareille palette ramp --base #b13e53 -n 5 [-o f.hex]` |
| `procgen` | `nonpareille procgen --mask spaceship --seed 42 [--count 1] [--palette pico8] [--scale 4] [--sheet] [--cols 8] -o ships.png` |
| `prompt` | `nonpareille prompt --subject <text> --size 32x32 --palette db32 [--view side] [--model codex-image] [--outline none\|black\|selout] [--shading flat\|cel\|soft] [--light top-left\|top\|top-right]` |
| `render` | `nonpareille render <in.dot.json\|in.dot.txt> [--scale 8] [--gap 1 --gap-color #000000] [--margin 0] [--background #00000000] [--format png\|png8\|svg\|ansi\|braille\|ascii\|shape-ascii] [-o out]` |
| `sheet` | `nonpareille sheet pack <frames...> --cols C [--preset P] -o out.png`<br>`nonpareille sheet slice <sheet.png> --frame WxH -o outdir` |
| `snap` | `nonpareille snap <image> [--expect 64x64] [--palette #hex,...] [--scale 1] [--json] -o sprite.png` |

## MCP 설정 (Claude Code)

`nonpareille mcp`는 stdio로 동작하는 MCP 서버입니다. Claude Code에는 이렇게 등록합니다.

```sh
claude mcp add nonpareille -- bun <repo>/cli/main.ts mcp
```

`<repo>`는 이 저장소의 절대 경로로 바꾸세요.

## codex-image 프로바이더

`nonpareille gen`의 기본 프로바이더인 `codex-image`는 로컬 codex-image 스킬을 호출합니다. 스킬 위치는 `NONPAREILLE_CODEX_IMAGE_SKILL_DIR` 환경 변수로 지정하고, 비어 있으면 `~/.agents/skills/codex-image`를 씁니다. 스킬은 ChatGPT 구독 로그인 정보(omo `/login`이 쓰는 `~/.omo/agent/auth.json`, `~/.omo/auth.json`, 또는 `~/.codex/auth.json`)를 쓰므로, 로그인이 없으면 `nonpareille gen`은 원인 메시지와 함께 종료 코드 3으로 끝납니다. 그 밖에 `openai`, `retro-diffusion`, `comfyui` 프로바이더도 고를 수 있습니다.

## 라이브러리로 쓰기

공개 API는 `src/index.ts`에서 내보냅니다.

```ts
import { writeFileSync } from "node:fs";
import { createPalette, createGrid, renderRGBA, encodeRGBAPNG } from "./src/index.ts";

const palette = createPalette([0x00000000, 0xff004dff, 0xffec27ff]);
const grid = createGrid(8, 8, palette);
grid.data[3 * 8 + 3] = 1;

const canvas = { width: 8, height: 8, dotW: 8, dotH: 8, gap: 0, gapColor: 0, margin: 0, background: 0 };
writeFileSync("dot.png", encodeRGBAPNG(renderRGBA(grid, canvas)));
```

색은 `0xRRGGBBAA` 형태의 32비트 정수이고, 팔레트 0번은 투명색입니다.

## 라이선스

MIT. 서드파티 고지는 [NOTICE](./NOTICE)를 보세요.

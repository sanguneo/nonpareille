# nonpareille — 도트(픽셀아트) 이미지 엔진 구현 계획

작성일: 2026-10-02 · 상태: 구현 착수 가능 (decision-complete) · 대상 경로: `C:\Users\sknah\workspace\nonpareille`

---

## 0. 한눈에 보기

### 0.1 무엇을 만드는가
**도트 수(W×H), 도트 크기(sx×sy px), 간격·여백, 전체 출력 크기**를 정하면 그 규격대로 도트 이미지를 만들어 내보내는 엔진입니다. 입력 경로는 네 가지이고, 모두 같은 내부 모델 `DotGrid`(팔레트 인덱스 격자)로 모입니다.

```
 (A) AI 생성 ── 프롬프트 빌더 → 이미지 모델(codex-image/OpenAI/RetroDiffusion/ComfyUI)
                                      │ (가짜 도트 이미지: 1024px, 경계 흐림)
                                      ▼
                            격자 검출 → 스냅(셀 대표색) ─┐
 (B) 직접 찍기 ── 사람/LLM 에이전트: DotText · MCP 도구 ──┤
 (C) 이미지 변환 ── 사진/일러스트 → 리샘플 ──────────────┤
 (D) 절차 생성 ── Bollinger 마스크 · 모자이크 ───────────┘
                                      ▼
                     DotGrid (Uint16 인덱스 + 팔레트, 0=투명)
                                      ▼
            팔레트(고정/추출) → 디더 → 정리(고아 픽셀·아웃라인)
                                      ▼
   출력: PNG(RGBA/인덱스 8bit) · SVG · 스프라이트시트 · EasyRPG 프리셋
         · 텍스트(ANSI 반블록/Braille/ASCII 형태매칭) · BOM(비즈/레고 수량)
```

사용자 요구("AI 자체로 뽑기"와 "이미지를 토대로 도트 추출" 둘 다 지원)는 (A)+(B) 경로와 (C) 경로를 모두 일급으로 두는 것으로 반영했습니다.

### 0.2 핵심 결정 (고정)
| 항목 | 결정 | 이유 |
|---|---|---|
| 언어/런타임 | TypeScript(strict) + Bun 1.4 | 환경에 Bun 1.4.2와 Node 24가 있음. `bun test`, 단일 바이너리 CLI |
| 코어 | 순수 TS, DOM/Node API 비의존 (`Uint8ClampedArray`, `Float32Array`만 사용) | 이후 웹 에디터에서 그대로 재사용 |
| 색 공간 | 거리·클러스터링·디더 오차는 **OKLab**, 평균은 **선형 sRGB(알파 premultiplied)** | 지각 균등 거리와 물리적으로 옳은 평균 |
| 투명 | 인덱스 `0` = 투명 (팔레트[0] = `0x00000000` 예약) | EasyRPG/RPG Maker의 "인덱스 0 = 투명 키"와 DotText `.`에 1:1 대응 |
| 이미지 디코드 | `Bun.Image`(JPEG/WebP/GIF/BMP/PNG) → PNG 바이트 → `fast-png`로 RGBA 디코드 | Bun 1.4.2의 `Bun.Image`에는 raw RGBA 접근자가 없음(프로토타입 확인: `png/jpeg/webp/resize/bytes…`만 있음) |
| PNG 인코드 | 자체 인코더 (인덱스 1/2/4/8bit + RGBA), zlib는 `node:zlib`, 브라우저는 `CompressionStream('deflate')` | 인덱스 PNG(PLTE+tRNS)를 정확히 제어해야 함 |
| 결정성 | 모든 난수는 시드 PRNG(mulberry32). `Math.random` 금지 | 재현 가능한 생성과 테스트 |
| 라이선스 | 프로젝트는 MIT. GPL/LGPL 저장소(EasyRPG Player, chafa, metapixel, scale2x, xBRZ, libimagequant)는 **아이디어와 포맷 수치만** 참고하고 코드는 복사하지 않음 | 라이선스 오염 방지 |
| 외부 의존성 | `fast-png`(MIT), `@modelcontextprotocol/sdk`(MIT), `zod`(MIT), `opentype.js`(MIT, M5부터) | 최소 의존 |

---

## 1. 용어

- **도트(dot)**: 논리 픽셀 1개. 격자 좌표 `(i, j)`, `0 ≤ i < W`, `0 ≤ j < H`.
- **DotGrid**: `W×H` 크기의 `Uint16Array` 인덱스 배열 + 팔레트.
- **도트 크기 `sx, sy`**: 출력에서 도트 1개가 차지하는 물리 픽셀 수(정수 ≥ 1). 보통 `sx = sy = s`.
- **간격 `g`**: 도트 사이 격자선 두께(px, 기본 0). **여백 `m`**: 바깥 테두리(px, 기본 0).
- **소스 주기 `p`**: AI 생성 이미지나 확대된 이미지에서 도트 1개가 차지하는 소스 픽셀 수(실수, 예: 7.5).
- **ΔE_ok**: OKLab 유클리드 거리.

---

## 2. 저장소 조사 결과

검증 수준: ✅ 소스/README/공식 문서로 확인 · ⚠️ 존재만 확인했거나 세부가 미확인.

### 2.1 이미지→도트 변환 / AI 가짜 도트 정리
| 저장소 | 라이선스 · 언어 | 핵심 기법 | 판정 | 근거 |
|---|---|---|---|---|
| [jenissimo/unfake.js](https://github.com/jenissimo/unfake.js) ✅ | MIT · Rust/WASM+JS | 경계 프로파일, zero-pad FFT로 기본 주기 + 배음 일관성 검사, **분수 주기와 위상 추정**, JPEG DCT 주기 배제. 다운샘플 모드: nearest/median/mode/mean/dominant(기본)/quantize→mode | **아이디어 채택** (격자 검출 §5.4의 원형) | `crates/unfake-core/src/detect/grid.rs`, `downscale.rs` |
| [KennethJAllen/proper-pixel-art](https://github.com/KennethJAllen/proper-pixel-art) ✅ | MIT · Python | 알파<50%를 배경으로 치환 → NN 2× → Canny → 모폴로지 close → 확률적 Hough → 수평/수직선 클러스터 → 간격 중앙값으로 메시 완성 → 색 양자화 → 셀별 최빈색. 영상은 격자와 팔레트를 공유 | **아이디어 채택** (메시 스냅, 셀 최빈색, 애니메이션 공유 격자) | README "Algorithm" |
| [alexkorol/pixel-perfecter](https://github.com/alexkorol/pixel-perfecter) ✅ | MIT · Python | 후보 검출기 4개(정확 NN, Hough, 경계질량 자기상관, phase-fold) → **통일 점수 = 셀 간 대비 / √(셀 내 분산)** 로 배음 판별 → 분수 피치는 가변 메시 → 셀 가장자리를 잘라낸 최빈색 | **아이디어 채택** (§5.4 검증 점수, 가장자리 트림) | README "How Reconstruction Works" |
| [kkjang/sprite-gen](https://github.com/kkjang/sprite-gen) ✅ | MIT · Go | 에이전트 친화 CLI: 알파/배경 정리 → 슬라이스 → snap scale → 팔레트 추출 → snap pixels → GIF/시트 export, manifest.json | **아이디어 채택** (CLI 구성, JSON 리포트) | README pipeline |
| [sedthh/pyxelate](https://github.com/sedthh/pyxelate) ✅ | MIT · Python | 3×3 반복 다운샘플 + Sobel 방향(HOG 유사), tied-covariance **Bayesian GMM 팔레트**, 확률 기반 디더 | **아이디어 채택** (선택 옵션), 기본값으로는 느림 | README, `pyxelate/main.py` |
| [KohakuBlueleaf/PixelOE](https://github.com/KohakuBlueleaf/PixelOE) ✅ | Apache-2.0 · Python | **대비 인지 아웃라인 확장**: 국소 휘도 median/min/max(창 16, stride 4) → 가중 `e·w + d·(1−w)`로 침식/팽창 혼합(각 2회). 대비 다운샘플: Lab 패치에서 L은 중앙값, 치우치면 min/max, a/b는 중앙값 | **이식** (§5.7.4, §5.3 `contrast`). NOTICE 유지 | `src/pixeloe/torch/outline.py`, `downscale/contrast_based.py` |
| [giventofly/pixelit](https://github.com/giventofly/pixelit) ✅ | MIT · JS | 브라우저 픽셀화 + 팔레트 | 참고만 (기법이 단순함) | `src/pixelit.js` |
| Gerstner 2012 *Pixelated Image Abstraction*: [fHachenberg/pix](https://github.com/fHachenberg/pix), [piasharp](https://github.com/urbanspr1nter/piasharp), [AlexandreBinninger/pixelization](https://github.com/AlexandreBinninger/pixelization) ⚠️ | pix: Gerstner 저작권 표기 · C++ / Rust 구현 | SLIC 슈퍼픽셀 + 질량 제약 결정적 어닐링 팔레트 | **보류** (M8 이후 고품질 모드 후보). 이번 범위에서는 k-means로 대체 | [논문 페이지](https://cragl.cs.gmu.edu/pixelate/) |

### 2.2 엔진·포맷·에디터·절차 생성 (EasyRPG / spritegen 계열)
| 저장소 | 라이선스 · 언어 | 쓸 만한 것 | 판정 |
|---|---|---|---|
| [EasyRPG/Player](https://github.com/EasyRPG/Player) ✅ | GPL-3.0 · C++ | `GetCharacterRect`: 캐릭터 블록 = `24·(T/16)·3 × 32·(T/16)·4`, 시트에서 `x=(idx%4)·bw, y=⌊idx/4⌋·bh`. `$` 접두 = 대형 캐릭셋(확장 기능) | **포맷 호환 (수치만)** |
| [EasyRPG/liblcf](https://github.com/EasyRPG/liblcf) ✅ | MIT · C++ | RPG Maker 2000/2003 데이터 포맷 | 포맷 호환 (필요 시 참조) |
| [EasyRPG 위키 미디어 규격](https://easyrpg.github.io/wiki/rtp-replacement/media-file-format-specifications/) ✅ | 문서 | 아래 §5.12.5 표의 모든 치수. **8bit 인덱스 256색 PNG/BMP/XYZ만 허용**, 알파/tRNS 무시 | **프리셋으로 채택** |
| [zfedoran/pixel-sprite-generator](https://github.com/zfedoran/pixel-sprite-generator) ✅ | MIT · JS | Dave Bollinger 알고리즘: 마스크(−1 테두리, 0 빈칸, 1 빈칸/몸통, 2 테두리/몸통) → 랜덤 샘플 → 미러 → 4-이웃 테두리 → HSL 채색. 기본값 `edgeBrightness .3, colorVariations .2, brightnessNoise .3, saturation .5` | **이식** (§5.9) |
| [tversteeg/sprite-gen](https://github.com/tversteeg/sprite-gen) ⚠️ | Rust | Bollinger 포트 + 에디터 | 참고 |
| [yurkth/sprator](https://github.com/yurkth/sprator) ⚠️ | — | 셀룰러 오토마타 기반 스프라이트 | 참고 (M6 옵션) |
| [aldegad/sprite-gen](https://github.com/aldegad/sprite-gen) ⚠️ | 라이선스 미확인 · Codex/Claude 스킬 | AI 스틸 이미지 → 상태 행/알파 정리/프레임 추출/아틀라스 | **아이디어 채택** (애니메이션 아틀라스) |
| [nakzyu/gemini-pixel-sprite-gen](https://github.com/nakzyu/sprite-gen) ✅ | Claude Code 플러그인 | **스타일 앵커 이미지 필수**(없으면 화풍이 흔들림), `sprite_spec.yaml`의 `target_h/cell_h` (캐릭터 32/48, 몬스터 64/72) | **아이디어 채택** (§6.1.5 스타일 앵커) |
| [kenneth968/spritegen](https://github.com/kenneth968/spritegen) ✅ | MIT · Python | 멀티 provider, 진화 체인, 적응형 flood-fill 배경 제거, 프로젝트 단위 스타일/팔레트 컨텍스트, 색 모드(제한 팔레트/흑백/값맵) | **아이디어 채택** (provider 추상화, 프로젝트 컨텍스트) |
| [demestav/spritegen](https://github.com/demestav/spritegen) ✅ | Python | 플레이스홀더 시트 생성 | 기각 (기능 무관) |
| [aseprite/aseprite](https://github.com/aseprite/aseprite) ✅ | 소스 공개 EULA(OSS 아님) · C++ | [`.ase` 파일 규격 문서](https://github.com/aseprite/aseprite/blob/main/docs/ase-file-specs.md) 공개 | **포맷 호환** (M8 `.ase` 내보내기) |
| Aseprite MCP: [diivi/aseprite-mcp](https://github.com/diivi/aseprite-mcp), [VukasinTheProgramer/Aseprite-MCP](https://github.com/VukasinTheProgramer/Aseprite-MCP), [willibrandon/pixel-plugin](https://github.com/willibrandon/pixel-plugin) ✅ | 다양 | LLM이 "텍스트 격자"로 그리는 인터페이스, 레이어/프레임 도구 | **아이디어 채택** (§6.2 MCP 도구 설계). Aseprite 설치에 의존하지 않도록 자체 구현 |
| LibreSprite ✅ GPL-2.0 / Pixelorama ✅ MIT / Piskel ✅ Apache-2.0 | — | 에디터 UX 참고 | 참고 (M8 웹 에디터) |
| [kitao/pyxel](https://github.com/kitao/pyxel) ⚠️ | 라이선스 표기 "Other"(MIT로 알려짐) · Rust | 16색 고정 팔레트 레트로 엔진 | 팔레트 프리셋만 |
| [Lospec Palette API](https://lospec.com/palettes/api) ✅ / [api.lospec.com/docs](https://api.lospec.com/docs/) | 웹 API | 슬러그로 팔레트 JSON 다운로드 | **채택** (`dot palette fetch <slug>`) |

### 2.3 ASCII / 텍스트 아트
| 저장소/자료 | 라이선스 · 언어 | 핵심 기법 | 판정 |
|---|---|---|---|
| [Alex Harri, "ASCII characters are not pixels"](https://alexharri.com/blog/ascii-rendering) (2026-01-17) ✅ | 블로그 | **6D 형태 벡터**: 셀마다 엇갈린 샘플링 원 6개(2열×3행, 왼쪽은 내리고 오른쪽은 올림), 글자별 원 내 잉크 비율 → 차원별 max 정규화 → 최근접 탐색. **대비 강화**: `v ← m·(v/m)^e` (m = 벡터 최댓값). **방향성 대비**: 셀 밖 외부 원 벡터로 성분별 `m_d = max(v_d, x_d)` → 계단 현상 제거 | **이식** (§5.10.4) |
| [jeeshofone/ascii-shape-renderer](https://github.com/jeeshofone/ascii-shape-renderer) ✅ / [JamesM92/Img2ContourAscii](https://github.com/JamesM92/Img2ContourAscii) ✅ | npm / PyPI | Harri 기법 구현 (k-d tree, 색 모드 fg/bg/both). 후자는 Harri 저장소의 `default.json` 형태 벡터 사용 | 참고 구현 |
| [hpjansson/chafa](https://github.com/hpjansson/chafa) ✅ | **LGPLv3+** · C | 심볼맵(블록/반블록/쿼터/섹스턴트/Braille), 셀마다 fg/bg 2색 + 최적 심볼 | **아이디어만** (§5.10.1 반블록 미리보기) |
| [TheZoraiz/ascii-image-converter](https://github.com/TheZoraiz/ascii-image-converter) ✅ | Apache-2.0 · Go | 휘도 램프, Braille, 색 출력 | 참고 |
| [Talinx/jp2a](https://github.com/Talinx/jp2a) ⚠️ / aalib / libcaca ⚠️ | GPL 계열 | 휘도 램프 매핑 | 아이디어만 (§5.10.3) |
| [OsciiArt/DeepAA](https://github.com/OsciiArt/DeepAA) ⚠️ | — | CNN 기반 AA | 기각 (모델 의존) |
| AcerolaFX ASCII 셰이더 ([GarrettGunnell/AcerolaFX](https://github.com/GarrettGunnell/AcerolaFX)) ⚠️ | — | DoG + Sobel 방향으로 `/ \ | _` 선택 | 아이디어 (§5.10.4 엣지 글자 옵션) |

**도트 엔진과의 접점** (ASCII 조사에서 건진 것)
1. **텍스트 격자 = LLM이 다루기 쉬운 도트 표현.** 글자 1개 = 도트 1개인 DotText(§6.2.1)가 에이전트 "직접 찍기"의 기본 포맷입니다.
2. **글리프 매칭 = 템플릿 매칭.** Harri의 "형태 벡터 + 최근접" 구조가 모자이크 타일 매칭(§5.11)과 같은 수학입니다.
3. **반블록 `▀` + truecolor**는 터미널에서 도트 2개를 손실 없이 보여줍니다. 그래서 CLI 미리보기와 에이전트 피드백 채널로 씁니다.

### 2.4 모자이크 · 양자화 · 디더 · 스케일러
| 저장소/자료 | 라이선스 | 핵심 | 판정 |
|---|---|---|---|
| [codebox/mosaic](https://github.com/codebox/mosaic) ✅ | MIT · Python | 타일을 `TILE_MATCH_RES` 저해상도로 줄여 절대차+제곱차 비교. 해상도 1이면 평균색만 비교 | **아이디어 채택** (§5.11 다해상도 특징) |
| [schani/metapixel](https://github.com/schani/metapixel) ✅ | **GPL-2.0** · C | 고전 포토모자이크, 타일 재사용 최소 거리 | 아이디어만 (재사용 금지 반경) |
| [danielballan/photomosaic](https://github.com/danielballan/photomosaic) ⚠️ | Python | 그리드 + 풀 매칭 | 참고 |
| [ibezkrovnyi/image-quantization (image-q)](https://github.com/ibezkrovnyi/image-quantization) ✅ | MIT · TS | RGBQuant/NeuQuant/Wu, CIEDE2000 등 거리, 디더 커널 다수 | **벤치마크 비교 대상** (자체 OKLab 구현과 품질 비교. 의존성으로는 넣지 않음) |
| [ImageOptim/libimagequant](https://github.com/ImageOptim/libimagequant) ✅ | **GPL-3.0 / 상용 이중** | 고품질 양자화 | **기각** (MIT 오염) |
| [Bisqwit: Yliluoma 위치 디더](https://bisqwit.iki.fi/story/howto/dither/jy/) ✅ / [hitherdither](https://github.com/hbldh/hitherdither) | 문서 / Python | 임의 팔레트용 순서 디더(혼합 쌍 탐색) | **이식 (알고리즘 1)** §5.6.3 |
| [Bottosson OKLab](https://bottosson.github.io/posts/oklab/) ✅ | 공개 | 행렬 (§5.2, 직접 계산으로 검증함) | **채택** |
| Scale2x/EPX ([amadvance/scale2x](https://github.com/amadvance/scale2x), GPL-2) ✅ | 규칙은 공개 | §5.12.6 | **규칙만 구현** |
| [MMPX (McGuire 2021)](https://casual-effects.com/research/McGuire2021PixelArt/) ✅ / [pierogis/mmpx-rs](https://github.com/pierogis/mmpx-rs) MIT | 논문 / Rust | 스타일 보존 2× 확대 | M8 옵션 (논문 기반으로 구현) |
| hqx / xBR / xBRZ ✅ | xBRZ GPL-3 | 블렌딩 확대 | **기각** (도트 감성 훼손, 라이선스) |
| [DitherPunk.jl](https://github.com/JuliaImages/DitherPunk.jl) ✅ MIT, [Tezumie/Image-to-Pixel](https://github.com/Tezumie/Image-to-Pixel) ⚠️ | — | 디더 카탈로그 | 시각 비교 참고 |

### 2.5 AI 생성 측
| 대상 | 핵심 | 판정 |
|---|---|---|
| codex-image 스킬 (로컬, 사용자 ChatGPT 구독) ✅ | `bun <skill>/scripts/gen.mjs --prompt-file f --out o.png --size 1024x1024 --quality high [--ref a.png]…`, stdout JSON `{path,size,…}`, 1~3분 | **기본 provider** (API 키 불필요) |
| OpenAI Images API (gpt-image) | `background: "transparent"` 지원 | provider (키가 있을 때) |
| [nerijs/pixel-art-xl](https://huggingface.co/nerijs/pixel-art-xl) ✅ | SDXL LoRA, 트리거 없음. LCM-LoRA와 쓸 때 8 step, CFG 1.5, LoRA 가중치 1.2, refiner 사용 안 함. 1024 생성 후 NN 축소 권장 | ComfyUI/A1111 provider 프리셋 |
| [Retro Diffusion](https://retrodiffusion.ai/) ✅ | 픽셀 전용 모델, API `POST …/inferences {prompt, negative_prompt, model, prompt_style, width:64, height:64}` (v1/v2 경로는 착수 시 확인) | provider (네이티브 해상도로 직접 받으므로 격자 검출을 건너뜀) |

---

## 3. 아키텍처

### 3.1 디렉터리 구조
```
nonpareille/
  package.json  tsconfig.json  bunfig.toml  biome.json  LICENSE(MIT)  NOTICE(PixelOE 등)
  src/
    core/
      color.ts          sRGB↔linear LUT, OKLab/OKLCh, ΔE, RGBA 패킹
      geometry.ts       캔버스 규격 해석기, 픽셀↔도트 매핑, fit/crop
      grid.ts           DotGrid, Document(frames/layers), flatten, clone, diff
      prng.ts           mulberry32, 시드 유틸
      image.ts          RGBAImage {w,h,data:Uint8ClampedArray}, 알파 이진화
    io/
      decode.ts         Bun.Image → PNG → fast-png → RGBAImage
      png-encode.ts     인덱스(1/2/4/8bit)·RGBA PNG 인코더, CRC32
      dottext.ts        DotText 파서/직렬화 (+RLE 행)
      project.ts        .dot.json 읽기/쓰기
      svg.ts            행 run 병합 SVG
      palette-files.ts  .hex / .gpl / .pal / PNG 스와치, Lospec fetch
      sheet.ts          스프라이트시트 배치/분할
    palette/
      presets.ts        pico8, db16, db32, gameboy4, nes(근사), endesga32, 1bit
      histogram.ts      고유색 가중 히스토그램
      median-cut.ts     OKLab median cut
      kmeans.ts         가중 Lloyd + 고정색 잠금
      map.ts            최근접 매핑 + 캐시
      ramp.ts           OKLCh 휴 시프트 램프
    convert/
      resample.ts       셀 분할 + 대표색 전략 7종
      grid-detect.ts    DFT 기반 주기/위상 + 검증 점수 + 메시 스냅
      snap.ts           AI 이미지 → DotGrid
      outline-expand.ts PixelOE형 전처리
      background.ts     크로마키/테두리 flood 배경 제거
      pipeline.ts       convert(), snap() 상위 파이프라인
    dither/
      diffusion.ts      커널 8종, serpentine
      ordered.ts        Bayer 2^k
      yliluoma.ts       알고리즘 1
    cleanup/
      orphans.ts  outline.ts  alpha.ts
    draw/
      primitives.ts     점, Bresenham 선, 사각, Zingl 타원, flood fill, 미러, 시프트
      stroke.ts         pixel-perfect 스트로크 필터
    gen/
      bollinger.ts  masks.ts
      prompt.ts         이미지 프롬프트 빌더(템플릿 + 수치)
      painter-prompt.ts LLM 직접 찍기용 시스템 프롬프트
      providers/{types.ts, codex-image.ts, openai.ts, retro-diffusion.ts, comfyui.ts}
      generate.ts       프롬프트 → provider → snap → 후처리
    text/
      halfblock.ts  braille.ts  ramp.ts  shape-ascii.ts  glyph-vectors.ts
    mosaic/
      tile-mosaic.ts  bom.ts
    presets/
      easyrpg.ts        규격표 + 검증기 + 시트 레이아웃
    index.ts            공개 API
  cli/
    main.ts            `dot` 명령 라우터 (Bun 단일 실행 파일 빌드 가능)
  mcp/
    server.ts          stdio MCP 서버 (에이전트 직접 찍기)
  test/
    fixtures/ …        합성 생성기 스크립트 + 소수의 실제 AI 샘플
    *.test.ts
  .omo/plans/dot-engine.md
```

### 3.2 데이터 모델 (TypeScript)
```ts
export type RGBA32 = number;            // 0xRRGGBBAA (>>> 0)
export interface RGBAImage { width: number; height: number; data: Uint8ClampedArray } // len = 4wh

export interface Palette {
  colors: Uint32Array;                  // RGBA32, colors[0] === 0x00000000 (투명, 예약)
  names?: (string | undefined)[];
  locked?: Uint8Array;                  // 1 = k-means에서 고정
}

export interface DotGrid {
  width: number; height: number;        // W, H (1..4096)
  palette: Palette;
  data: Uint16Array;                    // len = W*H, 값 = 팔레트 인덱스, 0 = 투명
}

export interface CanvasSpec {
  width: number; height: number;        // 도트 수 W, H
  dotW: number; dotH: number;           // sx, sy (정수 ≥ 1)
  gap: number; gapColor: RGBA32;        // g
  margin: number; background: RGBA32;   // m
}

export interface Layer { name: string; visible: boolean; data: Uint16Array }
export interface Frame { layers: Layer[]; durationMs: number }
export interface DotDocument {
  version: 1; canvas: CanvasSpec; palette: Palette; frames: Frame[];
  meta?: { source?: string; seed?: number; prompt?: string; tool?: string };
}
```
- `flatten(frame)`: 위 레이어부터 보며 `data ≠ 0`인 첫 인덱스를 채택합니다(도트 아트에는 반투명 합성이 없음). O(W·H·L).
- `.dot.json` 직렬화: `data`는 base64(Uint16 LE) + 선택적 RLE. 스키마는 `zod`로 검증합니다.

---

## 4. 처리 파이프라인 (함수 시그니처)

```ts
// (C) 이미지 변환
convert(img: RGBAImage, o: ConvertOptions): DotGrid
// ConvertOptions = { width: number; height?: number|'auto'; fit: 'cover'|'contain'|'stretch';
//   sample: SampleMode; palette: PaletteSpec; dither: DitherSpec; outlineExpand?: boolean;
//   cleanup: { orphans: boolean; outline?: OutlineSpec }; alphaThreshold: number }

// (A) AI 이미지 스냅
detectGrid(img: RGBAImage, prior?: { periodX?: number; periodY?: number }): GridEstimate
snap(img: RGBAImage, est: GridEstimate, o: SnapOptions): DotGrid

// (A) 생성 전체
generate(spec: GenSpec, provider: ImageProvider): Promise<{ grid: DotGrid; report: GenReport }>

// (B) 직접 찍기
parseDotText(src: string): DotGrid      // 오류는 행/열 위치와 함께 throw
applyOps(grid: DotGrid, ops: DrawOp[]): DotGrid

// 출력
renderRGBA(grid: DotGrid, c: CanvasSpec): RGBAImage
encodePNG(grid|img, opt): Uint8Array
```

---

## 5. 수학 명세

### 5.1 기하: 크기·도트 수·도트 크기의 관계

**정방향 (도트 → 출력 픽셀)**
```
OW = W·sx + (W−1)·g + 2m
OH = H·sy + (H−1)·g + 2m
```

**출력 픽셀 → 도트 매핑** (렌더링과 히트 테스트 공용). 출력 픽셀 `(X, Y)`에 대해:
```
u = X − m,  v = Y − m
u < 0 ∨ u ≥ OW − 2m  → 여백(background)
i = ⌊u / (sx+g)⌋,  ru = u mod (sx+g)
ru ≥ sx              → 격자선(gapColor)
그 외                → G[j·W + i]   (j, rv도 같은 방식)
```

**해석기 (사용자가 둘을 주면 나머지를 결정)**
| 입력 | 계산 | 실패 조건 |
|---|---|---|
| W, sx | OW = 위 식 | — |
| OW*, W | `sx = ⌊(OW* − 2m − (W−1)g) / W⌋` | sx < 1 |
| OW*, sx | `W = ⌊(OW* − 2m + g) / (sx+g)⌋` | W < 1 |
| exact OW* 요구 | 잔여 `r = OW* − OW(sx)` 를 좌 `⌊r/2⌋`, 우 `r − ⌊r/2⌋` 패딩 | — |

**소스 비율에서 H 자동 결정**: 소스가 `w0×h0`이고 W가 주어지면, 화면상 비율 `W·sx : H·sy = w0 : h0`을 맞춥니다.
```
H = max(1, round( W · (h0/w0) · (sx/sy) ))
```

**fit 모드** (목표 비율 `A_t = (W·sx)/(H·sy)`, 소스 비율 `A_s = w0/h0`)
- `cover`: A_s > A_t이면 소스 크롭 폭 `w' = h0·A_t`, `x0 = (w0 − w')/2`. 아니면 `h' = w0/A_t`, `y0 = (h0 − h')/2`.
- `contain`: 소스를 `σ = min(W·sx/w0, H·sy/h0)`로 맞추고 남는 셀은 투명으로 둡니다.
- `stretch`: 크롭 없이 축별 독립 스케일.

**제약**: `1 ≤ W, H ≤ 4096`, `OW·OH ≤ 2^28`(268M px), `sx, sy, g, m`은 정수. 프리셋: 8², 16², 24×32(RM2k 캐릭터 프레임), 32², 48²(RM2k 얼굴), 64², 128² / 표시 배율 ×1~×16.

### 5.2 색 공간 (OKLab)
sRGB 8bit → 선형 (256항목 LUT):
```
c = v/255;  lin(c) = c ≤ 0.04045 ? c/12.92 : ((c+0.055)/1.055)^2.4
```
선형 → OKLab:
```
l = 0.4122214708 r + 0.5363325363 g + 0.0514459929 b
m = 0.2119034982 r + 0.6806995451 g + 0.1073969566 b
s = 0.0883024619 r + 0.2817188376 g + 0.6299787005 b
l' = ∛l, m' = ∛m, s' = ∛s
L = 0.2104542553 l' + 0.7936177850 m' − 0.0040720468 s'
a = 1.9779984951 l' − 2.4285922050 m' + 0.4505937099 s'
b = 0.0259040371 l' + 0.7827717662 m' − 0.8086757660 s'
```
역변환:
```
l' = L + 0.3963377774 a + 0.2158037573 b
m' = L − 0.1055613458 a − 0.0638541728 b
s' = L − 0.0894841775 a − 1.2914855480 b
r =  4.0767416621 l³ − 3.3077115913 m³ + 0.2309699292 s³
g = −1.2684380046 l³ + 2.6097574011 m³ − 0.3413193965 s³
b = −0.0041960863 l³ − 0.7034186147 m³ + 1.7076147010 s³
enc(c) = c ≤ 0.0031308 ? 12.92c : 1.055·c^(1/2.4) − 0.055
```
- 거리: `ΔE_ok = √(ΔL² + Δa² + Δb²)`. 비교에는 제곱 거리를 씁니다. 선택적 가중치 `w_L`(기본 1).
- OKLCh: `C = √(a²+b²)`, `h = atan2(b, a)`.
- **검증된 기준값** (이번 조사에서 직접 계산):
  - 흰색 → `(1, 0, 0)`, 검정 → `(0, 0, 0)`
  - `#FF0000` → `(0.62796, 0.22486, 0.12585)`, `#00FF00` → `(0.86644, −0.23389, 0.17950)`, `#0000FF` → `(0.45201, −0.03246, −0.31153)`
  - `#808080` → `L = 0.59987`
  - sRGB→OKLab→sRGB 8bit 왕복 오차 0 (무작위 20만 색)
- **알파**: 도트 아트는 이진 알파입니다. `α ≥ τ_α(기본 128)`이면 불투명, 아니면 투명. 혼합 평균은 premultiplied로 계산합니다: `C̄ = Σ wᵢαᵢ·lin(cᵢ) / Σ wᵢαᵢ`, `ᾱ = Σ wᵢαᵢ / Σ wᵢ`. 셀 판정은 `ᾱ < 0.5`이면 투명입니다.

### 5.3 리샘플링: 셀 분할과 대표색
**셀 경계** (실수): `x_i = x0 + i·(w'/W)`, `y_j = y0 + j·(h'/H)`. 크롭 영역 `(x0, y0, w', h')`는 §5.1에서 정합니다.

**면적 가중치** (box filter): 소스 열 c가 셀 i에 기여하는 비율:
```
ω_i(c) = max(0, min(c+1, x_{i+1}) − max(c, x_i)),   가중치 = ω_i(c)·ω_j(r)
```

**가장자리 트림**: 셀 폭이 `p = w'/W`일 때, 최빈값 계열 전략은 안쪽 사각형 `[x_i + βp, x_{i+1} − βp]`만 씁니다(β 기본 0.15, 셀 폭이 4px 미만이면 0). AI 이미지의 안티앨리어싱 경계가 투표에 끼지 않게 하려는 것입니다(pixel-perfecter).

**대표색 전략 `SampleMode`**
| 모드 | 정의 | 용도 |
|---|---|---|
| `center` | 셀 중심 `(⌊(x_i+x_{i+1})/2⌋, …)` 1픽셀 | 정확히 확대된 도트 이미지 |
| `mean` | 면적 가중 선형광 평균(premultiplied) | 사진 (부드러움) |
| `median` | OKLab 채널별 가중 중앙값 | 노이즈가 섞인 경우 |
| `mode` | 사전 양자화(K₀=32, §5.5) 라벨의 최빈값. 동률이면 셀 평균과의 ΔE가 작은 쪽 | **AI 이미지 기본** (proper-pixel-art) |
| `dominant` | 최빈 라벨 점유율 `s* = n_{k*}/n`. `s* ≥ θ(기본 0.45)`이면 그 색, 아니면 `mean` | 혼합 |
| `kcentroid` | 셀 내부 k-means(k=2, 3회 반복, 초기값 = L 최소/최대 픽셀) → 큰 클러스터의 중심 | 경계 보존 |
| `contrast` | OKLab L의 평균 μ, 중앙값 med, 표준편차 σ. `κ = (μ − med)/(σ + 1e−6)`. κ > κ₀(0.5)이면 L = P95, κ < −κ₀이면 L = P5, 아니면 med. a·b는 중앙값 | 가는 선 보존 (PixelOE 계열. κ₀는 M2에서 PixelOE 원본과 A/B 비교로 확정) |

**셀 순도** (품질 지표, 리포트에 포함): `purity = (1/WH) Σ s*_{ij}`. AI 스냅 결과가 0.7 미만이면 경고합니다.

### 5.4 AI 이미지 격자 검출 (분수 주기 대응) — 프로토타입 검증 완료

> **이번 조사 중 잡은 실제 결함**: 정수 지연 자기상관 방식은 배율이 분수(예: 7.5)일 때 경계 간격이 7, 8, 7, 8…로 번갈아 나와 피크가 둘로 쪼개집니다. 그 결과 7.5→15, 5.3→15.9, 3.25→13처럼 **2~4배 배음을 주기로 오인**했습니다. 아래의 **연속 주파수 DFT** 방식으로 바꾼 뒤 합성 테스트 7/7에서 W를 정확히 복원했습니다(배율 3.25~16, 노이즈 ≤0.08, 블러 포함).

입력: RGBA 이미지 `w0×h0`. 출력: `GridEstimate { px, py, phiX, phiY, W, H, confidence, mesh?: {xs: number[], ys: number[]} }`.

1. **전처리**: 알파 < 128인 픽셀은 키 색으로 바꿉니다. 테두리의 균일 배경(모서리 4개의 최빈색과 ΔE < 0.04)은 트림합니다.
2. **경계 에너지 프로파일** (열 방향; 행 방향은 대칭):
   ```
   E_x(x) = Σ_y ΔE_ok( I(x,y), I(x−1,y) ),   x = 1 … w0−1,   E_x(0) = 0
   e(x) = E_x(x) − mean(E_x),   S = Σ E_x
   ```
3. **연속 주파수 스펙트럼**: 주기 후보 τ ∈ [2, w0/4], 1차 탐색 간격 Δτ = 0.05 (사전 주기 `p0`가 있으면 [0.6p0, 1.6p0]):
   ```
   A(τ) = | Σ_x e(x)·exp(−2πi·x/τ) | / S
   ```
   삼각함수는 회전 재귀(`z_{x+1} = z_x · e^{−2πi/τ}`)로 계산합니다. 후보 수 `#τ = (w0/4 − 2)/0.05 ≈ 5·w0`이므로 복잡도는 O(w0·#τ) ≈ O(5·w0²)입니다. w0 = 1024이면 복소 곱셈 약 520만 번입니다.
4. **기본 주기 선택**: A의 국소 최대 중 `A ≥ 0.5·A_max`를 만족하는 것들 가운데 **τ가 가장 큰 것(= 주파수가 가장 낮은 것)** 을 고릅니다.
   근거: 주기가 p인 경계열의 스펙트럼선은 k/p (k ≥ 1)에만 있고 1/p보다 낮은 주파수에는 없습니다. 그래서 p/2, p/3 같은 하위 주기는 배제되고, 2p는 홀수 배음이 비어 점수가 낮아 배제됩니다.
5. **정밀화** (배음 최소제곱): k = 1..K, `K = min(4, ⌊0.5·τ̂⌋)` (나이퀴스트 조건 k/τ̂ ≤ 0.5)에서 `f_k = argmax_{f ∈ [0.98, 1.02]·k/τ̂} A(1/f)` (간격 0.0005·k/τ̂), 그 다음
   ```
   f₁ = Σ k·f_k / Σ k²,   p̂ = 1/f₁
   ```
6. **위상**: `φ = ( −arg( Σ_x E(x)·e^{−2πi x f₁} ) / 2π ) · p̂  mod p̂`. 경계는 `b_k = φ + k·p̂`에 있습니다. 경계 인덱스 정의 때문에 약 +0.3px 편향이 있지만 트림으로 흡수됩니다.
7. **셀 수**: `k_min = ⌈−φ/p̂⌉`, `k_max = ⌊(w0 − φ)/p̂⌋`, `W = k_max − k_min` + (왼쪽 부분 셀 `b_{k_min} ≥ 0.5p̂`이면 1) + (오른쪽 부분 셀 `w0 − b_{k_max} ≥ 0.5p̂`이면 1).
8. **가로·세로 결합**: 도트가 정사각형이라고 가정하는 기본 모드에서 `|p̂x − p̂y| / max < 0.03`이면 두 값을 신뢰도 가중 평균으로 통일합니다. 차이가 크면 비정사각 도트로 봅니다.
9. **검증 점수** (pixel-perfecter): 후보 집합 {p̂, 2p̂, p̂/2}와 정수 반올림 후보에 대해
   ```
   Q(p) = mean_{인접 셀쌍} ΔE(c_a, c_b) / √( mean_{셀} Var_intra + ε ),   ε = 1e−4
   ```
   최댓값을 최종 주기로 씁니다.
10. **메시 스냅** (가변 격자): 각 예측 경계 b_k를 `[b_k − p̂/4, b_k + p̂/4]` 안의 E 최댓값 위치로 옮깁니다. 단, 그 최댓값이 `μ_E + σ_E`보다 클 때만 옮깁니다. 결과 `xs[]`를 셀 경계로 씁니다.
11. **정확 NN 단축 경로**: 정수 s = ⌊w0/2⌋ … 2 중 w0와 h0를 모두 나누는 값에 대해, 모든 s×s 블록의 최대 ΔE가 1e−6 이하면 즉시 확정합니다(confidence 1).
12. **신뢰도**: `confidence = A(p̂)`. 0.15 미만이면 "격자 없음"으로 보고 §5.3 일반 리샘플(사용자 지정 W)로 폴백합니다.

### 5.5 팔레트
**히스토그램**: 불투명 픽셀의 24bit 키 → 가중치. 고유색이 65,536개를 넘으면 채널당 5bit(32,768빈)로 사전 비닝하고 빈 평균을 대표값으로 씁니다.

**Median cut (OKLab, 결정적 초기화)**
```
boxes = {전체}
while |boxes| < K:
  b* = argmax_b SSE_b,   SSE_b = Σ_{c∈b} w_c ‖c − μ_b‖²
  축 d* = argmax_d 가중분산_d(b*);  가중 중앙값에서 분할
팔레트 = {μ_b}
```

**가중 k-means (Lloyd) 정제**
```
assign(c) = argmin_k ‖c − μ_k‖²
μ_k = Σ_{assign(c)=k} w_c·c / Σ w_c          (locked[k]이면 갱신하지 않음)
종료: max_k ‖Δμ_k‖ < 1e−4 또는 32회
빈 클러스터: 현재 오차가 가장 큰 색으로 재시드
```
목적함수 `J = Σ w_c min_k ‖c − μ_k‖²`는 단조 비증가해야 합니다(테스트 항목).

**고정 팔레트 매핑**: `idx(c) = argmin_k ΔE²(c, P_k)`, `Map<rgb24, idx>` 캐시. 팔레트가 32색 이하면 선형 탐색, 그보다 크면 L 기준 정렬 + 가지치기(|ΔL| ≥ 현재 최선이면 중단).

**프리셋**: pico8(16), db16, db32, endesga32, gameboy(4), 1bit(2). Lospec 슬러그로 내려받기 지원.

**팔레트 정렬**: 인덱스 PNG와 램프 표시를 위해 (휴 구간 12개, 그 안에서 L 오름차순)으로 정렬합니다. 인덱스 0(투명)은 고정합니다.

**휴 시프트 램프 생성** (n단계, 기준색 (L₀, C₀, h₀)):
```
t_i = i/(n−1) − 0.5                       (−0.5 … 0.5)
L_i = clamp(L₀ + t_i·ΔL, 0.08, 0.97)       ΔL 기본 0.6
C_i = C₀ · (1 − 0.6·(2|t_i|)^1.5)          (양 끝으로 갈수록 채도 감소)
h_i = h₀ + t_i·Δh·σ                        Δh 기본 40°, σ = 밝은 쪽이 h_warm = 90°(OKLCh 노랑 부근)로
                                           향하도록 최단 호 방향 부호(±1)
```
sRGB 영역 밖이면 L과 h는 고정하고 C를 이분법으로 줄입니다(12회).

### 5.6 디더링
작업 버퍼는 Float32 OKLab입니다. 투명 픽셀은 오차를 받지도 주지도 않습니다. 강도 λ ∈ [0, 1] (기본 1). 오차는 성분별로 클램프합니다: `|e_L| ≤ 0.25`, `|e_a|, |e_b| ≤ 0.1` (색 번짐 방지).

#### 5.6.1 오차 확산
`q = P[idx(c)]`, `e = λ(c − q)`. 이웃에 `e·k/D`를 더합니다(`*` = 현재 픽셀). serpentine 주사(홀수 행은 오른→왼, 커널 좌우 반전)가 기본입니다.
| 이름 | 커널 | D |
|---|---|---|
| Floyd–Steinberg | `[ * 7 ; 3 5 1 ]` | 16 |
| Jarvis–Judice–Ninke | `[ * 7 5 ; 3 5 7 5 3 ; 1 3 5 3 1 ]` | 48 |
| Stucki | `[ * 8 4 ; 2 4 8 4 2 ; 1 2 4 2 1 ]` | 42 |
| Burkes | `[ * 8 4 ; 2 4 8 4 2 ]` | 32 |
| Sierra-3 | `[ * 5 3 ; 2 4 5 4 2 ; 0 2 3 2 0 ]` | 32 |
| Sierra-2 | `[ * 4 3 ; 1 2 3 2 1 ]` | 16 |
| Sierra Lite | `[ * 2 ; 1 1 0 ]` | 4 |
| Atkinson | `[ * 1 1 ; 1 1 1 ; 0 1 0 ]` (6/8만 전파) | 8 |

(커널 행렬에서 `*` 왼쪽 열 수만큼 다음 행이 왼쪽으로 확장됩니다. 예: FS 다음 행은 x−1, x, x+1.)

#### 5.6.2 순서 디더 (Bayer)
```
M₁ = [[0,2],[3,1]],   M_{2n} = [[4Mₙ, 4Mₙ+2], [4Mₙ+3, 4Mₙ+1]]
M₄ = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]]   (검증됨)
t(x,y) = (M[y mod n][x mod n] + 0.5)/n² − 0.5          ∈ (−0.5, 0.5)
c' = c + λ·r·t(x,y)·u,  idx = argmin ΔE(c', P_k)
```
- `u = (1, 0, 0)` (`luma` 모드, 기본, OKLab L만) 또는 선형 RGB 세 채널(`rgb` 모드).
- 확산 폭 `r` = 팔레트 각 색의 최근접 이웃 거리(ΔE)의 중앙값.
- 위치 고정 패턴이라 **애니메이션에서 깜빡이지 않습니다** → 도트 아트 기본 디더로 씁니다.

#### 5.6.3 Yliluoma 알고리즘 1 (임의 팔레트 위치 디더)
고유 입력색 c마다 (캐시해서) 다음을 계산합니다:
```
(i*, j*, k*) = argmin_{i ≤ j, k ∈ {0..N}}  E(i, j, k)
  mix  = P_i + (k/N)(P_j − P_i)
  E    = ‖c − mix‖² + 0.1·‖P_i − P_j‖²·( |k/N − 0.5| + 0.5 )
픽셀 출력 = ( M[y mod n][x mod n] < k* ) ? P_j : P_i,   N = n²
```
비용은 고유색당 O(K²·N)입니다. K = 16, N = 16이면 4,352회. 혼합 계산은 선형 RGB, 오차 측정은 OKLab에서 합니다.

### 5.7 정리 (도트 관용 처리)
#### 5.7.1 고아 픽셀 제거
불투명 도트 v의 8-이웃 중 같은 인덱스가 0개이고, 이웃 최빈 인덱스 u의 개수가 5 이상이면 v ← u. 최대 2회 반복합니다. 테두리 도트는 존재하는 이웃만 셉니다. 옵션에 따라 1px 하이라이트를 보호하는 `minContrast`(ΔE(v,u) > 0.25이면 유지)를 둡니다.

#### 5.7.2 외곽선 (outline)
불투명 집합 `A = {p : G(p) ≠ 0}`.
```
외부 아웃라인  O = { p ∉ A : N₄(p) ∩ A ≠ ∅ }     (corner 옵션이면 N₈)
내부 셀아웃     B = { p ∈ A : N₄(p) ⊄ A }
```
- O의 색은 고정 인덱스(지정값, 없으면 팔레트에서 L이 가장 낮은 색)입니다. **selout 모드**에서는 각 p의 인접 몸통색 q에 대해 `idx(L_q·0.35, a_q·0.8, b_q·0.8)`로 칠합니다.
- O가 캔버스 밖으로 나가면 `expand` 옵션으로 W, H를 각각 +2 하고 내용을 (1, 1)만큼 이동합니다.

#### 5.7.3 알파와 배경
- **크로마키 제거**: `ΔE(c, key) < τ_key(0.12)`이면 투명. 키 색이 섞인 경계 셀(스냅 후 셀색과 키의 ΔE < 0.25)은 픽셀 단위로 색을 빼는 디스필 대신, 이웃 불투명 셀의 최빈색으로 바꿉니다(도트 단위라 더 단순하고 정확함).
- **테두리 flood 배경 제거**: 네 모서리 최빈색 `k_bg`에서 시작해 `ΔE < τ_bg(0.06)`인 4-연결 영역을 투명으로 만듭니다(kenneth968/spritegen의 적응형 flood-fill).

#### 5.7.4 PixelOE형 아웃라인 확장 (사진/일러스트 → 도트 전처리)
소스 주기 `p = w'/W`. 창 크기 `win = round(2p)`, stride `max(1, round(p/2))`에서 국소 L 통계(med, lo = P5, hi = P95)를 구하고 쌍선형으로 업샘플합니다.
```
w_e(x,y) = σ( κ_w · ((med − lo) − (hi − med)) ),   σ(z) = 1/(1 + e^{−z}),  κ_w = 10
I' = w_e · erode³ˣ³(I)^{(n_e)} + (1 − w_e) · dilate³ˣ³(I)^{(n_d)},   n_e = n_d = 2
```
- 해석: 밝은 바탕에 어두운 가는 선이 있으면(med − lo가 큼) 침식(min 필터)으로 어두운 선을 두껍게 하고, 그 반대면 팽창합니다.
- 마지막에 3×3 opening → closing 1회로 정리합니다.
- 상수(κ_w, 창 비율)는 M2에서 PixelOE 원본 출력과 같은 입력으로 비교해 확정합니다. Apache-2.0이므로 NOTICE에 출처를 남깁니다.

### 5.8 그리기 프리미티브 (직접 찍기용)
- **Bresenham (모든 옥탄트)**:
  ```
  dx = |x1−x0|, sx = sign(x1−x0), dy = −|y1−y0|, sy = sign(y1−y0), err = dx + dy
  loop: plot(x0,y0); if (x0,y0)=(x1,y1) break; e2 = 2err
        if e2 ≥ dy { err += dy; x0 += sx }   if e2 ≤ dx { err += dx; y0 += sy }
  ```
- **타원**: Zingl의 사각형 내접 타원 알고리즘(정수 연산, 짝수/홀수 폭 모두 지원). 원 = 정사각형 외접.
- **flood fill**: 스캔라인 스택, 4-연결, 인덱스 정확 일치.
- **미러**: `x' = W−1−x` (세로는 `y' = H−1−y`). **시프트**는 wrap 또는 clip.
- **pixel-perfect 스트로크** (Aseprite 방식): 연속된 스트로크 점 p_{k−1}, p_k, p_{k+1}에서 p_{k−1}과 p_{k+1}이 대각선으로 인접하고(|Δx| = |Δy| = 1) p_k가 둘 모두와 4-인접하면 p_k를 제거합니다. L자 모서리 이중 픽셀이 사라집니다.

### 5.9 절차 생성 (Bollinger, zfedoran 포트)
마스크 `M ∈ {−1, 0, 1, 2}^{w×h}`, 옵션 `mirrorX`, `mirrorY`. 출력 크기 `W = w·(mirrorX ? 2 : 1)`.
1. 초기화: 전체 −1, 그다음 마스크 복사(왼쪽 위 사분면).
2. 샘플링 (시드 PRNG `U()`): `1 → round(U()) ∈ {0, 1}`, `2 → U() > 0.5 ? 1 : −1`.
3. 미러: `D[W−1−x][y] = D[x][y]`.
4. 테두리: 값 > 0인 셀의 4-이웃 중 값 0인 셀 → −1. 단일 패스이므로 새로 생긴 −1은 전파되지 않습니다.
5. 채색: 방향 `vertical = U() > 0.5`. 행(또는 열) u마다
   ```
   n = |(U()·2−1) + (U()·2−1) + (U()·2−1)| / 3;   n > 1 − colorVariations 이면 hue = U()
   brightness = sin(π·u/ulen)·(1 − bn) + U()·bn
   rgb = HSL(hue, sat, brightness);  값 −1이면 rgb ·= edgeBrightness
   ```
   기본값은 `sat = clamp(U()·0.5, 0, 1)`, `bn = 0.3`, `colorVariations = 0.2`, `edgeBrightness = 0.3`.
6. **엔진 확장**: 최종 rgb를 §5.5 최근접 매핑으로 지정 팔레트에 스냅하고, 값 0인 셀은 투명(인덱스 0)으로 둡니다.
- 마스크 프리셋(spaceship 6×12, dragon 12×12, robot 4×11 등)은 zfedoran README/소스에서 그대로 옮깁니다(MIT, 출처 표기).

### 5.10 텍스트 렌더러
#### 5.10.1 반블록 (터미널 미리보기, 무손실)
행 쌍 (2r, 2r+1)마다 열 i에 대해 위 t, 아래 b:
| t | b | 출력 |
|---|---|---|
| 불투명 | 불투명 | `ESC[38;2;Rt;Gt;Btm ESC[48;2;Rb;Gb;Bbm ▀` |
| 불투명 | 투명 | `ESC[38;2;…t m ESC[49m ▀` |
| 투명 | 불투명 | `ESC[38;2;…b m ESC[49m ▄` |
| 투명 | 투명 | `ESC[0m ␠` |

같은 색이 이어지면 SGR을 생략합니다(직전 상태와 비교). 256색 폴백은 xterm 큐브(레벨 {0, 95, 135, 175, 215, 255})와 그레이 램프(8 + 10k)의 240색 중 OKLab 최근접 색을 씁니다. H가 홀수면 마지막 행은 b = 투명으로 처리합니다.

#### 5.10.2 Braille (2×4 도트/글자, 단색)
```
bit(dx, dy) = [[0,3],[1,4],[2,5],[6,7]][dy][dx]
code = 0x2800 + Σ_{on} 2^bit        (검증: 전부 켜짐 = U+28FF '⣿', 왼쪽 열 = U+2847 '⡇')
on(p) = G(p) ≠ 0 ∧ L(p) < τ_L   (또는 사용자 지정 전경 인덱스 집합)
```

#### 5.10.3 휘도 램프
`ramp = " .:-=+*#%@"` (n = 10). `idx = min(n−1, ⌊L·n⌋)`, 어두운 터미널용 반전 옵션이 있습니다. 셀 종횡비 보정을 위해 글자 셀 하나가 도트 1×2를 덮게 합니다.

#### 5.10.4 형태 벡터 ASCII (Harri 방식)
- **셀 규격**: 폭 `cw`, 높이 `ch = cw·ρ`(폰트 종횡비 ρ 기본 2.0). 소스는 도트 그리드를 정수 배율로 렌더링한 RGBA입니다.
- **샘플링 원 6개** (셀 정규화 좌표, 기본값. 착수 시 Harri 글 그림과 대조해 미세 조정):
  ```
  열 u ∈ {0.30, 0.70},  행 v ∈ {0.20, 0.50, 0.80}
  엇갈림: 왼쪽 열 v += 0.04, 오른쪽 열 v −= 0.04
  반지름 R = 0.28·cw (픽셀)
  ```
- **글자 형태 벡터**: 95개 출력 가능 ASCII를 `opentype.js`로 4× 초표본 래스터화합니다. 원 내부 잉크 비율 `s_c[d]`를 구한 뒤 `s_c[d] ← s_c[d] / max_c s_c[d]`로 차원별 정규화합니다. 결과는 JSON으로 캐시합니다.
- **샘플 벡터**: 원마다 7점 육각 패턴(중심 + 반지름 R/2 위 6점)에서 L(밝은 글자 모드)을 평균해 `v[d]`를 얻습니다.
- **외부 벡터** `x[d]`: 각 원을 가장 가까운 셀 변에 대해 셀 밖으로 반사한 위치에서 같은 방식으로 샘플합니다.
- **대비 강화** (두 단계):
  ```
  방향성: m_d = max(v_d, x_d);  v_d ← m_d·(v_d/m_d)^{e_dir}     (e_dir 기본 2)
  전역:   m = max_d v_d;        v_d ← m·(v_d/m)^{e_g}           (e_g 기본 1.5)
  ```
  균일한 벡터는 거의 변하지 않으므로 그라디언트가 보존됩니다.
- **조회**: `char = argmin_c Σ_d (v_d − s_c[d])²`. 전수 탐색은 95×6 = 570회 곱셈/셀입니다. 각 성분을 5bit로 양자화한 30bit 키로 `Map` 캐시를 둡니다.
- **색**: fg = 셀 평균색(선택), bg = 기본값.
- **엣지 글자 옵션** (AcerolaFX 계열): Sobel 각도 θ를 4구간으로 양자화(`|`: |θ| < 22.5°, `/`, `-`, `\`)하고, 기울기 크기가 상위 10%인 셀만 덮어씁니다.

### 5.11 모자이크
#### 5.11.1 타일 모자이크 (타일셋으로 이미지 재구성)
- 타겟을 T×T 셀로 나눕니다(예: EasyRPG ChipSet 16×16).
- 특징: 셀(또는 타일)을 k×k 부분격자로 나눈 OKLab 평균의 연결 `f ∈ ℝ^{3k²}` (k 기본 2 → 12차원, codebox의 `TILE_MATCH_RES`에 해당).
- 비용과 선택:
  ```
  C(cell, t) = ‖f_cell − f_t‖² + λ_r·use(t) + ∞·[t가 체비셰프 반경 ρ 안에 이미 배치됨]
  ```
  λ_r 기본 0.002, ρ 기본 2 (metapixel의 재사용 최소 거리 아이디어).
- 처리 순서: 셀 분산이 큰 순(어려운 셀부터), 동률은 시드 셔플로 정합니다.
- 색 보정 (선택): `tile' = tile + α(μ_cell − μ_tile)` (OKLab, α ∈ [0, 1]).
- 복잡도 O(cells × tiles × 3k²). 타일이 500개를 넘으면 k-d tree를 씁니다.

#### 5.11.2 도트 모자이크 / 물리 재료 (비즈·레고·자수)
- 팔레트 = 실제 재료 색표(데이터 파일).
- BOM: `n_k = |{(i, j) : G(i, j) = k}|`, `Σ_k n_k = (불투명 도트 수)`.
- 페그보드 수: `⌈W/29⌉·⌈H/29⌉` (29×29 기준, 보드 크기는 설정 가능).

### 5.12 출력
#### 5.12.1 렌더링
§5.1 매핑으로 RGBA를 만듭니다. 정수 NN만 쓰고 보간은 금지합니다. 결과 크기는 OW×OH와 정확히 같아야 합니다.

#### 5.12.2 PNG 인코더 (자체)
- 시그니처 `89 50 4E 47 0D 0A 1A 0A`, 청크 = `len(4) type(4) data crc(4)`, CRC32(다항식 0xEDB88320, 256 테이블).
- **인덱스**: `IHDR(W, H, bd, colorType = 3, 0, 0, 0)`.
  - `bd = 1 if K ≤ 2; 2 if K ≤ 4; 4 if K ≤ 16; else 8`. EasyRPG 프리셋은 8로 강제합니다.
  - `PLTE` = 3K 바이트, `tRNS` = 인덱스별 알파(끝쪽의 연속 255는 잘라냄. 인덱스 0만 투명이면 1바이트 `00`).
  - 스캔라인: 각 행 앞에 필터 바이트 0, 행 바이트 수 `⌈W·bd/8⌉`, MSB 우선 패킹.
- **RGBA**: colorType 6, bd 8. 스캔라인 필터는 행마다 0~4 중 Σ|byte|가 최소인 것을 고르는 휴리스틱을 씁니다.
- IDAT = zlib(deflate) 압축(`node:zlib.deflateSync` 레벨 9 / 브라우저 `CompressionStream('deflate')`), 그리고 IEND.

#### 5.12.3 SVG
행마다 같은 인덱스가 이어지는 구간(run)을 묶어, 색별 `<path d="M x y h len v 1 h −len z …">` 하나로 만듭니다. `shape-rendering="crispEdges"`, `viewBox="0 0 W H"`, 크기는 `OW×OH`입니다. 사각형 수 = Σ runs ≤ W·H.

#### 5.12.4 스프라이트 시트
프레임 `n`개, 열 수 `c`이면 `r = ⌈n/c⌉`.
```
sheetW = c·fw + (c−1)·pad + 2·margin,   frame k 위치: x = margin + (k mod c)(fw+pad), y = margin + ⌊k/c⌋(fh+pad)
```
분할(slice)은 역연산으로 하고, 시트 크기가 맞지 않으면 오류를 냅니다. manifest JSON `{frames:[{x,y,w,h,durationMs}], tags}`를 함께 씁니다.

#### 5.12.5 EasyRPG / RPG Maker 2000·2003 프리셋 (EasyRPG 위키 규격)
| 타입 | 시트 크기 | 단위 | 배치 |
|---|---|---|---|
| CharSet | 288×256 | 프레임 24×32 | 캐릭터 4×2개, 각 3프레임 × 4방향(위, 오른쪽, 아래, 왼쪽). 72×128(1캐릭터), 24×32(정지)도 허용 |
| ChipSet | 480×256 | 타일 16×16 | 30×16 타일 |
| FaceSet | 192×192 | 48×48 | 4×4 |
| Battle (애니메이션) | 480×(96k), k ≤ 5 | 96×96 | 행당 5개 |
| Battle2 (2003) | 640×640 | 128×128 | 행당 5개 |
| BattleCharSet (2003) | 144×384 | 48×48 | 3프레임 × 8행 |
| BattleWeapon (2003) | 192×512 | 64×64 | 3 × 8 |
| System | 160×80 | — | — |
| System2 (2003) | 80×96 | — | — |
| Title / Frame | 320×240 | — | — |
| Backdrop | 320×160 (2000), 320×240 (2003) | — | — |
| Monster | ≤ 320×160 가변 | — | — |
| Panorama | ≤ 640×480 가변 | — | — |

**검증기**: 크기 일치, colorType 3, bitDepth 8, 팔레트 ≤ 256, **인덱스 0 = 투명 키색**(tRNS는 무시되므로 팔레트[0]의 RGB는 화면에 안 쓰는 색으로, 기본 `#FF00FF`). 위반 시 정확한 원인을 담은 오류를 냅니다.

**CharSet 좌표**: 캐릭터 c (0..7), 방향 d (0..3), 프레임 f (0..2)의 위치는 `x = (c mod 4)·72 + f·24`, `y = ⌊c/4⌋·128 + d·32`입니다.

#### 5.12.6 선택 확대기
Scale2x(EPX). 중심 E와 이웃 B(위), D(왼쪽), F(오른쪽), H(아래)에 대해:
```
if B ≠ H ∧ D ≠ F:  E0 = (D=B ? D : E), E1 = (B=F ? F : E), E2 = (D=H ? D : E), E3 = (H=F ? F : E)
else: E0..E3 = E
```
Scale2x 규칙은 공개된 정의로부터 직접 구현합니다(GPL 코드 복사 금지). MMPX는 M8 옵션입니다.

---

## 6. AI 경로 상세

### 6.1 이미지 프롬프트 빌더 (A)
#### 6.1.1 입력 스펙
```ts
interface GenSpec {
  subject: string; view: 'front'|'side'|'three-quarter'|'top-down'|'isometric';
  width: number; height: number;               // 목표 도트 수
  palette: PaletteSpec;                         // 프리셋/hex 목록/K
  outline: 'none'|'black'|'selout'; shading: 'flat'|'cel'|'soft';
  lightDir: 'top-left'|'top'|'top-right';
  background: 'transparent'|'key';
  styleRef?: string[];                          // 스타일 앵커 이미지 경로(1~5)
  model: 'codex-image'|'openai'|'sdxl-pixel-art-xl'|'retro-diffusion';
  seed?: number;
}
```

#### 6.1.2 수치 결정
- 모델 캔버스 `(R_w, R_h)`: gpt-image 계열은 {1024², 1536×1024, 1024×1536} 중 목표 비율 `W/H`에 가장 가까운 것.
- **블록 크기** `b = ⌊min(R_w/W, R_h/H)⌋`. 프롬프트에 "각 도트 = b×b 블록"을 명시합니다.
- 1024 기준 권장 W ∈ {16, 32, 64, 128} (b = 64, 32, 16, 8).
- 격자 검출의 사전 주기 `p0 = b` → 탐색 범위 [0.6b, 1.6b]. 실패하면 범위 제한을 풀고 다시 탐색합니다.
- **키 배경색**: 후보 {#FF00FF, #00FF00, #00FFFF, #FF8000, #0000FF} 중 `argmax_k min_j ΔE(k, P_j)` (팔레트와 가장 먼 색).
- SDXL pixel-art-xl: 1024 생성 → 격자 검출(기대 주기 8) → 128 도트. 요청 W가 128보다 작으면 스냅 후 §5.3 `mode`로 한 번 더 축소합니다.
- Retro Diffusion: `width = W, height = H`로 직접 요청하므로 격자 검출을 건너뛰고 팔레트 스냅만 합니다.

#### 6.1.3 프롬프트 템플릿 (영문. 이미지 모델 입력용, 값만 치환)
```
Pixel art {view} sprite of {subject}.
The image is a {W}x{H} pixel-art grid upscaled so every pixel is a crisp, perfectly square {b}x{b} block on an exact grid; no pixel is split or blended.
Strictly limited palette of {K} colors: {hex list}. Use only these colors.
{outline=black: "Clean 1-pixel dark outline around the silhouette."}
{shading} shading, light from the {lightDir}. Hard edges, no anti-aliasing, no gradients, no blur, no noise, no dithering, no text, no border.
Subject centered with a 1-pixel margin, fully inside the frame.
Background: one flat solid color {keyHex} filling everything that is not the subject.
```
SD 계열 negative: `blurry, anti-aliasing, smooth gradient, photorealistic, 3d render, jpeg artifacts, noise, subpixel, text, watermark, frame`.

#### 6.1.4 Provider 인터페이스
```ts
interface ImageProvider {
  id: string;
  generate(req: { prompt: string; negative?: string; size: [number, number];
                  refs?: string[]; seed?: number }): Promise<{ png: Uint8Array; meta: Record<string, unknown> }>;
}
```
- `codex-image`: 프롬프트를 임시 파일로 쓰고 `bun <skillDir>/scripts/gen.mjs --prompt-file <tmp> --out <tmp.png> --size WxH --quality high [--ref …]`를 실행합니다. stdout JSON의 `path`를 읽습니다. 타임아웃 300초. 인증 만료 오류는 그대로 사용자에게 전달합니다.
- `openai`: `OPENAI_API_KEY`, `background: "transparent"`가 가능하면 키 배경 대신 사용합니다.
- `retro-diffusion`: `RD_API_KEY`, 엔드포인트 버전(v1/v2)은 M4 착수 시 공식 문서로 확정합니다.
- `comfyui`: 로컬 HTTP `/prompt` 워크플로 JSON 템플릿(pixel-art-xl LoRA 1.2, LCM 8 step, CFG 1.5).

#### 6.1.5 생성 후처리 체인
```
PNG → decode → 키/알파 배경 제거(§5.7.3) → detectGrid(prior p0) → snap(sample=mode, 트림 β=0.15)
    → 팔레트 스냅(요청 팔레트; K만 주어지면 median-cut+k-means) → 고아 제거 → (outline)
    → DotGrid + GenReport{ period, phase, confidence, purity, paletteResidual = mean ΔE(셀색, 팔레트색) }
```
- 재시도는 자동으로 하지 않습니다. `confidence < 0.15` 또는 `purity < 0.7`이면 리포트에 "재생성 권장"을 표시하고, `--retries n`을 줄 때만 시드를 바꿔 재생성합니다(한 번에 한 가지만 변경).
- **로스터 일관성**: 첫 결과를 스타일 앵커로 저장하고 이후 생성에 `--ref`로 넘깁니다(gemini-pixel-sprite-gen의 교훈).
- **애니메이션**: 프레임들의 격자와 팔레트를 공유합니다. 첫 프레임 또는 샘플 프레임들에서 주기·위상·팔레트를 한 번만 구합니다(proper-pixel-art 방식).

### 6.2 직접 찍기 (B): 사람과 LLM 에이전트
#### 6.2.1 DotText 포맷
```
@size 16x16
@palette
. transparent
K #1a1c2c  outline
W #f4f4f4
R #b13e53
@grid
......KKKK......
.....KWWWWK.....
....KWRRRRWK....
```
- 키는 공백, `@`, `#`을 제외한 출력 가능 ASCII 1글자입니다. `.`은 투명으로 예약되어 있습니다(최대 91색. 그보다 많으면 `.dot.json`을 씁니다).
- 각 행은 정확히 W글자, 행은 정확히 H개여야 합니다. 위반하면 `line L, col C: expected 16 chars, got 15` 형식의 오류를 냅니다.
- 선택적 RLE 행 `@rle` 블록: `6.4K6.` 형태(숫자 + 키). 64열 이상일 때 토큰을 절약합니다.
- 직렬화 ↔ 파싱은 정확한 왕복이 성립해야 합니다(테스트 항목).

#### 6.2.2 MCP 서버 도구 (`dot mcp`, stdio)
| 도구 | 입력 (zod) | 출력 |
|---|---|---|
| `canvas_new` | `{width, height, palette?: preset/hex[]}` | `{docId}` |
| `palette_set` | `{docId, colors: {key, hex}[]}` | 팔레트 |
| `set_pixels` | `{docId, points: [x, y, key][]}` (≤ 4096개) | 변경 수 |
| `draw_line` / `draw_rect{fill}` / `draw_ellipse{fill}` | 좌표, key | 변경 수 |
| `flood_fill` | `{x, y, key}` | 변경 수 |
| `mirror` | `{axis: 'x'\|'y', half: 'left'\|'right'\|'top'\|'bottom'}` | — |
| `apply_dottext` | `{docId, dottext}` (전체 교체 또는 `@patch x,y` 부분) | diff 요약 |
| `get_grid` | `{format: 'dottext'\|'halfblock'}` | 문자열 |
| `render_preview` | `{scale, gap?}` | PNG 파일 경로(+ base64 선택) |
| `export` | `{format, preset?, path}` | 파일 경로 |
| `undo` / `redo` | — | 상태 |
| `outline` / `remove_orphans` / `quantize` | 옵션 | 변경 수 |

모든 변경은 `DrawOp` 로그로 남기고, undo는 역연산 스택으로 처리합니다.

#### 6.2.3 LLM 화가 루프
1. 시스템 프롬프트(`painter-prompt.ts`)에 좌표계(원점 왼쪽 위, x는 오른쪽, y는 아래), 캔버스, 팔레트 키, 규칙(실루엣 먼저 → 아웃라인 → 기본색 → 명암 2단계 → 하이라이트, 좌우 대칭이면 반쪽만 그리고 `mirror`)과 출력 형식(DotText만)을 넣습니다.
2. 초안 DotText → `apply_dottext` → `render_preview(scale = ⌈256/W⌉)` → 모델이 PNG를 보고 비평 → `set_pixels`/`@patch`로 수정. 최대 N 라운드(기본 3).
3. 보조 도구: `get_grid('halfblock')`로 터미널에서 즉시 확인할 수 있습니다.
4. **하이브리드**: (A)로 만든 결과를 DotText로 내보내 LLM이 손질합니다. 예: 눈 위치 보정, 고아 픽셀 수정.

### 6.3 이미지 변환 (C)
`dot convert`: decode → fit/crop(§5.1) → (선택) 아웃라인 확장(§5.7.4) → 리샘플(§5.3, 사진 기본 `kcentroid`) → 팔레트(§5.5) → 디더(§5.6, 기본 none) → 정리(§5.7) → 출력.

---

## 7. CLI / API 표면
```
dot new        --size 32x32 [--palette pico8] -o hero.dot.json
dot convert    in.jpg --dots 64 [--height auto] [--fit cover] [--sample kcentroid|mode|mean|median|dominant|center|contrast]
               [--palette pico8|auto:16|lospec:<slug>|file.hex] [--dither none|bayer2|bayer4|bayer8|fs|jjn|stucki|atkinson|sierra|yliluoma]
               [--outline-expand] [--orphans] [--outline black|selout] [--scale 8] [--gap 0] -o out.png
dot detect-grid ai.png [--expect 64x64] --json          → {px,py,phiX,phiY,W,H,confidence}
dot snap       ai.png [--expect 64x64] [--palette …] -o sprite.png
dot prompt     --subject "slime knight" --size 32x32 --palette db32 --view side [--model codex-image] → 프롬프트 + 수치 JSON
dot gen        --subject … --size 32x32 --palette pico8 --provider codex-image [--ref anchor.png] [--retries 0] -o out.dot.json
dot render     in.dot.json|in.dot.txt --scale 8 [--gap 1 --gap-color #000] --format png|png8|svg|ansi|braille|ascii|shape-ascii -o …
dot sheet      pack frames/*.dot.json --cols 4 [--preset easyrpg-charset] -o sheet.png   |  dot sheet slice sheet.png --frame 24x32
dot mosaic     target.png --tiles chipset.png --tile 16 [--k 2] [--reuse-radius 2] -o out.png
dot procgen    --mask spaceship --seed 42 --count 64 [--palette pico8] --sheet -o ships.png
dot palette    extract in.png -k 16 | fetch <lospec-slug> | convert a.gpl b.hex | ramp --base #b13e53 -n 5
dot bom        in.dot.json --material perler
dot mcp        (stdio MCP 서버)
```
공통 옵션: `--json`(stdout에 기계용 리포트), `--seed`, `--verbose`. 종료 코드는 0 성공, 2 입력 검증 실패, 3 provider 실패입니다.

---

## 8. 마일스톤과 수용 기준
각 마일스톤은 `bun test` 전체 녹색, `tsc --noEmit` 0 오류, 실사용 QA 산출물(파일/스크린샷) 경로 기록을 끝나야 완료로 봅니다. 테스트는 결정적이어야 하며, 시드를 고정하고 sleep을 쓰지 않습니다.

### M0 — 스캐폴딩 (0.5일)
- `bun init`, `tsconfig`(strict, `noUncheckedIndexedAccess`), biome, `bun test` 구성, MIT LICENSE, NOTICE, `git init`.
- **수용**: `bun test`(빈 스모크 1개) 통과, `bunx tsc --noEmit` 통과. `fast-png` 라이선스와 버전 확인 결과를 NOTICE에 기록.

### M1 — 코어 + 입출력 (2일)
color, geometry, grid, prng, image, decode, png-encode, dottext, project, render, CLI `new`/`render`.
- **테스트**
  - OKLab 기준값 5개(§5.2)가 1e−4 이내, 8bit 왕복 오차 0(무작위 1만 색, 시드 고정).
  - geometry: 무작위 1,000쌍 (W, sx, g, m)에서 `OW` 식 → 해석기 역산 → 원래 값 복원. 픽셀→도트 매핑이 렌더 결과와 일치.
  - PNG 인덱스 인코딩(bd 1/2/4/8) → `fast-png` 디코드 → 팔레트·인덱스 완전 일치. tRNS 절단 규칙 검증.
  - DotText 파싱 ↔ 직렬화 왕복 일치. 잘못된 행 길이에 대한 오류 메시지의 행/열이 정확함.
- **실사용 QA**: `bun cli/main.ts render test/fixtures/heart.dot.txt --scale 8 -o out/heart.png` → 파일 크기 `W·8 × H·8` 확인, 이미지를 열어 육안 확인.

### M2 — 이미지 변환 (3일)
resample(7모드), histogram, median-cut, kmeans, map, presets, diffusion, ordered, yliluoma, orphans, outline, background, outline-expand, CLI `convert`.
- **테스트**
  - 합성: K색 도트 그리드(W = 32)를 정수 배율 ×6으로 확대 → `convert --dots 32 --sample center|mode` → 셀 100% 일치.
  - k-means: 정확히 K = 8색으로 된 이미지 → 복원 팔레트가 원색과 ΔE < 1e−3. 목적함수 J 단조 비증가(매 반복 assert).
  - FS/Atkinson: 64×64 단색 회색(L = 0.6), 흑백 팔레트 → 출력 평균 L이 0.6 ± 0.02(Atkinson은 ±0.05).
  - Bayer: `M₄` 행렬 일치. 50% 회색 + 흑백 → 4×4 타일마다 흰색 정확히 8개.
  - Yliluoma: 50% 회색 + 흑백 → 흰색 비율 0.5 ± 1/16.
  - 고아 제거: 단색 바탕의 1px 점 → 제거. 2×2 덩어리 → 유지.
  - 아웃라인: 원 마스크에서 O가 N₄ 정의와 정확히 일치.
- **실사용 QA**: 사진 1장(인물), 일러스트 1장을 `--dots 64 --palette pico8`로 변환 × {none, bayer4, fs}. `--scale 8` PNG 6장을 육안 비교하고, image-q(Wu + FS) 결과와 나란히 놓고 비교 메모를 남깁니다. PixelOE 원본 대비 아웃라인 확장 결과 비교로 κ_w와 창 비율을 확정합니다.

### M3 — AI 이미지 격자 검출과 스냅 (3일)
grid-detect, snap, CLI `detect-grid`, `snap`.
- **테스트** (합성 생성기 `test/fixtures/synth.ts`: W ∈ {16, 24, 32, 48, 64}, 배율 ∈ [3, 16] 연속 균등, 위상 ∈ [0, 배율), 노이즈 ≤ 0.05, 50% 확률로 [1,2,1]/4 블러, 30% 확률로 JPEG 품질 85 재인코딩(Bun.Image), 시드 200개)
  - 정확한 W, H 복원율 ≥ 98%.
  - 스냅 셀 정확도(원래 인덱스와 일치) ≥ 99% (W를 맞힌 경우).
  - 회귀 고정: 이번 조사에서 실패했던 (32, 7.5, 3), (64, 5.3, 1.7), (48, 3.25, 0.5) 케이스를 명시적 테스트로 둡니다.
  - 격자 없는 사진 → confidence < 0.15로 폴백.
- **실사용 QA**: codex-image로 32×32 스프라이트 3장 생성 → `dot snap --expect 32x32` → 결과 W/H/confidence/purity JSON과 ×10 확대 PNG를 육안 확인. 실패 사례는 fixture로 추가합니다.

### M4 — AI 생성과 에이전트 직접 찍기 (3일)
prompt, painter-prompt, providers 4종, generate, MCP server, CLI `prompt`/`gen`/`mcp`.
- **테스트** (기계값만 검증하고 문구는 고정하지 않음)
  - 블록 크기 b, 모델 캔버스 선택, 키 색 선택(팔레트와의 최소 ΔE 최대화)이 손계산과 일치.
  - provider: codex-image 어댑터가 만드는 인자 배열(`--prompt-file`, `--out`, `--size`, `--ref`) 검증. 가짜 스크립트(테스트용 bun 파일)로 stdout JSON 파싱 경로 검증.
  - MCP: SDK 클라이언트를 프로세스 내에서 연결 → `canvas_new(8x8)` → `draw_line(0,0)→(7,7)` → `get_grid('dottext')`가 대각선 DotText와 정확히 일치. `undo` 후 원래 상태로 복귀.
- **실사용 QA**
  1. `dot gen --subject "green slime" --size 32x32 --palette pico8 --provider codex-image -o out/slime.dot.json --json` → 출력이 32×32, 사용 색 ≤ 16, confidence ≥ 0.15. ×10 PNG 육안 확인.
  2. MCP를 Claude Code에 연결해 "16×16 하트 아이콘" 직접 찍기 3라운드 → 최종 PNG 확인.

### M5 — 텍스트 렌더러 (2일)
halfblock, braille, ramp, glyph-vectors(opentype.js), shape-ascii, CLI `render --format ansi|braille|ascii|shape-ascii`.
- **테스트**
  - 반블록: 2×2 fixture의 정확한 바이트 문자열(SGR 포함), 투명 조합 4가지.
  - Braille: 비트 매핑(전부 켜짐 U+28FF, 왼쪽 열 U+2847).
  - shape-ascii: 셀 상단/중단/하단 수평 막대 이미지가 각각 서로 다른 글자를 고르고, 그 글자의 형태 벡터 최대 행이 막대 위치와 일치.
  - 캐시 사용 여부와 무관하게 결과가 동일.
- **실사용 QA**: Windows Terminal에서 `dot render hero.dot.json --format ansi` 출력을 스크린샷으로 남깁니다(truecolor 확인).

### M6 — 모자이크 · 절차 생성 · EasyRPG (3일)
tile-mosaic, bom, bollinger, masks, easyrpg 프리셋/검증기, sheet pack/slice.
- **테스트**
  - 타일 모자이크: 타일셋의 타일로만 구성된 타겟 → 정확한 타일 인덱스 복원(비용 0). 재사용 반경 제약 위반 0건.
  - BOM 합계 = 불투명 도트 수.
  - Bollinger: 같은 시드 → 바이트 단위로 동일. `mirrorX`이면 모든 (x, y)에서 `G[x] = G[W−1−x]`. 테두리 규칙: 몸통 셀의 4-이웃 중 빈칸 0개.
  - EasyRPG: CharSet 시트 출력이 288×256, colorType 3, bd 8, 팔레트[0] = 키색. 잘못된 크기에 대한 오류 메시지가 정확함. CharSet 좌표식 검증.
- **실사용 QA**: 생성한 CharSet PNG를 EasyRPG Player(또는 RPG Maker 2003)의 CharSet 폴더에 넣어 맵에서 4방향 걷기를 확인하고 스크린샷을 남깁니다.

### M7 — 문서와 패키징 (1일)
README(한국어), 예제 갤러리, `bun build --compile cli/main.ts --outfile nonpareille.exe`.
- **수용**: 새 셸에서 `nonpareille.exe --help` 실행, 예제 스크립트 전부 재현.

### M8 (선택) — 웹 에디터 · 고급
Vite + Canvas2D 에디터(코어 재사용), `.ase` 내보내기, MMPX, Gerstner PIA, GIF 애니메이션, 블루노이즈 디더.

**일정 합계**: M0~M7 약 17.5 인일.

---

## 9. 리스크와 대응
| 리스크 | 대응 |
|---|---|
| AI 모델이 블록 크기 지시를 지키지 않음 (분수·불균일 격자) | §5.4 DFT 검출 + 메시 스냅 + 검증 점수. 실패하면 사용자 W로 폴백하고, purity 지표로 재생성 여부를 판단 |
| JPEG/WebP 압축 주기(8px DCT)를 격자로 오인 | 사전 주기 p0 범위 제한. 주기가 정확히 8이고 사전값과 다르면 감점(unfake.js의 DCT 배제 아이디어) |
| GPL 코드 혼입 | 위 표의 판정을 지킴. GPL 저장소는 링크와 수치만 남기고, 리뷰 체크리스트에 "출처 라이선스" 항목을 둠 |
| codex-image 인증 만료 | 오류를 그대로 전달하고 다른 provider로 전환 가능 |
| 큰 이미지에서 DFT 탐색 비용 | 1차 Δτ = 0.05 → 국소 정밀화. 4096px를 넘는 입력은 ½로 미리 축소한 뒤 p를 2배로 환산 |
| Retro Diffusion API 버전 변동 | provider를 격리하고 M4 착수 시 공식 문서로 확정 |

## 10. 착수 시 확인할 미확정 수치 (구현을 막지 않음)
1. PixelOE의 정확한 상수(κ, 창/stride 비율) → M2 A/B 테스트로 확정. 기본값은 이 문서의 값.
2. Harri 샘플링 원의 정확한 좌표와 지수 기본값 → M5에서 원문 그림과 대조. 기본값은 이 문서의 값.
3. Retro Diffusion 엔드포인트 버전, MMPX C 구현 라이선스, aldegad/sprite-gen과 Pyxel 라이선스 표기.
4. zfedoran 마스크 프리셋 배열은 원본 README/소스에서 그대로 복사(MIT).

## 11. 참고 링크
- unfake.js https://github.com/jenissimo/unfake.js · proper-pixel-art https://github.com/KennethJAllen/proper-pixel-art · pixel-perfecter https://github.com/alexkorol/pixel-perfecter · PixelOE https://github.com/KohakuBlueleaf/PixelOE · pyxelate https://github.com/sedthh/pyxelate · kkjang/sprite-gen https://github.com/kkjang/sprite-gen
- EasyRPG 규격 https://easyrpg.github.io/wiki/rtp-replacement/media-file-format-specifications/ · Player https://github.com/EasyRPG/Player · liblcf https://github.com/EasyRPG/liblcf
- pixel-sprite-generator https://github.com/zfedoran/pixel-sprite-generator · Aseprite 규격 https://github.com/aseprite/aseprite/blob/main/docs/ase-file-specs.md · Lospec API https://lospec.com/palettes/api
- Alex Harri https://alexharri.com/blog/ascii-rendering · ascii-shape-renderer https://github.com/jeeshofone/ascii-shape-renderer · chafa https://github.com/hpjansson/chafa
- codebox/mosaic https://github.com/codebox/mosaic · metapixel https://github.com/schani/metapixel · image-q https://github.com/ibezkrovnyi/image-quantization · OKLab https://bottosson.github.io/posts/oklab/ · Yliluoma https://bisqwit.iki.fi/story/howto/dither/jy/ · MMPX https://casual-effects.com/research/McGuire2021PixelArt/
- pixel-art-xl https://huggingface.co/nerijs/pixel-art-xl · Retro Diffusion https://retrodiffusion.ai/ · Gerstner PIA https://cragl.cs.gmu.edu/pixelate/

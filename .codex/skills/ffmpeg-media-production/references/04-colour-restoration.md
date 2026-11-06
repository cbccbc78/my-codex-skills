# 04 · 色彩科学与画质修复

本册覆盖 7 个脚本 + 1 个共享模块：`color.py` `deinterlace.py` `denoise.py` `stabilize.py` `straighten.py` `redact.py` `sphere.py` 与 `_common/color.py`。
所有脚本在 `<skill-dir>/scripts/`，共享内核在 `<skill-dir>/scripts/_common/`。行号即该路径下的行号。

---

## 一、单一职责与关键 flag

| 脚本 | 单一职责 | 关键 flag（默认值） | 产出 |
|---|---|---|---|
| `color.py` | HDR→SDR / LUT / 重打色彩标签 / 类型化校色，四种模式**互斥且必选一** | `--to-sdr`、`--lut PATH`、`--retag bt709\|bt2020-pq\|bt2020-hlg\|bt601`、`--strip-dovi`、`--correct`；`--tonemap hable`、`--peak 1000.0`、`--desat 0.0`、`--lut-strength 1.0`、`--force`、`--audio-stream 0` | 视频 |
| `deinterlace.py` | yadif 去隔行 | `--mode frame\|field`（frame）、`--parity auto\|tff\|bff`（auto）、`--only-interlaced`、`--fps` | 视频 |
| `denoise.py` | hqdn3d 降噪（只动画面，音频降噪走 `audio.py --denoise`） | `--strength low\|medium\|high`（medium）、`--luma-spatial/--chroma-spatial/--luma-temporal/--chroma-temporal`、`--fps` | 视频 |
| `stabilize.py` | 两遍 vidstab 防抖 | `--shakiness 5`（1..10）、`--smoothing 15`（0..1000）、`--zoom 0.0`（0..100 %）、`--crop keep\|black`（keep）、`--tripod` | 视频 |
| `straighten.py` | 任意小角度旋转校水平（非 90° 整数倍，区别于 `fit.py --rotate`） | `--degrees`（必填，-45..45，正=顺时针，0 拒绝）、`--fit crop\|pad`（crop）、`--fill-color black`、`--fps` | 视频 |
| `redact.py` | 固定像素矩形打码，整段生效 | `--x/--y/--width/--height`（全必填）、`--mode blur\|pixelate`（blur）、`--blur-strength 20`、`--block-size 12`、`--fps` | 视频 |
| `sphere.py` | 360/球面 → 平面取景（v360 包装） | `--input-projection equirect`（8 选 1）、`--stereo mono\|sbs\|tb`（mono）、`--yaw/--pitch/--roll 0.0`、`--h-fov 90.0`、`--v-fov 60.0`、`--width 1920`、`--height 1080`、`--interp lanczos`（7 选 1）、`--fps` | 视频 |

七者共同点（`color.py:230-231`、`denoise.py:45-46` 等）：`--codec`/`--quality` 默认 CRF 18，`--preset medium`；除 `redact.py`（用 `-filter_complex`）外都走 `-vf`。

### `color.py` 的模式互斥组（`color.py:200-205`）

`mode = ap.add_mutually_exclusive_group(required=True)`：`--to-sdr` / `--lut` / `--retag` / `--strip-dovi` / `--correct` 五选一，不给就 argparse 直接报错。

| 模式 | 是否重编码 | 默认输出后缀 |
|---|---|---|
| `--strip-dovi` | 否（`-c copy`） | `_nodv` |
| `--retag` | 否（`-c copy`，失败才回退重编码） | `_retag` |
| `--to-sdr` | 是 | `_sdr` |
| `--lut` | 是 | `_lut` |
| `--correct` | 是 | `_correct` |

---

## 二、HDR / 色彩判读

### 2.1 `hdr` 与 `bt2020_or_hdr` 的区别（关键）

`probe.py` 逐字段（`_common/probe.py:246-279`）：

| 字段 | 定义 | 行号 |
|---|---|---|
| `hdr` / `hdr_signal` | **只对真实 HDR 信号为真**：`trc in ("smpte2084", "arib-std-b67")` 或检出 Dolby Vision | `probe.py:256,274-275` |
| `bt2020_or_hdr` | 1.x 旧义：上面两者**或** `primaries == "bt2020"`（即包含宽色域 SDR） | `probe.py:249,276` |
| `hdr_format` | 人类可读分类：`Dolby Vision profile N` / `HDR10/PQ` / `HLG` / `BT.2020 SDR` / `None` | `probe.py:277-278` |
| `dolby_vision` | `{profile, level, bl_compatibility_id}`，从 side_data 读 | `probe.py:250-253,279` |

判定顺序：先按 `trc`/`prim` 得出宽义 `hdr`，再看 side_data 有没有 `dv_profile` 或 `DOVI`，**有 DV 就强制 `hdr = True`**（基底层标签缺失也算 HDR，`probe.py:254-255`）。

**所有编辑脚本路由用的是 `bt2020_or_hdr`**（`probe.py:271-273` 注释明说）：BT.2020 SDR 源也走 10-bit + 源标签路径，因为用 BT.709 标签跑 x264 会整体偏色。

### 2.2 三种 HDR 的识别

| 形态 | `color_transfer` | 其他证据 | `hdr_format` |
|---|---|---|---|
| HDR10 / PQ | `smpte2084` | 常带 MaxCLL/MDL 元数据、10-bit | `HDR10/PQ` |
| HLG | `arib-std-b67` | 10-bit；iPhone 的 DV 8.4 基底层也是 HLG | `HLG` |
| Dolby Vision | 基底层可能是 HLG 或 PQ | side_data 含 `dv_profile` | `Dolby Vision profile N` |

`--force`（`color.py:210`）用于源既非 HDR 也非 BT.2020 时强制按 PQ 走 `--to-sdr`。

### 2.3 `--strip-dovi`：保留 HDR，只丢 DV 层

- 只对 HEVC 生效，否则 `die("--strip-dovi only applies to HEVC (Dolby Vision) streams")`（`color.py:249-250`）
- 无 DV 元数据只是 `info()` 提示，仍继续（`color.py:251-252`）
- 实际动作：`-map 0 -c copy -bsf:v filter_units=remove_types=62 -tag:v hvc1`（`color.py:253`）——SEI type 62 即 DV RPU；**不重编码，所有流原样保留**
- mp4/mov/m4v 追加 `-movflags +faststart`（`color.py:254-255`）
- 结果回报 `dolby_vision=False`（`color.py:259`）

---

## 三、HDR→SDR 完整滤镜链

`hdr_to_sdr_chain()`（`color.py:155-169`）逐段：

```
zscale=tin=<trc>:pin=<prim>:min=<space>:rin=<range>:t=linear:npl=<peak>
format=gbrpf32le
zscale=p=bt709
tonemap=tonemap=<curve>:desat=<d>[ :peak=<peak/100>  仅当 curve == bt2390 ]
zscale=t=bt709:m=bt709:r=tv
format=yuv420p
```

| 段 | 作用 | 行号 |
|---|---|---|
| `tin/pin/min/rin` | 显式喂输入标签（文件缺标签时 zscale 无法自推）：`color_transfer`/`color_primaries`/`color_space`/`color_range`，缺省分别 `smpte2084`/`bt2020`/`bt2020nc`/`tv` | `color.py:157-162` |
| `t=linear:npl=<peak>` | 转线性光，`npl` = 源峰值亮度（nit） | `color.py:162` |
| `format=gbrpf32le` | 转 32 位浮点 RGB，tonemap 只能吃浮点 | `color.py:163` |
| `zscale=p=bt709` | 原色域 → BT.709 | `color.py:164` |
| `tonemap=tonemap=<curve>:desat=<d>` | 色调映射；**只有 `bt2390` 追加 `:peak=<peak/100>`** | `color.py:165` |
| `zscale=t=bt709:m=bt709:r=tv` | 传输/矩阵/范围回 BT.709 tv | `color.py:166` |
| `format=yuv420p` | 回 8-bit 4:2:0 | `color.py:167` |

默认值：`--tonemap hable`、`--peak 1000.0`、`--desat 0.0`（`color.py:206-208`）。
可选曲线 `TONEMAPS`：`hable` `mobius` `reinhard` `bt2390` `clip` `linear` `gamma`（`color.py:27`）。

**`--peak` 的两种用法**：既作 `npl`（线性化时的源峰值），又（仅 bt2390）除以 100 作 `:peak`。所以改 `--peak` 会同时改两个地方。

`look.py` 的联系表也内联同一条链，但**写死** `hable` + `npl=1000`，用于让 HDR 帧在 PNG 里可见（`look.py:196-197`）——那是显示用途，不改用户的片子。

---

## 四、BT.2020 原色 + SDR 传输的特例

判定：`is_bt2020_sdr()` = `bt2020_or_hdr` 为真 **且** `hdr_signal` 为假 **且** 无 Dolby Vision **且** `color_transfer` 不是 `smpte2084`/`arib-std-b67`（`color.py:190-193`）。

这类文件已是显示参考的 SDR，链只做色域转换（`bt2020_sdr_to_bt709_chain()`，`color.py:172-187`）：

```
zscale=tin=<trc>:pin=bt2020:min=<space>:rin=<range>:t=linear
format=gbrpf32le
zscale=p=bt709
zscale=t=bt709:m=bt709:r=tv
format=yuv420p
```

**与 HDR 链的唯一差别：没有 `npl`，也没有 `tonemap` 段。**

理由（`color.py:177` 原文）：加了 tone map 会把 100 % SDR 白当成 1000 nit 峰值的一个比例而压暗 —— **白 Y 235 → 151，灰 126 → 90**。所以对 BT.2020 SDR 源，`--tonemap/--peak/--desat` 三个参数不适用（`color.py:312-313` 会打印这条 note）。

`--to-sdr` 的输出里 `sdr_path` 字段区分两者：`"tonemap"` 或 `"gamut"`（`color.py:311,316,319`）。

---

## 五、BT.709 打标的 FFmpeg 7.1 分水岭

`bt709_tag_args(encoder)`（`_common/color.py:12-29`）：

| FFmpeg 版本 | 做法 |
|---|---|
| < 7.1 | 输出选项 `-colorspace bt709 -color_primaries bt709 -color_trc bt709`（`_common/color.py:25-26`） |
| ≥ 7.1 + `libx265` | `-x265-params colorprim=bt709:transfer=bt709:colormatrix=bt709`（`:27-28`） |
| ≥ 7.1 + 其他 | `-x264-params colorprim=bt709:transfer=bt709:colormatrix=bt709`（`:29`） |

**原因**（`_common/color.py:15-23` 原文）：7.0 及以前 `-colorspace` 等只是标签；7.1 起 libavfilter 加入色彩协商，把这些选项喂进滤镜图的输出约束，于是对**比特流本身不带色彩标签**的源（测试源、录屏、不少相机），CLI 会在每次 SDR 重编码里**自动插入一次真实的矩阵转换**（"unknown" 时它猜 bt601）。实测：`--lut-strength 0` 的空操作调色在 7.1 上距源约 **24 dB PSNR**。改走编码器 VUI 参数后 libavfilter 根本看不到这些值。

`_sdr_bt709()`（`_common/color.py:32-42`）是同一决策的可合并版本，供已自建 encoder params 的调用方拼接：`libsvtav1` → `color-primaries=1:transfer-characteristics=1:matrix-coefficients=1`；`libaom-av1` → 空（无 VUI 选项，未打标的 8-bit 流到处都被读作 BT.709）；其余 → 上面的 `colorprim=...` 串。

`--retag` 模式**不走**这套（`color.py:272-273` 仍用 `-colorspace/-color_primaries/-color_trc`），因为它是 `-c copy` 改容器级标签，不经过滤镜图。

---

## 六、校色链（`--correct`）

### 6.1 固定顺序

`correction_chain()`（`color.py:82-135`）产出的顺序**不可调**：

```
exposure → colortemperature → colorbalance(lift/gain/tint) → eq(contrast,saturation,gamma) → colorlevels → curves
```

| 段 | 滤镜串 | 行号 |
|---|---|---|
| exposure | `exposure=exposure=<v>` | `color.py:116` |
| 白平衡 | `colortemperature=temperature=<K>` | `color.py:117` |
| 三段式 | `colorbalance=rs=<lift>:gs=<lift>:bs=<lift>:rm=<rm>:gm=<gm>:bm=<bm>:rh=<gain>:gh=<gain>:bh=<gain>` | `color.py:118` |
| 对比/饱和/伽马 | `eq=contrast=<c>:saturation=<s>:gamma=<g>` | `color.py:120` |
| 色阶（可选） | `colorlevels=rimin=...:bomax=...`，12 个参数全显式给 | `color.py:125-130` |
| 曲线（可选） | `curves=preset=<name>` | `color.py:132` |

设计理由（`color.py:83-85`）：每段都看到前一段已校正的画面——曝光先定线性光水平，白平衡次之（让对比/饱和作用在已平衡的颜色上），对比/饱和/伽马最后。

**`tint` 不是单个 ffmpeg 选项**：`gm=-tint, rm=bm=tint/2`（`color.py:114`），正 tint 推中间调向洋红、负 tint 推绿，且不改变中间调整体亮度。

前四段（exposure/白平衡/eq）**永远发出**，因为它们的默认值就是滤镜自身的恒等值；`colorlevels` 与 `curves` 只在真被要求时才追加一个滤镜项（`color.py:34-36`）。

### 6.2 RGB 段包裹

`_rgb_stage()`（`color.py:138-152`）把一串只吃 RGB 的滤镜包成：

```
scale=in_color_matrix=bt601,format=gbrpf32le,<filters>,scale=out_color_matrix=bt601,format=yuv420p
```

**为什么必须显式包**（`color.py:141-149` 原文）：这些滤镜要 RGB，libavfilter 会在两侧各插一次 swscale 转换。放任不管时，进去那一程尊重帧的色彩标签（相机和 `export.py` 产物都是 bt709），回来那一程却用 swscale 默认矩阵（bt601）：在 bt709 已打标源上，一个全默认的 `--correct` 出来距输入 **26 dB PSNR、饱和度低约 8 %**（#159）。未打标源看不到这现象，因为两程都退到 bt601 互相抵消。两侧钉同一个矩阵后恢复恒等（**39 dB**）；**两侧都用 bt601 比都用 bt709（34 dB）更好**，因为 swscale 的 601 路径对 8-bit 4:2:0 往返更精确。这个矩阵只是转换对的工作空间，**不是标签**——输出仍带编码器的 BT.709 标签。

### 6.3 安全区间（`CORRECTION`，`color.py:37-47`）

| flag | 默认 | 下限 | 上限 | 单位 | 说明 |
|---|---|---|---|---|---|
| `--exposure` | 0.0 | -3.0 | 3.0 | stops | exposure 滤镜自身的完整范围 |
| `--contrast` | 1.0 | 0.0 | 2.0 | × | 0=平灰，1=不变，2=双倍 |
| `--saturation` | 1.0 | 0.0 | 2.0 | × | 0=灰度，1=不变，2=双倍 |
| `--temperature` | 6500.0 | 2000.0 | 12000.0 | K | 6500=不变 |
| `--tint` | 0.0 | -1.0 | 1.0 | × | 绿(-1)..洋红(+1) |
| `--gamma` | 1.0 | 0.1 | 10.0 | × | eq 的 gamma 选项 |
| `--lift` | 0.0 | -1.0 | 1.0 | × | colorbalance 阴影 rs=gs=bs |
| `--gain` | 0.0 | -1.0 | 1.0 | × | colorbalance 高光 rh=gh=bh |

越界由 `_checked()` 直接 `die`，文案带 "the safe range this tool guarantees"（`color.py:66-71`）。这是**本工具自己保证的安全子集**，不是滤镜的技术上限。

### 6.4 `LEVELS` 以 0..255 暴露

| flag | 默认 | 范围 |
|---|---|---|
| `--levels-in-black` | 0 | 0..255 |
| `--levels-in-white` | 255 | 0..255 |
| `--levels-out-black` | 0 | 0..255 |
| `--levels-out-white` | 255 | 0..255 |

（`color.py:52-58`）。构建时才 `/255.0` 转成 colorlevels 自己的 0..1（`color.py:123-124`）。另有两条交叉校验：`in_black < in_white`、`out_black < out_white`，否则 `die`（`color.py:109-112`）。

### 6.5 `CURVES_PRESETS`（10 个，`color.py:62-63`）

`color_negative` `cross_process` `darker` `increase_contrast` `lighter` `linear_contrast` `medium_contrast` `negative` `strong_contrast` `vintage`

即 `ffmpeg -h filter=curves` 的全部内建预设，**排除了它自己的 `none`**——不传 `--curves` 已经等于恒等，不必再发一个空操作项。

### 6.6 `--correct` 的两道护栏

- **HDR 源直接拒绝**：`color.py:323-325` 检测到 `bt2020_or_hdr` 且无 `--force` 就 `die`，理由是 `--correct` 作用在 SDR 像素上，会把 PQ/HLG 数据打上 BT.709 标签而不做 tone map（注释标 `sweep F10`）。
- **测量回报**：非 dry-run 时用 `analyze_levels()` 取输入/输出的 signalstats（亮度/饱和度分布），写进 `measurements`（`color.py:329-331,362-364`）。这是**技术测量，不是"更好看"的判断**。

---

## 七、LUT

`--lut PATH`（`color.py:332-353`）：

| `--lut-strength` | 滤镜串 |
|---|---|
| `== 0.0` | `format=yuv420p`（**完全不应用 LUT**，`color.py:341-346`） |
| `0 < s < 1` | `split[o][g];[g]lut3d=file=<path>:interp=tetrahedral[g2];[o][g2]blend=all_mode=normal:all_opacity=<s>,format=yuv420p`（`color.py:349`） |
| `== 1.0` | `lut3d=file=<path>:interp=tetrahedral,format=yuv420p`（`color.py:340,351`） |

- `interp=tetrahedral` 写死（`color.py:340`）
- 路径经 `escape_filter_path()` 处理（滤镜值双重解析）
- 强度越界（不在 0..1）先 `die`（`color.py:338-339`）
- LUT 文件不存在 `die`（`color.py:336-337`）
- **HDR 源直接拒绝**：`color.py:333-335`，理由是给 SDR 做的 LUT 套在 PQ/HLG 像素上得到一张错误画面却被标成 BT.709（注释标 `sweep F10`）
- 注释特别记录了一段真实 bug（`color.py:342-345`）：`--lut-strength 0` 曾落进"满强度应用"的兜底分支，即**唯一被文档定义为"别调色"的取值反而 100 % 调色**；现在有显式分支。

---

## 八、滤镜图注入防护

`validate_color(value, flag)`（`_common/color.py:58-69`）+ 正则 `_COLOR_TOKEN_RE`（`_common/color.py:55`）：

```
^(0[xX][0-9A-Fa-f]{6,8}|#[0-9A-Fa-f]{6,8}|[A-Za-z][A-Za-z0-9]*)(@(?:0(?:\.\d+)?|1(?:\.0+)?|\.\d+))?$
```

接受三类 token：命名色（字母开头，后跟字母数字）、`0xRRGGBB[AA]`、`#RRGGBB[AA]`，可带 `@alpha`（alpha 被约束在 0..1，注释记录 `"red@2"` 曾能走到 ffmpeg）。

**真实注入样例**（`_common/color.py:64` 注释）：`--color "black,drawtext=text=..."` 会渲染出任意烧录文字。原因：ffmpeg 滤镜选项以逗号/冒号分隔，未校验的值可以拼进一个完全不同的滤镜。**这是"不接受调用方传滤镜图"这条不变量在颜色 flag 上的落点**。

调用方：`straighten.py:51`（`--fill-color`）、`join.py`、`fit.py`（`pad_filters` 相关）。

---

## 九、修复类脚本关键参数

### 9.1 `denoise.py` — `STRENGTH_PRESETS`（三档四元组）

`hqdn3d` 的四参数顺序是 **luma-spatial : chroma-spatial : luma-temporal : chroma-temporal**（`denoise.py:24-25` 注释）：

| preset | ls | cs | lt | ct |
|---|---|---|---|---|
| `low` | 2.0 | 1.5 | 3.0 | 2.25 |
| `medium`（默认） | 4.0 | 3.0 | 6.0 | 4.5 |
| `high` | 8.0 | 6.0 | 10.0 | 7.5 |

（`denoise.py:26-30`）。四个独立 flag 逐个覆盖 preset 对应项（`denoise.py:54-58`），负值 `die`（`denoise.py:59-61`）。滤镜串 `hqdn3d=<ls>:<cs>:<lt>:<ct>`（`denoise.py:74`）。

脚本自述（`denoise.py:9-11`）：更重的降噪用细节换干净，**没有"免费"的设置**，`--strength high` 是真实的画质取舍而非"更好"。

### 9.2 `deinterlace.py` — yadif

`vf = f"yadif=mode={M}:parity={P}:deint={0|1}"`（`deinterlace.py:60`）。

| 参数 | 映射 |
|---|---|
| `mode` | `frame`→0（默认，保持帧率，两场混合回一帧）、`field`→1（一场一帧，帧率翻倍）（`deinterlace.py:27`） |
| `parity` | `auto`→-1（默认）、`tff`→0、`bff`→1（`deinterlace.py:28`） |
| `deint` | `--only-interlaced` 时为 1，否则 0（`deinterlace.py:60`） |

`--mode field` 时额外显式写 `-fps_mode cfr -r <源fps×2>`（`deinterlace.py:65-68`），不走 `cfr_args()`。

**脚本明确不做的事**（`deinterlace.py:12-15`）：不检测源是否真的需要去隔行——那是 `probe.py`/`look.py` 的判断（联系表上看运动处的梳状条纹）。对已逐行素材跑 yadif 实际是无害的空操作，但仍会重编码整片，所以别默认开。

### 9.3 `stabilize.py` — 两遍 vidstab

| 遍 | 滤镜串 | 行号 |
|---|---|---|
| 1（分析） | `vidstabdetect=shakiness=<n>:result=<trf>`；`--tripod` 追加 `:tripod=1` | `stabilize.py:66-70` |
| 2（渲染） | `vidstabtransform=input=<trf>:smoothing=<n>:crop=<0\|1>:zoom=<z>:optzoom=1`；`--tripod` 追加 `:tripod=1` | `stabilize.py:81-85` |

- 默认 `--shakiness 5`（1=几乎不抖/快，10=很抖/慢），`--smoothing 15`（两侧各平滑多少帧），`--zoom 0.0`（0=保留原构图、让边缘露出来），`--crop keep`（默认，拉伸边缘像素）或 `black`（填纯黑）（`stabilize.py:37-41`）
- `crop` 映射：`keep`→0、`black`→1（`stabilize.py:80`）
- `optzoom=1` 写死：自动优化缩放
- `--tripod` 的两处含义：pass 1 的 `tripod=1` 是**帧号**（1 = 标准参考帧，`stabilize.py:68-69` 注释）；pass 2 的 `tripod=1` 等价于 `relative=0:smoothing=0`，**会覆盖 `--smoothing`**——每帧都锁死到一个参考帧之后，再平均相机路径没有意义（`stabilize.py:83-84`）
- **trf 临时目录**：`tempfile.TemporaryDirectory(prefix="ffmpeg-skill-vidstab-")`，进程结束即销毁，**不落盘到用户目录**，不是调用方面向的工件（`stabilize.py:61-62`）
- 参数校验：`shakiness 1..10`、`smoothing 0..1000`、`zoom 0..100`（`stabilize.py:48-53`）
- **dry-run 语义**：pass 1 是"测量写临时文件"，dry-run 下**仍然跑**；只有 pass 2 的写被跳过（`stabilize.py:73-75` 注释 + `dry_run_input_pending()` 门控）

### 9.4 `straighten.py` — pad / crop 两条滤镜串

| `--fit` | 滤镜串 | 行号 |
|---|---|---|
| `pad`（保原图，填角） | `rotate=<rad>:fillcolor=<c>:ow=trunc(rotw(<rad>)/2)*2:oh=trunc(roth(<rad>)/2)*2` | `straighten.py:66-67` |
| `crop`（默认，放大填满，无可见角） | `scale=iw*<s>:ih*<s>,rotate=<rad>,crop=trunc(iw/<s>/2)*2:trunc(ih/<s>/2)*2`，其中 `s = |cos| + |sin|` | `straighten.py:73-76` |

- `s` 是**正方形的精确增长因子，对矩形是过度宽松的**（`straighten.py:69-70` 注释）：先按 s 放大保证旋转后完全盖住原 W×H 窗口，原地旋转（画布保持放大后尺寸），再居中裁回原尺寸
- 两处 `trunc(.../2)*2` 都是**向下取偶**：4:2:0 色度要求偶数，否则编码器拒收（`straighten.py:74-75`）
- `--degrees` 必填、范围 -45..45、**0 被拒绝**（"nothing to straighten"，`straighten.py:47-50`）
- `--fill-color` 经 `validate_color()`（`straighten.py:51`）
- 脚本不测量倾角（`straighten.py:13-15`）：它没法在帧里找地平线，那是 `look.py`/视觉判断；看出来差多少再给 `--degrees`

### 9.5 `redact.py` — 模糊半径钳制与马赛克链

`--mode blur`（`redact.py:79-81`）：

```
crop=W:H:X:Y, boxblur=<radius>:<radius>:<chroma>:<radius>
radius = max(1, min(blur_strength, min(W,H)//2 - 1))
chroma = max(1, min(radius//2, min(W,H)//4 - 1))
```

**为什么要钳制**（`redact.py:77-78` 注释）：boxblur 拒绝大于平面一半的半径；4:2:0 的色度平面是半尺寸，所以色度拿自己的（再减半的）半径。原文记录：30 px 的区域配默认 20 曾直接失败。

`--mode pixelate`（`redact.py:83`）：

```
crop=W:H:X:Y, scale=max(1,W//block):max(1,H//block):flags=neighbor, scale=W:H:flags=neighbor
```

两级 `flags=neighbor`（最近邻），先缩到 `W//block × H//block` 再放大回来。

合成图（`redact.py:84`）：`[0:v]split=2[base][region];[region]<region>[patched];[base][patched]overlay=X:Y[out]`，走 `-filter_complex`（`redact.py:85`）。

其他约束：`--x/--y >= 0`、`--width/--height > 0 且必须偶数`（4:2:0）、`--blur-strength > 0`、`--block-size > 1`（`redact.py:48-57`）；矩形越出源帧 `die`（`redact.py:65-66`），源带 ±90/270 旋转标签时先交换宽高再判（`redact.py:63-64`）。**脚本不定位人脸/车牌**（`redact.py:6-7`），矩形必须已知。

### 9.6 `sphere.py` — 8 种输入投影 + 7 种插值

| 常量 | 取值 | 行号 |
|---|---|---|
| `INPUT_PROJECTIONS`（8） | `equirect`（默认） `fisheye` `dfisheye` `c3x2` `c6x1` `barrel` `cylindrical` `hequirect` | `sphere.py:39` |
| `INTERP_METHODS`（7） | `nearest` `linear` `cubic` `lanczos`（默认） `spline16` `gaussian` `mitchell` | `sphere.py:40` |
| `STEREO_MODES` | `mono`→`2d`（默认）、`sbs`→`sbs`、`tb`→`tb`，**输出恒为 `out_stereo=2d`** | `sphere.py:41,103` |

滤镜串（`sphere.py:102-106`）：

```
v360=input=<proj>:output=rectilinear:in_stereo=<m>:out_stereo=2d:yaw=<y>:pitch=<p>:roll=<r>:h_fov=<h>:v_fov=<v>:w=<W>:h=<H>:interp=<i>
```

范围校验：yaw/pitch/roll 各 -180..180，h-fov/v-fov 各 1..170，宽高必须偶数（`sphere.py:76-89`）。

**两条明确的"不做"**（`sphere.py:11-24`）：不决定相机该朝哪（没有主体检测/跟踪）；不检测输入是否真是 360——`probe.py` 的帧尺寸分不出 2:1 的等距柱状采集和恰好同比例的普通平面片。**给错投影不报错，只会产出扭曲画面**，这是"帧自己的像素能证明什么"的真实极限，ffmpeg 的 v360 本身也一样。

---

## 十、本域硬阈值速查表

| 值 | 含义 | 出处 |
|---|---|---|
| `smpte2084` / `arib-std-b67` | PQ / HLG 传输，真实 HDR 信号 | `_common/probe.py:249,256` |
| `bt2020` 原色 | 宽色域（SDR 也算 `bt2020_or_hdr`） | `_common/probe.py:249` |
| `remove_types=62` | Dolby Vision RPU 的 SEI 类型（`--strip-dovi`） | `color.py:253` |
| FFmpeg `(7, 1)` | BT.709 打标方式的分水岭 | `_common/color.py:25,36` |
| ~24 dB PSNR | 7.1 上 no-op 调色的实测偏移 | `_common/color.py:20` |
| ~26 dB / ~8 % | bt709 已打标源上全默认 `--correct` 的 PSNR 损失与去饱和 | `color.py:144-146` |
| 39 dB / 34 dB | 两侧钉 bt601 / 两侧钉 bt709 的往返 PSNR | `color.py:147-148` |
| 白 235→151、灰 126→90 | BT.2020 SDR 若加 tone map 的压暗量 | `color.py:177` |
| `npl=1000` | `look.py` 联系表 tone map 的写死峰值 | `look.py:196` |
| `hable` | `--tonemap` 默认曲线 | `color.py:206` |
| `1000.0` | `--peak` 默认（nits） | `color.py:207` |
| `0.0` | `--desat` 默认 | `color.py:208` |
| `1.0` | `--lut-strength` 默认；0=完全不应用 | `color.py:209,341-346` |
| `-3.0 .. 3.0` stops | exposure 安全区间 | `color.py:39` |
| `0.0 .. 2.0` | contrast / saturation 安全区间 | `color.py:40-41` |
| `2000 .. 12000 K` | temperature 安全区间（6500=不变） | `color.py:42` |
| `0.1 .. 10.0` | gamma 安全区间 | `color.py:44` |
| `-1.0 .. 1.0` | tint / lift / gain 安全区间 | `color.py:43,45-46` |
| `0..255` → `/255.0` | levels 的 CLI 单位与滤镜原生单位 | `color.py:52-58,123-124` |
| `bt601` 两侧 | RGB 段的固定工作矩阵 | `color.py:151-152` |
| `interp=tetrahedral` | LUT 写死的插值 | `color.py:340` |
| 2.0/1.5/3.0/2.25 | `denoise --strength low` 四元组 | `denoise.py:27` |
| 4.0/3.0/6.0/4.5 | `denoise --strength medium`（默认） | `denoise.py:28` |
| 8.0/6.0/10.0/7.5 | `denoise --strength high` | `denoise.py:29` |
| `frame`→0 / `field`→1 | yadif mode | `deinterlace.py:27` |
| `auto`→-1 / `tff`→0 / `bff`→1 | yadif parity | `deinterlace.py:28` |
| `shakiness=5` / `smoothing=15` / `optzoom=1` | vidstab 默认 | `stabilize.py:37-38,81` |
| `zoom=0.0` | vidstab 默认（不裁边） | `stabilize.py:39` |
| `1..10` / `0..1000` / `0..100` | shakiness / smoothing / zoom 校验区间 | `stabilize.py:48-53` |
| `min(W,H)//2 - 1` | boxblur 半径上限 | `redact.py:79` |
| `min(W,H)//4 - 1` | boxblur 色度半径上限 | `redact.py:80` |
| `blur-strength 20` / `block-size 12` | redact 默认 | `redact.py:35-36` |
| `|cos|+|sin|` | straighten crop 模式的预放大因子 | `straighten.py:73` |
| `-45 .. 45` | `--degrees` 区间（0 拒绝） | `straighten.py:47-50` |
| 8 / 7 / 3 | sphere 的投影 / 插值 / 立体模式数量 | `sphere.py:39-41` |
| `h_fov 90` / `v_fov 60` / `1920x1080` | sphere 默认输出 | `sphere.py:61-65` |
| `p_low>=64 且 p_high<=235 且 sat<40` | `looks_like_log` 判据 | `_common/probe.py:397` |

---

## 十一、本域红线

1. **调色参数是机械的，"电影感"不是。** "应用这个 LUT"、"曝光 +0.3 档"属于本技能（`SKILL.md:49`）；"把这个场景调出电影感"属于决定参数的调色技能，本技能只负责执行它给出的参数。
2. **Log 素材必须先 `--lut`。** S-Log/V-Log/C-Log 看起来灰、低对比，但**打的是 SDR 标签**（`gotchas.md:32-34`）。顺序：`probe.py --analyze` 看 `looks_like_log`（判据 `_common/probe.py:397`）→ `color.py --lut <厂商.cube>`，在任何其它处理之前。
3. **HDR 源不能出 H.264。** `--codec h264` 遇 HDR 直接 `die`（"8-bit H.264 is SDR only"，`_common/decision.py:296-297`），提示先 `color.py --to-sdr` 或改用 hevc/av1/prores。
4. **HDR 不能走 SDR 路径。** 用 SDR 路径重编码 HDR（iPhone、HDR10）会把颜色压平（`gotchas.md:27-29`）。脚本默认保住 HDR；BT.2020 像素上不要打 BT.709 标签。
5. **`--correct` 在已打标 bt709 的源上有约 8 % 去饱和的已知行为。** 根因是 RGB 阶段的 bt709→bt601 往返（`color.py:144-146`）；脚本现在两侧钉 bt601 把 PSNR 恢复到 39 dB，但**去饱和这件事是往返本身的代价**，不是 bug。对未打标源看不到。
6. **`--to-sdr` 的 `--tonemap/--peak/--desat` 对 BT.2020 SDR 源不适用**（`color.py:312-313` 会明说），别以为传了就有用。
7. **`--strip-dovi` 只丢 DV 层，不转 SDR。** 输出仍是 HDR（HLG/HDR10 基底层）。要 SDR 得另跑 `--to-sdr`。
8. **`redact.py` 的矩形必须本技能自身知道。** 脚本不找人脸、不找车牌（`redact.py:6-7`）；`sphere.py` 同理不检测 360、不追主体（`sphere.py:11-24`）；`straighten.py` 不测量倾角（`straighten.py:13-15`）；`deinterlace.py` 不判断是否需要去隔行（`deinterlace.py:12-15`）。这些判断都属于"看画面的人"。
9. **`redact.py` 的矩形在整段生效。** 只有一段时间需要遮挡，先 `cut.py` 切段，再只对相关那段打码（`redact.py:12-14`）。
10. **不要把颜色 flag 当成传滤镜的入口。** 任何写进滤镜串的颜色值都过 `validate_color()`；`--color "black,drawtext=text=..."` 是真实存在过的注入路径（`_common/color.py:64`）。

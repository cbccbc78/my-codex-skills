# 07 — 平台交付与合规验收

范围：`scripts/export.py`、`scripts/check.py`、`scripts/proxy.py`、`scripts/report.py`、`scripts/metadata.py`、`scripts/_platforms.py`、`templates/*.json`（10 个）。

一句话：交付的规格数字只存在于一张表里（`scripts/_platforms.py` 的 `PLATFORMS`），check / export / render / caption / graphics / look 全部读它；`check.py` 是**验收门**，不是"修好它"的工具。

---

## 1. `_platforms.py`：唯一交付表

`PLATFORMS` 定义在 `scripts/_platforms.py:58-194`，共 **12 个键**（不是 11 个）：其中 10 个是合规目标（`check == name`），`youtube-hdr` / `youtube-av1` 是 youtube 目标的 export preset，不单列 spec（`scripts/_platforms.py:204-207` 的 `PLATFORM_CHOICES` 只收合规目标 + 别名）。

### 1.1 逐目的地规格（frame / fps / 时长上限 / 宽高比 / min_height / fps_max / codecs / max_bytes / LUFS±tol / TP / SDR-only / 安全区）

| 目的地 | frame | fps | 时长上限 | aspects | min_height | fps_max | codecs | max_bytes | LUFS±tol | TP | sdr_only | safe (t/b/l/r) | preset | check | 出处 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| tiktok | 1080x1920 9:16 | 30 | 600s | 9:16, 1:1 | 1080 | 60 | h264, hevc | 4 GiB | -14 ±2.0 | -1.0 | True | .10/.22/.05/.14 | tiktok | tiktok | `_platforms.py:59-71` |
| reels | 1080x1920 9:16 | 30 | 90s | 9:16, 4:5, 1:1 | 1080 | 60 | h264, hevc | 4 GiB | -14 ±2.0 | -1.0 | True | .08/.20/.05/.12 | reels | reels | `_platforms.py:72-82` |
| shorts | 1080x1920 9:16 | 30 | 180s | 9:16, 1:1 | 1080 | 60 | h264, hevc | 256 GiB | -14 ±2.0 | -1.0 | False | .06/.18/.05/.12 | shorts | shorts | `_platforms.py:83-93` |
| youtube | 1920x1080 16:9 | None | 43200s (12h) | 16:9, 9:16, 1:1, 4:3 | 720 | 60 | h264, hevc, prores, av1, vp9 | 256 GiB | -14 ±2.0 | -1.0 | False | 5% 四边 | youtube | youtube | `_platforms.py:94-104` |
| youtube-hdr | 1920x1080 16:9 | None | 43200s | 同 youtube | 720 | 60 | 同 youtube | 256 GiB | -14 ±2.0 | -1.0 | False | 5% 四边 | youtube-hdr | youtube | `_platforms.py:105-115` |
| youtube-av1 | 1920x1080 16:9 | None | 43200s | 同 youtube | 720 | 60 | 同 youtube | 256 GiB | -14 ±2.0 | -1.0 | False | 5% 四边 | youtube-av1 | youtube | `_platforms.py:116-126` |
| x | 1280x720 16:9 | 30 | 140s | 16:9, 1:1, 9:16 | 720 | 60 | h264 | 512 MiB | -14 ±3.0 | -1.0 | True | 5% 四边 | x | x | `_platforms.py:127-137` |
| linkedin | 1080x1080 1:1 | 30 | 600s | 16:9, 1:1, 9:16, 4:5 | 720 | 60 | h264 | 5 GiB | -14 ±3.0 | -1.0 | True | 5% 四边 | linkedin | linkedin | `_platforms.py:138-148` |
| facebook | 1920x1080 16:9 | 30 | 14400s (240min) | 16:9, 1:1, 9:16, 4:5 | 720 | 60 | h264, hevc | 4 GiB | -14 ±3.0 | -1.0 | True | 5% 四边 | facebook | facebook | `_platforms.py:149-159` |
| podcast | None（纯音频） | None | None | None | 0 | None | None | None | -16 ±1.0 | -1.0 | False | 全 0 | None | podcast | `_platforms.py:160-170` |
| broadcast (EBU R128) | 1920x1080 16:9 | None | None | 16:9 | 1080 | 60 | prores, dnxhd, h264, hevc, mpeg2video | None | -23 ±1.0 | -1.0 | False | 5% 四边 | prores | broadcast | `_platforms.py:172-182` |
| custom | None | None | None | None | 0 | None | None | None | None ±2.0 | -1.0 | False | 全 0 | None | custom | `_platforms.py:183-193` |

- 安全区比例是"App 自己的 UI 覆盖的帧边缘比例，0..1"（`_platforms.py:16-19` 的字段注释）：TikTok 的底部描述条 / 右侧点赞列、Reels 的 UI、Shorts 播放器；feed 类目的地没有常驻浮层，用惯例的 5% title-safe 边框（`_platforms.py:27-32`）。
- `_SAFE_5` / `_NO_SAFE` 定义在 `_platforms.py:49-50`。
- `podcast` / `custom` 的 `frame` 为 `None`，`has_frame()` 返回 False（`_platforms.py:210-212`），因此没有安全区可放文字。

### 1.2 别名表

`ALIASES` 定义在 `_platforms.py:201-202`；`resolve()`（`_platforms.py:246-251`）先 strip + lower，再查别名表：

| 写法 | 解析为 |
|---|---|
| `youtube-shorts` | `shorts` |
| `yt-shorts` | `shorts` |
| `yt` | `youtube` |
| `instagram` | `reels` |
| `ig` | `reels` |
| `twitter` | `x` |
| `fb` | `facebook` |

`--platform` / `--preset` / `--template` 都接受别名，因此 `--platform youtube-shorts` 与 `--platform shorts` 处处等价（`_platforms.py:198-200`）。

### 1.3 ASS 网格换算

- `ASS_SCRIPT_HEIGHT = 288`（`_platforms.py:40`）：caption.py 的 `--size` / `--margin` 参考网格。
- `ass_units(fraction) = int(round(fraction * 288))`（`_platforms.py:43-45`）：把"帧高比例"换成 caption 参数。
- 安全区像素换算 `safe_margins_px(name, width, height)`（`_platforms.py:229-233`）：每边 `int(round(比例 × 该边像素))`，即 top/bottom 乘 height、left/right 乘 width。
- `caption_defaults(name)`（`_platforms.py:236-243`）：size 与 margin 都经 `ass_units()`；margin 取 `position` 决定的边——`position` 以 `top` 开头取 `safe["top"]`，否则取 `safe["bottom"]`。position / box / outline / animate 原样返回。
- caption 默认两套：竖向 `size 0.0833`（=24）、position bottom、box False、outline 2、animate pop（`_platforms.py:55`）；横向 `size 0.0694`（=20）、animate none（`_platforms.py:56`）。
- 验算：0.0833×288=23.99→24；0.0694×288=19.99→20；tiktok 0.22×288=63.36→63；reels 0.20×288=57.6→58；shorts 0.18×288=51.84→52；youtube 0.05×288=14.4→14。这正好是 10 个模板里出现的 24/20/63/58/52/14。

---

## 2. `check.py`：判定规则

`SPECS` 由平台表推导（`check.py:43-44`）。`--platform` 用 `PLATFORM_CHOICES` 做 choices（`check.py:84`）。

### 2.1 平台与"未指定平台"的降级

- 未给 `--platform` 时：`named = False`，平台按 `youtube` 处理（`check.py:100-101`）。
- `JUDGEMENT = {"duration", "aspect", "loudness", "true peak", "fps", "resolution"}`（`check.py:118`）。当 `status == "FAIL"` 且未指定平台且行名在 `JUDGEMENT` 中 → 降为 `WARN`（`check.py:125-126`）。
- 同时写一条 note："no --platform given: youtube's spec was assumed, so judgement rows (duration, aspect, fps, resolution, loudness, true peak) are WARN, not FAIL"（`check.py:283-284`）。
- 显式给 `--platform` 后这些行按真实状态 FAIL。

### 2.2 逐项判定

| 检查行 | 判定 | 出处 |
|---|---|---|
| duration | `dur > max_duration` → FAIL；否则 PASS；spec 无上限 → PASS "any" | `check.py:131-135` |
| aspect | `aspect_name(w,h)` 在 aspects 白名单 → PASS，否则 FAIL；白名单空 → PASS "any"。aspect_name 用 0.02 容差匹配 16:9/9:16/1:1/4:5/4:3/21:9，否则给分数形式 | `check.py:73-78, 137-145` |
| resolution | 短边 `< min_height` → WARN（不是 FAIL）；否则 PASS | `check.py:146-148` |
| fps | `fps > fps_max + 0.01` → FAIL；否则 PASS | `check.py:149-151` |
| vfr | `variable_frame_rate_suspected` → WARN，否则 PASS | `check.py:152` |
| video codec | codec 不在 codecs → FAIL（reason：平台播放器可能直接拒绝解码） | `check.py:153-155` |
| pixel format | 仅 reels / tiktok / x / linkedin / facebook：`pix_fmt != "yuv420p"` → FAIL（reason：QuickTime 与 iOS 常拒绝非 8-bit 4:2:0）；其余平台不出这行 | `check.py:156-159` |
| colour | `sdr_only` 平台遇 `bt2020_or_hdr` → FAIL，fix `color.py --to-sdr`；否则 HDR / bt709+bt709 / podcast·custom → PASS；未打标且 8-bit → PASS（播放器一律按 bt709）；其他组合 → WARN | `check.py:160-172` |
| file size | `size > max_bytes` → FAIL | `check.py:176-178` |
| audio | 有音频 → PASS；podcast 无音频 → FAIL；其他平台无音频 → WARN | `check.py:180-181, 252-255` |
| channels（仅 podcast） | 非 1 / 2 → WARN（reason：播客播放器对 5.1 的下混不可预测） | `check.py:182-190` |
| chapters（仅 podcast） | 无章节 → WARN | `check.py:191-195` |
| subtitles（所有平台） | 无字幕轨 → WARN；有轨但缺语言标签 → WARN；全部有标签 → PASS。**从不计入 failed** | `check.py:196-213` |
| sample rate | 非 44100 / 48000 → WARN | `check.py:227-228` |
| loudness | `|实测 - 目标| > lufs_tol` → FAIL；否则 PASS | `check.py:235-237` |
| true peak | `tp > spec.tp + 0.05` → FAIL；否则 PASS | `check.py:238` |
| 静音轨 | 有音频但峰值 `<= SILENT_PEAK_DBFS (-50 dBFS)`：spec 有响度目标 → FAIL，否则 WARN | `check.py:218-225, 232-233, 247-251` |
| loudness 测不出 | ffmpeg 的 loudnorm JSON 解析失败 → loudness 与 true peak 都 WARN "could not measure"（宁可可见的空缺，不要假 PASS） | `check.py:239-246` |
| video（无视频流） | 非 podcast / custom 平台 → FAIL "video stream" | `check.py:173-174` |

- 响度测量命令固定 `loudnorm=I=-14:TP=-1:LRA=11:print_format=json`（`check.py:51`）；只读 `input_i` / `input_tp` / `input_lra`。
- `SILENT_PEAK_DBFS = -50.0` 来自 `_common/probe.py`（`check.py:36` 导入）。
- 汇总：有任何 FAIL → `die(kind="verification")`，退出码 1，JSON 里 `checks` 行全量保留（`check.py:280-305`）。

### 2.3 `--content` 三行（一次解码，opt-in）

常量在 `check.py:63-66`，判定在 `check.py:257-278`：

| 行 | PASS | WARN | FAIL |
|---|---|---|---|
| black | ≤ 10% 时长 | > 10% | ≥ 95% |
| frozen | 最长冻结 ≤ max(3s, 30% 时长) | > max(3s, 30%) | ≥ 95% 时长（整片冻结） |
| silence | ≤ 50% 时长低于 -50 dBFS | > 50% | ≥ 95% |

### 2.4 行分类：`format` vs `judgement`

每行都带 `kind` 字段（`check.py:120-129`）：

- **`format` 行**：可以安全地机械修复。例：video codec（换 export preset）、pixel format（重编到 yuv420p）、file size（`--crf` 或降分辨率）、sample rate、colour 的 retag、vfr（任一重编码都会顺化）、subtitles、chapters、channels。
- **`judgement` 行**（`JUDGEMENT` 六项）：修它会改内容——
  - duration 超限：`cut.py` 保画质但**丢素材**；`fit.py --duration` 加速（音高保留、运动变快）（`check.py:133`）。
  - aspect 不符：`fit.py --fit pad` 保全部但加黑边；`crop` 填满但**丢边缘**（`check.py:143`）。
  - fps 超限：`fit.py --fps 30` 丢掉 60fps 运动的一半帧（`check.py:151`）。
  - loudness：抬到目标会**抬高环境音**；≤ -40 LUFS 的环境音/near-silence 应当保持原样并说明（`check.py:236`）。
  - resolution：升采样不会增加细节，要从母版重导（`check.py:148`）。
  - true peak：`loudness.py --tp`（`check.py:238`）。

**红线**：`judgement` 行只在需求本身蕴含答案时才改；否则把"选择"和"代价"一起说出来，交给人决定。

---

## 3. `export.py`：preset

`PRESETS` 定义在 `export.py:70-90`，共 **14 条**：youtube / youtube4k / reels / x / prores / h265 / gif / copy / tiktok / shorts / linkedin / facebook / youtube-hdr / youtube-av1。以下逐条列出全部。

公共片段：`_H264_HIGH` = libx264 / preset slow / CRF 18 / profile high / yuv420p（`export.py:61`）；`_AAC_192` = aac 192k 48kHz（`export.py:62`）；`_AAC_128` = aac 128k 48kHz（`export.py:63`）；`_social(crf)` = libx264 / preset medium / CRF / profile high / yuv420p / `-r 30`（`export.py:66-67`）。

| preset | 编码器 | CRF | preset | 音频 | 分辨率 | 时长上限 | 备注 | 出处 |
|---|---|---|---|---|---|---|---|---|
| youtube | libx264 | 18 | slow | AAC 192k / 48kHz | 1920x1080 | 无（显式 `max=None`） | mp4 + faststart | `export.py:71` |
| youtube4k | libx264 | 18 | slow | AAC 192k / 48kHz | 3840x2160 | 无 | 只有它刻意不是目的地的原生 frame | `export.py:72` |
| reels | libx264 | 20 | medium | AAC 128k / 48kHz | 1080x1920 | 90s | `-r 30` | `export.py:73` |
| x | libx264 | 22 | medium | AAC 128k / **44100Hz** | 1280x720 | 140s | `-r 30` | `export.py:74` |
| prores | prores_ks profile 3 / vendor apl0 / yuv422p10le | — | — | PCM s16le | 源分辨率 | 无 | .mov，剪辑母版 | `export.py:75` |
| h265 | libx265 | 24 | medium | AAC 160k | 源分辨率 | 无 | `-tag:v hvc1` | `export.py:76` |
| gif | palettegen / paletteuse | — | — | 无 | 宽 480 | 无 | 12fps；走独立 filter_complex 分支 | `export.py:77, 173-180` |
| copy | 流拷贝 | — | — | 流拷贝 | 源 | 无 | codec / 容器 / 色彩标签全部保持 | `export.py:78, 201-207` |
| tiktok | libx264 | 20 | medium | AAC 128k / 48kHz | 1080x1920 | 600s | `-r 30` | `export.py:82` |
| shorts | libx264 | 20 | medium | AAC 128k / 48kHz | 1080x1920 | 180s | `-r 30` | `export.py:83` |
| linkedin | libx264 | 20 | medium | AAC 128k / 48kHz | 1080x1080 | 600s | `-r 30` | `export.py:84` |
| facebook | libx264 | 21 | medium | AAC 128k / 48kHz | 1920x1080 | 14400s | `-r 30` | `export.py:85` |
| youtube-hdr | codec=hevc → `encoder_args()` | 默认 20 | medium | AAC 192k | 源分辨率（w/h=None） | 无 | `hdr_only=True`：**拒绝 SDR 源** | `export.py:88, 145-150, 189` |
| youtube-av1 | codec=av1 → `encoder_args()` | 默认 32 | medium | AAC 192k | 1920x1080 | 无 | libsvtav1 优先、libaom-av1 兜底，都没有 → missing_tool | `export.py:89, 189, 307-322` |

- 帧与上限来自平台表：`_from_table()`（`export.py:45-58`）。两个 youtube preset 显式 `max=None`——export 从不裁剪 12 小时上限，check 负责报告。
- `--crf` 覆盖两条路径：`codec` preset 走 `encoder_args(codec, crf, ...)`（`export.py:185-195`），普通 preset 直接改 `-crf` 值（`export.py:196-197`）。
- `--fast` 把普通 preset 的 `-preset` 改成 veryfast（`export.py:198-199`）。
- `--fit pad|crop`：pad 用 `pad_filters`，crop 用 `scale=...:force_original_aspect_ratio=increase` + `crop`（`export.py:161-170`）；两者都补 `setsar=1`。
- HDR 输入告警：非 prores / copy / youtube-hdr 的 preset 遇 `bt2020_or_hdr` 源，输出 SDR BT.709 标签但**不做转换**，提示先跑 `color.py --to-sdr`（`export.py:151-156`）。
- `PLATFORM_OF`：preset → 目标平台，由表推导 + `youtube4k → youtube`，排除 broadcast（`export.py:98-105`）。`--normalize` 只对这些 preset 有效（`export.py:136-138`）；写完后测响度并给出 `loudness.ok`，不达标时 `--normalize` 会就地跑 `loudness.py`（只重编音频，视频 copy）（`export.py:219-272`）。
- 输出默认名 `<name>_<preset>.<ext>`（`export.py:158` + `default_output`）。

---

## 4. 10 个交付模板（`templates/*.json`）

模板由 `render.py --template NAME INPUT` 填充：`$PLACEHOLDERS`（`render.py:89`）无值的块**整体丢弃**（`render.py:176-204`）。

### 4.1 竖版四件（tiktok / shorts / youtube-shorts / reels）

| 字段 | tiktok | shorts | youtube-shorts | reels |
|---|---|---|---|---|
| frame | `{aspect 9:16, fit crop}` | 同 | 同 | 同 |
| captions.text | `$CUES` | `$CUES` | `$CUES` | `$CUES` |
| captions.animate | pop | pop | pop | pop |
| captions.karaoke | true | true | true | true |
| captions.size | 24 | 24 | 24 | 24 |
| captions.position | bottom | bottom | bottom | bottom |
| captions.margin | **63** | **52** | **52** | **58** |
| graphics | hook / title `$TITLE` / 0–3 | 同 | 同 | 同 |
| overlays | `{image $LOGO, top-left}` | 同 | 同 | 同 |
| loudness | -14 / -1.0 | 同 | 同 | 同 |
| export.preset | tiktok | shorts | shorts | reels |
| export.normalize | true | true | true | true |
| check.platform | tiktok | shorts | shorts | reels |
| 文件 | `tiktok.json` | `shorts.json` | `youtube-shorts.json` | `reels.json` |

### 4.2 横版五件（youtube / facebook / x / linkedin / audiogram）

| 字段 | youtube | facebook | x | linkedin | audiogram |
|---|---|---|---|---|---|
| frame | 16:9 pad | 16:9 pad | 16:9 pad | **1:1 crop** | 无（走 `audiogram` 块） |
| captions.animate | none | none | none | none | （模板未写，render 补） |
| captions.karaoke | false | false | false | false | （未写） |
| captions.size / margin | 20 / 14 | 20 / 14 | 20 / 14 | 20 / 14 | 20 / 14 |
| graphics | lower-third / name `$TITLE` / 1–6 | 同 | 同 | 同 | 无 |
| overlays | `{image $LOGO, top-left}` | 同 | 同 | 同 | 无 |
| loudness | -14 / -1.0 | 同 | 同 | 同 | -14 / -1 |
| export.preset | youtube | facebook | x | linkedin | youtube |
| export.normalize | true | true | true | true | true |
| check.platform | youtube | facebook | x | linkedin | youtube |
| audiogram 块 | — | — | — | — | `{image $IMAGE, style waveform, position strip}` |
| 文件 | `youtube.json` | `facebook.json` | `x.json` | `linkedin.json` | `audiogram.json` |

### 4.3 podcast（无画幅）

`templates/podcast.json` 字段最少：

- `silence: {threshold -40, min_silence 1.0, margin 0.15}`
- `loudness: {lufs -16, tp -1}`
- `chapters: "$CHAPTERS"`
- `check: {platform podcast}`
- **没有** frame / captions / graphics / overlays / export 块——音频交付没有画幅，也没有画面阶段。

模板的目的地由 `check.platform` 决定（`render.py:227, 331`）。

---

## 5. `render.py` 覆写模板的规则

`template_project()`（`render.py:224-266`）：

1. 平台表覆写 `captions.size` 与 `captions.margin`：`tpl["captions"]["size"] = caption_defaults(dest)["size"]`、`margin` 同理（`render.py:233-236`）。JSON 里写的 24/20/63/58/52/14 只是落点快照，改平台表即全量跟随。
2. `position` / `animate` / `outline` 只在模板没写时补（`setdefault`，`render.py:237-238`）。
3. **默认写 `"fit_size": "on"`**（`render.py:245-246`）——但有两个例外：
   - 模板自己写了 `fit_size`，模板赢；
   - brand 文件**明确声明**了 caption size（`brand_states_caption_size()`，`render.py:207-221`），此时不写——品牌字号是一个 look 声明，不能反过来被 fitter 收缩。
4. `--srt` 把 captions 的 `text` 键换成 `srt`（`render.py:228-230`）。
5. `--fit` 覆写 `frame.fit`（`render.py:264-265`）。
6. 输出默认 `<input 同名>_<template>.<ext>`；无 frame 的目的地（podcast）扩展名是 `.m4a`（`render.py:269-279`）。
7. 只读 `templates/` 下的文件；未知模板名 → die，提示合法名 + `all`（`render.py:165-173`）。

---

## 6. `proxy.py` 与 `export.py` 的分工

- **proxy 是中间件，不是交付 preset**（`proxy.py:1-13`）：给下游分析 / 预览 / 剪辑决策一个"机器解码便宜"的小替身；默认宽 640、质量 30、总是最快的 x264/x265 preset。
- 参数：`--width` 默认 640（高度随源比例）（`proxy.py:40`）；`--scale 0<f≤1` 按源尺寸缩放（`proxy.py:41, 49-50`）；`--quality` 默认 30（`proxy.py:42` 的 `set_defaults(crf=30)`，注释说明 `--crf` 别名已在 2.0 移除）；`--fps` 强制恒定帧率（`proxy.py:43`）；`--no-audio` 丢弃音轨（`proxy.py:44`）。
- 编码：`video_args(meta, crf, "veryfast")`——SDR 走 x264，HDR 源自动走 x265 Main10 保留动态范围（`proxy.py:68`；`_common/decision.py:346-364`）。
- 音频：保留时 `-map 0:a:0 -c:a aac -b:a 96k`（`proxy.py:70`）；视频宽偶数化（`proxy.py:31-33, 64`）。
- 输出默认 `<name>_proxy.<ext>`（`proxy.py:65`）。
- 质量刻度对比：proxy 默认 CRF 30，高于 export preset 的 18–24——CRF 越高越省体积、画质越低，proxy 正是用画质换体积和速度（`proxy.py:8-10`）。
- **proxy 不做决定**：不决定代理哪个素材、什么分辨率"对"、代理给谁用（`proxy.py:15-18`）。

---

## 7. `report.py`：单文件 HTML 交付报告

- 产物 `<after>_report.html`（`report.py:182`），单文件、无外部依赖：before/after 的 contact sheet 以 base64 内联（`report.py:27-33`，调 `look.py --tiles 4x2 --width 1200`）。
- 内容块：
  - before / after 两栏，每栏媒体事实表：Duration / Size / Video（codec 宽高 @ fps, pix_fmt）/ Colour（primaries/transfer + HDR 标记）/ Frame rate（疑似 VFR 标注）/ Audio / Loudness（`report.py:68-80, 190-196`）。
  - 响度来自 `loudness.py --measure-only`，取 LUFS / TP / LRA（`report.py:36-42`）。
  - 合规表：`--platform` 时跑 `check.py --platform X --json`，逐行 status / check / value / expected / fix；标题旁给 READY 或 "N FAIL" 判定（`report.py:45-57, 197-203`）。
  - 跑过的命令：`--commands FILE` 逐行原样嵌入（`report.py:206-207`）；`--notes FILE` 原样嵌入（`report.py:204-205`）。
- `--pack FILE`：把 `render.py --template all` 写的 `<stem>_pack.md` 社交包表渲染成 HTML，不重新测量（`report.py:97-146`）；表头为 platform / file / size / duration / check，check 列按 pass 上色（`report.py:119-128`）。
- `--no-sheets` 跳过 contact sheet（更快更小）（`report.py:159`）。
- `--dry-run` 下只打印"would write"，不落盘（`report.py:230-231`）。

---

## 8. `metadata.py`：章节与标签

- 章节文件格式 `TIME TITLE`，每行一条；时间语法与 cut.py 相同（秒 / mm:ss / hh:mm:ss.ms；`hh:mm:ss:ff` 需 `@fps` 后缀，因为章节文件不带 fps）（`metadata.py:9-11, 41-63`）。校验：start 递增、start 在文件内、最后一条延伸到文件末尾（`metadata.py:54-62`）。
- 标签：`title / artist / album / comment / date / genre`（`TAG_KEYS`，`metadata.py:38, 200-201`）。
- **全流 `-c copy`**：只改容器元数据，瞬时且无损（`metadata.py:6-7, 249`）。输出默认 `<name>_meta.<ext>`，拒绝与输入同路径（`metadata.py:175, 222-223`）。
- 章节容器白名单：`.mp4/.m4v/.m4a/.mov/.mkv/.mka/.webm`；不支持章节的容器（.wav/.gif/.mp3/.flac）对 `--chapters` 直接拒绝，而不是静默丢弃（`metadata.py:37, 225-227`）。
- `--clear-chapters` 写 `-map_chapters -1`（`metadata.py:243-244`）；写后校验数量，`--clear-chapters` 后仍有章节 → die（`metadata.py:254-259`）。
- `--auto-chapters`（`metadata.py:178-199, 87-147`）：默认 `--min-chapter 60`、`--max-chapters 0`（无上限）、`--from both`、`--silence-threshold -35`、`--silence-min 1.5`、`--scene-threshold 8`。检测器是 silence.py / scenes.py 用的同一批；决策是纯函数 `propose_chapters()`（`_common/decision.py:497-572`）。
- **命名约定：只给 `Chapter N`，不猜内容**（`_common/decision.py:509-511, 569-571`；`metadata.py:145-146`）。每个标记的位置有测量证据，但"这一章讲了什么"不是本技能能测量的。
- 两个副产品：`--chapters-out` 写回本工具自己的 `TIME TITLE` 格式（供人改完再喂回）；`--description-out` 写 YouTube 描述块 `00:00 Chapter 1` 每行一条（`metadata.py:150-169`；`_common/decision.py:575-577`）。

---

## 9. 本域红线

1. **`check.py` 是验收门，不是"修好它"的工具。** 它的输出是"这份文件对没对上平台的规格"；`format` 行可以机械修，`judgement` 行（duration / aspect / fps / resolution / loudness / true peak）会改内容，必须把选择和代价说出来再让人决定（`check.py:120-129, 118`）。
2. **WARN 要报告，不要追着消。** subtitles / chapters / sample rate / channels 这些 WARN 是"可选但值得知道"（`check.py:196-213, 191-195, 227-228, 182-190`），平台不会因此拒收；把 WARN 当 FAIL 去"修"会做无谓的重编码。
3. **未命名平台时 judgement 行只是建议。** 不给 `--platform` 就等于说"我只关心格式"，此时 FAIL 降 WARN 是设计（`check.py:97-99, 125-126`），不是漏检；要强制就点名平台。
4. **`export.py` 的平台 preset 是 SDR 交付。** 遇 HDR 输入只告警不转换（`export.py:151-156`），颜色会错；正确顺序是先 `color.py --to-sdr`，或者对 youtube 用 `youtube-hdr` preset。`youtube-hdr` 反过来拒绝 SDR 源（`export.py:145-150`）。
5. **平台数字只有一个真源。** 任何"这个平台的响度目标是多少 / 安全区多大"的问题，答案在 `scripts/_platforms.py`；在别处复述的数值只是快照。

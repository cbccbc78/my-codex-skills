# 02 · 媒体探查与测量

本册覆盖 4 个公开工具 + 1 个共享内核模块：`probe.py` `scenes.py` `cropdetect.py` `look.py` 与 `_common/probe.py`（本域用到的纯决策函数在 `_common/decision.py`）。
所有脚本在 `<skill-dir>/scripts/`，共享内核在 `<skill-dir>/scripts/_common/`。行号即该路径下的行号。

**本域的共同身份：只测量，不创作。** 四个工具都不改输入；`cropdetect.py` 连媒体产物都不写（纯 JSON 报告），`look.py` 只写 PNG，`probe.py` / `scenes.py` 只打印 JSON。它们给出数字和画面证据，**判断留给调用方**。

---

## 一、工具清单与单一职责

| 脚本 | 单一职责 | 关键 flag（默认值） | 产出 |
|---|---|---|---|
| `probe.py` | 探查一个或多个媒体文件，打印紧凑 JSON 摘要（时长/帧率/分辨率/旋转/位深/HDR/音轨） | `inputs*`、`--compact`、`--field PATH`、`--analyze` | JSON（stdout） |
| `scenes.py` | 找场景切换点与响度峰值，可选报节拍网格/运镜标签/语音比/候选精彩段/联系表 | `--threshold 8.0`、`--ratio 3.0`、`--min-scene 1.0`、`--beats`、`--beat-step 0.01`、`--beat-range 60-200`、`--min-confidence 0.5`、`--shots`、`--audio-peaks`、`--speech`、`--highlights N`、`--rank-by audio`、`--target`、`--max-scene 15.0`、`--edl FILE`、`--sheet FILE`、`--no-timecode` | JSON（+ 可选 PNG / EDL 文本） |
| `cropdetect.py` | 多窗口采样黑边（letterbox/pillarbox），报告要移除黑边时的裁切矩形；可选报逐秒运动质心 | `--seconds 10`、`--samples 5`、`--limit 0.0941176`、`--round 16`、`--motion-centre` | **JSON，无媒体** |
| `look.py` | 给代理"眼睛"：抽帧 / 联系表 / 前后对比 / 平台安全区遮罩 / 墨迹测量，输出 PNG | `--at`（可重复）、`--tiles 4x3`、`--width 1280`、`--compare`、`--no-timecode`、`--safe NAME`、`--ink`、`-o` | PNG |
| `_common/probe.py` | 共享测量原语：`probe()` 文档、输出验证、指纹、PCM/灰度帧解码、RMS 包络、关键帧、电平分析、场景检测 | 见 §6 | 函数库 |

本域用到的 `_common/decision.py` 纯函数（不跑 ffmpeg、不写文件）：

| 函数 | 作用 | 出处 |
|---|---|---|
| `beat_grid()` | RMS 包络 → 节拍网格 + 置信度 | `_common\decision.py:681` |
| `snap_points()` | 在容差内把点吸附到最近节拍，**永不发明点** | `_common\decision.py:804` |
| `frame_flow()` / `label_shot_flow()` | 4×4 块 SAD 匹配 → 位移量/方向一致性 → static/pan/motion | `_common\decision.py:969,990` |

---

## 二、`probe.py`：全部测量字段

### 2.1 顶层字段（`_common\probe.py:204-230`）

| 字段 | 含义 | 出处 |
|---|---|---|
| `file` | 传入的路径原样（不是绝对路径） | `_common\probe.py:205` |
| `format` | ffprobe `format_name` | `_common\probe.py:206` |
| `duration` | 容器 `format.duration`；缺失时退到 `video.duration`，再退到 `audio.duration`；全缺为 `null` | `_common\probe.py:196-200` |
| `size_bytes` / `bitrate` | 容器 size / bit_rate | `_common\probe.py:208-209` |
| `video` / `audio` | 单流摘要或 `null` | `_common\probe.py:210-211` |
| `subtitle_streams` / `data_streams` | 字幕流数 / `data`+`attachment` 流数 | `_common\probe.py:212-213,193-194` |
| `chapters` | `[{index,start,end,title}]` | `_common\probe.py:216-221` |
| `tags` | 只保留 `title/artist/album/comment/date/genre`，键小写 | `_common\probe.py:222` |
| `subtitle_stream_details` | 每条字幕 `{index,codec,language,title}`；`index` 即 `-map 0:s:n` | `_common\probe.py:224-229` |
| `audio_streams` | 仅当有音频流时存在；每条音频 `{index,codec,channels,channel_layout,sample_rate,language,title}`，`index` 即 `-map 0:a:n` | `_common\probe.py:300-308` |

选择规则：`video` 取第一条 `codec_type=="video"` 且 `attached_pic==0` 的流（**封面图不算视频流**，`_common\probe.py:191`）；`audio` 取第一条音频流（`_common\probe.py:192`）。

### 2.2 `video` 对象（`_common\probe.py:257-289`）

| 字段 | 含义 | 出处 |
|---|---|---|
| `codec` / `profile` | `codec_name` / `profile` | `_common\probe.py:258-259` |
| `width` / `height` | 像素尺寸（**未按 rotation 交换**） | `_common\probe.py:260-261` |
| `display_aspect` | ffprobe DAR，缺失时用 `w:h` 化简 | `_common\probe.py:262` |
| `fps` | `avg_frame_rate` 优先，缺失才用 `r_frame_rate`，保留 3 位小数 | `_common\probe.py:234,263` |
| `r_frame_rate` / `avg_frame_rate` | ffprobe 原始分数字符串 | `_common\probe.py:264-265` |
| `variable_frame_rate_suspected` | VFR 判定，见 §2.4 | `_common\probe.py:266` |
| `pix_fmt` / `bit_depth` | 像素格式 / 每分量位深，见 §2.6 | `_common\probe.py:267-268` |
| `hdr` / `hdr_signal` | **2.0 语义**：真 HDR 信号才为真，两者恒等 | `_common\probe.py:274-275` |
| `bt2020_or_hdr` | **1.x 语义**：HDR 信号或 BT.2020 原色，所有编辑脚本路由用这个 | `_common\probe.py:276` |
| `hdr_format` | `Dolby Vision profile N` / `HDR10/PQ` / `HLG` / `BT.2020 SDR` / `null` | `_common\probe.py:277-278` |
| `dolby_vision` | `{profile,level,bl_compatibility_id}`，来自 side_data | `_common\probe.py:250-253,279` |
| `color_space` / `color_primaries` / `color_transfer` / `color_range` | 源色彩标签 | `_common\probe.py:280-283` |
| `rotation` | 显示旋转角（度），见 §2.7 | `_common\probe.py:284` |
| `nb_frames` | 容器声明的帧数（可能是 `null`） | `_common\probe.py:285` |
| `duration` | **流自己的长度**（容器 duration 可能含音频 priming 或更长的轨） | `_common\probe.py:287` |
| `bitrate` | 视频流 `bit_rate` | `_common\probe.py:288` |

### 2.3 `audio` 对象

`{codec, channels, channel_layout, sample_rate, bitrate, duration}`（`_common\probe.py:290-298`）。多音轨用 `audio_streams`（§2.1），`fit.py --audio-stream n` / `audio.py --audio-stream n` 的 n 就是它的 `index`。

### 2.4 VFR 判定式

```
vfr = bool(r_rate and avg_rate and abs(float(r_rate) - float(avg_rate)) > 0.01)
```

出处 `_common\probe.py:235`。两个分数都用 `Fraction` 解析，`"0/0"` / `"0"` / 非正值一律视为不可用（`_common\probe.py:422-429`）。
含义：`r_frame_rate`（名义/时基帧率）与 `avg_frame_rate`（平均帧率）相差超过 0.01 fps 就怀疑 VFR。
下游后果：`cut.py` 遇 VFR 会自动从无损切切换到 `--accurate`（`scripts\cut.py:303-305`）；`fit.py` 提示会 conform 到恒定帧率（`scripts\fit.py:210-211`）；`cfr_args()` 据此插入 `-fps_mode cfr -r <rate>`（`_common\decision.py`，见 `01-overview.md`）。

### 2.5 `hdr` 与 `bt2020_or_hdr` 的区别（关键）

判定顺序（`_common\probe.py:246-256`）：

1. `hdr`（宽义，1.x 起）= `color_transfer in ("smpte2084","arib-std-b67")` **或** `color_primaries == "bt2020"`（`_common\probe.py:249`）；
2. 扫描 side_data，发现 `dv_profile` 或 `DOVI` → 记 `dolby_vision`，并**强制** `hdr = True`（基底层标签缺失也算 HDR，`_common\probe.py:250-255`）；
3. `hdr_signal` = 真 HDR 信号：`trc in ("smpte2084","arib-std-b67")` 或 有 Dolby Vision（`_common\probe.py:256`）；
4. 2.0 起 `hdr` 改为等于 `hdr_signal`（只认真 HDR），1.x 的宽义值保留在 `bt2020_or_hdr`（`_common\probe.py:269-276` 注释）。

| 源 | `hdr` / `hdr_signal` | `bt2020_or_hdr` | `hdr_format` |
|---|---|---|---|
| BT.709 SDR | false | false | `null` |
| BT.2020 原色 + SDR 传输 | **false** | **true** | `BT.2020 SDR` |
| HDR10 / PQ | true | true | `HDR10/PQ` |
| HLG | true | true | `HLG` |
| Dolby Vision | true | true | `Dolby Vision profile N` |

编辑脚本路由一律用 `bt2020_or_hdr`（`_common\probe.py:271-273`）：BT.2020 SDR 源也走 10-bit 路径并保留自己的标签，因为套 BT.709 标签跑 x264 会整体偏色。

### 2.6 `bit_depth`

从 `pix_fmt` 名字末尾的数字读，不靠 `"10" in pix` 这种子串匹配（`yuv410p` 曾被误读为 10-bit）：

| pix_fmt 形状 | 结果 |
|---|---|
| `yuv420p10le` / `gbrp12be` / `gray16le` | 10 / 12 / 16 |
| `yuv410p` / `yuv420p` | 8 |
| `rgb24` / `bgr32`（24、32 打包 8-bit） | 8 |
| `rgb48` / `rgba64`（48、64 打包 16-bit） | 16 |
| 其余 8..16 之外 | 8 |

正则 `(\d{1,2})(?:le|be)?$`，出处 `_common\probe.py:312-324`。

### 2.7 `rotation`

先查 `side_data_list` 里的 `rotation`（`int(round(float(...)))`），再查 `tags.rotate` 覆盖（`_common\probe.py:237-245`）。probe 只报告，不自动应用；各编辑脚本在算"显示尺寸"时若 rotation ∈ {90,-90,270,-270} 会交换宽高（例：`scripts\fit.py:129-130`、`scripts\crop.py:55-56`、`scripts\join.py:428-429`）。

### 2.8 `--analyze` 与 `looks_like_log`

`probe.py --analyze` 对每个含视频的结果追加 `levels` 键（`scripts\probe.py:29-32`）：

- 采样**前 20 秒**，命令 `-an -vf fps=2,signalstats,metadata=print:file=- -f null -`（`_common\probe.py:363,370-371`）；
- 读数按源位深归一化到 8-bit：10-bit 除 4、12-bit 除 16、16-bit 除 256（`_common\probe.py:388-391`）；
- `y_low_p5` / `y_high_p95` 是逐帧 YLOW / YHIGH（缺失退 YMIN / YMAX）的**第 5 / 95 百分位**，比绝对极值稳（`_common\probe.py:393-396`）；
- `looks_like_log = p_low >= 64 and p_high <= 235 and sat < 40`（`_common\probe.py:397`）；
- 返回 `scale / y_min / y_max / y_avg / y_low_p5 / y_high_p95 / saturation_avg / looks_like_log / note`；没有帧时返回 `{"error": "no frames analysed"}`（`_common\probe.py:381-382,398-405`）。

语义：**形状判断，不是色彩测量结论**——"平、灰、低饱和，却标着 SDR"像 Log（S-Log/V-Log/C-Log），建议用 `color.py --lut` 套相机 LUT（`_common\probe.py:363-367,403-404`）。

### 2.9 `--compact` 与 JSON 的差异（`scripts\probe.py:42-62`）

| 维度 | JSON（默认） | `--compact` |
|---|---|---|
| 形态 | 单文件一个对象，多文件一个数组（`scripts\probe.py:64`） | 每文件**一行**人类可读文本 |
| 时长 | 完整字段 | `{file}: {dur:.3f}s`，未知写 `?s` |
| 画面 | 全字段 | `WxH @ Ffps codec pix_fmt` |
| VFR | `variable_frame_rate_suspected` | 行尾追加 ` (VFR?)` |
| HDR | `bt2020_or_hdr` + `hdr_format` | 当 `bt2020_or_hdr` 为真追加 ` [<hdr_format>]`（**`hdr_format` 也会命名 BT.2020 SDR**，`scripts\probe.py:51` 注释） |
| Log | `levels.looks_like_log`（仅 `--analyze`） | 行尾追加 ` [Log?]`（仅 `--analyze` 且为真） |
| 音频 | `audio` + `audio_streams` | `\| audio codec Nch RHz`，无音频写 `\| no audio`；无视频写 `\| no video` |
| 丢失信息 | — | bitrate / tags / chapters / 字幕 / 色彩标签 / rotation / bit_depth 全部不显示 |

其他口径：

- `--field PATH` **优先于** `--compact`：按点分路径逐层取值（如 `video.fps`），取不到打印空行，然后直接返回（`scripts\probe.py:34-40`）。
- `--json / --dry-run / --fast / --progress` 为统一接口而接受，输出本来就是 JSON（`scripts\probe.py:24` 注释）；MCP 调用 `probe` 不会自动追加 `--json`（它属于 JSON-exempt 工具）。
- `--dry-run` 下对不存在的文件返回**诚实的未知值 stub**：`duration 0.0`、`width/height 0`、`fps 0.0`，不是看起来合理的占位数字（`_common\probe.py:142-157`）。

---

## 三、`scenes.py` 的五种子命令

公共起点：`probe()` → `detect_scenes()` → 按切换点把时间轴切成 `scenes`（每段含 `index/start/end/duration/audio_rms/audio_peak`，短于 0.05 s 的段跳过，`scripts\scenes.py:168-177`）。
音频侧统一解码一次 22050 Hz 单声道（`scripts\scenes.py:160-166`）：0.5 s 块用于场景打分，10 ms 块用于 `--beats`（0.5 s 是 10 ms 的整数倍，一趟解码两用）。

### 3.1 默认：场景切换 + `audio_peaks`

场景检测 `detect_scenes()`（`_common\probe.py:535-588`）：

- 命令 `-an -vf scale=320:-2,scdet=threshold=0,metadata=print:file=- -f null -`（`_common\probe.py:542-543`）；
- 一个 cut 必须同时满足：`sc >= --threshold`（默认 8.0，`scripts\scenes.py:109`）**且** `sc >= --ratio × max(±12 帧邻域中位数, 0.5)`（默认 3.0，`_common\probe.py:571-579`）；邻域**不含自身**（`_common\probe.py:576`）；
- 只保留 ±2 帧内的局部最大值（`_common\probe.py:581`）；与上一个 cut 间隔 < `--min-scene`（默认 1.0 s）丢弃（`_common\probe.py:584`）；末尾不足 `min_len` 的尾段弹掉最后一个 cut（`_common\probe.py:586-587`）；
- 起手 `cuts = [0.0]`（`_common\probe.py:565`）；
- 显式不用 `scdet=sc_pass=1`：5.x 上该选项会丢掉静态帧、让邻域统计被移动段填满（`_common\probe.py:544-552` 注释）。

`audio_peaks`（**无条件输出**，与 `--audio-peaks` 不同）：0.5 s RMS 包络里 ≥ 90 百分位且 > 0.02 的局部最大，按 RMS 降序取前 20 个再按时间升序；单位是无量纲 RMS（`scripts\scenes.py:178-185`）。

### 3.2 `--beats`：节拍网格

- 需要音轨，否则 `die(kind="input")`（`scripts\scenes.py:150-151`）；`--beat-step` 必须 > 0（`:152-153`）；`--beat-range` 只在 `--beats` 下解析（`:146-148`）。
- 构造（`_common\decision.py:597-801`，方法串 `"rms-flux-autocorrelation"`）：
  1. **onset 强度** = `log(env + 1e-9)` 的一阶差分、半波整流（`_common\decision.py:597-603`）；用 log 域是因为电平域差分会被响段压倒，安静段落一个 onset 都测不到。
  2. **onset 拾取** = 在 ±1 s 局部窗口内取 `median + 1.5×MAD` 以上的局部最大，60 ms 不应期内取更强者（常量 `BEAT_ONSET_K=1.5`、`BEAT_WINDOW_S=1.0`、`BEAT_REFRACTORY_S=0.06`，`_common\decision.py:586-588,606-633`）。
  3. **tempo** = onset 信号自相关在 `--beat-range`（默认 60-200 BPM）允许的 lag 上的最大峰（`_common\decision.py:636-664`）；候选的 0.5×/2× 也参评，必须比基准多解释 1.2× 的 onset 强度才替换（`BEAT_OCTAVE_MARGIN=1.2`，`_common\decision.py:592,743-771`）。
  4. **相位** = 在 `[0, interval)` 内让网格捕捉最多 onset 强度的偏移（`_common\decision.py:667-678,751-759`）。
  5. **beats** = `phase + n × interval` 铺满全片（`_common\decision.py:773-777`）。
- `confidence = 0.5 × clip((z−2)/4, 0, 1) + 0.5 × 对齐率`，其中 z 是获胜 lag 高出其余 lag 均值的标准差倍数（`BEAT_Z_FLOOR=2.0`、`BEAT_Z_SPAN=4.0`，即 z∈[2,6] 映射到 0..1；`_common\decision.py:593-594,786-792`）。用 z 而不是 peak/mean，因为任何信号的自相关都有峰，噪声的 peak/mean 约 2.9 会被误读为满信心（`_common\decision.py:707-710`）。
- `usable = confidence >= min_confidence`（`_common\decision.py:799`）；`--min-confidence` 默认 `BEAT_MIN_CONFIDENCE = 0.5`（`_common\decision.py:591`，`scripts\scenes.py:125-127`）。
- **`supported_beats`**：网格点中"有实测 onset 落在 interval/4 内"的子集（`BEAT_SUPPORT_DIVISOR=4`，`_common\decision.py:589,778-781`）；对齐判定用 interval/8（`BEAT_ALIGN_DIVISOR=8`，`_common\decision.py:590,782-784`）。
- 输出：顶层 `beats` + `beat_grid` 对象，含 `supported_beats / tempo_bpm / interval / confidence / phase / onsets(计数) / supported / unsupported / method / step_s / range_bpm / usable`（`scripts\scenes.py:223-234`）。
- **低置信度照报**：scenes 是测量工具，会输出 `confidence` 并标 `usable:false`；只有会改文件的工具（`cut.py --snap beats`）才拒绝低置信度网格（`scripts\scenes.py:216-219` 注释、`:236-242`）。
- 无稳定脉冲时 `tempo_bpm = null`、`beats = []`、confidence 0.0，并提示"语音/环境声/自由节奏没有可测的 tempo"（`scripts\scenes.py:235-237`；`_common\decision.py:712-713`）。

### 3.3 `--shots`：运镜标签

- 采样参数 `SHOT_FPS=4.0`、解码 `SHOT_W,SHOT_H=48,27`（`scripts\scenes.py:30-31`）；每个 shot 解成灰度帧后逐对做块匹配（`scripts\scenes.py:61-69`）。
- `frame_flow()`：4×4 锚块（`MOTION_GRID=4`），每块在 ±3 px（`MOTION_SEARCH=3`）内按 SAD 找最佳位移；块内零位移是**显式平局候选**，防止无纹理块把搜索窗第一个角报成位移（`_common\decision.py:928-966`）；输出 `dx/dy/magnitude/agreement`（agreement = 平均位移长度 / 各块位移长度均值，1.0 = 所有块同向，`_common\decision.py:969-987`）。
- `label_shot_flow()`：平均位移 `< 0.35 px` → `static`；`≥ 0.35` 且方向一致性 `≥ 0.6` → `pan`；否则 `motion`（`MOTION_STATIC_PX=0.35`、`MOTION_PAN_SPREAD=0.6`，`_common\decision.py:930-931,990-1008`）。
- 不足两个采样帧的 shot 报 `static` + `flow_magnitude 0`（没有可比对象，不做无根据的运动测量，`scripts\scenes.py:64-65`）。
- 显式声明这是**测量代理**，不是内容理解（`_common\decision.py:996-997`）。

### 3.4 `--audio-peaks`：逐秒 dBFS 峰值

- 0.25 s 窗口 RMS 包络的局部最大，输出 `[{time, level}]`，`level = round(20·log10(val), 1)` dBFS；RMS ≤ 1e-6 的窗直接跳过（`scripts\scenes.py:72-84`）。
- 键名 `audio_peaks_db`，**刻意与无条件的 `audio_peaks`（无量纲 RMS）分开**：不同单位不同键，旧键含义不变（`scripts\scenes.py:72-75` 注释、`:198-205`）。
- 无音轨时给空数组 + 提示，不报错（`scripts\scenes.py:199-201`）。

### 3.5 `--speech`：语音 vs 音乐比例

- 每秒窗口的过零率 ZCR 除以**全片 ZCR 中位数**，输出 `[{time, speech_music_ratio}]`，1.0 = "对本文件来说典型"（`scripts\scenes.py:87-103`）。
- 机理：语音的辅音瞬变让 ZCR 逐窗跳动；持续音（音乐、长音、房间噪声）过零率稳定（`scripts\scenes.py:88-93`）。
- **是测量，不是分类**：不判断哪段是语音（`scripts\scenes.py:93,134-136`）。键名 `speech`。

### 3.6 `--highlights`：候选精彩段

- `--rank-by audio`（默认，按 `audio_rms` 降序）或 `duration`（按段长降序）（`scripts\scenes.py:113-114,245-249`）。
- 预算：`per = --target / 选取数`，没给 `--target` 就用 `--max-scene`（默认 15.0 s）；每段 `length = min(段长, per, max_scene)`（`scripts\scenes.py:251-254`）。
- 取段内**最响窗口**的起点（0.5 s 粒度滑窗），不总是从段首开始（`scripts\scenes.py:255-265`）；结果按时间排序。
- 输出 `highlights / highlights_total / highlights_rank_by`；`--edl FILE` 写 `START-END` 行（两位小数，`cut.py --segments` 格式），**dry-run 下不写**（`scripts\scenes.py:267-276`）。
- 文档明说两个排名都是**代理指标**：`audio` 会漏掉安静但重要的瞬间（一句坦白、落在静默里的笑点），还可能顶起纯人群噪声；`duration` 只找长镜头。**都不替代看联系表**（`scripts\scenes.py:5-11`）。

### 3.7 `--sheet` 与 `--edl`

`--sheet FILE`：每个场景**首帧**一张缩略图拼成联系表——`cols = min(4, max(1, 场景数))`、`tile_w = 1280 // cols // 2 * 2`、`select='eq(n\,round(start*fps))+...'`、`tile=colsxrows:padding=2:margin=2:color=0x202020`、`-frames:v 1 -fps_mode vfr`；默认烧时间码 `drawtext=text='%{pts\:hms}':fontsize=h/14:box=1:boxcolor=black@0.55:boxborderw=4:x=6:y=6`，`--no-timecode` 关闭（`scripts\scenes.py:278-295`）。结果里回写 `sheet` 路径。

---

## 四、`cropdetect.py`：只报告，不写媒体

- 参数校验：`--seconds > 0`、`--samples > 0`、`--limit ∈ 0..1`、`--round > 0`（`scripts\cropdetect.py:128-135`）。
- **多窗口采样**：`per_window = max(0.5, --seconds / --samples)`（默认 10 s / 5 窗 = 2 s/窗）；第 i 个窗从 `(duration − per_window) × i / (samples − 1)` 开始，均匀铺满全片（`scripts\cropdetect.py:46-51`）。每个窗跑
  `-ss START -i IN -t PER_WINDOW -vf cropdetect=limit=<L>:round=<R>:reset=1 -f null -`（`:52-53`），从 stderr 正则抓 `crop=W:H:X:Y`（`:41,60-61`）。
- 单个窗解码失败**跳过**，其余窗照测；全部窗失败才 `die(kind="ffmpeg")`（`scripts\cropdetect.py:55-63`）。
- 报告：用 `Counter` 取**出现最多的矩形**为结果，`confidence = 众数出现次数 / 总读数`（`scripts\cropdetect.py:149-151`）；矩形等于源尺寸时提示"全画幅已是内容，无黑边"（`:152-153`）。
- 输出 `{file, source_width, source_height, crop:{width,height,x,y}, confidence, motion_centre?}`，**经 `emit(None, ...)` / `print_json` 输出 JSON，从不写媒体**（`scripts\cropdetect.py:144-167`）。
- 语义边界：它与 `fit.py --fit crop` 不同——后者裁到**目标画幅**（自己算矩形，不检测黑边）；cropdetect 只测"源画面里已经烤进去的黑边"在哪，**不判断该不该裁**（一部 16:9 画框里的宽银幕电影会被"检测"出黑边，还原原始画幅是对的，但若黑边本身是创作呈现就是错的——先看帧再裁，`scripts\cropdetect.py:12-19`）。
- `--motion-centre`：逐秒运动质心，采样方式与上同——`MOTION_CENTRE_FPS=2.0`、解码 `64×36` 灰度、`cell=8` 的 8×8 差分网格（每格 8×4.5 px）；以逐像素 `|prev−cur|` 为权重求质心（`scripts\cropdetect.py:38-39,67-110`）。输出 `[{time, x, y, x_frac, y_frac, motion}]`：`x/y` 是**源帧像素坐标**，`x_frac/y_frac` 是 0..1 比例，`motion` 是平均绝对差；整帧无差异时 `x/y/x_frac/y_frac` 为 `null`、`motion 0.0`（`:102-108`）。文档明确：**它报告"测到的像素运动集中在哪"，不等于"有意思的主体在哪"**（背景在动、说话人静止时质心落在背景），本工具从不挑重新构图（`scripts\cropdetect.py:67-75,120-123`）。

---

## 五、`look.py`：只写 PNG 的"眼睛"

三条产出路径（`scripts\look.py:202-263`）：

| 模式 | 触发 | 关键行为 |
|---|---|---|
| 联系表 | 默认 | `--tiles 4x3`、`--width 1280`；`step = duration / 格数`；`tile_w = max(2, (width // cols) // 2 * 2)`；滤镜串 `select='isnan(prev_selected_t)+gte(t-prev_selected_t\,<step*0.98>)',scale=<tile_w>:-2<时间码>,tile=<cols>x<rows>:padding=2:margin=2:color=0x202020`（`scripts\look.py:252-257`）；seek = 帧数 < 4 时 0，否则 `step/2`（采每片中间，避免首尾黑场，`:258-260`）；可用帧数不足时自动降为 `cols×1`（`:246-251`） |
| 抽帧 | `--at T`（可重复） | `--at` 超出时长直接 `die`（`:227-228`）；单帧 + `-o` 给图片扩展名时 `-o` 即输出文件名，否则 `<stem>_<sec:.3f>s.png`（`:229-233`） |
| 前后对比 | `--compare B`（需 `--at`） | 两路各缩到 `--width/2`，`scale2ref` 对齐后 `hstack=inputs=2`（`scripts\look.py:218-219`）；命名 `<stem>_vs_<B>_<idx>_<sec:.3f>s.png`（`:208-214`） |

叠加与测量：

- 时间码 `FONT = fontcolor=white:fontsize=h/18:box=1:boxcolor=black@0.55:boxborderw=6:x=8:y=8`（`scripts\look.py:22`）；`--no-timecode` 关闭。字体优先用 `fontfile=` 解析出的真实文件（某些 Windows ffmpeg 构建按 family 名解析会崩），解析不到才退回 `font=`（`scripts\look.py:156-160`）。
- `--safe NAME`：按平台 UI 遮挡比例画红框——**上下边 `red@0.35`、左右边 `red@0.20`**，比例来自 `_platforms.PLATFORMS[name]["safe"]`（`scripts\look.py:164-192`）。源宽高比与平台画幅差 > 0.02 时提示"先 `fit.py --aspect` 重构图再看"（`:173-176`）。
- `--ink`：`measure_ink(png, margin_frac=0.03, threshold=28)`——以区域边缘薄条的中位 RGB 估计背景，任一通道差 > 28 记为"墨"；`margin = max(1, int(min(bw,bh)×0.03))` 用于把有墨的行合并成带；返回 `has_ink / bbox / ink_fraction / row_bands`（`scripts\look.py:58-129`）。联系表会被拆回**每格单独测**（`margin=2, padding=2` 反推格子坐标，`:269-288`）。它只测像素，不判断可读性。
- HDR 自动 tone map：源 `bt2020_or_hdr` 为真时插入 `zscale(...,npl=1000) → gbrpf32le → zscale p=bt709 → tonemap=hable → zscale t/m=bt709 → yuv420p`，让代理看到有代表性的颜色而不是原始 HLG/PQ 码值（`scripts\look.py:194-199`）。
- 产出统一走 `emit()`：单文件给 `output`，多文件给 `outputs` 数组（`scripts\look.py:290-293`）。

---

## 六、硬阈值速查表

| 阈值 / 常量 | 值 | 出处 |
|---|---|---|
| VFR 判定 | `|r_frame_rate − avg_frame_rate| > 0.01` | `_common\probe.py:235` |
| fps 取值优先级 | avg 优先，缺失用 r，保留 3 位 | `_common\probe.py:234,263` |
| 视频流选择 | 第一条 `attached_pic == 0` 的视频流 | `_common\probe.py:191` |
| bit depth 解析 | 末尾数字；24/32→8，48/64→16，其余 8..16 外→8 | `_common\probe.py:312-324` |
| `hdr`（2.0） | `trc ∈ {smpte2084, arib-std-b67}` 或有 DV | `_common\probe.py:256,274` |
| `bt2020_or_hdr`（1.x） | 上式 **或** `primaries == bt2020` | `_common\probe.py:249,276` |
| DV 强制 HDR | side_data 含 `dv_profile` / `DOVI` | `_common\probe.py:250-255` |
| `--analyze` 采样 | 前 20 s，`fps=2`，signalstats | `_common\probe.py:363,370-371` |
| 百分位 | 5th = `lows[len//20]`，95th = `highs[-1-len//20]` | `_common\probe.py:395-396` |
| `looks_like_log` | `p_low ≥ 64` 且 `p_high ≤ 235` 且 `sat < 40` | `_common\probe.py:397` |
| 场景阈值 | `--threshold 8.0`、`--ratio 3.0`、`--min-scene 1.0` | `scripts\scenes.py:109-111` |
| 场景邻域 | ±12 帧，比值对 `max(median, 0.5)`，需 ±2 帧局部最大 | `_common\probe.py:571,578,581` |
| 最短场景段 | ≤ 0.05 s 跳过 | `scripts\scenes.py:171` |
| 场景 RMS 窗口 | 0.5 s，解码 22050 Hz | `scripts\scenes.py:157,160` |
| `audio_peaks` | ≥ P90 且 > 0.02，最多 20 个 | `scripts\scenes.py:180-184` |
| `--audio-peaks` | 0.25 s 窗；RMS ≤ 1e-6 跳过 | `scripts\scenes.py:72-84` |
| `--speech` | 1 s 窗 ZCR / 全片 ZCR 中位数 | `scripts\scenes.py:87-103` |
| `--shots` 采样 | 4 fps，48×27 灰度 | `scripts\scenes.py:30-31` |
| 块匹配 | 4×4 块，±3 px SAD，零位移平局 | `_common\decision.py:928-929,951-956` |
| static / pan | `< 0.35 px` / 一致性 `≥ 0.6` | `_common\decision.py:930-931,1002-1007` |
| 节拍 onset | `median + 1.5×MAD`，±1 s 窗，60 ms 不应期 | `_common\decision.py:586-588` |
| 节拍支撑/对齐 | 支撑 `interval/4`，对齐 `interval/8` | `_common\decision.py:589-590` |
| 节拍八度规则 | 备选需多解释 1.2× | `_common\decision.py:592,770` |
| 节拍置信度 | z 映射区间 [2,6]；`usable = conf ≥ 0.5` | `_common\decision.py:593-594,790-799` |
| `--beats` 参数 | `--beat-step 0.01`、`--beat-range 60-200`、`--min-confidence 0.5` | `scripts\scenes.py:121-127` |
| `--highlights` 上限 | `--max-scene 15.0` | `scripts\scenes.py:116` |
| `--sheet` | cols ≤ 4，`tile_w = 1280//cols//2*2`，padding/margin 2，底 `0x202020` | `scripts\scenes.py:280-292` |
| cropdetect 默认 | `--seconds 10`、`--samples 5`、`--limit 0.0941176`、`--round 16` | `scripts\cropdetect.py:116-119` |
| cropdetect 窗长 | `max(0.5, seconds/samples)` | `scripts\cropdetect.py:46` |
| 运动质心 | 2.0 fps、64×36、cell=8（8×8 格） | `scripts\cropdetect.py:38-39,77` |
| look 时间码 | `fontsize=h/18`、`black@0.55`、`boxborderw=6`、`x=8:y=8` | `scripts\look.py:22` |
| look 联系表 | `step×0.98`、`padding=2:margin=2:color=0x202020` | `scripts\look.py:256-257` |
| look 安全区 | 上下 `red@0.35`，左右 `red@0.20`；宽高比差 > 0.02 提示 | `scripts\look.py:173,182-188` |
| look 墨迹 | `margin_frac=0.03`、`threshold=28` | `scripts\look.py:58,86` |
| look HDR tone map | `tonemap=hable`、`npl=1000` | `scripts\look.py:196-197` |

---

## 七、本域红线

1. **测量工具只报告，不做判断。** 四个工具都不改输入、不"顺手"修任何东西；`cropdetect.py` 是唯一连媒体产物都不写的工具（`scripts\cropdetect.py:4-7,163-166`）。
2. **`--highlights` 是候选，不是裁决。** `audio` 排名会漏掉安静但重要的瞬间、可能顶起噪声；`duration` 只找长镜头。两个都是代理指标，提交剪辑前必须看 `--sheet` 联系表（`scripts\scenes.py:5-11`）。
3. **`--motion-centre` 只给质心。** 它报告像素运动集中在哪，不等于主体在哪（背景动、人不动 → 质心在背景）；裁切/重新构图由调用方决定，本工具从不挑（`scripts\cropdetect.py:67-75`）。
4. **黑边该不该裁是判断。** cropdetect 只报矩形；宽银幕电影的黑边是创作呈现的一部分，先看帧再决定（`scripts\cropdetect.py:14-19`）。
5. **`hdr` ≠ `bt2020_or_hdr`。** 前者只认真 HDR 信号，后者含 BT.2020 SDR；编辑路由用后者，否则宽色域 SDR 会被当成 SDR 走 8-bit BT.709 而偏色（`_common\probe.py:269-276`）。
6. **`looks_like_log` 是形状判断。** "平、灰、低饱和 + 标 SDR"只是提示可能是 Log，结论和转换路径（`color.py --lut`）由调用方定（`_common\probe.py:363-367,397`）。
7. **`--safe` 只在源画幅接近平台画幅时有意义。** 比例差 > 0.02 时先 `fit.py --aspect` 重构图，再看遮罩（`scripts\look.py:173-176`）。
8. **`--beats` 报弱测量是诚实的。** 低置信度网格照样输出并标 `usable:false`；只有会移动文件的工具（`cut.py --snap beats`）才被禁止使用它（`scripts\scenes.py:216-219`）。

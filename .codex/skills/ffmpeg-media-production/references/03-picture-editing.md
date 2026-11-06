# 03 · 画面剪辑与构图

本册覆盖 14 个脚本：`cut.py` `join.py` `fit.py` `crop.py` `pad.py` `freeze.py` `reverse.py` `loop.py` `speedramp.py` `insert.py` `sequence.py` `background.py` `grid.py` `broll.py`。
所有脚本在 `<skill-dir>/scripts/`，共享内核在 `<skill-dir>/scripts/_common/`。行号即该路径下的行号。

**本域的共同身份：执行调用方指定的画面改动，并且把"实际改成了什么"如实报出来。** 它们不做内容判断（谁该被裁、哪里是精彩点由调用方决定），但每一条路径都会在结果文档里给出可验证的数字（`precision`、`duration_delta_seconds`、`mode`、`nearest_keyframes`、`verification`）。

---

## 一、工具清单与关键 flag（默认值）

| 脚本 | 单一职责 | 关键 flag（默认值） | 产出 |
|---|---|---|---|
| `cut.py` | 无损优先切一段/多段并拼接；关键帧偏差超容差才重编码 | `--start 0`、`--end`、`--duration`、`--segments`、`--accurate`、`--tolerance 0.5`（-1=永不）、`--snap none\|beats`、`--snap-tolerance 0.12`、`--snap-source FILE`、`--min-confidence 0.5` | 视频/音频 |
| `join.py` | 多片段按序拼接，支持 xfade 转场与音频专用拼接 | `inputs*`、`--list FILE`、`--on-missing fail\|skip`、`--on-silent warn\|fail\|skip`、`--allow-silent N`、`--silence-threshold -50`、`--transition fade`、`--duration 0.5`、`--fit pad\|crop`、`--pad-color black`、`--sample-rate`、`--channels` | 视频/音频 |
| `fit.py` | 一次调用同时改**时长**（speed/trim）+**画幅**（aspect/pad/crop/blur）+**旋转翻转** | `--duration`、`--method speed\|trim`、`--from-center`、`--max-speed 4.0`、`--smooth none\|blend\|interpolate`、`--aspect`、`--fit pad\|crop\|blur`、`--width/--height`、`--pad-color black`、`--pad-fill color\|blur`、`--pad-blur 20`、`--crop-x/--crop-y 0.5`、`--rotate 90\|180\|270`、`--flip h\|v`、`--audio-stream 0` | 视频 |
| `crop.py` | 按**像素矩形**硬裁（调用方已知确切矩形时用） | `--x/--y/--width/--height`（全必填，宽高必须偶数）、`--fps` | 视频 |
| `pad.py` | 在**时间轴**头/尾加纯色静帧 + 静音（区别于 `fit.py --fit pad` 的加画框） | `--start 0`、`--end 0`、`--color black` | 视频 |
| `freeze.py` | 单帧定格插入（insert）或末尾延长（extend） | `--at`（默认最后一帧）、`--hold`（必填）、`--mode insert\|extend` | 视频 |
| `reverse.py` | 整段倒放（可选倒放音频） | `--no-audio` | 视频 |
| `loop.py` | 重复循环 / 乒乓 boomerang | `--times N`、`--duration T`（二者互斥必选一）、`--boomerang` | 视频 |
| `speedramp.py` | 分段常数变速（每段一个 factor），再拼回 | `--segment START-END:FACTOR`（可重复，必填） | 视频 |
| `insert.py` | 静图 → 定时长视频片段，Ken Burns 推拉摇 | `--duration`（必填）、`--width/--height`、`--fps 30`、`--zoom in\|out`、`--zoom-amount 1.3`、`--pan left\|right\|up\|down` | 视频（无音频） |
| `sequence.py` | 编号图片序列 → 视频（printf 模式或 glob） | `--dir`（必填）、`--pattern`（必填）、`--fps 30`、`--start-number 0`、`--width/--height` | 视频（无音频） |
| `background.py` | 生成纯色/渐变底片，无输入文件 | `-o`（必填）、`--duration`（必填）、`--width/--height`（必填、偶数）、`--fps 30`、`--color black`、`--gradient C1:C2`、`--angle 0` | 视频（无音频） |
| `grid.py` | N 路视频拼 cols×rows 对比墙，每格 letterbox 不拉伸 | `--cols/--rows`（必填）、`--cell-width 480`、`--cell-height 270`、`--fps 30`、`--label auto\|none`、`--font/--font-size 16/--font-color`、`--pad`、`--audio-from N`、`--gap 0`、`--background black` | 视频 |
| `broll.py` | 在 A-roll 时间轴上定时插入 B-roll 覆盖，A 的时间轴不变 | `--insert B`（必填，可重复）、`--at T`（必填，与 insert 成对）、`--duration`（默认 4/条）或 `--end`、`--from 0`、`--audio a\|b\|mix`、`--pad-color black` | 视频 |

共同点（全 14 个）：都调用 `add_common(ap)` + `apply_common(args)`（`_common\runner.py`），因此共享 `--dry-run` / `--json` / `--json-brief` / `--plan FILE` / `--overwrite` / `--timeout` / `--fast` / `--progress` / `--quality` / `--codec` / `--preset`；默认 CRF 18、`--preset medium`；默认拒绝覆盖已存在输出。

---

## 二、`cut.py`：精度模型

### 2.1 无损优先

- 单段：`-ss <start> -i IN -t <dur> -c copy -avoid_negative_ts make_zero OUT`（`scripts\cut.py:133`）；容器是 `.mp4/.mov/.m4v` 时加 `-movflags +faststart`（`:82-84`）。
- 音频输出（`-o out.wav`）在视频输入上走 `-vn -c:a copy`（`:79-81`）；非 PCM 源拷进 PCM 容器会先提示并改为解码重编码（`:112-114`）。
- 音频流的 copy 用**输出侧** `-ss`（输入侧 seek 在视频文件上会落到前一个视频关键帧、在 FLAC/MP3 上落到粗索引；读全量丢包才精确到 packet，`:128-131`）。
- 多段：每段各切进临时目录，写 concat demuxer list，`-f concat -safe 0 -i list.txt -c copy`；这条失败才改为重编码整个拼接（`scripts\cut.py:349-367`）。
- 重编码段：`-ss` 在 `-i` 前 + `-t`，音频 `atrim=end=<dur>,asetpts=PTS-STARTPTS`，并 `-sn -dn`（字幕/数据流不能跟着重定时，`scripts\cut.py:115-127`）；丢了流会在 `dropped_non_av_streams` 上报（`:125-126,381`）。

### 2.2 关键帧容差

- `--tolerance` 默认 **0.5 s**，`-1` = 永不因容差重编码（`scripts\cut.py:283`）。
- 判定：copy 后 `got = probe(dst).duration`，**`abs(got - dur) >= tolerance` 即判为"超出容差"**——恰好等于容差也算超出（注释标明 `sweep F20`，`scripts\cut.py:140-142`）。触发后自动改为重编码该段，并打印最近关键帧供下次选择无损切点（`:143-152`）。
- 最近关键帧由 `keyframes_near(src, start)` 提供，窗口 ±5 s，用 `-skip_frame nokey -read_intervals` 只读附近（`_common\probe.py:327-343`）。
- 输出 `nearest_keyframes`（排序去重）与 `lossless_alternative` 文案（建议把 `--start` 移到最近关键帧即可无损），仅在 `mode == "hybrid"` 且单段时给出（`scripts\cut.py:388-392`）。

### 2.3 `--accurate` 与 `precision` 四值

- `--accurate` 强制重编码：视频帧精确、音频采样精确（`scripts\cut.py:282`）。
- 两个自动升级：源 `variable_frame_rate_suspected` 为真（VFR 上无损切不可靠，`scripts\cut.py:303-305`）；给了 `--codec`（copy 保不住目标编码器，`:306-309`）。
- `precision_of()` 按**实际写出的东西**定四值（`scripts\cut.py:90-104`）：

| `precision` | 含义 | 判据 |
|---|---|---|
| `packet` | stream copy：落包边界（音频）或关键帧（视频） | 未重编码（`:99-100`） |
| `sample` | 解码后裁到采样、无损写出 | 音频输出且编码器 ∈ `LOSSLESS_AUDIO = {pcm_s16le, pcm_s24le, pcm_s32le, pcm_f32le, flac}`（`:87,101-103`） |
| `codec_frame` | 解码裁到采样后被有损编码器成帧（AAC 1024 / MP3 1152 / Opus 960 采样，且 priming 会加进时长） | 音频输出且编码器不在上表（`:95-97,103`） |
| `frame` | 重编码视频：画面帧精确，其下音频是采样裁剪 | 其余重编码情况（`:104`） |

- `mode` 三值：`copy`（真无损）/ `accurate`（调用方要求 `--accurate`）/ `hybrid`（要求无损但关键帧偏差超容差，**静默改成重编码**）（`scripts\cut.py:374-376`）。
- 结果文档：`expected_duration / duration_error_ms / precision / reencoded / keyframe_snapped / requested_start|end|segments / requested_duration / output_duration / duration_delta_seconds / mode / nearest_keyframes / lossless_alternative / snap`（`scripts\cut.py:380-393`）。

### 2.4 `--snap beats`：只吸附到有 onset 支撑的点

- 需要音轨，或 `--snap-source` 指定另一路音乐；都没有则拒绝（`scripts\cut.py:206-209`）。
- 整片拷贝（无 in/out 点可移）直接拒绝（`scripts\cut.py:210-217`）。
- `--min-confidence` 必须 **> 0**：0 会让"从噪声测出的网格"也算可靠（`scripts\cut.py:218-224`）。
- `confidence < --min-confidence` 或无 beats → 拒绝，文案明说"吸附到发明的节拍会把切点移到音频不支撑的时间"（`scripts\cut.py:228-232`）。
- 吸附网格**只能是 `supported_beats`**（真有 onset 支撑的子集），绝不用完整规则网格——规则网格会穿过没有音乐的段落，吸到那里就是凭空造点（`scripts\cut.py:233-247`）；文档缺 `supported_beats`、或子集为空，都拒绝（`:239-247`）。
- 吸附用 `snap_points(points, supported, --snap-tolerance)`，`--snap-tolerance` 默认 0.12 s（约 120 BPM 的四分之一拍，`scripts\cut.py:249,287-289`）；某次吸附若让段首尾塌缩（`e <= s`）则该段整体回退不吸附（`:253-256`）。
- `--snap-source` 可直接读 `scenes.py --beats --json` 的文档（省一次解码）或读媒体文件现测（`scripts\cut.py:159-195`）；老版本文档缺 `supported_beats` 会被拒绝（`:170-176`）。
- 关键帧/容差判定在吸附**之后**跑（`:202-204` 注释）——能否无损取决于切点实际落点。
- `snap` 结果文档：`mode/tolerance/confidence/tempo_bpm/grid:"supported"/grid_points/moved[]/snapped/unchanged/source`（`scripts\cut.py:265-270`）。

---

## 三、`join.py`：转场、布局与输入记账

### 3.1 16 种转场

`TRANSITIONS` 共 **16** 项（`scripts\join.py:44-45`）：
`fade` `dissolve` `wipeleft` `wiperight` `wipeup` `wipedown` `slideleft` `slideright` `circleopen` `circleclose` `fadeblack` `fadewhite` `smoothleft` `smoothright` `radial` `none`。
视频转场 = `xfade=transition=<t>:duration=<d>:offset=<o>`，offset 逐段累加 `offset += lens[i-1] - d`（`scripts\join.py:516-521`）；音频同步 `acrossfade=d=<d>:c1=tri:c2=tri`（`:521`）。`--transition none` 时视频走 `concat=n=N:v=1:a=1`（`:510-512`）。默认 `--transition fade`、`--duration 0.5`（`:306-307`）。

### 3.2 长度归一与音频布局

- 每个片段先统一：`scale/pad`（或 crop）→ `setsar=1` → `fps=<fps>` → `format=<pixfmt>` → `settb=AVTB`（`scripts\join.py:500`）。
- 视频与音频**统一到同一个片长 `lens[i]`**：视频 `tpad=stop_mode=clone:stop_duration=<lens-vlen>`（短于片长时补帧）+ `trim=duration=`；音频 `apad=whole_dur=` + `atrim=duration=`（`:503-509`）。`clip_length()` 取视频流长度；音频比画面多出超过一帧时取音频长度（旁白不被切），容器时长只是兜底（`:83-94`）。
- 音频统一 `aformat=sample_rates=48000:channel_layouts=<layout>`（`:501`，音频专用拼接在 `:156`）；`LAYOUTS = {1: mono, 2: stereo, 6: 5.1, 8: 7.1}`，其它声道数拒绝并提示（`:46,494-496`）；视频拼接不再强转立体声，默认取各片段最宽布局（`:492-493`）。
- 无音轨的片段用 `anullsrc=r=48000:cl=stereo` 合成静音轨，`-t` 取该片段时长（`:463-478`）。
- 任一 HDR 输入 → 整个 join 走 `yuv420p10le`（`:487-488`）。
- 输出 `-fps_mode passthrough`（帧由各片段 trim + xfade/concat 摆好，不让 cfr 补帧；`:539-543`）。
- 输出时长校验：`tol = max(1.5 / fps, 0.05)`，测的是**视频流**时长而不是容器（容器含 AAC 尾巴），写进 `verification`（`:550-555`）。
- 片段短于 `2 × --duration` 拒绝（转场放不下）：视频 `:453-455`，音频 `:133-134`。
- 音频专用拼接：输出必须是音频扩展名，否则拒绝（`:150-151`）；产出的采样率/声道数与请求不符直接 `die(kind="output")`（`:170-174`）。

### 3.3 `--list` / `--on-missing` / `--on-silent` 的语义

| 机制 | 语义 | 出处 |
|---|---|---|
| `--list FILE` | 每行一个片段、按序；相对路径相对 list 文件所在目录；空行与 `#` 注释忽略；ffmpeg concat 写法 `file 'part 01.wav'` 也接受；**空列表拒绝**（上游步骤没产出文件是最常见的失败） | `scripts\join.py:182-206,291-292` |
| `--on-missing fail`（默认） | 缺失/空文件/目录/不可读**一次全部列出**（kind input），不逐个发现 | `scripts\join.py:293-295,344-352` |
| `--on-missing skip` | 跳过坏输入、拼接其余，跳过的写进 `skipped` | `scripts\join.py:353-360` |
| `--dry-run` 下的缺失输入 | 记为 `pending`（"上游步骤的输出"），**永不记 skipped**；扩展名代表它将持有的内容（音频扩展名 = 无画面） | `scripts\join.py:27-29,379-394,407-410` |
| `--on-silent warn`（默认） | 音频整轨峰值 ≤ `--silence-threshold` 的片段照拼，列进 `silent` | `scripts\join.py:296-299,361-366` |
| `--on-silent fail` / `skip` | 拒绝 / 丢进 `skipped` | `scripts\join.py:342-354` |
| `--allow-silent N[,N...]` | 1-based 输入号，声明"静音是故意的"：总是拼入、标 `intended:true`、不警告 | `scripts\join.py:300-302,275-285,338` |
| `--silence-threshold` | 默认 **-50 dBFS**，必须为负（≥0 拒绝）；测法是整文件 `volumedetect` 的 `max_volume`（`seconds=86400`），每个有音轨的输入一次解码；**无音轨的片段永远不算 silent**；`--dry-run` 下不测静音并记 note | `scripts\join.py:303-304,330-331,243-259,35` |

其余记账：`short_segments`（视频短于 `MIN_SEGMENT_FRAMES=2` 帧 / 音频短于 `MIN_AUDIO_SEGMENT=0.05 s`，只警告不拒绝，`scripts\join.py:60-61,106-117`）；`duplicates`（同一路径列多次，按 realpath 比对，警告不拒绝，`:97-103,369-378`）。

---

## 四、`fit.py`：三轴模型

一次调用可以同时动三个轴，`vf` 链按 **旋转/翻转 → 时长重定时 → 画幅 → fps** 的顺序拼（`scripts\fit.py:141-211`）。

### 4.1 时长轴

`--method speed`（默认）：`factor = src_dur / target`（>1 = 加速，`scripts\fit.py:158-161`）。

- 拒绝 `factor > --max-speed`（默认 **4.0**）或 `factor < 1/4.0`，提示改用 `--method trim` 或放宽上限（`scripts\fit.py:80,162-163`）。
- 画面 `setpts=<1/factor>*PTS`；音频 `atempo_chain(factor)`（`:164-173`）。
- **`--smooth` 只在慢放（factor < 1.0）时生效**（`:167-171`）：

| `--smooth` | 滤镜串 | 用途 |
|---|---|---|
| `none`（默认） | 无附加 | 复制帧，最便宜 |
| `blend` | `fps=<src_fps>` + `tblend=all_mode=average` | 帧混合，较平滑 |
| `interpolate` | `minterpolate=fps=<src_fps>:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1` | 运动补偿，慢但流畅 |

- 末尾 `-t <target>` 精确截到目标（`:174`）；`atempo` 单实例只接受 0.5..100，越界用 `atempo=0.5` / `atempo=100.0` 链式补齐（`:54-65`）。
- `--method trim`：目标短于源时从 0 开始（`--from-center` 则 `-ss (src−target)/2` 取中段）并 `-t target`；目标不短于源时什么都不做并提示（`:176-182`）。

### 4.2 画幅轴

输出尺寸由 `frame_size(ratio, width, height, sw, sh)` 统一决定（`_common\decision.py:75-103`）：两边都给直接用；给一边另一边按比例；都不给则**不超源分辨率**地取目标画幅（9:16 从 16:9 源会被源高度约束，`_common\decision.py:97-102`）。

| `--fit` | 滤镜串 | 出处 |
|---|---|---|
| `pad`（默认） | `scale=W:H:force_original_aspect_ratio=decrease,pad=W:H:(ow-iw)/2:(oh-ih)/2:color=<--pad-color>`；`--pad-fill blur` 时换成模糊分支 | `_common\decision.py:22-43` |
| `crop` | `scale=W:H:force_original_aspect_ratio=increase` + `crop=W:H:(in_w-out_w)*<crop-x>:(in_h-out_h)*<crop-y>` | `scripts\fit.py:188-190` |
| `blur` | `pad_filters(..., "blur", ...)`：整幅画面居中放在自己的一份"模糊 + 压暗"拷贝上，不裁不黑边 | `scripts\fit.py:191-203` |

- `--crop-x` / `--crop-y` 默认 **0.5**（0=左/上，1=右/下），必须在 0..1（`scripts\fit.py:94-95,111-114`）。
- 模糊分支（`_common\decision.py:34-43`）：半径钳制 `max(1, min(int(blur), max(1, min(out_w,out_h)//2 - 1)))`（`boxblur` 拒绝大于短边一半的半径）；图为 `split → [bg] scale(cover)+crop+boxblur=r:2[,eq=brightness=-d] → [fg] scale(fit) → overlay 居中`。
- 压暗量 `BLUR_DARKEN = 0.15`，**只对 SDR 源生效**；HDR 源（`bt2020_or_hdr`）背景保持原亮度并提示"PQ/HLG 码值上的 eq 不是 -15% 感知压暗"（`scripts\fit.py:43,194-202`）。
- `--pad-blur` 默认 20，必须 > 0（`_common\decision.py:49`；`scripts\fit.py:116-117`）。
- 画幅链末尾统一 `setsar=1`（`scripts\fit.py:206`）。

### 4.3 旋转 / 翻转轴

| flag | 滤镜串 | 出处 |
|---|---|---|
| `--rotate 90` | `transpose=1` | `scripts\fit.py:142-143` |
| `--rotate 270` | `transpose=2` | `scripts\fit.py:144-145` |
| `--rotate 180` | `transpose=2,transpose=2` | `scripts\fit.py:146-147` |
| `--flip h` / `--flip v` | `hflip` / `vflip` | `scripts\fit.py:148-151` |

- 先 rotate 后 flip（`scripts\fit.py:13-14` 文档、`:141-151` 代码顺序）。
- 这与源文件自带的 rotation **元数据**不同：probe 读元数据只用于算显示尺寸（`scripts\fit.py:129-130`），不改写；新旋转只由这两个 flag 施加。

### 4.4 音频与字幕

- `--audio-stream n` 选择保留哪条音轨（默认 0，多语言/多轨输入时重要；越界拒绝）（`scripts\fit.py:72-75,122-126`）。
- 有音轨才 `-map 0:a:<n>` + AAC；无音轨 `-an`（`:219-227`）。
- 重定时或 `-ss` 时字幕/数据流会被**丢弃**而不是带着旧时间戳发布（`:229-239`）；否则走 `run_keeping_subtitles()` 尽量保留，并上报 `dropped_non_av_streams`（`:239,246`）。
- `--fps` 强制恒定帧率；源是 VFR 且没给 `--fps` 时会提示自动 conform（`:208-211`）。

---

## 五、其余脚本的关键滤镜串

### 5.1 `crop.py`

`crop=<w>:<h>:<x>:<y>,setsar=1`（`scripts\crop.py:62`）。矩形必须在（按 rotation 交换后的）源画面内，宽高必须偶数（4:2:0 色度），**只拒绝不静默取整**（`scripts\crop.py:44-58`）。

### 5.2 `pad.py`（时间轴加黑）

- 画面 `tpad=start_duration=<start>:stop_duration=<end>:color=<color>`（`scripts\pad.py:49`）。
- 音频 `adelay=<start*1000>:all=1,apad=pad_dur=<end>`（`:52`）。
- `--start` 与 `--end` 不能同时为 0（`:39-40`）；`--start > 0` 时字幕流丢弃（stream copy 的字幕会提前 `<start>` 秒触发，`:60-64`）。

### 5.3 `freeze.py`

| 模式 | 滤镜图 | 出处 |
|---|---|---|
| `--mode extend` | `tpad=stop_mode=clone:stop_duration=<hold>` + 音频 `apad=pad_dur=<hold>` | `scripts\freeze.py:58-64` |
| insert，`--at 0` | `tpad=start_mode=clone:start_duration=<hold>` + 音频 `adelay=<hold*1000>:all=1` | `scripts\freeze.py:65-73` |
| insert，其它 | `[0:v]split[a][b];[a]trim=end=<at>,setpts=PTS-STARTPTS[head];[b]trim=start=<at>,setpts=PTS-STARTPTS[tail];[head]tpad=stop_mode=clone:stop=<n>[frozen];[frozen][tail]concat=n=2:v=1:a=0[outv]`；音频同构 `asplit/atrim/apad=pad_dur=<actual_hold>/concat` | `scripts\freeze.py:74-94` |

- 定格帧数 `n = max(1, round(hold × fps))`；音频补的时长用**帧取整后的** `actual_hold = n / fps`，不是原始 `--hold`——否则会留下最多半帧的永久 A/V 漂移（`scripts\freeze.py:78-83`）。
- `--mode extend` 要求 `--at ≥ dur − 0.01`（`:53-54`）；insert 会丢字幕流（`:101-106`）。

### 5.4 `loop.py`

- 常量 `LOOP_FILTER_MAX_FRAMES = 32767`（loop 滤镜的帧数上限，`scripts\loop.py:31`）。
- 普通循环用 demuxer 级 `-stream_loop <times-1>`（音视频一起重复，`:137-141`）；`--duration` 时 `stream_loop = ceil(target/src_dur) − 1` 并 `-t target`（`:131,142-143`）。
- boomerang 图：`[0:v]split[f][r];[f]setpts=PTS-STARTPTS[fw];[r]trim=start_frame=1,reverse,trim=start_frame=1,setpts=PTS-STARTPTS[bw];[fw][bw]concat=n=2:v=1:a=0,loop=loop=<repeats>:size=32767,setpts=N/((<rate>)*TB),fps=<rate>[v]`（`scripts\loop.py:63-66`）。每个折返帧只出现一次（正向已含两端），不同于常见 split/reverse/concat 会重复端点帧（`:34-40`）。
- boomerang 需要至少 3 帧，且一个周期 `2N−2` 帧必须 ≤ 32767（`scripts\loop.py:43-48`）；**boomerang 必丢音频**（倒放的声音是倒的），结果里给出 note 提示用 `audio.py` 配底音（`:117,133-136`）。
- 解码帧常驻内存：超过 2 GiB 打印警告，建议先 `cut.py` 切短（`:51-55`）；`reverse.py` 同理，> 60 s 给出警告（`scripts\reverse.py:37-39`）。
- `--times` 与 `--duration` 互斥必选一；`--duration` 必须长于源（否则提示用 `cut.py`）（`:100-102,129-130`）。

### 5.5 `insert.py`（静图 → Ken Burns）

- `--duration` 必填；`--fps 30`；`--zoom-amount 1.3` 且必须 > 1.0；`--pan` 必须配 `--zoom`（`scripts\insert.py:42-48,60-63`）。
- 先放大再推：`upscale = max(2, ceil(amount × 2))`，然后
  `scale=<out_w*upscale>:<out_h*upscale>:force_original_aspect_ratio=increase` → `crop=...` → `zoompan=z='<zexpr>':x='<pan_x>':y='<pan_y>':d=<frames>:s=<W>x<H>:fps=<fps>` → `setsar=1`（`scripts\insert.py:100-108`）。
- 表达式：zoom in `if(eq(on,0),1,min(zoom+<(amount−1)/frames>,<amount>))`；zoom out `if(eq(on,0),<amount>,max(zoom−<(amount−1)/frames>,1))`；pan left/right `(iw-iw/zoom)*(1−on/frames)` / `(iw-iw/zoom)*on/frames`，up/down 同理用 `ih`；不给 pan 时居中（`scripts\insert.py:88-99`）。
- 输入必须是静图：时长 > 0.5 s 或带音轨都拒绝（"这是视频，用 broll.py / cut.py / join.py"，`scripts\insert.py:68-70`）。输出无音频。

### 5.6 `sequence.py`

- `"%" not in pattern` → glob 模式；否则 printf 模式（`scripts\sequence.py:75`）。
- glob 用 `sorted(dir.glob(...), key=natural_key)`（`img2 < img10`，字典序会把 `img1x` 全排到 `img2` 前，`:35-37,76-82`）；printf 模式从 `--start-number` 起逐号找连续帧，**缺帧时列出被排除的后续帧**（2.2.1 起不再静默变短，`:83-101`）。
- 两种模式都**先解析出实际文件列表、在磁盘上核对**，再喂给 ffmpeg 的 concat demuxer 列表——显式避开 `-pattern_type glob`，因为部分真实 ffmpeg 构建编译时没有它（`scripts\sequence.py:8-11,122-131`）。
- concat 列表每帧写一行路径 + `duration <1/fps>`，**末尾重复最后一条**（concat demuxer 会忽略最后一项的 duration）；又因为这条技巧在部分构建上会多出一帧，显式加 `-t <len(frames)/fps>` 钉死长度（`:120-129,135-139`）。
- 画面 `scale=<out_w>:<out_h>,setsar=1,fps=<fps>`；输出无音频（`:132-139`）。

### 5.7 `background.py`

- 纯色：`color=c=<color>:size=WxH:rate=<fps>`（`scripts\background.py:66`）。
- 渐变：`gradients=size=WxH:rate=<fps>:c0=<c0>:c1=<c1>:x0=0:y0=0:x1=<round(W·cosθ)>:y1=<round(W·sinθ)>:seed=0:speed=1e-05`（`scripts\background.py:54-63`）。
- `seed=0` 与 `speed=1e-05` 是**显式钉死**的：gradients 默认 `seed=-1`（每次运行随机）与 `speed=0.01`（每帧缓慢旋转），不钉住的话"静态底片"既不可复现也不静止，违反该工具声明的 bit_exact/deterministic 契约；speed 合法下限就是 1e-05（0 会被拒）（`scripts\background.py:57-63` 注释）。
- `-f lavfi -i <filter> -t <target>`，无输入文件、无音频；`--width/--height` 必填且偶数（`:42-45,69-71`）。

### 5.8 `grid.py`

- 每格单元链：`fps=<fps>` → `scale=<cw>:<ch>:force_original_aspect_ratio=decrease` → `pad=<cw>:<ch>:(ow-iw)/2:(oh-ih)/2:color=<bg>` → `setsar=1`（`scripts\grid.py:96-101`）；letterbox 不拉伸。
- `--pad`：短片段 `tpad=stop_mode=clone:stop_duration=<target−dur>` 保持到最长片段；否则 `trim=duration=<target>` 截到最短（`:102-105`）；`target_duration = max/min(durations)`（`:84-85`）。
- 标签（`--label auto` 默认）：`drawtext=text='<stem>':fontfile=...:fontsize=<16>:fontcolor=<white>:x=w-tw-<10>:y=h-th-<10>:box=1:boxcolor=black@0.5:boxborderw=4`，右下角，`LABEL_MARGIN = 10`（`scripts\grid.py:31,106-111`）。
- 合成：`xstack=inputs=N:layout=<c*cw>_<r*ch>|...:fill=<background>`，其中 `cw = cell_width + gap`、`ch = cell_height + gap`（`:114-116`）；`--gap` 必须 ≥0 且偶数，cell 尺寸必须偶数（`:63-70`）。
- 音频默认没有（"把每路音频静默混在一起很少是对比墙想要的"）；`--audio-from N` 只带那一路，`--pad` 时再 `apad,atrim=duration=<target>`（`:117-123`）。
- HDR 输入会被合成进 8-bit SDR 网格并打印提示（对比工件不是交付件，需要调色先 `color.py --to-sdr`，`:124-128`）。

### 5.9 `broll.py`（A-roll 上的定时覆盖）

- B 画面：`[i+1:v]trim=start=<from>:duration=<length>,setpts=PTS-STARTPTS+<at>/TB,scale=W:H:force_original_aspect_ratio=decrease,pad=W:H:(ow-iw)/2:(oh-ih)/2:color=<pad-color>,setsar=1,fps=<fps>,format=<yuv420p10le|yuv420p>[bi]`（`scripts\broll.py:105-107`）。
- 覆盖：`[cur][bi]overlay=0:0:eof_action=pass:enable='between(t,<at>,<at+length>)'`——B 的首帧之前与末帧之后 A 原样透出，**A 的时间轴从不被改**（`scripts\broll.py:99-110`）。
- 音频 `--audio a`（默认）：A 的音轨直接 stream copy；`b`：A 在窗口内 `volume=0:enable='between(t,...)'` 后与 B 延迟 `adelay=<at*1000>|<at*1000>` 的声音 `amix=inputs=...:normalize=0:dropout_transition=0`，再 `atrim=duration=<dur_a>`；`mix` 则是两者都留（`:112-129`）。
- 输出必须与 A 等长：实测偏差 > `max(0.1, 1.5/fps)` 直接 `die(kind="output")`（"cutaway 不能改变长度"，`:145-146`）。
- `--duration` 每条默认 4 s（或 `--end` 换算）；`--at` 越界、窗口越界、cutaway 互相重叠都拒绝（`:78-89`）；`--audio b/mix` 要求每条 B 都有音轨（`:91-92`）。

### 5.10 `speedramp.py`

- `MAX_SPEED = 20.0`、`MIN_SPEED = 0.05`（`scripts\speedramp.py:24-25`），超出即拒绝（`:52-53`）。
- 每段：视频 `[0:v]trim=start=<s>[:end=<e>],setpts=(PTS-STARTPTS)/<factor>[vi]`；音频 `[0:a]atrim=...,asetpts=PTS-STARTPTS,<atempo 链>[ai]`；最后 `concat=n=N:v=1:a=1`（`:86-104`）。
- `atempo` 单实例 0.5..100，越界用 `atempo=0.5` / `atempo=100.0` 链式补齐（`:28-39`）。
- 段必须覆盖全片且无缝隙：起点距 0 ≤ 0.01、终点距 duration ≤ 0.5、相邻段边界差 ≤ 0.01（`:75-82`）。
- 输出 `-fps_mode cfr -r <源 fps>`（`:108`）；字幕/数据流丢弃并上报（`:119`）。

---

## 六、硬阈值速查表

| 阈值 / 常量 | 值 | 出处 |
|---|---|---|
| cut 关键帧容差 | `--tolerance 0.5`；`abs(got−dur) >= tolerance` 即超出（**等于也算**）；`-1` 永不 | `scripts\cut.py:283,142` |
| cut 吸附容差 | `--snap-tolerance 0.12` | `scripts\cut.py:287` |
| cut 置信度门槛 | `--min-confidence 0.5`，且必须 > 0 | `scripts\cut.py:293,221-224` |
| cut 节拍解码率 | `BEAT_RATE = 22050` | `scripts\cut.py:156` |
| cut 无损音频编码器 | `{pcm_s16le, pcm_s24le, pcm_s32le, pcm_f32le, flac}` | `scripts\cut.py:87` |
| cut 关键帧搜索窗 | ±5.0 s | `_common\probe.py:327` |
| cut 多段拼接 | concat demuxer + `-c copy`，失败才重编码 | `scripts\cut.py:355-367` |
| join 转场数 | `TRANSITIONS` 16 项 | `scripts\join.py:44-45` |
| join 最短片段 | 视频 `MIN_SEGMENT_FRAMES = 2`；音频 `MIN_AUDIO_SEGMENT = 0.05 s` | `scripts\join.py:60-61` |
| join 声道布局 | `{1: mono, 2: stereo, 6: 5.1, 8: 7.1}` | `scripts\join.py:46` |
| join 音频统一 | `aformat=sample_rates=48000:channel_layouts=<layout>` | `scripts\join.py:156,501` |
| join 静音阈值 | `--silence-threshold -50` dBFS，必须为负 | `scripts\join.py:303-304,330-331` |
| join 静音测量 | 整文件 volumedetect（`seconds=86400`） | `scripts\join.py:256` |
| join 输出时长校验 | `tol = max(1.5/fps, 0.05)` | `scripts\join.py:553` |
| join 转场下限 | 每段必须 > `2 × --duration` | `scripts\join.py:453-455,133-134` |
| fit 速度上限 | `--max-speed 4.0`（低于 1/4 也拒绝） | `scripts\fit.py:80,162-163` |
| fit 裁剪锚点 | `--crop-x/--crop-y 0.5`，范围 0..1 | `scripts\fit.py:94-95,111-114` |
| fit 模糊半径 | `--pad-blur 20`；钳制 `max(1, min(blur, min(out_w,out_h)//2−1))` | `_common\decision.py:49,37` |
| fit 压暗量 | `BLUR_DARKEN = 0.15`，仅 SDR；HDR 不压暗 | `scripts\fit.py:43,198-202` |
| fit 慢放平滑 | `interpolate` → minterpolate(mci/aobmc/bidir/vsbmc=1)；`blend` → tblend=average | `scripts\fit.py:167-171` |
| atempo 单实例范围 | 0.5..100，越界链式补齐 | `scripts\fit.py:54-65`；`scripts\speedramp.py:28-39` |
| freeze 帧取整 | `n = max(1, round(hold×fps))`；音频补 `n/fps` | `scripts\freeze.py:78-83` |
| freeze extend 位置 | `--at ≥ dur − 0.01` | `scripts\freeze.py:53-54` |
| loop 滤镜帧上限 | `LOOP_FILTER_MAX_FRAMES = 32767` | `scripts\loop.py:31` |
| loop boomerang | 至少 3 帧；周期 `2N−2 ≤ 32767`；必丢音频 | `scripts\loop.py:43-48,117` |
| loop 内存警告 | 解码帧 > 2 GiB | `scripts\loop.py:53` |
| loop 可信帧率上限 | `MAX_PLAUSIBLE_FPS = 240` | `scripts\loop.py:70` |
| reverse 内存警告 | 源 > 60 s | `scripts\reverse.py:37-39` |
| insert 推拉 | `--zoom-amount 1.3`；`upscale = max(2, ceil(amount×2))` | `scripts\insert.py:47,102` |
| insert 静图判定 | duration ≤ 0.5 s 且无音轨 | `scripts\insert.py:68-70` |
| sequence glob 判定 | `"%" not in pattern` | `scripts\sequence.py:75` |
| sequence 长度钉死 | 显式 `-t <len(frames)/fps>` | `scripts\sequence.py:135-139` |
| background 渐变确定性 | `seed=0:speed=1e-05` | `scripts\background.py:63` |
| grid 标签边距 | `LABEL_MARGIN = 10` | `scripts\grid.py:31` |
| grid 单元链 | `fps → scale(decrease) → pad → setsar=1` | `scripts\grid.py:96-101` |
| grid 时长目标 | `--pad` 取最长，否则取最短 | `scripts\grid.py:84-85` |
| grid gap 约束 | `--gap ≥ 0` 且偶数 | `scripts\grid.py:69-70` |
| broll 默认窗长 | 每条 4 s（或 `--end`） | `scripts\broll.py:78` |
| broll 覆盖语法 | `overlay=0:0:eof_action=pass:enable='between(t,at,at+len)'` | `scripts\broll.py:108` |
| broll 长度校验 | 偏差 > `max(0.1, 1.5/fps)` 判失败 | `scripts\broll.py:145` |
| speedramp 速度范围 | `MAX_SPEED 20.0` / `MIN_SPEED 0.05` | `scripts\speedramp.py:24-25` |
| speedramp 段覆盖 | 起点 0（≤0.01）、终点 duration（≤0.5）、无缝（≤0.01） | `scripts\speedramp.py:75-82` |
| crop 尺寸约束 | 宽高必须偶数，矩形必须在（rotation 交换后的）画面内 | `scripts\crop.py:44-58` |

---

## 七、本域红线

1. **`fit.py --fit crop` 从 16:9 到 9:16 丢掉约 68% 的宽度。** 以 1920×1080 源、9:16 目标为例：`frame_size()` 被源高度约束得到 608×1080（`_common\decision.py:97-102`），`crop` 后只保留 1920 中的 608 px ≈ 31.7%，**约七成宽度被丢弃**，且默认只保中间（文档原话：中三分之一以外的内容会被切掉，`scripts\fit.py:16-21`）。不知道被摄主体在哪时，用 `--fit pad`（什么都不丢）、`--fit blur`，或显式给 `--crop-x/--crop-y`。
2. **"60 秒"是两个不同答案。** `fit.py --duration 60 --method speed`（默认）把全片重定时到 60 s——内容全保留、节奏改变、可被 `--max-speed 4.0` 拒绝；`--method trim` 只留 60 s——内容被丢、节奏不变（默认取开头，`--from-center` 取中段）（`scripts\fit.py:153-182`）。调用方要先说清要哪一个；第三种答案是 `cut.py --segments` 选多段拼 60 s，第四种是 `speedramp.py` 分段变速。
3. **裁剪位置是判断，不是测量。** `cropdetect.py` 只报矩形、`--motion-centre` 只报质心（运动集中处 ≠ 主体所在）；"谁在被拍"由调用方决定（`scripts\cropdetect.py:67-75,14-19`）。
4. **画面变化后必须用 `look.py` 看一眼。** 本册 14 个脚本全部重编码画面；`fit/crop/pad/freeze/insert/loop/broll/grid` 之后要看联系表或抽帧确认构图、安全区、黑边（`01-overview.md` 的验证策略：画面变了就必须视觉复核）。
5. **无损 ≠ 精确。** `cut.py` 默认 `-c copy`，`precision=packet`，切点落关键帧/包边界；要帧精确（视频）/采样精确（音频）必须 `--accurate`，代价是重编码。**偏差恰好等于 `--tolerance` 也算超出**（`scripts\cut.py:142`）。想无损又要准，就看 `nearest_keyframes` / `lossless_alternative` 把切点挪到真实关键帧。
6. **`--snap beats` 只吸附到 `supported_beats`。** 低于 `--min-confidence`（默认 0.5）直接拒绝，`--min-confidence 0` 也被拒绝；文档缺 `supported_beats` 或子集为空同样拒绝——**工具不会把切点移到音频不支撑的时间**（`scripts\cut.py:221-247`）。
7. **`join.py --on-silent warn` 是默认。** 静音片段（整轨峰值 ≤ -50 dBFS）会被拼进去并记在 `silent` 里，**不会自动丢弃**；要拒绝或丢掉得显式 `fail` / `skip`（`scripts\join.py:296-299,361-366`）。
8. **boomerang 必丢音频。** 一半的声音倒放没有意义，`loop.py --boomerang` 直接丢音轨并给出 note，需要底音另配 `audio.py`（`scripts\loop.py:117,133-136`）。
9. **`reverse.py` 与 `loop.py --boomerang` 把整段解码进内存。** 长片段先 `cut.py` 切短（`scripts\reverse.py:37-39`；`scripts\loop.py:51-55`）。
10. **`grid.py` 默认没有音频。** 它不会把每路音频静默混在一起；要声音得 `--audio-from N` 显式指定（`scripts\grid.py:9-11,117-123`）。

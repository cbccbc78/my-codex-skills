# 05 · 音频工程与多机位同步

覆盖 `audio.py` `loudness.py` `silence.py` `sync.py` `multicam.py` `waveform.py` 与 `_common/asr.py`。

**本域两条铁律先记住**：
1. **≤ −40 LUFS 是环境音，不是内容。** 把它拉到语音目标等于把噪声一起放大。
2. **去口头禅没有实测词时间戳就绝不做。** 没有一种启发式能在不切掉真词的前提下找到口头禅。

---

## 一、音频是一等输入

WAV / FLAC / MP3 / M4A(AAC) / OGG / Opus 走 `probe`、`cut`、`join`、`silence`、`loudness`、`audio`、`sync`、`check --platform podcast`，命令与视频完全相同。

**输出扩展名决定编解码器**：

| 输出 | 编码器 |
|---|---|
| `.wav` | PCM |
| `.flac` | FLAC |
| `.mp3` | MP3 |
| `.m4a` / `.aac` | AAC |
| `.ogg` | Vorbis |
| `.opus` | Opus |

给视频输入一个音频扩展名会**丢掉画面**（`audio.py talk.mp4 -o talk.wav`），可以顺带清理（`--voice -o talk.m4a`）。
`--audio-stream N` 选轨；`probe` 在 `audio_streams` 下列出全部轨。

需要画面的工具（`fit`、`caption`、`overlay`、`graphics`、`color`、`export`、`scenes`、`look`）遇到音频输入会以
`input has no video stream` 拒绝——**不要强行套一个视频壳**。

---

## 二、`audio.py` —— 声音处理链

每个 flag 都是**一个被文档化的选项**，不是接受调用方传滤镜串。参数在 ffmpeg 跑之前就被范围校验。

### 2.1 人声清理

`--voice light|medium|strong` —— 三档预设链。中档的构成是：高通滤波（80 Hz）→ 齿音抑制（0.4）→ FFT 降噪（噪声底 −25）→ 压缩（阈值 −18 / 比率 3 / 起攻 5 ms / 释放 80 ms / 补偿增益 2）。强档额外加 −1 dBFS 限制器。轻档去掉压缩、只做高通与轻降噪。

`--denoise` —— 独立的 FFT 降噪，可与人声链分开用。

### 2.2 类型化动态

| flag | 对应的 FFmpeg 组件 | 主要参数 |
|---|---|---|
| `--compress` | 压缩器 | `--comp-threshold`（默认 −18）、`--comp-ratio`（默认 3） |
| `--limit` | 限制器 | `--limit-ceiling`（默认 −1 dBFS） |
| `--gate` | 噪声门 | `--gate-threshold`（默认 −45 dBFS） |

三者可组合，各自独立校验。

### 2.3 音乐床与侧链闪避

`--music bed.mp3 --duck` —— 背景音乐 + 侧链闪避。默认参数：

| 参数 | 默认值 |
|---|---|
| `--duck-amount` | 12 dB |
| `--duck-threshold` | −26.0206 dBFS（即线性 0.05） |
| `--duck-attack` | 20 ms |
| `--duck-release` | 400 ms |

`--effects sfx.wav` 加第三条床，**永不被闪避**。项目文件里的层级用 `audio.stems` 表达。

### 2.4 声道与格式

| flag | 作用 |
|---|---|
| `--downmix` | 5.1 → 立体声。中置声道按 **0.707** 权重下混 |
| `--stereo-widen 0.5` | 立体声加宽（`extrastereo`，m = 1 + 2a）。**需要真实立体声源** |
| `--fade-out 3` / 淡入 | 淡入淡出 |
| `--replace narration.wav` | 音轨替换 |
| `--audio-stream N` | 选轨 |

**注意**：5.1 源要先 `--downmix` 才能谈"立体声加宽"，否则是对一个假立体声做处理。

---

## 三、`loudness.py` —— 响度标准化

### 3.1 流程

两遍 EBU R128 `loudnorm`，`linear=true`。

1. 第一遍测量整段的响度、真峰值、动态范围
2. 第二遍按测量结果线性归一化
3. **写出的文件被重新测量**；若真峰值超过 `--tp`，按以下顺序处理：
   - 先把音频码率从 256k 提到 320k
   - 再下调 ceiling（按 overshoot + 0.2 的余量）
   - 最多循环 5 轮

**为什么需要这个循环**：有损编码器会过冲——测量达标的信号编成 AAC/MP3 之后真峰值会抬上去。所以"测一次就完"是不成立的。

### 3.2 参数

| flag | 含义 |
|---|---|
| `-I` | 目标响度（LUFS） |
| `--tp` | 真峰值上限（dBTP） |
| `--lra` | 允许的动态范围 |
| `--measure-only` | 只测量不写文件 |

**视频流是 stream copy**，不重编码画面。

### 3.3 目标值速查

| 场景 | 目标 |
|---|---|
| YouTube / 社交平台 | −14 LUFS / −1 dBTP（`loudness.py` 的默认） |
| 播客 | `-I -16 --tp -1.5` |
| 广播 | `-I -23` |

---

## 四、`silence.py` —— 静音与口头禅

### 4.1 基础去停顿

| flag | 默认 | 含义 |
|---|---|---|
| `--threshold` | −35 dBFS | 低于此电平视为静音 |
| `--min-silence` | — | 最短静音时长 |
| `--margin` | — | 语音前后保留的余量 |
| `--edl` | — | 导出切点表而不写媒体 |

**检测不到任何静音时**，工具会带出该音轨的**实测电平**并给提示——先看实测值再调阈值或缩短 `--min-silence`，不要盲目试。

### 4.2 语音感知模式

`--speech-aware` —— **句内换气保留，只在句界停顿切**。

这正是用户说"别在句子中间切"时想要的：一个短于 `--min-silence` 的换气在句子内部会被保留，只有句子边界的停顿才会被切掉。

它与 `--filler` 通过**同一个 `keep_ranges()`** 组合，所以两者可以同时用而不打架。

### 4.3 口头禅切除

`--filler --words words.json`（或 `--transcribe` 生成词时间戳）

**硬约束**：
- **必须有实测的词级时间戳。** 没有一种启发式能在不切掉真词的前提下找到"嗯""啊"
- 内置列表**故意不含** `like`、`tipo`、`cioè` 这类话语标记词——它们在口语里是**内容词**，不是填充词
- 匹配是**精确 token 匹配**，不是子串匹配（"umbrella" 不含 "um"）
- 必须 `start < end`、时长 ≤ 1.2 s
- 前后各留 0.02 s 的 pad
- 间隔 ≤ 0.05 s 的片段会合并

### 4.4 转写是可选依赖

`--transcribe` 需要本地 whisper 引擎。**没有引擎时会拒绝**，并列出三种安装方式。
**不联网、不下载模型**——转写引擎必须已经在机器上。

---

## 五、`sync.py` —— 对齐与漂移

### 5.1 算法

1. 把每路音频降采样到 **8 kHz**
2. 计算 **RMS 包络**
3. 纯 Python FFT **归一化互相关**（粗搜 20 ms，精修到 **1 ms**）
4. 重叠比例下限 `MIN_OVERLAP_FRACTION = 0.35`，并按 `overlap^0.5` 加权

### 5.2 参数与输出

| flag | 含义 |
|---|---|
| `--analyze-seconds` | 分析窗口长度 |
| `--fix-drift` | 时钟漂移校正（用 `asetrate`/`aresample` + `setpts` 按 ppm 校正） |
| `--replace-audio` | 用对齐后的音频替换 |
| `--trim-second` | 裁掉第二路的多余部分 |

**N 路**：`sync.py REF A B C ...` —— 第三路及以后是额外的位置参数。

### 5.3 置信度是必读字段

结果里带 `confidence`。**低于 0.3，或偏移落在分析窗边缘，很可能是错的。**

处理方式：扩大 `--analyze-seconds`，或让用户找一个"打板"点（拍手、敲击）。

### 5.4 边界

**只做音频对齐，不做唇形或人脸检测。** 它对齐的是音频波形，不是"嘴型和声音"。

---

## 六、`multicam.py` —— 多机位

### 6.1 对齐 + 切换

任意数量机位先按音频对齐（含漂移校正），再按时序切换。

| 模式 | 用法 |
|---|---|
| 手工切换表 | `--switch "0-20:0,20-40:1,40-60:2"` |
| 能量自动切换 | `--switch energy` —— 自动切到当前最响/在说话的机位 |
| 最短镜头 | `--min-shot` |

### 6.2 输出形态

| flag | 产出 |
|---|---|
| `--edl` | 纯 `START-END` 切点表（**不是 CMX EDL**） |
| `--write-project p.json` | 写成可编辑项目文件 |

**给 Premiere / DaVinci Resolve 的正确路径**：`--write-project` 生成项目文件，再 `render.py --export-timeline`。
不要拿 `--edl` 去喂剪辑软件——那是给人看的切点表，不是 EDL 格式。

---

## 七、`waveform.py` —— 音频可视化

| flag | 作用 |
|---|---|
| `--style` | 波形（`showwaves`）或频谱（`showspectrum`） |
| `--image cover.png` | 把可视化叠在静态底板上（audiogram，播客封面视频） |
| `--platform` | 按目的地取画幅 |
| `--title` | 标题 |
| 字幕相关 | 可烧入字幕 |

**不抓取任何远程封面**：`--image` 给的必须是本地文件。**没有封面就明说，不编一个出来。**

---

## 八、`_common/asr.py` —— 本地转写桥

### 8.1 引擎探测顺序

1. `whisper-cli` / `whisper-cpp`（也兼容"目录名含 whisper 的 `main`"）
2. `faster-whisper`（Python 包，线程 + 超时）
3. `openai-whisper`（CLI）

先 ffmpeg 把音频转成 **16 kHz 单声道**再喂进去。

### 8.2 两种失败

| 失败 | 行为 |
|---|---|
| 没有引擎 | `die_no_engine`（`kind: input`），**列出三条安装提示** |
| 引擎跑了但没有语音 | `die_no_speech`，`reason: "no_speech"` |

第二种很关键：**引擎能跑不等于素材里有语音**。不能把"没检测到语音"报成"转写成功但内容为空"。

### 8.3 导出

`transcribe` / `transcribe_words` / `parse_srt` / `write_srt`
—— 转写结果可以直接喂给 `caption.py`（`--text` 或 `--srt`）。

---

## 九、硬阈值速查

| 项 | 值 | 出处 |
|---|---|---|
| 人声清理中档：高通 / 齿音 / 降噪底 / 压缩 | 80 Hz / 0.4 / −25 / −18:3:5:80:+2 | `scripts/audio.py` |
| 强档限制器天花板 | −1 dBFS | `scripts/audio.py` |
| 闪避量 / 阈值 / 起攻 / 释放 | 12 dB / −26.0206 dBFS / 20 ms / 400 ms | `scripts/audio.py` |
| 5.1 下混中置权重 | 0.707 | `scripts/audio.py` |
| 响度复测轮数上限 | 5 | `scripts/loudness.py` |
| 响度复测码率阶梯 | 256k → 320k | `scripts/loudness.py` |
| 默认静音阈值 | −35 dBFS | `scripts/silence.py` |
| 填充词时长上限 / pad / 合并间隔 | 1.2 s / 0.02 s / 0.05 s | `_common/decision.py` |
| 对齐采样率 / 粗搜 / 精修 | 8 kHz / 20 ms / 1 ms | `scripts/sync.py` |
| 对齐重叠下限 | 0.35 | `scripts/sync.py` |
| 对齐置信度警戒线 | 0.3 | `scripts/sync.py` |
| 转写输入采样率 / 声道 | 16 kHz / 单声道 | `_common/asr.py` |

---

## 十、本域红线

1. **环境音不拉响度。** ≤ −40 LUFS 是房间底噪，不是内容。拉上去等于放大噪声——必须显式说明并让用户决定
2. **"标准化"过仍可能削顶。** 必须同时看响度与真峰值两个数字
3. **没有词时间戳不去口头禅。** 也**不要把话语标记词当填充词**
4. **置信度低必须复核每一路。** 不要拿一个 0.1 置信度的偏移量去切片子
5. **`sync` 只对齐音频。** 它不做唇形/人脸检测，不要说它"做到了音画同步"
6. **分机录制超过十分钟必须做漂移校正**，否则对齐只在前半段成立
7. **转写引擎可选且离线。** 没有就如实拒绝，不要假装能转
8. **响度放最后。** 剪辑会改变节目时长，从而改变整体响度

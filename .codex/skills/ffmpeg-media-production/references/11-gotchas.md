# 11 · 坑清单与反面模式

本册把上游 `references/gotchas.md` 的全部小节（6 个分组、15 个 `###` 小节，加 1 个只有正文的 `##` 小节）逐条转写并加厚，每条给**症状 → 为什么 → 正确做法 → 具体命令**四段。
末尾两节：**本技能明确不做的判断**（对应 `SKILL.md:41-55`）与**最常见的 8 个误用**。

行号口径：脚本在 `<skill-dir>/scripts/`，共享内核在 `<skill-dir>/scripts/_common/`。

---

## 一、色彩 / HDR / Log

### 1.1 HDR 与色彩

**症状**
iPhone HDR、HDR10 素材经过一条 SDR 路径重编码后整体发灰、发平，高光糊成一片；或者反过来，文件看着正常，但一到 SDR 平台颜色就不对。

**为什么**
SDR 产物是 H.264 + BT.709 标签 + `yuv420p`；HDR 素材承载的是 10-bit PQ/HLG 的高动态范围信号。用 8-bit H.264 的 SDR 路径去装它，要么被裁掉动态范围，要么像素不变但被打上错误的 BT.709 标签——后者更隐蔽，画面"能看"，颜色是错的。

`probe.py` 报 `bt2020_or_hdr: true` 时（HDR10/PQ、HLG、Dolby Vision，**或 BT.2020 SDR**），每个编辑脚本都会把输出保持在 10-bit 路径（HEVC Main10 + 源色彩标签），不让任何东西被静默压平（`_common/probe.py:269-276`、`_common/decision.py:349-363`）。

两个字段的差别必须记牢：

| 字段 | 含义 |
|---|---|
| `hdr: true` | **窄义**：真实的 PQ / HLG / Dolby Vision 传输（`_common/probe.py:256,274`） |
| `bt2020_or_hdr: true` | 1.x 旧义：上面两者**再加**宽色域的 SDR 文件（`_common/probe.py:249,276`） |
| `hdr_format` | 把中间那种情况命名出来：`BT.2020 SDR`（`_common/probe.py:277-278`） |

**"不是 HDR"不等于"可以出 BT.709 交付物"。** BT.2020 SDR 文件仍带宽色域原色，面向 SDR-only 的客户端或平台需要先 `color.py --to-sdr`。`export.py` **只重打 BT.709 标签，不做转换**（`export.py:151-156` 会明确 warning：`This preset outputs SDR BT.709 tags without converting it`）。

iPhone `.mov` 还带时间码/元数据轨；脚本只映射第一条音轨，重编码时其余轨被丢弃（`gotchas.md:23-25`）。ProRes 母版保持源色彩：`export.py --preset prores` 不重打标签。

**正确做法**
先 `probe.py`，按目的地二选一：保留 HDR（YouTube/手机端可以）或先跑 `color.py --to-sdr` 再做 SDR-only 目的地、LUT 工作、H.264 交付物。

**具体命令**

```bash
python3 <skill-dir>/scripts/probe.py clip.mov --json          # 看 hdr / bt2020_or_hdr / hdr_format
python3 <skill-dir>/scripts/color.py clip.mov --to-sdr        # 转 SDR BT.709，默认 hable tonemap
python3 <skill-dir>/scripts/color.py clip.mov --strip-dovi    # 只丢 DV RPU，保留 HLG/HDR10 基底层
```

> 手工写 ffmpeg 时（永远不要，见第 8 节第 1 条）**不要在 BT.2020 像素上打 BT.709 标签**。

---

### 1.2 Log 素材

**症状**
S-Log / V-Log / C-Log 素材看起来灰、低对比，但 `probe.py` 报的是 SDR——没有任何 HDR 标志，直接调色或直接交付都是错的方向。

**为什么**
Log 是**采集端的编码方式**，不是传输特性：它把高动态范围压进一条对数曲线，所以文件标签是普通 SDR，像素却是"未还原"的。直接交付 = 交付一条灰片；直接调色 = 在一个错误的起点上调。

`probe.py --analyze` 用 signalstats 的亮度/饱和度分布判断：`p_low >= 64 且 p_high <= 235 且 sat < 40` 时置 `looks_like_log: true`（`_common/probe.py:397,402`）。

**正确做法**
在任何其它处理**之前**，用厂商给的 `.cube` 做 `color.py --lut`。这是顺序问题，不是强度问题。

**具体命令**

```bash
python3 <skill-dir>/scripts/probe.py clip.mp4 --analyze                  # looks_like_log
python3 <skill-dir>/scripts/color.py clip.mp4 --lut SLog3_to_Rec709.cube
python3 <skill-dir>/scripts/color.py clip.mp4 --lut look.cube --lut-strength 0.6   # 只吃 60%
```

---

## 二、剪辑

### 2.1 关键帧切点

**症状**
`cut.py` 的无损结果比要求的时间点**早了最多一个 GOP**（常见 1–10 s）；用 `-c copy` 切 VFR 或非关键帧边界，得到一个"能播"但从**冻结帧或错误帧**开始的文件。

**为什么**
`-c copy` 不能凭空造出关键帧：视频流拷贝只能在关键帧上落刀，落点由源文件的 GOP 结构决定。`cut.py` 的机制是——拷贝后实测落点偏差，`abs(got - dur) >= tolerance` 判为超出容差（**恰好等于容差也算超出**，`cut.py:142` 注释标 `sweep F20`），默认 `--tolerance 0.5`（`cut.py:107`），超出就自动重编码那一段（`cut.py:150-152`）。输出 JSON 的 `mode` 字段会说明这次是 `copy` / `accurate` / `hybrid`（`cut.py:14-15`）——`hybrid` 就是"无损切点超容差、被静默重编码了"。

**正确做法**
尊重自动重编码，不要强推拷贝。用户坚持要无损时传 `--tolerance -1`（负值关闭该检查，`cut.py:140`），并明确告知：切点会落在**最近的前一个关键帧**上。

**具体命令**

```bash
python3 <skill-dir>/scripts/cut.py input.mp4 --start 3.5 --duration 10 --accurate    # 帧精确
python3 <skill-dir>/scripts/cut.py input.mp4 --start 3.5 --duration 10 --tolerance -1 # 强制无损，接受关键帧落点
python3 <skill-dir>/scripts/cut.py talk.wav --start 1.2345 --end 2.3456 --accurate -o part.wav  # 样本精确
```

---

### 2.2 可变帧率 VFR

**症状**
手机、录屏素材切完之后音画对不上、动作一顿一顿；或者每一帧都编码但时长和预期差一截。

**为什么**
`probe.py` 在 `r_frame_rate` 与 `avg_frame_rate` 相差超过 0.01 时置 `variable_frame_rate_suspected: true`（`_common/probe.py:235,266`）。VFR 文件里"帧率"不是常数，按时间戳落刀的 `-c copy` 切法不可靠。

**正确做法**
所有重编码脚本会自动加 `-fps_mode cfr` 并取源的平均帧率（`_common/decision.py:266`）；`cut.py` 在检测到 VFR 时**自行切到 `--accurate`**。当平均帧率是个怪数（比如丢帧丢出来的 23.4 fps）时，用 `fit.py --fps 30|60` 显式指定。

**具体命令**

```bash
python3 <skill-dir>/scripts/probe.py clip.mp4 --json     # variable_frame_rate_suspected
python3 <skill-dir>/scripts/fit.py clip.mp4 --fps 30     # 显式 conform
```

---

## 三、音频

### 3.1 同步、多机位与时钟漂移

**症状**
`sync.py` / `multicam.py` 报了一个 offset，命令退出 0，但成品口型对不上。

**为什么**
三点：

1. **低置信度不可信。** `confidence` 低于 0.3，或 offset 超过分析窗口的 60 %，基本是错的（`gotchas.md:56-58`）。`multicam.py` 对每台机器各自报一个 `confidence`，低于 0.1 时在 stderr 上 warning（`multicam.py:14,202`），但**只看命令成功是不够的，每台都要看**。`sync.py` 内部的 `MIN_OVERLAP_FRACTION = 0.35`（`sync.py:52`）约束的是搜索重叠度，不是结果可信度。
2. **这两个脚本对齐的是"音轨对音轨"，永远不是唇形同步。** 本技能里没有任何人脸/嘴部检测（`gotchas.md:62-65`）。高置信度只说明**音频匹配得好**，不说明画面看起来对。口型对不对得看画面，不是看报出来的 offset。
3. **不同帧率或采样率的文件不要在一条 `cut.py --segments` 拼接里混用**，除非走 `--accurate` 重编码。

**正确做法**
加大 `--analyze-seconds` 或找一个拍手声；每台机器逐个查置信度。`sync.py` 跑完后**再跑一遍它自己的输出**验证：offset（以及带 `--fix-drift` 时的 drift ppm）应该接近 0。分开设备录的、长于约 10 分钟的素材，**永远加 `--fix-drift`**。

**具体命令**

```bash
python3 <skill-dir>/scripts/sync.py cam.mp4 recorder.wav --max-offset 60 --json
python3 <skill-dir>/scripts/sync.py cam.mp4 recorder.wav --fix-drift --replace-audio
python3 <skill-dir>/scripts/multicam.py a.mp4 b.mp4 c.mp4 --analyze-seconds 120   # 逐台看 confidence
```

---

### 3.2 响度与环境音

**症状**
(a) "已归一化"的音频仍然削波；(b) 一段几乎无声的素材被拉到语音目标后，听到的全是底噪。

**为什么**
(a) **LUFS 与 true peak 是两件事。** 达标的是平均响度，不代表峰值没爆——`check.py` 两样都测（`check.py:229-238`，true peak 行判据 `lm["tp"] <= spec["tp"] + 0.05`）。
(b) **−40 LUFS 及以下不是内容，是房间底噪、风声或者干脆是静音**（`gotchas.md:75-77`，`check.py:236` 的提示文案写的就是 `leave ambience/near-silence (<= -40 LUFS) alone and say so`）。把它抬 25 dB，抬起来的是噪声，不是内容。`loudness.py` 自己的 `--tp` 默认 −1.0、`-I` 默认 −14.0（`loudness.py:50-51`），并且有真峰超限后的重编码循环（`loudness.py:129-143`）。

**不要加语音门。** `loudnorm` 的 EBU R128 integrated loudness 已经内置 −70 LUFS 绝对门与 −10 LU 相对门，会丢掉 `silencedetect` 同样会丢的那些安静块。上游在**每一个 fixture**（包括一个一半是数字静音的）上把"语音跨度门"与"整文件测量"做过对照：结果最多差 **0.6 LU**，落在 `check.py` 自己的 ±1 LU 容差里，代价是第二次完整解码。**这就是 `loudness.py` 没有 speech-gate flag 的原因**（`gotchas.md:80-86`）。

**正确做法**
检查 true peak，不只看 LUFS。环境音/近静音保持原电平并**明确说出来**，然后提供音乐或旁白作为替代方案。

**具体命令**

```bash
python3 <skill-dir>/scripts/check.py clip.mp4 --platform youtube      # loudness + true peak 两行
python3 <skill-dir>/scripts/loudness.py talk.wav -I -14 --tp -1 -o talk_norm.wav
# 环境音：不动，报告 "measured -43 LUFS, room tone; not raised"
```

---

## 四、文字与画幅

### 4.1 字幕、字体与文字顺序

**症状**
(a) 字幕烧在裁切/缩放**之前**，结果落在画外或被切掉；
(b) 字幕先按中间尺寸烧好，`export.py` 再放大，字发虚；
(c) Windows 上 drawtext 直接崩。

**为什么**
(a) 画幅一变，字幕的位置和尺寸就不再对应。**先改帧，后上字**（`SKILL.md:20`：`Frame changes before captions, so text is sized for the final frame`）。
(b) 一个 1280×720 的源 fit 到 9:16 只有 406×720，`export.py` 再把它放大到 1080×1920——字是从小图放大的，必然软。
(c) 部分真实构建上 Windows drawtext 按 family 名解析字体会崩（#100）；工具默认解析一个具体的 `--font-file` 来规避，但手工拼的 drawtext 调用会踩到（`gotchas.md:106-108,128-131`）。

**正确做法**
顺序：`fit.py --width 1080 --height 1920`（先到交付尺寸）→ `caption.py` → `export.py`。

自 1.12 起，cue 的长度与时序由 `caption.py` 处理（`gotchas.md:97-104`）：按实测宽度在所选 `--size` 下折到安全区；超过 `--max-lines`（默认 2，`caption.py:954`）的 cue 拆成连续 cue；短于 `--min-duration`（默认 1.0 s，`caption.py:964`）的 cue 被拉长，**但永不超过下一条 cue**；`--offset SECONDS` 整体平移（`caption.py:336-337`）。它会用一行 `cues:` 报告改了什么，并把调整后的副本写在输出旁边，**从不覆盖你传进去的文件**。折行需要输入视频（行宽来自真实帧尺寸）；只用 `--write-srt` 时只有时序类 flag 生效。

**具体命令**

```bash
python3 <skill-dir>/scripts/fit.py input.mp4 --width 1080 --height 1920 -o stage1.mp4
python3 <skill-dir>/scripts/caption.py stage1.mp4 --srt subs.srt --offset -0.4 --max-lines 2 --min-duration 1.2
python3 <skill-dir>/scripts/export.py staged.mp4 --preset reels
# Windows 崩了就显式指定：
python3 <skill-dir>/scripts/graphics.py in.mp4 --template title --text "Hi" --font-file "C:/Windows/Fonts/msyh.ttc"
```

---

### 4.2 按文种选字体

**症状**
视频里每个字都是一个空方框（tofu），而 ffmpeg **退出码是 0**——经典的"它成功了"失败。

**为什么**
libass 和 drawtext 对没有字形的字符各画一个空盒子，但进程照样正常退出。自 1.12 起，`caption.py`、`graphics.py` 和 `overlay.py --text` 会先检测待绘文字的**文种**（日、中、韩、阿拉伯、希伯来、天城文、孟加拉、泰米尔、泰、老挝、西里尔、希腊），再解析一个覆盖它的字体文件，并打印一行如 `font: /usr/share/fonts/.../wqy-zenhei.ttc (covers ko)`（`gotchas.md:110-117`）。

**没有覆盖该文种的字体是一个失败任务**（`kind: input`），不是 warning（`gotchas.md:117`）。

几条细则：

| 情形 | 行为 |
|---|---|
| 只有汉字（无假名、无谚文） | 会被读作中文；日文/韩文汉字文本需要 `--lang ja` / `--lang ko`（`caption.py --language` 同一 flag），或 brand.json 里的 `"lang"`（`gotchas.md:132-134`） |
| 显式 `--font` / `--font-file` / brand 文件里点名的字体 | **永远保留**，即使 fontconfig 说不覆盖该文种——只给一行说明，不静默替换（`gotchas.md:135-138`） |
| brand 文件从没点名字体 | 不算"选择"，脚本仍会自己挑（`gotchas.md:138`） |
| `--fonts-dir`（`caption.py`） | 只是**追加**搜索面，不关掉检查；目录里没有覆盖的，仍会照常解析一个覆盖字体并说明（`gotchas.md:139-141`） |
| 机器上没有 fontconfig | 是 **`unknown`，不是 `missing`**：任务按给定字体照跑并给一行 info；只有 fontconfig 明确回答"没有覆盖"才失败（`gotchas.md:142-145`） |
| RTL（阿拉伯/希伯来） | `caption.py` 全部经 libass 渲染，**天然正确**；drawtext 取决于构建有没有 `--enable-libfribidi`，本技能不检查（`gotchas.md:146-153`） |

**字形覆盖之外还有第二个问题：shaping（成形）。** 覆盖了文种的字体仍需要被重排/重组：天城文的元音符号要重排，泰文/老挝文的标记要重新聚类。drawtext 在有 fribidi 的构建上能做 bidi 和阿拉伯连写，但**在任何构建上都不做重排/重组**，因为它不用 harfbuzz；libass 会做。所以自 1.15 起，`graphics.py` 对 shaping 文种（`hi bn ta te kn ml gu pa si th lo km my`）自动走 libass 渲染，生成一个 `<output>_gfx.ass`，JSON 里 `text_renderer: "ass"`；`--text-render auto|ass|drawtext` 可覆盖，而 `--text-render drawtext` 配这类文种是**拒绝，不是画错一帧**。拉丁/CJK/阿拉伯输出不变。`overlay.py --text` 还没有 ASS 路线，遇 shaping 文种会拒绝并指向 `caption.py`/`graphics.py`（`gotchas.md:155-166`）。

**正确做法 / 命令**

```bash
python3 <skill-dir>/scripts/_contract.py doctor --json     # .fonts.scripts 逐文种 available/missing/unknown + 会用哪个文件
fc-list ":lang=ja" file family                            # fontconfig 里有什么（ja zh-cn ko ar he hi th ru el）
# 装字体：apt install fonts-noto-cjk fonts-noto-core
# brew install --cask font-noto-sans-cjk font-noto-sans-arabic
python3 <skill-dir>/scripts/caption.py in.mp4 --srt s.srt --lang ja
```

---

### 4.3 Emoji

**症状**
emoji 出来是单色轮廓、空框，或者整行渲染失败没有文件。

**为什么**
彩色 emoji 需要**要么**一个能画彩色字形的 libass，**要么**一个 PNG 目录——而多数构建上只有第二条路（`gotchas.md:168-170`）。

- **装了彩色 emoji 字体证明不了任何事。** Noto Color Emoji 在 Ubuntu 上装得很干净，发行版 ffmpeg 的 libass 照样渲染成单色轮廓（`Glyph 0x1F389 not found, broken font? Trying all charmaps`）。唯一诚实的测试是**真渲染一次**，`doctor` 做的就是这件事（`gotchas.md:172-176`）。
- **drawtext 根本加载不了 emoji 字体。** 不是渲染降级：CBDT/sbix 字体让滤镜初始化直接失败（`Could not set font size to 48 pixels: invalid library handle`；在字体自带 strike 下还有 `Monocromatic (1bpp) fonts are not supported.`），**不会写出任何文件**（`gotchas.md:179-183`）。
- **PNG 命名约定**：`--emoji-assets DIR`，文件名是按码点的小写十六进制、用 `-` 连接：`1f389.png`、`1f1ef-1f1f5.png`、`1f469-200d-1f4bb.png`（Twemoji/Noto 约定）。**本技能从不下载任何东西**：目录缺失是 `kind: input`，绝不是静默抓取。同一目录也可来自 brand.json 的 `styles.caption.emoji_assets` 或环境变量 `FFMPEG_SKILL_EMOJI_ASSETS`（`gotchas.md:184-190`）。
- **混合行是常态。** 文字留在 ASS 里，用一个不可见占位符**精确预留 emoji 的盒子**，PNG 在 `ass=` 滤镜之后合成上去——libass 的 shaping 和卡拉 OK 都保住，包括 `\kf` 段内（占位符是它自己的零时长片段）（`gotchas.md:191-195`）。
- **什么算 emoji。** 一个 cluster 只能从 emoji **基字符**开始。U+200D ZWJ 和 U+200C ZWNJ 是普通的印度/波斯正字法（`क्‍ष` = ka + virama + ZWJ + ssa），只在两个 emoji **之间**才当胶水；普通字母后面的 VS16 或肤色修饰符也不算 emoji。U+FE0E（VS15）要的是文字字形，所以 `❤︎` 是文本、`❤️` 是 emoji（`gotchas.md:196-200`）。
- **摆放容差是量过的。** 位置来自与折行同一张平均 em 表，所以行首/行尾的 emoji 精确，拉丁行中间的会累积前面字符的取整误差——在 1280 宽帧、24 px 字幕上实测 **17 px，0.28 em，约行宽的 3 %**，且总是落在预留的空隙里而不是压在字形上，也永不越出安全区。RTL 行（阿拉伯、希伯来）从右往左排版，所以位置是**从渲染后的行尾**量，不是逻辑前缀（`gotchas.md:201-208`）。
- **降级路径是诚实的。** `mode: mono` 表示 libass 画出文字字体有的那个字形（它有 fallback 链），退出 0，并在 `warning:` 行与 `notes` 里说明。`mode: none` 会把该 cluster 从绘制文字里剥掉（缺一个装饰不该让交付失败），但会**拒绝**一个文字内容**只有** emoji 的 `graphics.py` 模板——那一帧会是空白（`gotchas.md:209-218`）。
- `--animate` 也会带动 PNG：叠加层拿到匹配的 alpha 淡入淡出，emoji 随整行进出一致（`gotchas.md:219-220`）。

**具体命令**

```bash
python3 <skill-dir>/scripts/_contract.py doctor --json     # .fonts.emoji → mode: color|png|mono|none
python3 <skill-dir>/scripts/caption.py in.mp4 --srt s.srt --emoji-assets ./twemoji/72x72 --emoji-max 60
# 缺失即失败，不会去下载：
# --emoji png: no emoji assets directory resolved -- ...
```

---

### 4.4 重构图、帧率与时长

**症状**
(a) 16:9 转 9:16 用 `--fit crop`，宽画面两侧的人没了；
(b) 60 fps 降到 30 fps 后运动看着一顿一顿；
(c) "把它变成 60 秒"——3 分钟的讲话，成品没法看。

**为什么**
(a) **`--fit crop` 到 9:16 会丢掉约 70 % 的宽度**（16:9 在固定高度下宽度只剩约 31.6 %）。一个宽镜头会在边缘丢人。静默的中心裁切是**猜测，不是决定**（`gotchas.md:225-228`）。`fit.py` 的 `--crop-x`/`--crop-y` 默认 0.5（居中，`fit.py:94-95`）。
(b) 60 → 30 把运动采样减半：对讲话头没问题，对体育、游戏、无人机横摇**肉眼可见地卡**。平台允许就保 60。
(c) 靠变速把 3 分钟压成 60 秒是 3×，没法看；靠裁切则丢掉三分之二的词（`gotchas.md:233-235`）。`fit.py --method speed|trim` 是两种完全不同的答案。

**正确做法**
看联系表。填充（黑边）、朝主体方向的 `--crop-x/--crop-y`，或者真正的重构图，往往才是诚实的答案。时长问题要**问**是变速还是裁切，或者提议用 `scenes.py` 做一条精彩片段剪辑。

**具体命令**

```bash
python3 <skill-dir>/scripts/look.py input.mp4 --tiles 4x3          # 先看联系表
python3 <skill-dir>/scripts/fit.py input.mp4 --aspect 9:16 --fit pad            # 保全部画面
python3 <skill-dir>/scripts/fit.py input.mp4 --aspect 9:16 --fit crop --crop-x 1 # 明确保右侧主体
python3 <skill-dir>/scripts/fit.py input.mp4 --duration 60 --method trim        # 说清用哪种
python3 <skill-dir>/scripts/scenes.py long.mp4 --highlights 6 --target 60 --edl picks.txt
```

---

### 4.5 平台安全区

**症状**
文件每一行 `check.py` 都通过，但在 App 里字幕被描述栏压住，完全读不了。

**为什么**
每个竖屏 App 都会把自己的 UI 画在交付物上（`gotchas.md:238-244`）：

| 目的地 | top | bottom | left | right | 出处 |
|---|---|---|---|---|---|
| TikTok | 10 % | 22 % | 5 % | 14 % | `_platforms.py:68` |
| Reels | 8 % | 20 % | 5 % | 12 % | `_platforms.py:79` |
| Shorts | 6 % | 18 % | 5 % | 12 % | `_platforms.py:90` |
| YouTube / X / LinkedIn / Facebook / Broadcast | 5 %（统一 `_SAFE_5`） | 同 | 同 | 同 | `_platforms.py:49` |

竖屏的字幕默认 `size 0.0833`（≈288 网格下的 24）、`outline 2`、`animate "pop"`；横屏 `size 0.0694`、`animate "none"`（`_platforms.py:55-56`）。

这些比例只在**一张表**里（`scripts/_platforms.py`）。`caption.py --platform NAME`、`graphics.py --platform NAME`、`overlay.py --platform NAME` 都从它取边距，`render.py --template NAME` 把它传给三者，`look.py --safe tiktok` 把这些区域在帧或联系表上**涂出来**给你看。显式 `--margin` 永远优先（`gotchas.md:246-250`）。

**具体命令**

```bash
python3 <skill-dir>/scripts/look.py out.mp4 --safe tiktok --at 3
python3 <skill-dir>/scripts/caption.py in.mp4 --srt s.srt --platform tiktok
python3 <skill-dir>/scripts/render.py --template tiktok in.mp4
```

---

### 4.6 尺寸与旋转

**症状**
编码器报宽高不能被 2 整除；或者竖拍手机素材被算成了横的。

**为什么**
`yuv420p` 需要偶数宽高。手机素材常带一个 `rotation` 标签；`probe.py` 会报出来（`_common/probe.py:237-245,284`），`fit.py` 在算输出画幅时会考虑它（`fit.py:129`）。

**正确做法**
`fit.py` 和 `export.py` 会自动取偶。不要手工去掉那个取偶步骤。

**具体命令**

```bash
python3 <skill-dir>/scripts/probe.py clip.mov --json     # 看 rotation 与 width/height
python3 <skill-dir>/scripts/fit.py clip.mov --width 1080 --height 1920
```

---

## 五、规划

### 5.1 精彩片段

**症状**
`scenes.py --highlights` 选出来的"精彩片段"里，一个安静的、但其实是全场最重要的时刻（一句自白、一个在静默里落地的包袱）被跳过；而纯观众噪声或撞麦反而排到前面。

**为什么**
默认 `--rank-by audio` 按**响度**排：它排的是"最响的场景"，不是"最好的部分"。`--rank-by duration` 换成长度，也只是另一把尺子。脚本自己的文档写明：`--rank-by, not a classifier: nothing here decides what is speech`（`scenes.py:93`），候选范围是**提案，不是判决**（`scenes.py:112-114,244-270`）。

**正确做法**
把 `--highlights` 的结果当作候选，**在把选择定下来之前看联系表**（`--sheet`）。

**具体命令**

```bash
python3 <skill-dir>/scripts/scenes.py event.mp4 --highlights 5 --target 60 --sheet
python3 <skill-dir>/scripts/scenes.py talk.mp4 --highlights 5 --rank-by duration
python3 <skill-dir>/scripts/cut.py input.mp4 --segments 0-1:00,1:30-2:00
```

---

### 5.2 串联与速度

**症状**
一个交付需求被手工串成三次重编码，每一步都是一个独立的临时文件；想改一个数字要重跑整条链。

**为什么**
每次重编码都是又一次有损 + 又一次等待（重编码用 x264 `medium`，`_common/runner.py:141`）。手工链没有单一事实来源，改一个参数就全部重来。

**正确做法**
**三步及以上就用一个 `render.py` 项目**：计划是一个文件，用户改一个数字就行。长文件的中间产物加 `--preset veryfast`，最终导出保持默认（`gotchas.md:268-270`）。

**具体命令**

```bash
python3 <skill-dir>/scripts/render.py project.json
python3 <skill-dir>/scripts/render.py --template reels in.mp4
# 中间步骤预览：
python3 <skill-dir>/scripts/fit.py in.mp4 --duration 60 --fast
```

---

## 六、纯音频

### 6.1 纯音频文件是一等输入

**症状**
有人以为音频要"先包成视频"才能处理。

**为什么**
不需要。`probe.py`、`cut.py`、`silence.py`、`loudness.py`、`audio.py`、`sync.py` 和 `check.py --platform podcast` 都接受 WAV、FLAC、MP3、M4A/AAC、OGG 和 Opus（任何 ffmpeg 能读的容器），并写出与输出扩展名匹配的编码，所以同一条命令把 `talk.mp4` 换成 `talk.wav` 就能用（`gotchas.md:272-278`）。

会变的地方：

| 项 | 行为 | 出处 |
|---|---|---|
| 输出格式由扩展名决定 | `-o out.mp3` 转码、`-o out.wav` 保 PCM、`-o out.m4a` 写 AAC；`audio.py in.wav -o out.mp3` 无其它 flag 就是纯转换 | `gotchas.md:280-282` |
| `cut.py` 也流拷贝音频 | 切点落在 packet 边界（`precision: packet`，几 ms，JSON 报 `duration_error_ms`）；`--accurate` 才样本精确：输出是 PCM/FLAC 时 `precision: sample`，有损编码再成帧时 `codec_frame`。`.wav` 输出**永远是 PCM**，绝不是 WAV 里装 AAC | `gotchas.md:283-287` |
| `join.py` 纯音频拼接 | 按音频拼（`acrossfade` 或硬接），统一到一个采样率与声道布局；输出必须有音频扩展名。**视频和音频片段不能混在一次 join 里** | `gotchas.md:288-290` |
| 视频输入 + 音频扩展名 | `audio.py talk.mp4 -o talk.wav`、`cut.py talk.mp4 --start 1:00 --end 2:00 -o part.wav` 都是**抽音频**，输出没有视频流；多轨用 `audio.py --audio-stream N`（`probe` 在 `audio_streams` 下列出） | `gotchas.md:291-294` |
| 报告 | `Look: not needed`；`Check:` 对响度仍然适用 | `gotchas.md:295-296` |
| 需要画面的脚本 | `fit` `caption` `overlay` `graphics` `color` `export` `scenes` `look` 对音频文件以 `input has no video stream` **拒绝**。如实说出来，不要硬套一个视频壳 | `gotchas.md:297-299` |

### 6.2 纯音频配方表

| 用户说（音频文件） | 做什么 |
|---|---|
| "把这个 WAV 归一到 −14 LUFS"、"播客电平" | `loudness.py talk.wav -I -14 --tp -1 -o talk_norm.wav`（播客用 `-I -16 --tp -1.5`） |
| "把这段录音里的静音去掉" | `silence.py talk.wav -o talk_tight.wav` |
| "清一下这个 M4A 的噪声" | `audio.py talk.m4a --voice -o talk_clean.m4a`（人声）或 `--denoise` |
| "把这个 WAV 转成 MP3" | `audio.py talk.wav -o talk.mp3` |
| "从 00:30 剪到 02:00" | `cut.py talk.wav --start 0:30 --end 2:00 -o talk_cut.wav`（样本精确加 `--accurate`） |
| "把这些录音接起来"、"片头 + 正片 + 片尾" | `join.py intro.wav episode.m4a outro.wav -o full.flac`（硬接加 `--transition none`） |
| "把视频里的音频抽出来" | `audio.py talk.mp4 -o talk.wav`（顺带清一下：`--voice -o talk.m4a`） |
| "压缩 / 限幅 / 门限人声" | `audio.py talk.wav --compress --comp-threshold -20 --comp-ratio 4 --limit --limit-ceiling -1 -o talk_dyn.wav` |
| "这个够 Apple Podcasts 的响度吗" | `check.py talk.m4a --platform podcast` |

（来源：`gotchas.md:301-314`；`loudness.py:50-51` 的 `-I` / `--tp` 默认值。）

---

## 七、本技能明确不做的判断

`SKILL.md:41-55` 把边界写死了：**它执行一次剪辑，它不决定一次剪辑。** 逐条说明归属：

| 不做的判断 | 归属谁 | 本技能给出的东西 |
|---|---|---|
| **哪个剪辑是对的、成片能否过审** | 用户或制作代理 | `check.py` 的 PASS/WARN/FAIL 行、`cut.py` 的时长误差——**测量与报告**，是否上线由人决定（`SKILL.md:45`） |
| **什么算精彩** | 用户/剪辑判断 | `scenes.py --highlights` 按可测代理（音频能量、时长）排序，是**候选，不是判决**（`SKILL.md:46`） |
| **缩略图或封面的构图** | 设计决策 | 无——这是设计决策，不是测量（`SKILL.md:47`） |
| **视频讲的是什么** | 调用代理 | 没有视觉理解，只有 `look.py` 的联系表供调用方自己看（`SKILL.md:48`） |
| **什么好看** | 决定参数的调色/调色技能 | "应用这个 LUT"、"曝光校正 +0.3 档"是机械的；"把这个场景调出电影感"属于先决定参数、再回来调 `color.py` 的调色技能（`SKILL.md:49`） |
| **字幕里的字** | 用户 | cue 文字**照写烧录**。放不下就缩小字号、`--max-lines`，或用户自己改；**绝不改写、缩写或意译**，即使被要求"让它放得下"——如实说明并给出 `--max-lines 1` + 更小字号（`SKILL.md:50`） |
| **未被指明的被摄主体 / 区域** | 调用代理（从 `look.py` 联系表看） | "裁到 x=200,y=0"在框已知时是机械的；"裁到让说话人留在画面里"需要先判断**什么**是说话人（`SKILL.md:51`） |

判定线（`SKILL.md:53`）：**同一输入 + 同一组显式参数，永远产出同一个可验证结果**——这属于本技能；任何取决于品味、理解、或者"看起来/听起来好不好"的，属于做那个判断的人。

另外一条硬规则（`SKILL.md:55`）：如果某个需求要用到 42 个脚本都没暴露的 FFmpeg 能力，**如实说明并给出最接近的内建选项**——绝不要猜一条裸 `ffmpeg`/`ffprobe` 命令来替代。它绕开了本技能做出的每一条保证，所以**脚本的 flag 不够用时不构成降级到裸命令的理由**。

---

## 八、最常见的 8 个误用

### 1. 直接手写 ffmpeg 命令绕过脚本

**为什么错**：绕开的是整条保证链——输出不覆盖输入（`_common/runner.py:368,535,548`）、输出锁与 staging（`_OutputLock` `_common/runner.py:458`；`_stage_existing_output` `:598`）、超时（`DEFAULT_TIMEOUT = 1800.0`，`_common/runner.py:65`）、信号处理（`_common/runner.py:286`）、失败时的 partial 清理（`_common/runner.py:323`）、产物探针复核、`--json` 文档、BT.709 打标版本分支（`_common/color.py:12-29`）、滤镜图注入防护（`_common/color.py:58-69`）。
**正确**：脚本的 flag 不够用就**说出来**，并给出最接近的内建选项（`SKILL.md:55`）。

### 2. 用 `-c copy` 切 VFR 源

**为什么错**：VFR 上按时间戳落刀的流拷贝不可靠，结果会从冻结帧或错误帧开始（`gotchas.md:42-44`）。`cut.py` 检测到 VFR 会自行切到 `--accurate`。
**正确**：尊重自动重编码；需要固定帧率先 `fit.py --fps 30|60`（`_common/probe.py:235`）。

### 3. 先烧字幕，再裁切

**为什么错**：画幅一变，字幕的位置和尺寸就都不对应了；先按小尺寸烧再放大还会发虚（`gotchas.md:90-95`）。
**正确**：`fit.py --width 1080 --height 1920` → `caption.py` → `export.py`（`SKILL.md:20`）。

### 4. 把环境音（≤ −40 LUFS）拉到语音目标

**为什么错**：−40 LUFS 及以下不是内容，是房间底噪、风声或静音；抬 25 dB 抬的是噪声（`gotchas.md:75-77`，`check.py:236`）。
**正确**：保持原电平、**明确说出来**，然后提供音乐或旁白作为替代。也别加语音门——`loudnorm` 的内建门已经做了同样的事，上游实测最多差 0.6 LU，代价是第二次完整解码（`gotchas.md:80-86`）。

### 5. 把 `--fit crop` 的 70 % 宽度损失当成 bug

**为什么错**：16:9 → 9:16 在固定高度下只能保留约 31.6 % 的宽度，这是几何事实，不是实现缺陷。静默的中心裁切是**猜测**（`gotchas.md:225-228`）。
**正确**：先看联系表；用 pad（黑边）、朝主体的 `--crop-x`/`--crop-y`，或真正的重构图。

### 6. 在没测量节拍时声称"卡点"

**为什么错**：`cut.py --snap beats` 依赖 `scenes.py --beats --json` 产出的**实测**节拍网格；只有 `confidence >= 0.5` 才 `usable`，而**会改动文件的工具只允许吸附到 `supported_beats`**（真正有 onset 支撑的子集）（`_common/decision.py` 的 `beat_grid`/`snap_points`；`cut.py:159-195` 的 `_grid_from_source()` 与 `cut.py:249` 的 `snap_points()`；报错文案直接指向 `scenes.py ... --beats --json`）。
**正确**：先测量，把网格文件用 `--snap-source` 带过来，再切：

```bash
python3 <skill-dir>/scripts/scenes.py track.mp4 --beats --json > beats.json
python3 <skill-dir>/scripts/cut.py input.mp4 --segments ... --snap beats --snap-source beats.json
```

### 7. 用 4 行字幕堆叠来躲开字号缩小

**为什么错**：这是**改内容**来绕开排版约束。字幕的字不属于本技能（`SKILL.md:50`）；`--max-lines` 默认就是 2（`caption.py:954`）。
**正确**：放不下就缩小 `--size`、显式设 `--max-lines`，或者让用户自己改文字——**绝不重写**。

### 8. 把 `look.py` 的联系表当成"AI 看懂了画面"

**为什么错**：`look.py` 产出 PNG，是给**调用方眼睛**看的；本技能没有超越联系表的视觉能力，也不会解释它（`SKILL.md:48`）。
**正确**：报告写成 `Look: PATH`；没有视觉能力时写 `Look: PATH (pixels not inspected; agent has no image view)`，**绝不在没看图的情况下声称看过**，也不要为不存在的能力卡住（`SKILL.md:27`）。`look.py --ink` 给的是**墨迹覆盖率测量**（`measure_ink(..., margin_frac=0.03, threshold=28)`，`look.py:58`），也是测量，不是理解。

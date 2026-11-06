# 06 · 字幕排版与图文合成

覆盖 `caption.py` `overlay.py` `graphics.py`，以及 `_common/fonts.py` `emoji.py` `drawtext.py` `wrap.py` `text.py` 与 `scripts/_ass_overlay.py`。

**本域第一条红线**：**字幕文字是不可变输入。** 任何工具都不会重写、缩短、改写措辞或翻译字幕文本。
放不下就缩字号、限行数，或让用户自己改。

---

## 一、`caption.py` —— 字幕

### 1.1 输入来源

| 来源 | 用法 |
|---|---|
| SRT 文件 | `--srt subs.srt` |
| ASS 文件 | 同上 |
| 带时间的纯文本 | `--text cues.txt`（构建 SRT） |
| 本地转写 | `--transcribe`（需要本地 whisper 引擎；没有就拒绝并列出安装方式） |

**没有文本来源时**：有本地引擎就转，否则**要用户提供文本或时间轴文件**。**绝不编造台词。**

### 1.2 烧录 vs 封装

| 模式 | 效果 |
|---|---|
| 默认（burn） | 字幕烧进画面 |
| `--mode mux` | 封装成**可切换**的字幕轨 |

多语言：重复 `--srt file:lang`。两条轨用 `.mp4`（mov_text）就够；**超过两条建议用 `.mkv`**。
配套 `--track-title`、`--default-track`。

### 1.3 样式

字体、字号、颜色、描边、位置都可指定。
`--platform NAME` 会让字幕按该目的地的**左右安全区**排版——烧进画面的 ASS 也会把这个安全边距写成自己的侧边距。

### 1.4 动画与卡拉OK

| flag | 效果 |
|---|---|
| `--animate fade` | 淡入淡出 |
| `--animate pop` | 逐字弹出 |
| `--animate slide` | 滑入 |
| `--karaoke` | 卡拉OK高亮：按**语音能量**或**真实词时间戳**驱动 |

动画与卡拉OK都通过 ASS override 实现（精确的 override 值写在工具里，不需要调用方构造）。
逐词模式每个词一条 Dialogue，高亮词放大到 112%，`WrapStyle: 2`。

### 1.5 断行策略

`--wrap phrase|measured`，**默认 `phrase`**。

短语感知断行会在**已经放得下**的断点之间做选择，惩罚以下几类断点：

- 在词内部断
- 在连字符的错误一侧断
- 留下孤立的数字、假名或标点对
- 不在日语句末或助词后断（优先句末与助词）
- 以冠词或介词结尾

**关键性质**：这些惩罚只作用于"已经放得下"的候选，所以**不会加宽任何一行，也不会改变行数**。
`--wrap measured` 恢复纯宽度断行。

泰语片段与片假名词**永不从内部断开**（泰语词内不写空格，也没有词典——断点只能落在空格或显式分隔符处）。
一行宽于安全宽度会被报为 `overlong` 并给出修复方式。

### 1.6 字号自适应（本域最重要的机制）

`--fit-size auto|on|off`（默认 `auto`）

**工作方式**：在**排版之前**把字号往下走，直到每一句都放得下 `--max-lines`。

| 参数 | 默认 |
|---|---|
| `--max-lines` | 2（竖屏模板） |
| `--min-size` | 13 ASS 单位（≈ 帧高的 4.5%） |
| `--min-duration` | 1.0 s |
| `--offset` | 整体时间偏移 |

**为什么需要它**：在平台字幕尺寸下，一行大约只放得下六个字宽（em），一个普通句子需要四行。
如果硬套两行，句子会被切成连续的两条 cue——后半句姗姗来迟。

**关键规则**：
- **显式指定的 `--size` 或 `brand.json` 里的字号是"关于外观的陈述"，永不被覆盖**
- 交付模板路径会把平台表里的字号标记为"默认值"（项目里写 `"fit_size": "on"`），所以字号会缩、句子不会被拆
- `--fit-size off` 逐字节恢复旧行为
- **任何情况下都不改写字幕文字来让它放得下**

### 1.7 报文字段

| 字段 | 含义 |
|---|---|
| `caption text unchanged` | 字幕被**原样**烧入，一个字没动 |
| `broken_inside_word` | 有多少个词在边缘被切开（在字号下限仍放不下时，会在边缘切并优先在连字符处切——这是自动的，且**从不改写文字**） |
| `split` | 有多少条 cue 被拆成多条 |
| `tracks` | 有几条字幕轨、哪些语言 |
| `emoji.mode` | `color` / `png` / `mono` / `none` |

---

## 二、`overlay.py` —— 叠加

| 能力 | flag |
|---|---|
| 图片 / logo / 水印 | `--image logo.png` |
| 文字 | `--text "Title"` |
| 品牌 logo | `--logo` |
| 画中画 | `--video webcam.mp4` |
| 绿幕抠像 | `--chromakey 0x00ff00`（`-similarity` 默认 0.15、`-blend` 默认 0.05） |

### 2.1 位置

9 种命名位置（四角、四边中点、居中）。默认边距 `--margin 24`。

**`--platform NAME` 时，四条边各取各的安全边距**（因为平台的 UI 覆盖是不对称的——竖屏平台底部盖得最多、右侧次之）。
**显式给的 `--margin` 优先于平台表。**

### 2.2 时间与外观

| flag | 作用 |
|---|---|
| `--start` / `--end` | 时间窗 |
| `--fade 0.4` | 淡入；**淡出只在给了 `--end` 时才加** |
| `--opacity` | 不透明度（`colorchannelmixer=aa=<opacity>`） |
| `--scale` / `--scale-percent` | 缩放 |

---

## 三、`graphics.py` —— 动效模板

9 个模板：

| 模板 | 用途 |
|---|---|
| `lower-third` | 下三分之一（人名条） |
| `title` | 标题卡 |
| `chapter` | 章节标签 |
| `progress` | 进度条 |
| `countdown` | 倒计时 |
| `bug` | 角落台标 |
| `sticker` | 社交贴纸 |
| `hook` | 开场钩子卡 |
| `meme` | 梗图字幕（上下两行） |

### 3.1 参数

| flag | 默认 | 作用 |
|---|---|---|
| `--template` | 必填 | 模板名 |
| `--brand brand.json` | — | 品牌套件（品牌色 / 字体 / logo） |
| `--name` / `--title` / `--text` / `--top` / `--bottom` / `--subtitle` | — | 内容 |
| `--duration` | 3.0 s | 时长 |
| `--from` | 5 s | 起始时间 |
| `--start` / `--end` | — | 显式时间窗 |
| `--position` / `--margin` | — / — | 位置 |
| `--platform` | — | 安全区 |
| `--primary` / `--text-color` / `--font` / `--font-file` / `--lang` | — | 外观与字体 |
| `--scale` | — | 整体缩放 |
| `--wrap` | `phrase` | 断行策略（同字幕） |
| `--text-render auto\|ass\|drawtext` | `auto` | 渲染器 |
| `--write-ass PATH` | — | 额外产出 ASS 文件 |

---

## 四、渲染器分工：drawtext vs libass

这是本域最容易踩的坑。

| 渲染器 | 能力 | 限制 |
|---|---|---|
| 基础文字绘制滤镜（drawtext） | 快、无外部依赖 | **从不重排 matra、不重新聚类记号**；不能加载彩色 emoji 字体 |
| libass（`ass` 滤镜） | 正确排版需要重排/重聚类的文种 | 需要构建带 libass |

### 4.1 需要重排的文种必须走 libass

`_common/drawtext.py` 维护两份表：

- `SHAPING_SCRIPTS` —— 需要 shaping 的 13 个文种（印度语系、泰语、老挝语等）
- `BIDI_SCRIPTS` —— 双向文字（`ar`、`he`）

`graphics.py` 遇到这类文种会**自动切到 libass 路线**（`text_renderer: "ass"`），几何不变、只换渲染器。
`--text-render drawtext` 遇到这类文种**会被拒绝，而不是渲染错误**。

双向文字在支持 fribidi 的构建上本来就是对的。

### 4.2 `_ass_overlay.py`

私有的 ASS 渲染器，输出 v4.00+ 格式（含 `[V4+ Styles]` 与 `[Events]`），`utf-8-sig`。

**安全措施**：`ass_escape()` 把 `{` 转成 `\{`、`}` 转成 `\}`。
原因是 ASS 用花括号标记 override 指令——**调用方文本里的花括号如果不转义，就等于让用户文本注入渲染指令**。
这是防护，不是 bug。

---

## 五、emoji

### 5.1 机制

| flag | 值 |
|---|---|
| `--emoji` | `auto` / `color` / `png` / `mono` / `none` |
| `--emoji-assets DIR` | PNG 资产目录 |
| `--emoji-max` | 默认 60 |

资产按**码点命名**（Twemoji / Noto 风格，如 `1f389.png`）。

### 5.2 为什么需要 PNG 资产

基础文字绘制滤镜**根本不能加载彩色 emoji 字体**；而"系统装了彩色 emoji 字体"也**不证明 libass 会把它画成彩色**。
所以彩色 emoji 靠**逐字形合成 PNG**。

### 5.3 降级是显式的

- 有资产 → 彩色合成
- 没有资产 → **任务仍然成功**，但明确报 `mode: mono`
- **从不下载任何东西**（不联网、不抓取 emoji 字体或图片）

### 5.4 ASS 路线的宽度占位

`_ass_overlay.py` 用 `\fsp`（字距）保留精确的 emoji 宽度，而不是插一个替代字符。
原因是实测发现替代字符（如 U+2588）在不同字体下宽度是 0.66–0.83 em，**不精确**，会让 emoji 位置错位。

---

## 六、字体与文种

### 6.1 按文种自动选字体

`_common/fonts.py` 维护：

| 常量 | 内容 |
|---|---|
| `SCRIPTS` | 13 个文种 |
| `PREFERRED_FAMILIES` | 每文种的首选字族 |
| `WINDOWS_FONTS` | Windows 上的候选 |

主要函数：`char_script`（单字符判文种）、`detect_script`（整段判文种）、`font_for_script`、`script_font_for_text`。

### 6.2 无覆盖字体 = 失败

**找不到覆盖该文种的字体时，任务以 `kind: input` 失败**，而不是渲染成豆腐块（tofu）。
这是刻意的：**豆腐块是失败的作业**，不是可以交付的结果。

### 6.3 消歧与覆盖

| 场景 | 处理 |
|---|---|
| 纯汉字文本（可能是中文也可能是日文） | `--lang ja\|ko` 显式消歧 |
| 用户显式给了 `--font` / `--font-file` | **永远保留**，不做自动替换 |

### 6.4 先问机器能渲染什么

`doctor --json` 的 `fonts.scripts` 给出 `ja`/`zh`/`ko`/`ar`/`he`/`hi`/`th`/`ru`/`el` 各一态与将使用的文件路径。
`fonts.emoji` 给出 emoji 支持模式。

**在任务开始前就确认，而不是做完发现是豆腐块。**

---

## 七、断行代价模型

`_common/wrap.py`：

| 名称 | 作用 |
|---|---|
| `wrap_text` | 按模式断行 |
| `wrap_variants` | 生成候选断法 |
| `fit_size` | 在排版前把字号走到放得下 |
| `text_width_em` | 文本宽度（em） |
| `line_em_for_size` | 给定字号下一行能放多少 em |
| `ass_units_local` | ASS 单位换算 |
| `PENALTY_*` | 各类断点的惩罚值 |
| `JA_NO_LINE_START` / `JA_NO_LINE_END` | 日文行首/行尾禁则 |
| `WRAP_MODES` | `("phrase", "measured")` |

---

## 八、安全区与 ASS 网格

### 8.1 ASS 网格

| 常量 | 值 |
|---|---|
| `ASS_SCRIPT_HEIGHT` | **288** |
| `ass_units(f)` | `round(f * 288)` |

### 8.2 字幕默认值

| 画幅 | 字号 | 描边 | 动画 |
|---|---|---|---|
| 竖屏 | `size 0.0833`（≈ 288 网格下的 24） | 2 | `pop` |
| 横屏 | `size 0.0694` | 2 | `none` |

### 8.3 平台安全区比例（UI 覆盖帧的比例）

| 目的地 | top | bottom | left | right |
|---|---|---|---|---|
| TikTok | 0.10 | **0.22** | 0.05 | **0.14** |
| Reels | 0.08 | **0.20** | 0.05 | **0.12** |
| Shorts | 0.06 | **0.18** | 0.05 | **0.12** |
| YouTube / X / LinkedIn / Facebook / 广播 | 5% | 5% | 5% | 5% |

`safe_margins_px()` = `round(fraction * 宽/高)`，取整像素。

**竖屏平台的底部与右侧盖得最多**——这是为什么字幕不能简单居中，也是为什么模板会把文字放在描述栏上方、点赞列左侧。

### 8.4 用遮罩看安全区

`look.py --safe tiktok` 会把被覆盖的区域画出来（上下 `red@0.35`、左右 `red@0.20`）供人目检。

---

## 九、硬阈值速查

| 项 | 值 | 出处 |
|---|---|---|
| ASS 网格高度 | 288 | `scripts/_platforms.py` |
| 竖屏字幕默认字号 / 描边 / 动画 | 0.0833 / 2 / pop | `scripts/_platforms.py` |
| 横屏字幕默认字号 / 动画 | 0.0694 / none | `scripts/_platforms.py` |
| 字号可读性下限 | 帧高的 4.5%（13 ASS 单位） | `scripts/caption.py` |
| 默认最大行数（竖屏模板） | 2 | `templates/` |
| 默认最短时长 | 1.0 s | `scripts/caption.py` |
| 逐词高亮放大倍数 | 112% | `scripts/caption.py` |
| emoji 数量上限 | 60 | `scripts/caption.py` |
| 绿幕抠像默认相似度 / 混合 | 0.15 / 0.05 | `scripts/overlay.py` |
| 叠加默认边距 | 24 px | `scripts/overlay.py` |
| 动效模板默认时长 / 起始 | 3.0 s / 5 s | `scripts/graphics.py` |
| 需要 shaping 的文种数 | 13 | `_common/drawtext.py` |
| 双向文字 | ar, he | `_common/drawtext.py` |
| 文种表规模 | 13 | `_common/fonts.py` |
| emoji 哨兵字符 | U+E000 | `scripts/_ass_overlay.py` |
| 墨迹测量 margin / threshold | 0.03 / 28 | `scripts/look.py` |

---

## 十、本域红线

1. **字幕文字不可变。** 不重写、不缩短、不改写措辞、不翻译。太长了缩字号 / 限行数 / 让用户改
2. **画幅先定再排字。** 先烧字再裁切会让文字落画外；先烧小字再放大等于把字弄糊
3. **帧率变化先做。** 字幕按秒计时，帧率换了节奏就错
4. **放不下不改文字。** 用字号自适应在排版前解决，不要在文字上动手
5. **没有覆盖字体就失败。** 豆腐块是失败的作业，不是可以交付的结果
6. **没有 emoji 资产就报单色。** 不要静默接受，也不要下载任何东西
7. **需要重排的文种必须走 libass。** 用基础渲染器硬画会得到错误字形，工具会拒绝这种组合
8. **竖屏安全区是不对称的。** 底部和右侧盖得最多，不要按四边等距处理
9. **封面构图不属于本域。** "该放什么标题、封面怎么设计"是设计决策，不是测量

# 01 · 全景

本册回答三个问题：**这 42 个工具是怎么分类的**、**一次任务的主工作流长什么样**、**哪些规则贯穿全库**。
具体阈值与滤镜串不在这里，去对应分册。

---

## 一、这个技能是什么

把 FFmpeg 封装成**给 AI 编码代理用的结构化工具集**：

- **42 个公开工具**，全部是 `python3 <skill-dir>/scripts/<name>.py` 形式的 CLI，带类型化参数
- **一份机器可读契约**（`contract --json`），逐工具声明入参 schema、角色、所需 FFmpeg 组件、验证策略
- **一个 MCP 服务器**，本身不含工具表，`tools/list` 从契约派生
- **一个能力探测命令**（`doctor`），回答"这台机器能跑哪些工具"

设计取向是**把猜测拿掉**：

| 常见失败 | 本技能的对策 |
|---|---|
| 假设帧率 / 选了容器装不下的编码器 | 一切从 `probe.py` 的实测数字出发 |
| 明明只需 stream copy 却整段重编码 | 无损优先，只有必须时才重编码 |
| 报"完成了"但从没打开过结果 | 执行后必须探针复核；画面变了还必须看联系表 |
| 让调用方拼 shell 字符串 | 每个操作是一个脚本 + 类型化参数；不接受调用方传滤镜图 |

**它不做什么**：不决定哪个剪辑是对的、不判断成片能否过审、不评判什么算精彩、不设计封面构图、不理解视频讲的是什么、不评判什么好看、不改写字幕文字、不替调用方挑未被指明的被摄主体。这条边界是硬设计（详见 `11-gotchas.md` 末节）。

---

## 二、42 个工具的分类

按**角色**分四类（契约里的 `role` 字段）：

| role | 含义 | 工具 |
|---|---|---|
| `analysis` | 读媒体、报测量，不写媒体 | `probe` `scenes` `cropdetect` |
| `analysis_and_execution` | 默认测量，带某 flag 时可写产物 | `silence` `loudness` `sync` `multicam` `stabilize` `report` `check` |
| `execution` | 从输入写出新媒体产物，输入永不被改 | 其余大部分 |
| `verification` | 检查或展示产物，不写媒体 | `look` `verify` |

按**功能域**分（本知识库的分册口径）：

### 2.1 探查与测量（4 个）
`probe` `scenes` `cropdetect` `look`
→ 分册 `02-analysis.md`

### 2.2 剪辑与构图（14 个）
`cut` `join` `fit` `crop` `pad` `freeze` `reverse` `loop` `speedramp` `insert` `sequence` `background` `grid` `broll`
→ 分册 `03-picture-editing.md`

### 2.3 色彩与修复（7 个）
`color` `deinterlace` `denoise` `stabilize` `straighten` `redact` `sphere`
→ 分册 `04-colour-restoration.md`

### 2.4 音频与同步（6 个）
`audio` `loudness` `silence` `sync` `multicam` `waveform`
→ 分册 `05-audio-sync.md`

### 2.5 字幕与图文（3 个）
`caption` `overlay` `graphics`
→ 分册 `06-caption-typography.md`

### 2.6 交付与合规（5 个）
`export` `check` `proxy` `report` `metadata`
→ 分册 `07-delivery-compliance.md`

### 2.7 编排与批处理（3 个）
`render` `batch` `verify`
→ 分册 `08-orchestration.md`

> 4 + 14 + 7 + 6 + 3 + 5 + 3 = 42。**没有重复归属，也没有遗漏。**

### 2.8 不是工具，但属于对外表面

| 组件 | 作用 |
|---|---|
| `scripts/_contract.py` | 契约生成器；`contract --json` 与 `doctor` 的入口 |
| `scripts/_platforms.py` | 11 个交付目的地的单一规格表，被 `check`/`export`/`render`/`caption`/`graphics`/`look` 共读 |
| `scripts/_ass_overlay.py` | 私有 ASS 渲染器，给需要 shaping 的文种走 libass |
| `mcp/server.py` | MCP 传输层（stdio JSON-RPC），工具表从契约派生 |
| `bin/install.js` | npm 安装器，把技能装进各代理的 skills 目录 |

---

## 三、主工作流（按顺序）

这是 `SKILL.md` 交给代理的固定流程。**顺序本身是知识**，不要重排。

### 步骤 0 · 环境，只在失败时
不要一上手就 `doctor`。机器坏了会以 `kind: missing_tool` 或一条点名滤镜/编码器的 ffmpeg 错误失败。
**在那种失败之后**，或用户问"这台机器能做什么"时，才跑 `contract --json doctor`，读 `ok` / `usable`。

### 步骤 1 · 探测你打算据以规划的东西
对每个要据以规划的输入跑 `probe.py`。它给：时长、帧率（含可变帧率嫌疑）、分辨率、编解码器、声道、色彩标签、HDR 形态、每条音频流。
**不要每个编辑动作前都探一次**——每个写工具的 `--json` 自带输入信息与输出探针。
**从真实数字规划，绝不从假设规划。**

### 步骤 2 · 优先无损
能在不重编码的前提下满足需求（关键帧上的纯切割、remux、只改音频）就不要重编码。
`cut.py` 与 `loudness.py` 默认对视频流做 stream copy；`cut.py --accurate` 只在需要帧精确时用。

### 步骤 3 · 先规划再执行
用 `--dry-run --json` 规划。**任何计划里的数字都要信 `--json`，不要信 dry-run 的摘要行**（那里的尺寸可能是占位符）。
长编码前用它；汇报事实时用它。
`--fast` 是预览质量；`--progress` 在 stderr 打百分比与 ETA。
**不要把 `-o` 指向本次任务没有创建过的文件**，除非用户明确要求替换；那时才传 `--overwrite`。

### 步骤 4 · 按合理顺序串联
- 纯粹"交付到某平台、没有别的编辑"= 一次模板运行（`render.py --template NAME INPUT`），不要手工搭链
- 否则顺序是：**色彩（HDR→SDR / LUT）→ 切割 → 拼接 → 静音处理 → 画幅 → 字幕/叠加 → 同步 → 音频 → 响度 → 导出**
- **画面尺寸变化在字幕之前**，这样文字是按最终画幅排版的
- 尽量少重编码：中间产物用 CRF 18，`export.py` 放最后
- **三步及以上 → 用 `render.py` 的项目文件**

### 步骤 5 · 检查交付物
汇报前跑 `check.py OUTPUT --platform X`（模板运行已经自带）。
行分两类：
- **`format` 行**（编解码器、像素格式、尺寸、真峰值、色彩标签、VFR）→ 安全，可以修
- **`judgement` 行**（时长、宽高比、帧率、响度）→ **会改内容**：时长意味着丢素材，宽高比意味着丢边缘，帧率意味着丢运动，响度可能抬高环境音 → **只在需求蕴含答案时才改，否则把选择和代价说出来**
- WARN 要提及，**不要追着消**

### 步骤 6 · 验证输出
用写工具的 `--json`/`--json-brief` 探针或 `probe.py` 确认时长、分辨率、帧率、音频符合需求，并**报出这些数字**。
一步只有在"脚本退出码 0 **且** 输出探针符合预期"时才算完成。
非零退出、文件缺失或为空、探针与需求矛盾 = 失败，并且要**引用脚本的错误消息原文**。

### 步骤 7 · 保留用户的原始文件
绝不覆盖源文件；新文件写在输入旁边或用户指定的位置。已存在的输出路径默认被拒绝（`kind: input`）。

### 步骤 8 · 看一眼画面
只要画面变了（字幕、叠加、图形、裁切/加边、缩放、色彩、转场、拼接时把片段缩放到首片段的画幅、`color --to-sdr`），就跑
`look.py OUTPUT --tiles 3x2`（或 `--at T` 看单帧）并**查看那张 PNG**。
**没在报告里点名那张 PNG 就不算完成**——探针看不出字幕压在脸上。
纯音频任务写 `Look: not needed`。

看什么，分两类：
- **机械项（本技能自己负责验证并报告）**：指定文字/logo 在指定位置、字幕出现在指定时间戳、尺寸是偶数。`fit.py --fit pad` 产生的信箱黑边是**该模式的正确结果**，不是缺陷
- **判断项（报告它，不要静默通过或失败）**：主体或人脸是否被切掉、文字是否压在脸上、颜色是否发灰、转场是否落到位。这些需要判断主体"是什么"，是调用方的事——用一行说你看到了什么，由他们判

没有视觉能力时，写 `Look: PATH (pixels not inspected; agent has no image view)` —— **绝不在没看的情况下声称看过**，也不要因为"没有这个能力"就卡住。

---

## 四、共享 flag（每个脚本都有）

| flag | 语义 |
|---|---|
| `--dry-run` | 写工具什么都不跑；**测量工具仍可能跑 ffmpeg/ffprobe**（跳过产物与副产物：`--edl`、`--sheet`、生成的 `.ass`）；`verify` 忽略该 flag |
| `--json` | 结构化结果：输出路径、输出的探针、跑过的命令 |
| `--json-brief` | 同一份文档裁剪到调用方会行动的部分：status / output / verified + 紧凑 `summary`；体积约为 `--json` 的三分之一 |
| `--fast` | 预览质量 |
| `--progress` | stderr 打百分比与 ETA |
| `--timeout SECONDS` | 默认 1800，`0` = 不限；超限归类 `kind: timeout` |
| `--overwrite` | 显式同意替换已存在的输出 |
| `--plan FILE` | 把 dry run 存成计划，`render.py FILE` 之后执行；输入变了会拒绝 |

重编码类工具另有 `--codec h264|hevc|av1|prores` 与 `--quality N`。
未指定时：SDR 走 x264，HDR 走 x265 Main10。
`prores` 要求 `-o NAME.mov`；`h264` 遇 HDR 直接拒绝（先 `color.py --to-sdr`）。

**时间语法**：`--start`/`--end`/`--at`/`--from`/`--duration`/`--offset` 以及 cue 与章节文件里的时间，
都接受秒、`mm:ss(.fff)`、`hh:mm:ss(.fff)`，或带 `@fps` 的 SMPTE `hh:mm:ss:ff@29.97`。
长度类 flag（`--min-silence`、`--margin`、`--fade`）是纯秒数。

---

## 五、音频是一等输入

WAV / FLAC / MP3 / M4A(AAC) / OGG / Opus 走 `probe`、`cut`、`join`、`silence`、`loudness`、`audio`、`sync`、`check --platform podcast`，命令与视频相同。
**输出扩展名决定编解码器**：`-o out.wav` 写 PCM，`-o out.flac` 写 FLAC，`-o out.mp3` 写 MP3，`-o out.m4a` 写 AAC。

需要画面的工具（`fit`、`caption`、`overlay`、`graphics`、`color`、`export`、`scenes`、`look`）遇到音频输入会以
`input has no video stream` 拒绝——**不要强行套一个视频壳**。

---

## 六、三层事实来源优先级

冲突时按此顺序裁决：

1. **代码** —— `scripts/*.py` 的 argparse 定义与滤镜串构造。契约的 `input_schema` 就是从这些 parser 在运行时派生的
2. **契约输出** —— `contract --json` / `doctor --json`。从代码派生，所以比文档新；但 `TOOL_META` 里那部分（角色、能力、验证策略）是手写的**声明**，仍需回代码核对
3. **文档** —— `SKILL.md`、`README.md`、`docs/`、`references/`。它们是被测试盯着的复述，可能滞后

**特例**：`docs/design-decisions.md` 记录的是**有意为之的行为**。遇到"看着像 bug"的现象，先读它再判断。

**反例警告**：不要用文档推翻代码。

---

## 七、全库红线

1. **不手写裸 ffmpeg 命令绕过脚本**——那会绕过参数校验、输出保护、探针复核、错误分类这四层保证。脚本没暴露的能力，就说没有，并指出最接近的内置选项
2. **不从文件名推断媒体属性**——一切从 `probe.py` 实测出发
3. **不声称没做过的事**——没跑 `check` 就不说合规，没跑 `look` 就不说看过画面
4. **不把判断伪装成测量**——测量给数字；"哪个剪辑对""能否过审""什么算精彩"交给人
5. **不使用 shell**——全部 argv 列表；除"命名脚本 + ffmpeg + ffprobe"外不执行任何东西
6. **报告格式固定五行**：`Done:` / `Steps:` / `Check:` / `Look:` / `Notes:`（失败用 `Failed:`）。标签保持英文，内容跟随用户语言
7. **数字只能来自 `--json` 或实测**，不能来自记忆或估算

---

## 八、跨模块数据契约红线

破了这些，单工具仍能跑通，但整条链会给出错误结果：

| 顺序约束 | 原因 |
|---|---|
| 色彩 → 剪辑 | HDR→SDR / LUT 是逐帧操作，先做可少编码一遍，也避免在错误色彩空间判断曝光 |
| 剪辑 → 画幅 → 字幕 | 字幕按最终画幅排版；先烧字再裁切会让文字落画外；先烧小字再放大 = 字糊 |
| 帧率变化 → 字幕 | 字幕按秒计时，帧率换了节奏就错 |
| 音频处理 → 最后、导出之前 | 响度标准化要看到最终时长 |

| 不可变约定 | 内容 |
|---|---|
| 字幕文字 | 任何工具都不重写、缩短、改写措辞或翻译字幕文本 |
| 输入文件 | `mutates_input` 恒为 `false`；已存在的输出默认被拒绝 |
| 测量工具 | 只报告，不裁决（`--highlights` 是候选，`--motion-centre` 是质心） |
| 能力缺失 | 显式失败并给修复提示，不静默降级 |

---

## 九、怎么读一次任务

拿到需求先分诊：

1. **是单一动作还是多步？** 单一动作 → 直接找对应脚本；多步（≥3）→ `render.py` 项目文件
2. **有目的地吗？** 有（YouTube/Reels/TikTok/播客…）→ 目的地一次性决定了画幅、时长上限、响度、编码器，直接走模板
3. **需要改画面吗？** 改画面就必须在最后跑 `look.py`
4. **输入是音频还是视频？** 音频走音频路径，别套视频壳
5. **有不可逆判断吗？** 裁切会丢边缘、变速/裁剪二选一会得到不同答案、响度会抬高环境音——这些要在动手前说清代价

分诊完再进分册查具体 flag。

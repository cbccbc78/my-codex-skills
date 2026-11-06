# 09 · 契约与工具集成

本册覆盖**运行时的集成表面**：机器可读契约怎么生成、MCP 服务器怎么暴露工具、`doctor` 探测什么、
错误怎么分类、安装器装到哪里。**不覆盖**怎么用这些工具剪片子（那是 02–08 册）。

---

## 一、核心设计：契约从 CLI 派生

这套工具集最重要的一条工程决定：**工具的入参 schema 从不手写**。

```
脚本的 argparse parser
        │  _capture_parser() 替换 ArgumentParser.parse_args 抛 _Captured，
        │  导入脚本并调 main()，截获那个已经构建好的 parser 对象
        ▼
   input_schema()        ← properties / types / enums / defaults / required / positional / mutually_exclusive
        ▼
   tool_spec()           ← 叠加手写的 TOOL_META（role / capabilities / verify / idempotency …）
        ▼
   build()               ← 契约 JSON 文档
        ├──► contract --json
        └──► mcp_input_schema() → MCP tools/list
```

**为什么重要**：给脚本的 argparse 加一个 flag，`input_schema` 与 MCP 工具定义**自动跟着变**，
不需要第二处编辑。而一个落后于代码的文档页或 `TOOL_META` 条目会让 CI 失败，而不是静默漂移。

**边界**：只有 `input_schema` 是 parser 派生的。`ToolSpec` 的其余部分（`role`、`capabilities`、
`inputs`、`outputs`、`output_schema`）来自手写的 `TOOL_META` 表 —— 因为这些事实不是 parser 能表达的。

**失败模式**：`scripts/<name>.py` 是公开脚本（不以 `_` 开头）但 `TOOL_META` 里没有条目时，
`tool_spec()` 直接 `raise RuntimeError` —— **大声失败，不猜**。

---

## 二、契约文档的顶层结构

`contract --json` 的顶层键：

| 键 | 内容 |
|---|---|
| `contract_version` | **契约自身的版本**，当前 `"1.0"`。只在文档**形状**变化时改，与技能版本独立，便于消费方钉住形状并单独读版本做溯源 |
| `skill` | 技能标识、版本（读自 `package.json`）、描述，以及 `not_provided` —— 明确声明不做什么（不做 AI 推理/决策、不生产计划、不联网） |
| `requirements` | Python ≥ 3.9 且**仅标准库**；FFmpeg ≥ 5.0；Node ≥ 16 且**仅安装器需要** |
| `execution` | 无 shell、不执行任意可执行文件、argv 列表、无网络、不改输入 |
| `invocation` | 结构化参数 → argv 的映射规则，以及 raw `argv` 兼容分支 |
| `roles` | 四种角色的定义 |
| `idempotency_hints` | 四种幂等提示 |
| `verification_policy` | `probe_first` / `verify_last` / `visual` / `check_rows` |
| `json_output` | 成功形状、失败形状、`error_kinds` 枚举、成功判据 |
| `capabilities` | 本机能力探测结果（`--static` 时省略） |
| `tools` | **42 个 ToolSpec** |
| `provides` | 每工具一个能力 id：`ffmpeg-skill.<tool>`（`lifecycle: EXPERIMENTAL`） |
| `capability_map` | 7 个**抽象业务能力** id → 工具 + 固定参数（见下） |
| `deprecated` / `removed` | 弃用与已移除清单 |

### 2.1 每个 ToolSpec 的字段

| 字段 | 含义 |
|---|---|
| `id` | `ffmpeg-skill/<name>` |
| `name` / `version` / `description` | 工具名、技能版本、一句话描述 |
| `executable` | 调用方式（脚本路径形态） |
| `examples` | 从 `SKILL.md` 的 "User says / Do" 表解析出来的示例 |
| `role` | `analysis` / `analysis_and_execution` / `execution` / `verification` |
| `capabilities` | `{required: [...], optional: [{capability, when}, ...]}` |
| `inputs` / `outputs` | 人读的输入输出说明 |
| `input_schema` | **parser 派生**：properties / types / enums / defaults / required / positional / additionalProperties:false / mutually_exclusive / one_of_required |
| `output_schema` | `--json` 会打出什么：基础键 + 该工具特有的键 |
| `supports_dry_run` / `supports_json` / `supports_json_brief` | **由测试实测得出，不是声明** |
| `dry_run` | `{supported, ffmpeg_execution: full\|analysis_only\|none, semantics, note}` |
| `mutates_input` | **恒为 `false`** |
| `produces_artifact` | 是否产出媒体文件 |
| `verification` | `{required, tools}` —— 事后该跑哪些工具复核（`probe` / `check` / `look`） |
| `reencodes_video` / `reencodes_audio` / `reencode_note` | 每项取 `always`/`never`/`conditional` + 说明。**依据脚本实际的 encode/copy 参数判定，不是依据 role** |
| `requires_visual_verification` | 画面变了，必须看联系表 |
| `audio_only` / `video_required` | 是否接受纯音频输入 / 是否必须有画面 |
| `deterministic_inputs` | 输入确定性 |
| `idempotency_hint` | `bit_exact` / `content_equivalent` / `cached` / `environment_dependent` |
| `mcp` | `{tool, positional, argument_exceptions}` |

### 2.2 `input_schema` 里每个属性的字段

| 字段 | 含义 |
|---|---|
| `type` | `boolean` / `array` / `integer` / `number` / `string` |
| `description` | 说明；`%(default)s` 已被插值替换 |
| `enum` | 允许值 |
| `default` | 默认值 |
| `cli` | 该参数在 CLI 上的拼写，或字面量 `"positional"` |
| `common` | 是否是 9 个共享 flag 之一 |

### 2.3 抽象能力映射

`capability_map` 是一张**手写的多对一表**，让规划代理不必先知道工具名就能解析意图。
它故意只包含**无需判断即可解析**的能力：

| 能力 id | 解析到 |
|---|---|
| `video.trim` | `cut` |
| `video.reframe` | `fit` **且固定 `fit=crop`**（裸 `fit` 还能变速和加边，所以必须钉参数） |
| `audio.loudness` | `loudness` |
| `subtitle.burn` | `caption` |
| `media.stream.inspect` | `probe` |
| `media.frames.extract` | `look` |
| `media.proxy` | `proxy` |

**故意不提供**例如 `video.highlight` —— `scenes --highlights` 是按测量代理排序的候选，不是理解内容后的裁决，
所以不作为"规划代理可以盲目委派"的能力。

构建时会校验：固定参数必须真实存在于该工具的 `input_schema.properties` 里，否则 `RuntimeError`（漂移就是漂移，不是可以静默发布的笔误）。

---

## 三、能力命名空间

```
ffmpeg | ffprobe
encoder:<name>          ← 来自 ffmpeg -encoders
filter:<name>           ← 来自 ffmpeg -filters
bsf:<name>              ← 来自 ffmpeg -bsfs
external:whisper        ← 本地 whisper 引擎
```

`--codec` 会把编码器能力**动态加进 optional**：

| flag | 追加的能力 | 说明 |
|---|---|---|
| `--codec hevc` | `encoder:libx265` | |
| `--codec av1` | `encoder:libsvtav1` | `libaom-av1` 是回退 |
| `--codec prores` | `encoder:prores_ks` | |

去重规则：同一工具已因别的条件列了同一个能力时，**扩展 `when` 而不是新增条目**。

---

## 四、`doctor` 探测项清单

`doctor` 读 `ffmpeg -encoders` / `-filters` / `-bsfs` / `-version`，把契约声明的每个能力解析到本机。

| 探测项 | 命令 | 判定 |
|---|---|---|
| `ffmpeg` / `ffprobe` | `which` | available / missing |
| `encoder:<name>` | `ffmpeg -hide_banner -encoders` | 按行解析 |
| `filter:<name>` | `ffmpeg -hide_banner -filters` | **按 io-spec token（`A->A`）识别**，不按列宽 |
| `bsf:<name>` | `ffmpeg -hide_banner -bsfs` | 单 token 行 |
| `filter:drawtext` | **真实渲染一帧**：`ffmpeg -f lavfi -i color=c=black:s=64x64:d=1 -vf drawtext=fontfile=<默认字体>:text=x -frames:v 1 -f null -`，再跑一次不带 `fontfile` 的裸 `drawtext` | 干净退出 → available；崩溃（负码或 ≥ 0x80000000）→ missing；裸渲染崩而带 `fontfile` 成功 → available + `note` |
| `external:whisper` | `which(whisper-cli\|whisper-cpp\|whisper)` 或 `find_spec(faster_whisper\|whisper)` | 任一命中即 available |
| 默认字体族 | `fc-match --format=%{family}` | 解析结果 == 请求名才算 available（fontconfig 会静默替换，drawtext 仍然 exit 0） |
| 每文种字体 | `fc-list` 按 `FC_LANG` 查询 | available（给出文件路径）/ missing / unknown |
| emoji | `emoji_support(probe=...)` | **真实渲染探测**，不是"字体存在"。结果 `color` / `png` / `mono` / `none` |
| 版本 | `ffmpeg -version` / `ffprobe -version` | 取首个 token |
| GPU 编码器 | 从 `-encoders` 按后缀 `_nvenc` / `_videotoolbox` / `_qsv` / `_vaapi` / `_amf` 过滤 | **只证明这个 build 编译进去了，不证明本机 GPU/驱动能接受任务** |
| python | `sys.version_info` | 报告 |

### 4.1 三态模型与退出码

每个能力三态：**`available` / `missing` / `unknown`**。

`unknown` 的来源是列表**跑了但没解析出行**（`unparsed`）或**非零退出**（`failed`）。
它**既不折进 missing 也不折进 available** —— 这是刻意的：把"没解析出来"读成"没装"会让一台好机器报成残废。

| 退出码 | 含义 |
|---|---|
| `0` | `ok`：所有 required 能力都 available |
| `1` | 有 required 能力 missing |
| `2` | 没有证明缺失，但有 required 能力 unknown |

`ok` 的判据：**无 required missing 且无 required unknown**。

### 4.2 `doctor --json` 的返回结构

```
version / python / ffmpeg / ffprobe
available / missing / missing_optional / unknown
detection / errors / notes
ok
tools      ← 每工具 {usable: yes|no|unknown, missing: [...], fix: "..."}
gpu_encoders
fonts      ← 默认 drawtext 家族 + fonts.scripts 每文种一态 + fonts.emoji
```

**两个信号必须分开读**：

- `ok` = "**每个工具都需要的**东西没缺"
- 某工具自己的 `usable: "no"` = "这个工具在这台机器上跑不了"

一个 Homebrew 的普通 `ffmpeg` 可以 `ok` 为真，而 `caption` 的 `usable` 是 `"no"`（缺 `subtitles` 滤镜）。
**不要只看 `ok`。**

`fonts.scripts` 给出 `ja`/`zh`/`ko`/`ar`/`he`/`hi`/`th`/`ru`/`el` 各一态与将使用的文件 ——
"这台机器能不能渲染韩语字幕"在任务开始前就有答案，而不是之后。

`--static` 跳过全部环境探测。

### 4.3 探测结果如何影响运行时行为

`doctor` 本身**只报告**。真正的运行时分支在别处：

| 位置 | 分支 |
|---|---|
| `decision.py` | `--codec av1` 无可用编码器 → `die(kind=missing_tool)`；`prores` 无 `prores_ks` 同理 |
| `runner.ffmpeg_encoders()` | 编码器可用性查询 |
| `decision.bt709_tag_args` / `drawtext_boxborderw` / `drawtext_center_align` | **按 ffmpeg 版本切换拼写**（这三处） |
| 字体能力 | 绘制工具选具体字体文件；找不到就**拒绝**，不静默渲染豆腐块 |
| whisper 能力 | 决定 `--transcribe` 的拒绝文案（列出三种安装） |

### 4.4 FFmpeg 列表解析的版本陷阱

FFmpeg **8 缩短了 `-filters` 的 flag 列**。锚定旧列宽的 parser 在 FFmpeg 8 上什么都匹配不到，
而"什么都没匹配到"如果被读成"什么都没装"，就会在 macOS 和 Windows 上把所有滤镜报成缺失。

现在的做法：**按行的 io-spec token（`A->A`、`AA->A`、`|->V`、`N->N`）识别**，
于是 flag 列宽、图例、分隔线都不影响；仍然读不出来的列表返回 `unknown` 而不是 `missing`。

| FFmpeg | flag 列形态 |
|---|---|
| 5.1.1 | 三个字符，与 6.x 相同 |
| 6.1.1 | 三个字符：`..C acompressor A->A` |
| 7.1.x | 与 6.x 相同 |
| 8.1.2 | **两个字符**：`TS aap AA->A`，三字符图例，`------` 分隔线 |
| 9.0.1 | 与 8.x 相同，**CRLF** |

---

## 五、JSON 输出协议

### 5.1 成功文档

```json
{
  "status": "completed",
  "output": "…",
  "dry_run": false,
  "commands": ["…"],
  "probe": { … },
  "verified": true,
  "verification": [ {"step": "probe", "ok": true} ],
  "…tool_extra"
}
```

- 写文件前先 `verify_output()`：存在、非空、ffprobe 至少认出一个流；0 字节会被删掉并以 `kind: output` 失败
- `verified` = 非 dry-run **且** verification 非空 **且** 每步 ok。
  **规格类失败**（例如 export 的响度不达标）保持 `status: completed` 而 `verified: false` —— 文件是写出来了，但没过关
- `verification` = `probe` 步 + 工具自带的测量（响度、平台检查、check 阶段）

### 5.2 失败文档

```json
{
  "status": "failed",
  "exit_code": 1,
  "error": {"kind": "…", "message": "…", "code": "…", "retryable": false, "hint": "…"},
  "commands": ["…"]
}
```

stderr 同时给人读的消息与 hint。

### 5.3 七种错误种类

| kind | code | 触发 | 退出码 |
|---|---|---|---|
| `input` | `INPUT_INVALID` | 输入缺失/不合适/参数错误 | 1 |
| `missing_tool` | `DEPENDENCY_MISSING` | ffmpeg/ffprobe 不在 PATH | 127 |
| `ffmpeg` | `FFMPEG_EXECUTION_FAILED` | 子进程非零（原码在 `ffmpeg_returncode`） | 1 |
| `output` | `OUTPUT_INVALID` | ffmpeg exit 0 但产物不可用 | 1 |
| `timeout` | `TIMEOUT` | 超限 | 124 |
| `verification` | `VERIFICATION_FAILED` | 结果未过检查 | 1 |
| `interrupted` | `INTERRUPTED` | SIGINT / SIGTERM | 130 / 143 |

**`retryable` 恒为 `false`**。这是刻意的"宁缺毋滥"：不靠嗅探退出码或 stderr 去猜能不能重试。

### 5.4 `--json` vs `--json-brief`

`--json-brief` **蕴含** `--json`。同样的键、同样的语义，但：

| `--json` | `--json-brief` |
|---|---|
| `probe` 对象 | → `summary`（`duration_s` / `width` / `height` / `fps` / `vcodec` / `acodec` / `channels` / `lufs`；未知键省略，非有限 LUFS 不写） |
| `commands` 数组 | → 命令**条数** |
| `verification` 数组 | → 丢弃（保留 `verified` 布尔） |

体积约为三分之一。**失败文档两者完全相同**（`die()` 不裁剪）。

### 5.5 plan 文件

`--plan FILE` **蕴含 `--dry-run`**。写出：

```json
{
  "plan_version": 1,
  "created": "…",
  "tool": "…",
  "argv": ["…"],
  "cwd": "…",
  "inputs": [ {fingerprint…} ],
  "commands": ["…"],
  "output": "…",
  "verify": ["probe", "check"],
  "notes": "…"
}
```

原子写（tmp + replace）。`render.py FILE` 可重放它 —— **重放前会先重新指纹化输入**，输入变了就拒绝。

---

## 六、执行模型（`_common/runner.py`）

集成方需要知道的运行时保证：

### 6.1 超时

| 对象 | 默认 | 说明 |
|---|---|---|
| 媒体处理 ffmpeg 调用 | **1800 s** | 可用 `FFMPEG_SKILL_TIMEOUT` 环境变量或 `--timeout` 覆盖；`0` = 不限 |
| ffprobe | **120 s** | 固定 |
| `doctor` 的自身探测 | **10 s** | 这些是"应当很快"的检查；挂住时返回 `failed` 而不是永久冻结 |

超时 → kill → 删 partial → `die(kind=timeout, exit 124)`。

`child_limit() = per_call * 4 + 60` 是给"兄弟脚本 / MCP 派发"用的外层上限。

### 6.2 进度

`--progress` 时在 ffmpeg 后插 `-progress pipe:1 -nostats`；两个 reader 线程泵 stdout/stderr；
主循环用 `queue.get(timeout ≤ 0.5s)` 唤醒查时钟 —— **即使死锁且无任何输出也能超时**（这是修过一个真实 bug 的地方：
早期版本按"进度行到达"检查超时，死锁时永不触发）。

### 6.3 中断

仅主线程装 SIGINT/SIGTERM；记录活动子进程；收到信号 → terminate → 5 s → kill → 清理 partial → `die(kind=interrupted)`。

### 6.4 输出保护（多层）

| 层 | 作用 |
|---|---|
| `_check_no_overwrite_input` | realpath 比较输出与全部 `-i` |
| `refuse_output_is_input` | 工具级双胞胎检查 |
| `_check_output_path` | 目录 / 父目录 / 可写 |
| `_check_existing_output` / `refuse_existing_outputs` | **默认拒绝覆盖**；`--overwrite` 显式同意；dry-run 也会预测这个拒绝，并记录 `(size, mtime_ns)` 快照 |
| `_OutputLock` | `.<name>.ffskill-lock`，`O_EXCL` + pid；stale 判据是 pid 已死或超过 1 小时 |
| `_stage_existing_output` | 已存在时先写 `.<stem>.ffskill-<pid><ext>` 再 `os.replace` |
| `_cleanup_partial_output` | 只清 ffmpeg 产物；若 `STATE.preexisting` 快照未变则不动 |

**"失败时清理 partial" 曾经删掉过用户文件**，所以现在的方案是 staging temp + 成功才 replace。

### 6.5 命令构造与转义

- 全部 argv 列表，**绝无 shell**
- `ffmpeg_base()` = `[ffmpeg, -hide_banner, -loglevel error, -nostdin, -y|-n]` —— `-nostdin` 恒定，所以不会出现卡在 stdin 上的 ffmpeg
- `escape_filter_path()` 处理滤镜值的**双重解析**（filter 串会被解析两遍）：`:` → `\\:`、`'` → `\\\'`、`,;[]` 前置反斜杠、反斜杠统一成正斜杠
- `shell_quote()` **只用于展示与记录**，不用于执行

### 6.6 dry-run 语义

- 写工具的 ffmpeg 命令**只记录并返回假成功**，不执行
- ffprobe / 测量命令**照跑**（`run_analysis` 不受 dry-run 门控）
- 对"尚未生成的阶段输入"，跳过测量并记一条 note

### 6.7 两个自动重试

| 重试 | 触发 |
|---|---|
| `_odd_dimension_retry` | stderr 含 "not divisible by 2"、没有 `-filter_complex`、且不是 `-c:v copy` 时，在 `-vf` 前插 `scale=trunc(iw/2)*2:trunc(ih/2)*2` |
| `run_keeping_subtitles` | 先试 `-map 0:s? -map 0:d? -c:s copy -c:d copy`，失败则重试不带 |

`run_keeping_subtitles` 返回被丢弃的流清单，工具会把它上报为 `dropped_non_av_streams`。

---

## 七、MCP 服务器（`mcp/server.py`）

### 7.1 传输

stdio 逐行 JSON-RPC 2.0，**仅标准库**，协议版本 `2024-11-05`。
本文件**不含任何工具表** —— 启动时调 `_contract.build(detect=False)` 取全部 ToolSpec 并缓存。

### 7.2 方法

| 方法 | 行为 |
|---|---|
| `initialize` | 返回 protocolVersion / capabilities（`tools` + `prompts`）/ serverInfo / `instructions` |
| `tools/list` | 见下 |
| `tools/call` | 见下 |
| `prompts/list` | 5 个预置配方 |
| `prompts/get` | 填充模板并返回一条 user 消息 |
| `ping` | |

### 7.3 工具暴露策略

默认 `tools/list` **只列 12 个核心工具**（依据评测里的提示词命中统计）：
`render` `look` `caption` `export` `check` `fit` `cut` `audio` `loudness` `graphics` `silence` `probe`

理由：让客户端不必为 30 个很少直接调用的 schema 付上下文成本。

设置环境变量 `FFMPEG_SKILL_MCP_FULL` 为**非空且非 `"0"`** 时列出全部 42 个。

**关键**：无论列不列，**其余 30 个始终可以按名通过 `tools/call` 调用**。
而 `contract --json` **始终描述全部 42 个**。

### 7.4 参数映射（`build_argv`）

两种形态：

1. **结构化对象** —— 键 = argparse 的 dest；positional 按名先传；`True` → 该 flag；list → 重复该 flag；
   `argument_exceptions` 做改写（`output` → `-o`、`loudness.lufs` → `-I`，其余键与 `--key-with-dashes` 不符时取首个长选项）
2. **`{"argv": [...]}`** —— 原样 CLI 参数，其余键忽略（**兼容形态，标记为非规范**）

除 `look` 与 `probe` 两个豁免项外，服务器自动追加 `--json`。
`json` 与 `progress` **不出现在任何 `inputSchema` 里** —— 它们是传输层自己设置的 flag，不是工具参数。
仍然发送它们的客户端不会被拒绝。

### 7.5 调用与错误

- 调用走 `_common.run_tool([script] + argv, per_call=timeout)`
- stdout 是 JSON → 放进 `structuredContent`
- 失败 → `isError: true` + 文本（stderr 尾 12 行）+ **子进程的失败文档透传进 `structuredContent`** ——
  所以 MCP 调用方可以机器读 `kind` / `code`
- 未知工具 → `isError` 文本（**不是协议错误**）
- 方法不存在 → `-32601`；其他异常 → `-32000`
- **非 dict 的 JSON 行会被跳过**（防止一个 `int`/`bool` 触发 `TypeError` 杀掉整个 stdio 进程）
- 无 `id` 的通知被忽略

调试入口：`python3 mcp/server.py --list`、`python3 mcp/server.py --call probe '{"inputs": ["a.mp4"]}'`

### 7.6 五个 MCP prompts

`reel` / `podcast` / `multicam` / `delivery_check` / `hdr`

它们**不是新工具调用** —— 每个配方点名的命令行都是 `tools/call` 或 CLI 本来就能跑的。
返回的是一条文本消息，列出该跑哪些命令、之后该检查什么。

### 7.7 客户端配置

```json
{"mcpServers": {"ffmpeg-skill": {"command": "python3", "args": ["<skill-dir>/mcp/server.py"]}}}
```

**Windows 注意**：`python3` 只在从 Microsoft Store 装的 Python 下才在 PATH 上；
python.org 的安装暴露的是 `python`（或 `py` 启动器）。MCP 客户端报服务器启动失败时，把 `command` 改成 `python` 或 `where python` 给出的完整路径。

---

## 八、安装器（`bin/install.js`）

### 8.1 目标目录

| 命令 | 目标 |
|---|---|
| 安装器默认目标 | `~/.claude/skills/ffmpeg-skill` |
| `--cursor` | `~/.cursor/skills/ffmpeg-skill` |
| `--codex` | `~/.agents/skills/ffmpeg-skill`（Cursor 也读这个位置） |
| `--all` | 以上三者 |
| `--project` | `./.claude/skills/ffmpeg-skill` |
| `--dir DIR` | `DIR/ffmpeg-skill` |
| `--uninstall` | 从选定目标移除（`--codex` 同时清理旧位置 `~/.codex/skills/…`） |

### 8.2 载荷

`SKILL.md`、`scripts/`、`templates/`、`references/`、`docs/`、`mcp/`、`package.json`
（递归复制，跳过 `__pycache__`；`.py` 设为 0755）

### 8.3 原子升级

复制到 `<target>.tmp-<pid>` → 旧目录 rename 到 `<target>.bak-<pid>` → 新目录 rename 到位。
第二步失败则回滚旧目录；成功后删 bak。
**保证"升级可以失败，但绝不留下空目录"**（首次安装没有这个保证）。

### 8.4 子命令代理与依赖探测

`ffmpeg-skill contract|doctor [...]` 直接 spawn `scripts/_contract.py`。
Python 解释器候选：win32 上是 `python3, python, py`，其他平台是 `python3`。
找不到 → exit 127 并提示装 Python 3.9+。

安装后跑 `ffmpeg -version` 探测；缺失则打印平台安装建议。
**已安装的副本不会自动更新**，要重跑安装器刷新。

### 8.5 作为 Claude Code 插件

`claude plugin install <owner>/<repo>` 也可安装（不需要 Node），
命名空间是 `ffmpeg-skill:ffmpeg-skill`，清单在 `.claude-plugin/plugin.json`。

---

## 九、集成方常见问题

| 问题 | 答案 |
|---|---|
| 我只想拿到工具清单，不要探测环境 | `contract --json --static` |
| 我要把工具 schema 喂给另一个代理框架 | `contract --json` 的 `tools[].input_schema`，与 MCP 的 `inputSchema` 同源 |
| 我的 MCP 客户端上下文很紧张 | 保持默认（只列 12 个）；需要别的工具时直接按名 `tools/call` |
| 我需要在调用前知道这台机器能不能跑 | `doctor --json` 的 `tools.<name>.usable`，**不要只看 `ok`** |
| 我拿到失败要判断能不能重试 | `error.retryable` 恒为 `false`；按 `error.kind` + `error.hint` 决定改什么 |
| 我要在 CI 里用 | 全部工具是标准库 Python + argv 调用；`--json` 给机器读；无网络、无密钥 |
| 我要 pin 住契约形状 | 读 `contract_version`（当前 `1.0`），它与技能版本独立 |
| 我要看某个 flag 的完整语义 | 先 `--help`（最便宜的全量 flag 列表），再 `references/scripts.md` |

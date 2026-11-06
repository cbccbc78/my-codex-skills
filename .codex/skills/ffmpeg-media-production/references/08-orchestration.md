# 08 — 渲染编排与批处理

范围：`scripts/render.py`、`scripts/batch.py`、`scripts/verify.py`、`scripts/_common/timeline.py`、`scripts/_common/decision.py`。

一句话：三步以上的处理就该写成一个 `project.json` 交给 `render.py`；批量交给 `batch.py`；两条路径共用同一套决策层（`_common/decision.py`），它只做机械调度与测量，不替调用方决定"哪个剪辑对"。

---

## 1. `render.py`：声明式渲染

声明式编辑：把整个剪辑写进一个 `project.json`，一条命令渲染；改一个数字，重渲染。源文件永不被碰，中间产物在 work 目录（`render.py:1-4`）。

### 1.1 `STAGE_ORDER` 与阶段序列

```
clips → audiogram → join → silence → fit → captions → graphics → overlays → audio → loudness → export → chapters
```

定义在 `render.py:560-561`（元组），docstring 的等价叙述在 `render.py:36-37`。**最后跑 check**：`check` 不在 `STAGE_ORDER` 里，而是所有阶段之后单独执行（`render.py:1342-1361`）；check FAIL（或 check.py 跑不起来）→ exit 1，产物仍保留（`render.py:41-45, 1370-1376`）。

| 阶段 | 做什么 | 读哪些键 | 出处 |
|---|---|---|---|
| clips | 逐 clip 用 `cut.py --accurate` 剪切（有 in/out 才切）；`speed≠1` 时再经 `fit.py --duration` 变速 | `clips[].src/in/out/speed/snap`、项目级 `snap{to,tolerance,min_confidence,source}` | `render.py:1032-1075` |
| audiogram | 音频源先生成画面（调 `waveform.py`），之后的链路才有东西可处理 | `audiogram.{image,image_fit,style,position,vis_height,opacity,platform,title,color,background,width,height,fps}` | `render.py:1078-1097` |
| join | 多 clip 拼接，带 transition | `transition.{type,duration}`、`frame.{width,height,fps}` | `render.py:1103-1114` |
| silence | 去静音 / jump-cut | `silence.{threshold,min_silence,margin}` | `render.py:1119-1129` |
| fit | 时长与画幅适配 | `fit.{duration,method,aspect,fit,width,height,fps,smooth}` + `frame.{aspect,fit,width,height,fps}` 兜底 | `render.py:1134-1166` |
| captions | 烧录字幕 | `captions.{text,srt,ass,font,size,color,position,margin,animate,highlight_color,outline,karaoke,bold,box,lang,offset,max_lines,min_duration,fit_size,min_size,fit_size_scope}` | `render.py:1171-1195` |
| graphics | 逐个图形叠加（title / lower-third / hook / sticker 等） | `graphics[]` 全部 18 个键 | `render.py:1200-1214` |
| overlays | 逐个 logo / 图片 / 文字叠加 | `overlays[]` 全部 15 个键 | `render.py:1219-1241` |
| audio | 音乐床 / 替换 / 人声链 / duck / stems | `audio.*` 22 键 + `audio.stems.{dialogue,music,effects}` | `render.py:1246-1278` |
| loudness | 两遍 EBU R128 | `loudness.{lufs,tp}` | `render.py:1283-1294` |
| export | preset 导出（或直接 place 最终文件） | `export.{preset,fit,crf,normalize}` | `render.py:1299-1322` |
| chapters | 写章节元数据（流拷贝） | `chapters`（文件路径或 `[{at,title}]`） | `render.py:1324-1340` |
| check | 平台验收 | `check.{platform,content}` | `render.py:1342-1361` |

阶段是"有内容才跑"：某块的值为 `null` / `false` / `{}` 就跳过（`render.py:37-38`，`validate_project` 的 require_object 语义 `render.py:410-415`）。

---

## 2. `project.json` 完整 schema

顶层合法键（`OBJECT_KEYS["project"]`，`render.py:116-119`）：

```
output, frame, clips, transition, silence, brand, captions, graphics, overlays,
audio, loudness, fit, export, check, chapters, audiogram, template, snap
```

未知键**拒绝**并给 did-you-mean 建议（`check_keys()`，`render.py:396-407`）；`clips[]` 里的 `start`/`end` 会提示改成 `in`/`out`，`audio.stems` 里的 `voice`/`sfx`/`bed` 会提示 `dialogue`/`effects`/`music`，`chapters[]` 的 `start`/`time`/`name` 提示 `at`/`title`（`NEAR_KEYS`，`render.py:154-157`）。

### 2.1 逐块 schema

| 块 | 合法键 | 出处 |
|---|---|---|
| `clips[]` | `src`（必填）, `in`, `out`, `speed`, `snap` | `render.py:120` |
| `snap`（项目级或 clip 级） | `to`（`"beats"` / `"none"`）, `tolerance`, `min_confidence`, `source` | `render.py:121-122` |
| `frame` | `aspect`, `width`, `height`, `fps`, `fit` | `render.py:123` |
| `transition` | `type`, `duration` | `render.py:124` |
| `silence` | `threshold`, `min_silence`, `margin` | `render.py:125` |
| `audiogram` | `image`, `image_fit`, `style`, `position`, `vis_height`, `opacity`, `platform`, `title`, `color`, `background`, `width`, `height`, `fps` | `render.py:127-128` |
| `captions` | `text`, `srt`, `ass`, `font`, `size`, `color`, `position`, `margin`, `animate`, `highlight_color`, `outline`, `karaoke`, `bold`, `box`, `lang`, `offset`, `max_lines`, `min_duration`, `fit_size`, `min_size`, `fit_size_scope` | `render.py:131-134` |
| `graphics[]` | `template`, `name`, `title`, `subtitle`, `start`, `end`, `position`, `from`, `scale`, `primary`, `text_color`, `lang`, `text`, `top`, `bottom`, `duration`, `margin`, `platform` | `render.py:138-140` |
| `overlays[]` | `logo`, `image`, `text`, `position`, `start`, `end`, `fade`, `opacity`, `scale`, `font_size`, `font`, `font_file`, `margin`, `box`, `platform` | `render.py:141-142` |
| `audio` | `music`, `replace`, `music_volume`, `fade_in`, `fade_out`, `music_fade_out`, `gain`, `duck_amount`, `duck_threshold`, `duck_attack`, `duck_release`, `voice`, `denoise`, `duck`, `music_loop`, `stereo`, `mono`, `downmix`, `stereo_widen`, `effects`, `effects_volume`, `stems` | `render.py:143-146` |
| `audio.stems` | `dialogue`（→ `--gain`）, `music`（→ `--music-volume`）, `effects`（→ `--effects-volume`）；显式 flag 优先 | `render.py:147, 1254-1261` |
| `chapters` | 字符串=文件路径，或 `[{at, title}]` 列表 | `render.py:148, 452-459, 1330-1335` |
| `loudness` | `lufs`, `tp` | `render.py:149` |
| `fit` | `duration`, `method`, `aspect`, `fit`, `width`, `height`, `fps`, `smooth` | `render.py:150` |
| `export` | `preset`, `fit`, `crf`, `normalize` | `render.py:151` |
| `check` | `platform`, `content`（`true` 追加 check.py --content 的 black/frozen/silence 行） | `render.py:152` |

补充规则：

- `stems` 是"调音台词汇表"而非第二条代码路径：每个键映射到已存在的 flag；`effects` 或 `music` 的 stems 层级指向一个项目里不存在的文件 → die（`render.py:1249-1261`）。
- `export.normalize` 未写且 preset 在 `PLATFORM_OF` 且项目**没有** loudness 阶段时默认开启（一次导出即达标）；`"normalize": false` 显式关闭（`render.py:1307-1315`）。
- `frame` 只有 aspect 时，会从 export preset 补 width/height（避免字幕按 406x720 烧录再被 export 放大）（`render.py:757-777, 959-961`）。
- 项目带 `template` 键时，caption / graphics / overlay 阶段会收到该模板目的地的 `--platform`，用平台安全区（`render.py:963-968`）。

### 2.2 `--init` 生成的骨架

`render.py --init FILE` 把 `TEMPLATE` 字典按 `indent=2` 写出（`render.py:872-876`）。骨架内容（`render.py:94-110`）：

```json
{
  "output": "final.mp4",
  "frame": {"aspect": "16:9", "width": 1920, "fps": 30},
  "clips": [{"src": "REPLACE_ME.mp4", "in": "0:00", "out": "0:30"}],
  "transition": {"type": "fade", "duration": 0.5},
  "silence": null,
  "brand": null,
  "captions": null,
  "graphics": [],
  "overlays": [],
  "audio": null,
  "loudness": {"lufs": -14, "tp": -1},
  "fit": null,
  "export": {"preset": "youtube", "normalize": true},
  "chapters": null,
  "check": {"platform": "youtube"}
}
```

---

## 3. `--dry-run` / `--stop-after` / `--cache DIR` / `--from STAGE`

### 3.1 `--dry-run`

- 每个阶段命令照常构建、只记录不执行；子脚本收到转发的 `--dry-run`（`render.py:498-504, 526-528`）。
- 计划写出的中间文件不落盘；缓存**不写**（`cache_store()` 在 dry-run 直接 return，`render.py:661-665`）。
- dry-run 仍创建 work 目录（部分子步骤会往里写），退出时若目录是本进程独占的自动名则删除（`render.py:1363-1369`）。

### 3.2 `--stop-after STAGE`

- choices 只到 `export`：`clips|join|silence|fit|captions|graphics|overlays|audio|loudness|export`（`render.py:848`）——即最远可以停在导出前一步。
- 到点即 `emit(current, stages=stages_done)` 返回（如 `render.py:1099-1101`）。
- **未读到的 section 不做校验**：`validate_project` 按 `READ_AT` 表（`render.py:418-422`）过滤，`--stop-after fit` 的预览不会因后面 captions 写错而失败（`render.py:443-446`）。

### 3.3 `--cache DIR`（opt-in，无默认目录）

- 设计立场：缓存出现在磁盘上必须是"被要求的"；没有默认目录（`render.py:554-558`，参数 help `render.py:836-839`）。
- 缓存 key（`cache_key()`，`render.py:602-628`）= sha1 of：
  - `stage`、`tool`（脚本名）；
  - `args`：参数里凡存在为文件的项换成内容哈希，输出位替换为 `<out>`（`render.py:509-513, 620-623`）；
  - `inputs`：每个输入文件的 `file_key()` 哈希（name|size|mtime + 首尾 1MB，复用 batch.py 的 `file_key`，`render.py:574-580`）；
  - `child`：`child_args()`（含 `--fast`——不放进 key 会把草稿当交付缓存复用，`render.py:610-614`）；
  - `codec`、输出扩展名（`render.py:625`）；
  - **`ffmpeg` banner**：`ffprobe -version` 的整行首行，不是 major.minor——同一 7.1.x 的两个 build 产出不同字节，缓存还的是字节（`render.py:583-599`）；
  - **`skill` 版本**（读 `package.json`，`render.py:73-83`）与 **`contract` 版本**（`CONTRACT_VERSION`，`render.py:69, 626`）。
  - 结论：**跨 ffmpeg build / 技能版本 / 契约版本永不复用**（`render.py:605-608`）。
- 命中：把缓存件 hardlink（不行则 copy，绝不 move）到目标路径（`render.py:650-658`），并**仍然计入 `stages_done`**（"缓存命中也是发生过的一个阶段"，`render.py:501-503`）。
- dry-run 命中只记 `would_hit`，不落盘（`render.py:647-649`）。
- 报告：`cache_report` 含 dir / ffmpeg / hits / misses / saved_seconds / entries（dry-run 额外 would_hit）（`render.py:1378-1387`）。

### 3.4 `--from STAGE`

- 必须同时给 `--cache`，否则直接拒绝："without a cache there is no earlier artifact to start from"（`render.py:988-992`）。
- 更早阶段必须**命中缓存**，否则拒绝而不是悄悄重编：`_refuse_uncached_earlier_stage()`（`render.py:485-495`），由 `sh()` 在 miss 时调用（`render.py:523`）。
- 拒绝文案明确提醒："a different ffmpeg build or skill version never reuses one"（`render.py:494`）。
- 因此正确用法：先不带 `--from` 跑一次填缓存，再 `--from` 续跑。

---

## 4. `--template NAME INPUT` 与 `--template all`

- 语义：`render.py --template tiktok talk.mp4 …` 时**位置参数是素材，不是项目文件**（`render.py:881-885`）。
- 模板名接受别名解析（`resolve_platform`，`render.py:316-317`）；逗号分隔可列多个；去重保序（`expand_templates()`，`render.py:305-322`）。
- `--template all` = `PACK_DEFAULT = [tiktok, reels, shorts, youtube, x, linkedin, facebook]`（`render.py:300-302`）——播客（纯音频）与 youtube-shorts（shorts 的别名）不进视频包。
- 单模板：`template_project()` 填充占位符 → 立即渲染（`render.py:891-892`）。
- 多模板 / all：`render_pack()`（`render.py:325-393`）逐个目的地完整渲染一遍（各自 frame / captions / loudness / export / check），完成后写 `<stem>_pack.md`：
  - 表格列 `platform | file | size | duration | check`（`render.py:376-383`）；
  - `report.py --pack <stem>_pack.md` 可把这张表渲染成 HTML（`report.py:97-146`）；
  - 任一目的地失败 → 整个 pack `die(kind="verification")`，列出失败项（`render.py:388-390`）。
- `--list-templates`：打印模板名、frame、fit、时长上限、响度目标、安全区比例（`render.py:282-297, 869-871`）。
- `--write-project FILE`：只写填好的 project.json，不渲染；多模板时拒绝（"writes one project"）（`render.py:864, 888-890, 909-917`）。
- 模板输出默认名：`<input 同名>_<template>.<ext>`；pack 的文件写到 `-o` 的目录或输入旁（`render.py:274-279, 329-338`）。

---

## 5. `--export-timeline edit.fcpxml|.edl|.otio`

- **只导出，不渲染**（`render.py:780-827`）：`--export-timeline FILE` 走 `export_timeline()`，`FORMATS` 由后缀决定（`.edl`/`.fcpxml`/`.otio`）（`_common/timeline.py:33`）；未知后缀 → die，提示三种扩展名（`render.py:783-786`）。
- 仍会 probe 每个 clip（和音乐床），因为时间轴需要真实时长与帧率（`render.py:787-794`）——dry-run 也一样。
- **能带走的**（`_common/timeline.py:15-21`）：
  - clips：`src` + `in`/`out`（按源自己的时钟读，`hh:mm:ss:ff` 需源 fps 或 `@fps`）+ `speed`；
  - transition：相邻 clip 之间的 dissolve（时长 `d`；每侧 trim `d/2`，让编辑器里的 dissolve 居中于剪切点，总长与渲染一致）；
  - 音乐床：单独一条音频轨（`audio.music`）；
  - 章节：标记（markers；`[{at,title}]` 内联形式）。
- **留下的**（`not_exported`，逐条打印，绝不静默丢弃）（`_common/timeline.py:38-50`）：
  `silence`（静音切除）、`captions`、`graphics`、`overlays`、`fit`/reframe、`audiogram`、`loudness`、`export`、`check`、`brand`、`snap`（节拍吸附）；音频处理另有一行 `audio processing: …`，列出被丢弃的 audio 键（`_common/timeline.py:54-57, 231-234`）。
- 帧率不是整数时用 NTSC 精确比率（23.976→24000/1001 等，`_common/timeline.py:35-36, 64-71`）。
- 导出后校验文件能被读回（`parses()`，`_common/timeline.py:484-495`），`summary()` 给出 rate / duration / frames / clips / transition / music / markers / notes / not_exported（`_common/timeline.py:498-506`）。
- 给 Premiere / Resolve 的正确路径：`multicam.py --write-project` 先写出 render 项目，再 `render.py <project> --export-timeline edit.fcpxml`——不要在时间轴导出里期待 caption / 图形 / 静音切除被带过去。

---

## 6. `_common/timeline.py`：编辑器中立时间轴

以帧为单位的中立模型（"every time in frames at `rate`"，`_common/timeline.py:111-115`）。

| 名字 | 作用 | 出处 |
|---|---|---|
| `FORMATS` | 后缀 → 格式名（`.edl`/`.fcpxml`/`.otio`） | `timeline.py:33` |
| `build(proj, probes, rel)` | 项目 → 中立时间轴；所有时间换算成帧 | `timeline.py:111-238` |
| `to_edl(tl)` | CMX 3600，非丢帧、整数标称帧率，record 从 01:00:00:00 起；事件 reel=AX，`FROM CLIP NAME` / `SOURCE FILE` 注释可 relink；变速为 M2 行；dissolve 是标准的一对（零长 cut + D 事件） | `timeline.py:266-317` |
| `to_fcpxml(tl)` | FCPXML 1.10（Final Cut Pro 10.6+ / Resolve）：library/event/project，spine 上 asset-clips 与 cross dissolve，音乐床在 lane -1，章节为 chapter-marker；变速是线性 timeMap；异画幅 clip 写 `adjust-conform` | `timeline.py:333-419` |
| `to_otio(tl)` | OpenTimelineIO JSON：视频轨 clips + SMPTE_Dissolve，音乐轨，markers 挂在 stack；变速是 LinearTimeWarp | `timeline.py:431-478` |
| `WRITERS` | `{fmt: 写出函数}` | `timeline.py:481` |
| `parses(path, fmt)` | 写出的文件读回是否就是它声称的格式（校验步） | `timeline.py:484-495` |
| `summary(tl, fmt)` | `--json` 里读回的部分 | `timeline.py:498-506` |
| `exact_rate(fps)` | 常见 NTSC 比率 → 精确分数；否则 `limit_denominator(1001)` | `timeline.py:64-71` |
| `TimelineError` | 无法表达成时间轴的项目（对外 `kind: input`） | `timeline.py:60-61` |
| `_NOT_EXPORTED` / `_AUDIO_NOT_EXPORTED` / `_CONFORM` | 留下的清单与 conform 映射（pad→fit, crop→fill, blur→fit） | `timeline.py:38-57` |

序列画幅取 `frame` 按 fit.py 规则算出的尺寸；没有 frame 时用第一个 clip 自己的画面（`timeline.py:129-144`）。reframe 的表述按格式不同：FCPXML 用 `adjust-conform` 声明（只有 blur 的背景仍算缺失），EDL / OTIO 没有 conform 字段，留给编辑器默认（`timeline.py:241-255`）。

---

## 7. `batch.py`：recipe 批处理

### 7.1 两种 recipe 形态

```json
{
  "glob": "*.mp4",
  "output_dir": "out",
  "suffix": "_final",
  "ext": "mp4",
  "steps": [
    ["silence.py", "{in}", "--threshold", "-38", "-o", "{out}"],
    ["loudness.py", "{in}", "-o", "{out}"],
    ["export.py", "{in}", "--preset", "youtube", "-o", "{out}"]
  ]
}
```

或项目形态 `{"project": "project.json", "clip_key": 0}`（`batch.py:6-17`）。项目形态把 `clips[idx].src` 换成当前文件、`output` 换成最终路径，再调 `render.py`（`batch.py:146-159`）。步骤形态里 `{in}`/`{out}` 逐步替换，上一步输出喂下一步（`batch.py:161-182`）。

- 默认 `suffix="_out"`、`ext` 缺省用源文件自己的扩展名（防止 `clip.mp4` 与 `clip.mov` 撞名）（`batch.py:123-132`）。
- 中间件命名 `<stem>_stepN.<ext>`（最后一步写最终路径）（`batch.py:170`）。
- 输出路径冲突**预检拒绝**，不做事后覆盖（`batch.py:281-288`）。

### 7.2 步骤白名单（防任意执行）

`ALLOWED_STEP_SCRIPTS = scripts/ 下非 `_` 前缀的 .py 文件名集合`（`batch.py:39-45`）。`run_step()` 对每个步骤脚本名做白名单检查，不在其中直接 die——因为 `Path / "绝对路径"` 会静默丢掉左边，且挡不住 `../` 穿越（`batch.py:44, 97-100`）。

### 7.3 缓存 key

- 文件侧：`file_key()` = sha1(`name|size|mtime` + 首 1MB + 尾 1MB（>2MB 时））（`batch.py:48-57`）。
- recipe 侧：`recipe_key()` = sha1(recipe JSON 排序 + 被引用 project 文件的全文)[:12]——改 `project.json` 内容也必须让缓存失效（`batch.py:60-73`）。
- 缓存键 = `f"{file_key}:{rkey}"`（`batch.py:324`）；存 `<output_dir>/.ffskill_cache.json`，原子替换写入（`batch.py:236, 299-315`）。
- 命中条件：条目存在 + 输出文件仍存在 + 未 `--force`（`batch.py:326-329`）；`--force` 忽略缓存（`batch.py:193`）。

### 7.4 `--jobs` 与超时预算

- `JOBS_CAP = 8`：超过这个数，并发编码只会互相抢核与内存（`batch.py:76`）。
- 实际并发 = `max(1, min(requested, cpu_count, 8))`；`auto` = `min(cpu_count, 4)`（`batch.py:250-259`）；被 clamp 时打一条说明而不是拒绝（`batch.py:260-262`）。
- **共享同一个 `--timeout` 预算**而不是每项一个：`shared_budget = bool(args.timeout) or jobs > 1`，deadline 只设一次（`batch.py:263-269`）；`budget()` 返回"批次剩余时间"（`batch.py:140-145`）。默认串行 + 默认超时保持旧行为（每项各自的上限）。
- 超时未开始的项目标 `skipped: "timeout"`，最后以 `kind=timeout`、exit 124 报告，并说明"--timeout is the whole run's limit, not each item's"（`batch.py:332-335, 523-531`）。
- 并行时每项独立 work 子目录 `work/<i>-<stem>/`（`batch.py:289-297`）；日志缓冲后**按文件顺序**回放（`batch.py:81-88, 366-380, 427-430`），逐项表格与串行时逐行一致。

### 7.5 `--watch`

`--watch N` 每 N 秒轮询文件夹跑一轮（`batch.py:494-509`）；空闲等待期间让 Ctrl-C 成为普通 KeyboardInterrupt，从而能打印摘要而不是"nothing was written"（`batch.py:496-498`）。

---

## 8. `verify.py`：真实素材全链路验收

- 在**调用方自己的真实文件**上跑整条工具链，逐步 PASS/FAIL：合成测试媒体永远看不到真实容器的行为（`verify.py:1-11`）。
- 每个文件的步骤链（`verify.py:141-160`）：
  1. `probe`；
  2. `cut.py` 无损 copy 切（前 `--seconds`，默认 6s）；
  3. `cut.py --accurate` 精确切；
  4. `fit.py --aspect 9:16 --width 720`；
  5. `caption.py --text <生成的 cue> --animate pop --karaoke`；
  6. （非 `--quick`）`overlay.py --text`、`look.py` contact sheet、`probe.py --analyze`；
  7. HDR 源追加 `color.py --to-sdr` + "hdr preserved" 检查（重编码后 `bt2020_or_hdr` 且 bit_depth ≥10 才算 PASS）（`verify.py:72-82, 151-153`）；
  8. `export.py --preset x`；
  9. 有音频且非 `--quick`：`loudness.py --measure-only`、`silence.py --list`、>2 声道时 `audio.py --downmix`。
- `--quick` 只跑 probe / copy cut / fit / caption / export（`verify.py:97, 148, 156`）。
- 每步打印 `PASS/FAIL + 名称 + 秒数 + 错误尾行`（`verify.py:164`）；同名 stem 自动加稳定序号防输出互覆（`verify.py:33-52`）。
- `--report verify.md` 写 Markdown 报告（每文件一个 step/result/time/error 表）（`verify.py:100, 169-186`）。
- `--timeout` 是每步超时（默认 600s）（`verify.py:99`）；`--keep` 保留输出目录，否则用临时目录（`verify.py:95-96, 112-114, 189-190`）。
- **不支持 `--plan`，也忽略 `--dry-run`**——它的步骤是真的在跑（`verify.py:104-105`）。
- 任一步失败 → `die(kind="verification")`，报告文件与逐文件结果照常保留（`verify.py:191-193`）。

---

## 9. `_common/decision.py`：编排层的"大脑"（决策点清单）

纯决策 / 策略层：不跑 ffmpeg、不写文件（`_common/decision.py` 模块职责，见共享内核）。以下决策点全部集中在这里。

### 9.1 是否强制 CFR（`cfr_args`，`decision.py:266-277`）

- 触发条件：源被 probe 判为疑似 VFR（`variable_frame_rate_suspected`，判据 `|r_frame_rate − avg_frame_rate| > 0.01`，`_common/probe.py:235`）或显式给了 fps。
- 输出 `["-fps_mode", "cfr", "-r", rate]`；近整数取整（`|rate − round(rate)| < 0.02`）。
- 理由：VFR 源（手机/录屏）在切与拼之后会与音频漂移，所以每个重编码脚本都自动顺化。

### 9.2 编码器选择（唯一出口 `encoder_args` / `video_args` / `x264_args`）

| 情形 | 选择 | 出处 |
|---|---|---|
| `--codec h264` | libx264 8-bit；**拒绝 HDR**（8-bit H.264 装不下）→ die | `decision.py:294-298` |
| `--codec hevc` + HDR | libx265 Main10 `yuv420p10le` + `hvc1` + 源色彩标签；PQ 加 `hdr10-opt=1`；CRF=min(51, crf+2) | `decision.py:299-303` |
| `--codec hevc` + SDR | libx265 `yuv420p` + hvc1 + BT.709 标签（版本分叉见 9.4） | `decision.py:304-306` |
| `--codec av1` | `libsvtav1` 优先（preset 走 `SVT_PRESET` 映射，`decision.py:107`），否则 `libaom-av1`（`-cpu-used 6 -row-mt 1`）；都没有 → `die(kind="missing_tool")` | `decision.py:307-322` |
| `--codec prores` | `prores_ks profile 3 yuv422p10le`；无该编码器 → `missing_tool` | `decision.py:323-326` |
| 未给 `--codec`，SDR 源 | x264 8-bit BT.709（`x264_args`） | `decision.py:338-343, 356-358` |
| 未给 `--codec`，HDR 源 | x265 Main10 + 源色彩标签（同 hevc+HDR） | `decision.py:356-364` |

`STATE.codec`（`--codec`）优先；这是 (codec, quality, preset, source) → 编码器参数的**唯一出口**（`decision.py:280-287`）。

### 9.3 音频编码器按扩展名（`audio_codec_for` / `is_audio_output`）

| 扩展名 | 编码 | 出处 |
|---|---|---|
| .wav | pcm_s16le | `decision.py:372` |
| .flac | flac | `decision.py:373` |
| .mp3 | libmp3lame `-q:a 0` | `decision.py:374` |
| .m4a / .aac | aac 256k | `decision.py:375-376` |
| .ogg | libvorbis `-q:a 6` | `decision.py:377` |
| .opus | libopus 128k | `decision.py:378` |
| 其他 | aac，默认 192k | `decision.py:382-385` |

音频输出扩展名还会触发 `-vn`（丢掉画面）（`decision.py:388-394`）。

### 9.4 BT.709 打标按 FFmpeg 版本分叉（`bt709_tag_args`，`_common/color.py:12-29`）

- **FFmpeg < 7.1**：输出选项 `-colorspace bt709 -color_primaries bt709 -color_trc bt709`（纯标签）。
- **FFmpeg ≥ 7.1**：改走编码器 VUI 参数（libx265 → `-x265-params colorprim=…`；其余 → `-x264-params colorprim=…`）。原因：7.1 起 libavfilter 会把输出选项喂进图的约束，在无色彩标签的源上自动插入真实矩阵转换（对"unknown"的猜测是 bt601），一个 no-op 调色能掉到 ~24 dB PSNR。
- `_sdr_bt709()` 处理需要合并 encoder params 的调用方：libsvtav1 用 `color-primaries=1:transfer-characteristics=1:matrix-coefficients=1`，libaom-av1 无 VUI 选项（未打标 8-bit 到处都被读作 BT.709）（`color.py:32-42`）。

### 9.5 章节提议（`propose_chapters` / `_evidence_rank`）

- 输入：duration + silencedetect 的静音段 + scdet 的场景切点；输出 `[{at, title, evidence}]`。**纯函数**，不解码（`decision.py:497-511`）。
- 静音贡献它的 `end`（语音恢复点），不是中点。
- 1s 内的 scene 与 silence 合并成一个候选 `kind: "silence+scene"`（`decision.py:531-545`）。
- 证据排序 `_evidence_rank`：`start 3 > silence+scene 2 > silence 1 > scene 0`；同级比静音长度 / 分数（`decision.py:488-494`）。
- 与已保留标记距离 < `min_chapter` 的候选被丢弃，强证据胜出；**永不替换 index 0 的 0.0 起点**（`decision.py:548-560`）。
- 文件尾 `min_chapter` 内的候选丢弃（`decision.py:549-550`）。
- `--max-chapters` 超限时**从弱到强淘汰**（同级晚的先进淘汰序），永不丢 index 0，然后按时间恢复顺序（`decision.py:562-567`）。
- 标题只给 `Chapter N`：不猜内容（`decision.py:509-511, 569-571`）。

### 9.6 节拍网格（`beat_grid` / `snap_points`）

- onset 强度 = `log(env + 1e-9)` 的半波整流一阶差分（`decision.py:597-604, 692-694`）。
- onset = 局部极大值 > median + 1.5×MAD（±1s 窗口），60ms 不应期（常量 `BEAT_ONSET_K=1.5`、`BEAT_WINDOW_S=1.0`、`BEAT_REFRACTORY_S=0.06`，`decision.py:586-588, 606-635`）。
- tempo = onset 信号在 60–200 BPM 内的最佳自相关 lag；半/双拍候选必须多解释 ≥1.2× 的 onset 强度才替换（`BEAT_OCTAVE_MARGIN=1.2`，`decision.py:592, 743-771`）。
- confidence = `0.5 × clip((z−2)/4, 0, 1) + 0.5 × 对齐率`（z 为获胜 lag 高出其余均值的标准差数；`BEAT_Z_FLOOR=2.0`、`BEAT_Z_SPAN=4.0`）；`usable = confidence ≥ 0.5`（`decision.py:593-594, 786-799`）。
- `supported_beats` 是真正有 onset 支撑的子集——**会改动文件的工具只允许吸附到这上面**（网格会穿过无音乐段，那里没有任何音频证据）（`decision.py:702-704, 778-780`）。
- `snap_points`：tolerance 内移到最近 beat；无 beat 在 tolerance 内则原样返回 `snapped=False`；**永不发明点**（`len(out) == len(points)`，`to` 只能来自 beats 或调用方自己的值）（`decision.py:804-829`）。

### 9.7 填充词切除（`filler_spans` / `normalise_filler_token`）

- **精确匹配，不是子串**："umbrella" 不含 "um"（`decision.py:875-883`）。
- 只处理语音引擎测出 `start < end` 的词；无时序 → 不切，且工具明说（`decision.py:890-908`）。
- 时长上限 `FILLER_MAX_WORD = 1.2s`（更长的"uhhh"是有人故意的拖长元音）；前后各 pad `FILLER_PAD = 0.02s`；间隔 ≤ `FILLER_MIN_GAP = 0.05s` 的相邻 span 合并（`decision.py:870-872, 908-918`）。
- 默认词表按语言（en/ja/es/de/fr/pt/it）；`FILLER_AMBIGUOUS` 列出"同时也是正常词汇"的项，每切一个都警告；`like` / `tipo` / `cioè` 是 discourse marker 不是 disfluency，默认不切，只能 `--filler-extra`（`decision.py:842-868`）。

### 9.8 运镜标注（`frame_flow` / `label_shot_flow`）

- 4×4 锚块（`MOTION_GRID=4`），每块在 ±3px 范围（`MOTION_SEARCH=3`）按 SAD 匹配；零位移是显式 tie-break 候选（纹理块上所有偏移 SAD 相同，不 tie 会把搜索窗第一角报成位移）（`decision.py:928-931, 934-966`）。
- 平均位移 `< 0.35px`（`MOTION_STATIC_PX`）→ `static`；`≥ 0.35px` 且块间方向一致性 `≥ 0.6`（`MOTION_PAN_SPREAD`）→ `pan`；否则 `motion`（`decision.py:969-1008`）。
- 显式声明：这是**测量代理**，报告粗块匹配看到的东西，不是"这个镜头有不有趣"（`decision.py:995-997`）。

### 9.9 其他

- `frame_size` / `aspect_ratio`：宽高偶数化（`decision.py:52-105`）。
- `parse_time` / `time_arg` / `signed_time_arg` / `fmt_*`：统一时间语法（秒 / mm:ss / hh:mm:ss.ms / hh:mm:ss:ff@fps）（`decision.py:140-238`）。
- `load_brand`：brand.json 与默认合并，`_stated` 区分"文件真的写了"（`decision.py:420-475`）。
- `escape_filter_path`：filter 值双重解析转义（`decision.py:240-264`）。
- `default_output`：`<name>_<suffix>.<ext>` 约定（`decision.py:110-121`）。

---

## 10. 本域红线

1. **三步以上就该进 `render.py` 项目文件，不要手工串命令。** 手工串三次重编码会掉画质，而且没有可重放的单一事实来源——改一个数字要重敲整条链。项目文件是幂等的：改数字、重渲染（`render.py:1-4`）。
2. **编排层只做机械调度。** `render.py` / `batch.py` / `_common/decision.py` 不判断"哪个剪辑对""这段该不该留""标题写什么"：章节标题只给 `Chapter N`（`decision.py:509-511`）、代理不做用途决定（`proxy.py:15-18`）、`snap_points` 永不发明时间点（`decision.py:810-814`）。
3. **缓存是 opt-in，且跨版本永不复用。** 没有 `--cache` 就没有缓存目录；`--from` 必须配 `--cache`，更早阶段不命中就拒绝而不是悄悄重编（`render.py:554-558, 485-495, 988-992`）。
4. **`--stop-after` 之前的 section 才校验。** 用它迭代预览时，后面的块写错不会挡住这一步——不要把它当"部分校验通过"的验收（`render.py:443-446`）。
5. **`--export-timeline` 是翻译，不是渲染。** 只导出剪辑器能承载的东西；其余逐条列进 `not_exported`，绝不静默丢弃（`timeline.py:15-21, 38-50`）。
6. **`batch.py` 的 recipe 步骤只允许本技能自己的脚本。** 白名单防的是"从别处拿来的 batch.json 在你机器上执行任意 Python"（`batch.py:39-45`）。
7. **并行有硬上限。** `--jobs` 被 clamp 到 `min(N, cpu, 8)`；每个 item 本身已是多线程 ffmpeg，盲目加大只会互相抢资源（`batch.py:76, 246-262`）。

---
name: ffmpeg-media-production
display_name: FFmpeg 音视频制作专家团
display_name_en: FFmpeg Video Production Team
description: >-
  Edit video and audio locally with FFmpeg: cutting, reframing, captions and typography, audio engineering,
  platform delivery compliance. Probe first, stay lossless where possible, verify last. Fully offline, no
  upload, no API key. TRIGGER when the user asks for "把这段 16:9 的访谈剪成 60 秒 9:16…" / "这条视频是 iPhone…" /
  "把三个机位对齐，去掉停顿和口头禅，再批量导出…" / "视频剪辑" / "视频编辑" / "音频编辑" / "音视频处理" / "视频处理" / "剪辑" / "视频制作" / "本地视频处理" / "离线视频处理"
  / "命令行视频编辑" / "CLI 视频编辑" / "自动化剪辑" / "批处理剪辑" / "视频剪切" / "视频裁剪" / "视频截取" / "片段截取" / "多段剪辑" / "视频拼接" / "视频合并" /
  "视频串联" / "交叉淡化" / "转场" / "无损剪辑" / "流拷贝" / "关键帧剪辑" / "帧精确剪辑" / "采样精确剪辑" / "变速" / "慢动作" / "快动作" / "平滑慢动作" /
  "变速曲线" / "倒放" / "循环播放" / "来回播放" / "定格" / "冻结帧" or says "ffmpeg", "B-roll", "HDR", "Dolby Vision", "HLG", "tone
  mapping", "LUT", "3D LUT", "cube", "S-Log", "V-Log", "C-Log", "LUFS", "EBU R128", "true peak", "ducking",
  "SRT", "ASS". DO NOT TRIGGER for unrelated requests outside the FFmpeg 音视频制作专家团 domain, or when no
  domain-specific output is requested.
description_zh: "用本地 FFmpeg 做音视频剪辑、字幕排版、音频工程与交付验收，探测优先、无损优先、全程离线。"
description_en: "Edit video and audio locally with FFmpeg: cutting, reframing, captions and typography, audio engineering, platform delivery compliance. Probe first, stay lossless where possible, verify last. Fully offline, no upload, no API key."
category: creative-collaboration
version: 1.0.0
author: 赛博驴
allowed-tools: Read
agent_created: true
---

# FFmpeg 音视频制作专家团

> 本文件是技能的唯一入口。保持正文精简，超出的细节一律下沉 `references/`。
> 单代理形态：本技能没有子代理。下表「能力模块」对应 `references/` 下的角色文件，执行时**切换到该文件并按其方法与输出规范执行**。

## 目标与适用场景

本技能是这个专家团的总控。团队把 FFmpeg 封装成 42 个带类型参数的本地工具，覆盖从探测、剪辑、字幕、音频到平台交付的全链路。
负责三件事：**分诊需求**、**按 SOP 调度成员**、**守住那条"工具不做判断"的边界**。

**定位**：用本地 FFmpeg 做音视频剪辑、字幕排版、音频工程与交付验收，探测优先、无损优先、全程离线。

**适用场景**：

| 用户会怎么说 | 本技能做什么 |
|---|---|
| 把这段 16:9 的访谈剪成 60 秒 9:16 竖屏，加中文字幕并导出到抖音规格 | Cut this 16:9 interview to 60 s of 9:16 vertical, add… |
| 这条视频是 iPhone HDR，颜色发灰，帮我转成 SDR 并把声音响度标准化到 -14 LUFS | This clip is iPhone HDR and looks washed out — convert to… |
| 把三个机位对齐，去掉停顿和口头禅，再批量导出 YouTube 和 Reels 两版 | Sync three camera angles, remove pauses and filler words,… |

## 输入与输出

**输入**：用户的自然语言需求；必要时由用户提供的相关材料、文件或既有产出。

**输出**：符合本技能领域规范的结构化交付物；具体形态见「核心功能逻辑」与 `references/`。

## 核心功能逻辑

### 能力模块

### 测量与画面

| 成员 | Agent ID | 职责 |
|---|---|---|
| 媒体探查与测量工程师 | `references/role-01-`references/role-01-media-inspection-engineer.md`.md` | 一切判断的数字来源：时长/帧率（含可变帧率）/分辨率/色彩/HDR/音频流；场景切分、镜头运动分类、音频峰值、语音音乐比、节拍网格、黑边检测、运动质心；出联系表与前后对比图供人看 |
| 画面剪辑与构图工程师 | `references/role-02-`references/role-02-picture-editing-engineer.md`.md` | 无损优先的切割与多段拼接、转场、时长与画幅（竖屏/方形/精确像素）、旋转翻转、定格/倒放/循环/变速、图片转片段、拼贴墙、B-roll 插入 |
| 色彩科学与画质修复工程师 | `references/role-03-`references/role-03-colour-restoration-engineer.md`.md` | HDR10/HLG/杜比视界转 SDR、Log 素材、3D LUT、色彩标签改写、一级校色；去隔行、降噪、两遍防抖、水平校正、隐私打码、360 转平面 |

### 声音与文字

| 成员 | Agent ID | 职责 |
|---|---|---|
| 音频工程与多机位同步工程师 | `references/role-04-`references/role-04-audio-sync-engineer.md`.md` | 人声清理链、FFT 降噪、类型化压缩/限制/噪声门、音乐床侧链闪避、5.1 下混、立体声加宽、音轨替换与提取；EBU R128 两遍响度；静音与口头禅切除；毫秒级音频对齐与时钟漂移校正；多机位切换；波形/频谱视频；本地转写 |
| 字幕排版与图文合成工程师 | `references/role-05-`references/role-05-caption-typography-engineer.md`.md` | SRT/ASS 烧录与封装多语言多轨、卡拉OK与逐字动画、按文种自动选字体、emoji 彩色合成、短语感知断行、字号自适应；logo/水印/画中画/绿幕；下三分之一、标题卡、进度条、倒计时、贴纸、钩子卡、梗图 |

### 交付与编排

| 成员 | Agent ID | 职责 |
|---|---|---|
| 平台交付与合规验收工程师 | `references/role-06-`references/role-06-delivery-compliance-engineer.md`.md` | 13 个导出预设、11 个目的地的规格表与安全区、交付前 PASS/WARN/FAIL 验收（区分可修的 format 行与改内容的 judgement 行）、代理文件、单文件 HTML 交付报告、章节标记与元数据 |
| 渲染编排与批处理工程师 | `references/role-07-`references/role-07-render-orchestration-engineer.md`.md` | 多步任务的项目文件、阶段缓存与断点重跑、模板一键交付、批量与并发、编辑器时间线导出（FCPXML/EDL/OTIO）、真实设备整链验证 |

### 工程与集成

| 成员 | Agent ID | 职责 |
|---|---|---|
| 契约与工具集成工程师 | `references/role-08-`references/role-08-contract-tooling-engineer.md`.md` | 机器可读契约、MCP 服务器接入、能力探测与环境排障、错误种类判读、安装到各代理 |
| 技能工程与质量保障工程师 | `references/role-09-`references/role-09-skill-quality-engineer.md`.md` | 测试矩阵、评测方法论、CI 与发布流程、扩展新工具、把工程经验迁移到用户自己的技能项目 |

### 预设 Workflow

### Workflow A · 平台交付（最高频）

- **触发**：出现具体目的地（Reels/TikTok/Shorts/YouTube/播客/小红书…），或"发到社交平台""做一版短的"
- **编排**：Phase 1 探测（并行：规格 + 场景/节拍候选）→ Phase 2 串行（画面 → 字幕 → 音频）→ Phase 3 验收 → Phase 4 看画面 → Phase 5 汇编
- **依赖**：目的地在 Phase 1 就确定，它一次性决定画幅、时长上限、响度目标、编码器

### Workflow B · 素材抢救

- **触发**："颜色不对""发灰""有噪点""抖得厉害""歪了""有黑边""老录像""iPhone 拍的"
- **编排**：Phase 1 探测（判 HDR/Log/隔行/黑边/抖动）→ Phase 2 修复（色彩 + 画质，可并行）→ Phase 2b 再剪辑构图 → Phase 4 看画面 → Phase 5 汇编
- **注意**：Log 素材必须先做 LUT；HDR 源不能直接出 H.264

### Workflow C · 多机位与长内容

- **触发**："两个机位""三台机器""对齐""播客""访谈""直播回放""去掉停顿"
- **编排**：Phase 1 探测每路 + 音频对齐置信度 → Phase 2 串行（对齐 → 静音/口头禅 → 切换或剪辑 → 音频 → 响度）→ Phase 3 验收 → Phase 4 看画面
- **注意**：置信度低于 0.3 必须复核每一路；分机录制超过十分钟必须做漂移校正

### Workflow D · 批量与流水线

- **触发**："整个文件夹""几十个文件""每天都跑""给我一个剪辑工程"
- **编排**：Phase 1 抽样探测（不必全量）→ `render-orchestration-engineer` 出配方/项目文件 → 先 `--dry-run` 让用户确认 → 执行 → Phase 3 抽查验收
- **注意**：并发上限受 CPU 与 8 双重限制；缓存是显式开启的，跨版本不复用

### Workflow E · 集成与排障

- **触发**："接进我的代理""MCP 起不来""doctor 说什么意思""这个报错怎么修"
- **编排**：`contract-tooling-engineer` 主责；需要判断"这台机器能不能做某个任务"时并行拉 `media-inspection-engineer` 复核
- **注意**：`ok` 与单工具 `usable` 是两个信号，必须分开读

### 直调路由

| 用户问法 | 直接调 |
|---|---|
| "这个文件多长/什么规格/是 HDR 吗" | `media-inspection-engineer` |
| "剪掉头 10 秒 / 只留这段 / 把两段拼起来" | `picture-editing-engineer` |
| "做成竖屏 / 方屏 / 改成 1080p / 转 90 度" | `picture-editing-engineer` |
| "颜色发灰 / iPhone HDR / 套这个 LUT / 老素材有隔行" | `colour-restoration-engineer` |
| "声音太小 / 降噪 / 加背景音乐 / 去停顿 / 去口头禅" | `audio-sync-engineer` |
| "对齐两个机位 / 音画不同步 / 外接麦" | `audio-sync-engineer` |
| "加字幕 / 双语字幕 / 卡拉OK字幕 / 打水印 / 加片头" | `caption-typography-engineer` |
| "导出到抖音/YouTube/小红书 / 这版能上传吗" | `delivery-compliance-engineer` |
| "一次做完这几步 / 批量处理整个文件夹 / 给我剪辑工程" | `render-orchestration-engineer` |
| "接到我的 MCP 客户端 / 这台机器能跑什么 / 报错看不懂" | `contract-tooling-engineer` |
| "帮我加个新功能 / 测试怎么跑 / 想自己写一个技能" | `skill-quality-engineer` |

## 关键实现步骤

### Phase 0 · 分诊（你亲自做，不派发）

拿到需求先回答五个问题：

1. **是单一动作还是多步？** 单一 → 直接派对应成员；三步及以上 → `render-orchestration-engineer` 走项目文件
2. **有目的地吗？** 有（YouTube/Reels/TikTok/Shorts/LinkedIn/播客…）→ 目的地一次性决定画幅、时长上限、响度、编码器 → 走模板路径
3. **输入是视频还是音频？** 音频走音频路径，**不要套视频壳**
4. **画面会变吗？** 会变 → 收尾必须有人跑联系表
5. **有不可逆判断吗？** 有 → 先向用户披露代价，再动手

分诊结果落成一句任务书，再进入 Phase 1。

### Phase 1 · 探测（并行，按需）

**任何需要据以规划的数字，都先由 `media-inspection-engineer` 出。**

- 需要规划的一切：时长、帧率（含 VFR 嫌疑）、分辨率、编解码器、声道、色彩标签、HDR 形态、音频流
- 需要选片段：场景切点、节拍网格、高光候选
- 需要判断构图：黑边矩形、运动质心
- 需要看画面：联系表 / 单帧 / 前后对比

**探测结果原文传给后续所有成员**，不要转述成摘要。

### Phase 2 · 专业处理（并行或串行，按依赖关系）

按 Phase 0 的分诊结果调度。**并行**用于无数据依赖的域（例如同时做色彩与音频），**串行**用于有严格顺序的链。

严格执行跨模块顺序红线：

```
色彩 → 剪辑 → 拼接 → 静音 → 画幅 → 字幕/叠加 → 同步 → 音频 → 响度 → 导出
```

画面尺寸变化必须在文字之前；帧率变化必须在字幕之前。

### Phase 3 · 交付验收（串行）

`delivery-compliance-engineer` 对成品跑目的地规格检查，逐行给 PASS/WARN/FAIL 并标注每行是 `format` 还是 `judgement`。

- `format` 行 → 可修，直接修
- `judgement` 行 → **只在需求蕴含答案时才改，否则把选择和代价报给用户**
- WARN 要提及，不要追着消

### Phase 4 · 画面复核（画面变了就必须做）

`media-inspection-engineer` 出联系表。**报告里没点名那张 PNG 就不算完成。**

复核结论分两类：
- **机械项**（工具自己负责验证并报告）：指定文字/logo 在指定位置、字幕在指定时间戳、尺寸偶数。`--fit pad` 的信箱黑边是**该模式的正确结果**，不是缺陷
- **判断项**（报告，不静默通过或失败）：主体/人脸是否被切掉、文字是否压脸、颜色是否发灰、转场是否落位 → 一行说你看到了什么，由用户判

### Phase 5 · 汇编交付（你亲自做）

用固定五行格式输出，数字一律来自 `--json` 输出或实测，**不得来自记忆或估算**：

```
Done: final.mp4 — 59.98 s, 1080x1920, 30 fps, H.264, AAC stereo, -14.1 LUFS
Steps: cut 0:12-1:12 (lossless) -> fit 9:16 crop -> captions (pop, karaoke) -> loudness -14 -> export reels
Check: reels — all 12 checks pass (verified: true)
Look: final_sheet.png (captions inside the safe area, logo top-right)
Notes: source was VFR, conformed to 30 fps; audio was mono, made stereo
```

失败时把 `Done:` 换成 `Failed:`，其余保持诚实；`error.hint` 原文引在 `Notes:` 里。
**部分完成写 `Done:` 并把缺口写进 `Notes:`；带交付的拒绝写 `Failed:`。永远不要造第三个标签。**

## 子资源使用

| 资源 | 内容 |
|---|---|
| `@references/role-00-ffmpeg-media-production-team-lead.md` | FFmpeg 音视频制作专家团 - 编排角色 |
| `@references/role-01-media-inspection-engineer.md` | 媒体探查与测量工程师 |
| `@references/role-02-picture-editing-engineer.md` | 画面剪辑与构图工程师 |
| `@references/role-03-colour-restoration-engineer.md` | 色彩科学与画质修复工程师 |
| `@references/role-04-audio-sync-engineer.md` | 音频工程与多机位同步工程师 |
| `@references/role-05-caption-typography-engineer.md` | 字幕排版与图文合成工程师 |
| `@references/role-06-delivery-compliance-engineer.md` | 平台交付与合规验收工程师 |
| `@references/role-07-render-orchestration-engineer.md` | 渲染编排与批处理工程师 |
| `@references/role-08-contract-tooling-engineer.md` | 契约与工具集成工程师 |
| `@references/role-09-skill-quality-engineer.md` | 技能工程与质量保障工程师 |
| `@references/01-overview.md` | 领域知识参考 |
| `@references/02-analysis.md` | 领域知识参考 |
| `@references/03-picture-editing.md` | 领域知识参考 |
| `@references/04-colour-restoration.md` | 领域知识参考 |
| `@references/05-audio-sync.md` | 领域知识参考 |
| `@references/06-caption-typography.md` | 领域知识参考 |
| `@references/07-delivery-compliance.md` | 领域知识参考 |
| `@references/08-orchestration.md` | 领域知识参考 |
| `@references/09-contract-tooling.md` | 领域知识参考 |
| `@references/10-skill-engineering.md` | 领域知识参考 |
| `@references/11-gotchas.md` | 领域知识参考 |

## 注意事项

1. 严格按 `references/` 中的领域规范产出，不要臆造字段或参数。
2. 不确定时先查证再产出。

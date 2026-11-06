# Remotion 视频制作参数速查

## ⭐ 最新推荐配置（1.3 倍字体 - 财报项目实测）

### 视频规格
- 分辨率：1080x1920（竖屏 9:16）
- 帧率：30 FPS
- 格式：MP4 (H.264)

### 语音配置（财报用男声）

| 语音 | 性别 | 适用 |
|------|------|------|
| **zh-CN-YunjianNeural** ⭐ | **男** | **财报解读（沉稳专业）** |
| zh-CN-XiaoxiaoNeural | 女 | 科技/AI 分析 |

### 字体规范（1.3 倍放大版）

| 元素 | 原字号 | **放大后** | 说明 |
|------|--------|-----------|------|
| 大标题 h1 | 68-72px | **90-94px** | bold，居中 |
| 场景标题 h2 | 44-52px | **57-62px** | bold，居中 |
| 小节标题 h3 | 28-36px | **36-47px** | bold |
| 正文 | 24-28px | **31-36px** | lineHeight 1.6-1.8 |
| 核心数字 | 48px | **62px** | bold，居中，醒目 |
| 结论 | 32-42px | **42-55px** | bold，带背景块 |

### 背景颜色

| 场景类型 | 颜色 | Hex |
|----------|------|-----|
| 开场/结尾 | 深蓝 | `#001529` |
| 内容场景 | 深紫灰 | `#1a1a2e` |
| 技术/费用分析 | 深靛蓝 | `#0f0f23` |

### 主题色

| 用途 | 颜色 | Hex |
|------|------|-----|
| 科技蓝（主色） | `#1890ff` | 标题、按钮、强调 |
| 青色 | `#00d9ff` | 技术亮点 |
| 绿色 | `#52c41a` | 正面/优势/第一 |
| 金色 | `#ffd700` | 结论/重要数字 |
| 紫色 | `#722ed1` | 策略/版本 |
| 橙色 | `#fa8c16` | 警告/不足 |

### 卡片样式

```tsx
// 数据卡片
backgroundColor: 'rgba(255,255,255,0.05)', padding: 30, borderRadius: 16

// 对比卡片（带边框）
backgroundColor: 'rgba(0,217,255,0.1)', border: '2px solid #00d9ff'

// 结论强调块
backgroundColor: 'rgba(255,215,0,0.1)', padding: 20, borderRadius: 12, textAlign: 'center'
```

### 常用 emoji

| 用途 | Emoji |
|------|-------|
| 目标/重点 | 🎯 |
| 技术/工具 | 🔍 🔧 💾 📦 |
| 正面/第一 | ✅ 🏆 💪 |
| 警告/不足 | ⚠️ |
| 速度/性能 | 🚀 ⚡ |
| 数据/文档 | 📊 📝 📖 📄 |
| 结论 | 💡 📌 |

---

## ⚠️ 音频配置检查清单

**渲染前必查:**

1. **FullVideo.tsx 导入:**
```tsx
import { Audio, staticFile } from 'remotion';
```

2. **每个 Sequence 添加 Audio:**
```tsx
<Sequence from={0} durationInFrames={600}>
  <Scene1 />
  <Audio src={staticFile('scene1_audio.mp3')} />
</Sequence>
```

3. **音频文件位置:** `public/scene1_audio.mp3`, `public/scene2_audio.mp3` ...

4. **渲染前检查:**
- [ ] 所有场景都有 Audio 组件
- [ ] 音频文件存在于 public/ 目录
- [ ] 文件名与场景编号对应

---

## 项目结构

```
project/
├── src/
│   ├── Root.tsx          # Composition 配置
│   ├── FullVideo.tsx     # 场景序列编排 + Audio
│   ├── Scene[1-8].tsx    # 各场景组件
│   └── index.ts          # Remotion 入口
├── public/
│   ├── scene1_audio.mp3  # 逐场景音频
│   └── ...
├── out/
│   └── video.mp4         # 渲染输出
├── gen_audio_v2.py       # 音频生成脚本
├── measure_scenes.py     # 场景时长测量
└── script.md             # 视频脚本
```

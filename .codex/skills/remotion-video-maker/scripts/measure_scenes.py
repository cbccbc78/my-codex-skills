# -*- coding: utf-8 -*-
"""
测量视频各场景音频时长并输出 Remotion 配置

使用方法:
1. 修改 PUBLIC_DIR 为当前项目 public/ 目录
2. 运行: python measure_scenes.py
3. 复制输出到 Root.tsx 和 FullVideo.tsx
"""
import os
from mutagen.mp3 import MP3

# ⚠️ 修改为当前项目的 public/ 目录
PUBLIC_DIR = r"<project-dir>\public"

print("=== 场景时长测量 ===\n")

scenes = []
scene_num = 1

while True:
    audio_path = os.path.join(PUBLIC_DIR, f"scene{scene_num}_audio.mp3")
    if not os.path.exists(audio_path):
        break
    
    audio = MP3(audio_path)
    duration = audio.info.length
    # 向上取整到整数秒
    duration_ceil = int(duration) + 1
    frames = duration_ceil * 30  # 30fps
    
    scenes.append((scene_num, duration, duration_ceil, frames))
    print(f"Scene {scene_num}: 实际 {duration:.2f}s -> 配置 {duration_ceil}s ({frames} frames)")
    
    scene_num += 1

if not scenes:
    print("未找到音频文件！请检查 PUBLIC_DIR 路径。")
    exit(1)

total_duration = sum(s[2] for s in scenes)
total_frames = sum(s[3] for s in scenes)
total_actual = sum(s[1] for s in scenes)

print(f"\n{'='*60}")
print(f"总语音时长：{total_actual:.2f}s")
print(f"总视频时长：{total_duration}s ({total_frames} frames @ 30fps)")
print(f"\n{'='*60}")
print(f"// Root.tsx 配置:")
print(f"durationInFrames={total_frames}")
print(f"\n// FullVideo.tsx Sequence 配置:")

current_frame = 0
for i, actual, ceil, frames in scenes:
    print(f"\n// Scene {i}: 实际{actual:.2f}s -> 配置{ceil}s ({frames} frames)")
    print(f"<Sequence from={current_frame} durationInFrames={frames}>")
    print(f"  <Scene{i} />")
    print(f"  <Audio src={staticFile('scene{i}_audio.mp3')} />")
    print(f"</Sequence>")
    current_frame += frames

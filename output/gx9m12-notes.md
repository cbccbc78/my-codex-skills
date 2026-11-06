# GX-9M12 英文口播产品片

Remotion 编排实拍素材与五段英文标题，FFmpeg 完成原创 100 BPM 节奏音乐混音、两遍 EBU R128 响度标准化、H.264/AAC 导出及 faststart。

目标：18 秒，1080×1920，30 fps，H.264 yuv420p，AAC 48 kHz 双声道。
音频实测：−14.02 LUFS，真峰值 −3.46 dBTP（目标 −14 LUFS，偏差 −0.02 LU）。

PASS [format]：MP4 / H.264 / AAC、1080×1920、30 fps、48 kHz stereo。
PASS [format]：完整解码无错误、响度及真峰值检查。
PASS [judgement]：18 秒处于脚本指定 10–20 秒范围。
WARN [judgement]：未找到自动关盖动作素材，结尾使用产品外观，未声称展示自动关盖。
WARN [judgement]：在线 Edge TTS 返回 403，使用本地 Flite SLT 英文合成语音。

画面复核：gx9m12-contact.png。已检查五场景产品主体、英文标题位置及清洗/烘干镜头对应关系。该联系表只代表采样帧；另完成全片解码检查。

gx9m12-en.srt 为口播字幕附件；画面已烧录五段脚本英文标题。

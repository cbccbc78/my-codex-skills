/**
 * 场景组件模板（1.3 倍字体 - 财报项目实测）
 * 
 * 使用方法:
 * 1. 复制为 Scene1.tsx, Scene2.tsx 等
 * 2. 修改场景编号和文案内容
 * 3. 在 FullVideo.tsx 中为每个 Sequence 添加 Audio 组件:
 * 
 *    import { Audio, staticFile } from 'remotion';
 *    
 *    <Sequence from={0} durationInFrames={600}>
 *      <Scene1 />
 *      <Audio src={staticFile('scene1_audio.mp3')} />  // ← 必须添加!
 *    </Sequence>
 * 
 * 4. 音频文件放在 public/ 目录：public/scene1_audio.mp3
 * 
 * ⚠️ 重要：没有 Audio 组件会导致视频没有声音！
 */

import {AbsoluteFill, useCurrentFrame, interpolate} from 'remotion';

export const SceneX: React.FC = () => {
  const frame = useCurrentFrame();
  
  return (
    <AbsoluteFill style={{
      backgroundColor: '#001529',  // 深蓝背景（开场/结尾）
      // backgroundColor: '#0f0f23',  // 深靛蓝（技术/费用分析）
      // backgroundColor: '#1a1a2e',  // 深紫灰（内容场景）
      justifyContent: 'center',
      alignItems: 'center',
      padding: 40,
    }}>
      <div style={{
        color: '#fff',
        width: '100%',
      }}>
        {/* 场景标题（1.3 倍） */}
        <h2 style={{
          fontSize: 62,
          fontWeight: 'bold',
          marginBottom: 40,
          textAlign: 'center',
          color: '#1890ff',  // 科技蓝标题
          // color: '#ffd700',  // 金色（结论/重点）
          // color: '#00d9ff',  // 青色（技术亮点）
          // color: '#fa8c16',  // 橙色（警告/利润下滑）
          // color: '#FF6B6B',  // 红色（风险/负面）
          // color: '#722ed1',  // 紫色（策略/版本）
        }}>
          场景标题
        </h2>
        
        {/* 数据卡片（1.3 倍） */}
        <div style={{
          backgroundColor: 'rgba(255,255,255,0.05)',
          padding: 30,
          borderRadius: 16,
          marginBottom: 30,
        }}>
          <h3 style={{
            fontSize: 36,
            color: '#1890ff',
            marginBottom: 20,
          }}>
            🏆 标题（带 emoji）
          </h3>
          <div style={{fontSize: 31, lineHeight: 1.8}}>
            <div style={{color: '#52c41a', fontWeight: 'bold'}}>第一名：3206 ✅</div>
            <div>第二名：3168</div>
            <div>第三名：3052</div>
          </div>
        </div>
        
        {/* 财报对比卡片（1.3 倍 - 红绿对比） */}
        <div style={{
          display: 'flex',
          gap: 30,
          justifyContent: 'center',
          marginBottom: 30,
        }}>
          {/* 正面指标（绿色） */}
          <div style={{
            flex: 1,
            backgroundColor: 'rgba(82,196,26,0.1)',
            padding: 30,
            borderRadius: 16,
            border: '2px solid #52c41a',
          }}>
            <h3 style={{fontSize: 42, color: '#52c41a', marginBottom: 15, textAlign: 'center'}}>
              营收
            </h3>
            <div style={{fontSize: 62, fontWeight: 'bold', textAlign: 'center', color: '#52c41a'}}>
              349.88亿
            </div>
            <div style={{fontSize: 36, textAlign: 'center', marginTop: 10}}>
              同比 +6.13%
            </div>
          </div>
          
          {/* 负面指标（红色） */}
          <div style={{
            flex: 1,
            backgroundColor: 'rgba(255,107,107,0.1)',
            padding: 30,
            borderRadius: 16,
            border: '2px solid #FF6B6B',
          }}>
            <h3 style={{fontSize: 42, color: '#FF6B6B', marginBottom: 15, textAlign: 'center'}}>
              净利润
            </h3>
            <div style={{fontSize: 62, fontWeight: 'bold', textAlign: 'center', color: '#FF6B6B'}}>
              13.10 亿
            </div>
            <div style={{fontSize: 36, textAlign: 'center', marginTop: 10}}>
              同比 -46.58%
            </div>
          </div>
        </div>
        
        {/* 结论强调块（1.3 倍） */}
        <div style={{
          textAlign: 'center',
          fontSize: 42,
          color: '#ffd700',
          backgroundColor: 'rgba(255,215,0,0.1)',
          padding: 20,
          borderRadius: 12,
        }}>
          💡 关键结论：计算量 27% | 显存 10%
        </div>
      </div>
    </AbsoluteFill>
  );
};

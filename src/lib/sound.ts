/**
 * 判题音效（Web Audio API 程序化合成，零音频文件依赖）
 * - 答对：上行双音（C5 → G5，正弦波），清脆
 * - 答错：低沉单音（G3，方波），短促
 * - 首次播放时自动创建/恢复 AudioContext（用户手势链路内即可用）
 * - 无音频设备 / 播放失败时静默忽略
 */

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  if (!Ctor) return null
  if (!ctx) ctx = new Ctor()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** 播放一个短音（带起音/衰减包络） */
function tone(
  c: AudioContext,
  freq: number,
  startOffset: number,
  duration: number,
  type: OscillatorType,
  volume: number,
): void {
  const t0 = c.currentTime + startOffset
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  osc.connect(gain)
  gain.connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + duration + 0.05)
}

/** 答对音效：C5 → G5 上行双音 */
function playCorrect(c: AudioContext): void {
  tone(c, 523.25, 0, 0.14, 'sine', 0.18)
  tone(c, 783.99, 0.13, 0.2, 'sine', 0.16)
}

/** 答错音效：G3 低沉短音 */
function playWrong(c: AudioContext): void {
  tone(c, 196, 0, 0.28, 'square', 0.1)
}

/** 按判题结果播放对应音效（correct: 答对 / 答错） */
export function playFeedback(correct: boolean): void {
  try {
    const c = getCtx()
    if (!c) return
    if (correct) playCorrect(c)
    else playWrong(c)
  } catch {
    // 无音频设备或播放受限时静默忽略
  }
}

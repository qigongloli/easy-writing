export const TYPING_SOUND_OPTIONS = [
  { label: '青轴机械键', value: 'crisp' },
  { label: '茶轴机械键', value: 'drop' },
  { label: '老式打字机', value: 'typewriter' },
  { label: '枪声音效', value: 'gunshot' },
  { label: '狗狗汪叫', value: 'dogBark' },
  { label: '静音', value: 'none' },
] as const

export type TypingSound = (typeof TYPING_SOUND_OPTIONS)[number]['value']

export const TYPING_SOUND_VALUES = TYPING_SOUND_OPTIONS.map(
  ({ value }) => value,
) as TypingSound[]

export interface TypingSoundSampleConfig {
  src: string
  volume: number
  startOffset: number
  duration: number
  minInterval: number
  exclusive: boolean
}

export const TYPING_SOUND_SAMPLES: Partial<
  Record<TypingSound, TypingSoundSampleConfig>
> = {
  // 原素材是 2.14 秒 AK 连射。每次输入只播放第一发，避免快速码字时多层连射叠加。
  gunshot: {
    src: '/audio/typing/microsammy-ak-47-firing-8760.mp3',
    volume: 0.2,
    startOffset: 0,
    duration: 0.085,
    minInterval: 0.05,
    exclusive: false,
  },
  // 狗叫完整播放期间忽略新的触发，避免每个字叠加一层叫声。
  dogBark: {
    src: '/audio/typing/dragon-studio-dog-bark-382732.mp3',
    volume: 0.28,
    startOffset: 0.045,
    duration: 0.5,
    minInterval: 0,
    exclusive: true,
  },
}

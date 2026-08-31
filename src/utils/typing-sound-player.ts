import {
  TYPING_SOUND_SAMPLES,
  type TypingSound,
  type TypingSoundSampleConfig,
} from '@/config/typing-sounds'

export class TypingSoundSamplePlayer {
  private readonly sampleBytes = new Map<TypingSound, ArrayBuffer>()
  private readonly bytePromises = new Map<TypingSound, Promise<ArrayBuffer>>()
  private readonly decodedBuffers = new Map<TypingSound, AudioBuffer>()
  private readonly decodePromises = new Map<TypingSound, Promise<AudioBuffer>>()
  private readonly activeSources = new Set<AudioBufferSourceNode>()
  private readonly exclusiveSources = new Map<
    TypingSound,
    AudioBufferSourceNode
  >()
  private readonly lastStartedAt = new Map<TypingSound, number>()
  private readonly failedSamples = new Set<TypingSound>()

  preload() {
    for (const [type, config] of this.sampleEntries()) {
      void this.loadBytes(type, config).catch((error) => {
        this.reportFailure('preload', type, error)
      })
    }
  }

  reset() {
    for (const source of this.activeSources) {
      try {
        source.stop()
      } catch {
        // 已自然结束的 source 再 stop 会抛错，清理阶段可以忽略。
      }
    }
    this.activeSources.clear()
    this.exclusiveSources.clear()
    this.lastStartedAt.clear()
    this.decodedBuffers.clear()
    this.decodePromises.clear()
  }

  async play(ctx: AudioContext, type: TypingSound): Promise<boolean> {
    const config = TYPING_SOUND_SAMPLES[type]
    if (!config) return false

    if (config.exclusive && this.exclusiveSources.has(type)) return true
    const lastStartedAt = this.lastStartedAt.get(type) ?? -Infinity
    if (ctx.currentTime - lastStartedAt < config.minInterval) return true

    let buffer: AudioBuffer
    try {
      buffer = await this.getDecodedBuffer(ctx, type, config)
    } catch (error) {
      this.reportFailure('play', type, error)
      return true
    }

    if (ctx.state !== 'running') return true
    if (config.exclusive && this.exclusiveSources.has(type)) return true

    const startedAt = ctx.currentTime
    const previousStartedAt = this.lastStartedAt.get(type) ?? -Infinity
    if (startedAt - previousStartedAt < config.minInterval) return true

    const availableDuration = Math.max(
      0,
      buffer.duration - config.startOffset,
    )
    const duration = Math.min(config.duration, availableDuration)
    if (duration <= 0) return true

    const source = ctx.createBufferSource()
    const gain = ctx.createGain()
    const fadeAt = Math.max(startedAt, startedAt + duration - 0.012)
    source.buffer = buffer
    gain.gain.setValueAtTime(config.volume, startedAt)
    gain.gain.setValueAtTime(config.volume, fadeAt)
    gain.gain.exponentialRampToValueAtTime(0.001, startedAt + duration)
    source.connect(gain)
    gain.connect(ctx.destination)

    this.activeSources.add(source)
    if (config.exclusive) this.exclusiveSources.set(type, source)
    this.lastStartedAt.set(type, startedAt)

    source.onended = () => {
      this.activeSources.delete(source)
      if (this.exclusiveSources.get(type) === source) {
        this.exclusiveSources.delete(type)
      }
      source.disconnect()
      gain.disconnect()
    }
    source.start(startedAt, config.startOffset, duration)
    source.stop(startedAt + duration + 0.01)
    return true
  }

  private sampleEntries() {
    return Object.entries(TYPING_SOUND_SAMPLES) as Array<
      [TypingSound, TypingSoundSampleConfig]
    >
  }

  private loadBytes(type: TypingSound, config: TypingSoundSampleConfig) {
    const cached = this.sampleBytes.get(type)
    if (cached) return Promise.resolve(cached)

    const existing = this.bytePromises.get(type)
    if (existing) return existing

    const request = fetch(config.src)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`音效资源加载失败：${response.status}`)
        }
        return response.arrayBuffer()
      })
      .then((bytes) => {
        this.sampleBytes.set(type, bytes)
        this.failedSamples.delete(type)
        return bytes
      })
      .finally(() => {
        if (this.bytePromises.get(type) === request) {
          this.bytePromises.delete(type)
        }
      })

    this.bytePromises.set(type, request)
    return request
  }

  private getDecodedBuffer(
    ctx: AudioContext,
    type: TypingSound,
    config: TypingSoundSampleConfig,
  ) {
    const cached = this.decodedBuffers.get(type)
    if (cached) return Promise.resolve(cached)

    const existing = this.decodePromises.get(type)
    if (existing) return existing

    const request = this.loadBytes(type, config)
      .then((bytes) => ctx.decodeAudioData(bytes.slice(0)))
      .then((buffer) => {
        this.decodedBuffers.set(type, buffer)
        return buffer
      })
      .finally(() => {
        if (this.decodePromises.get(type) === request) {
          this.decodePromises.delete(type)
        }
      })

    this.decodePromises.set(type, request)
    return request
  }

  private reportFailure(
    phase: 'preload' | 'play',
    type: TypingSound,
    error: unknown,
  ) {
    if (!this.failedSamples.has(type)) {
      console.warn(`${phase} typing sound failed: ${type}`, error)
    }
    this.failedSamples.add(type)
  }
}

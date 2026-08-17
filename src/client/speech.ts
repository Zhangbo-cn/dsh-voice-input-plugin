/**
 * Browser Web Speech recognition plumbing for the mic control. The browser
 * `SpeechRecognition`/`webkitSpeechRecognition` API is wrapped behind a
 * structural type so recognition flow is unit-testable in jsdom with a fake.
 * @module @deepseek-ai/dsh-client-ui-voice-input/src/client/speech
 */

/** One recognition result entry (the minimal fields the mic control reads). */
export interface VoiceRecognitionResult {
  readonly isFinal: boolean
  readonly 0: { readonly transcript: string }
}

/** The structural surface of a browser recognition instance the mic uses. */
export interface VoiceRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: { readonly resultIndex: number; readonly results: readonly VoiceRecognitionResult[] }) => void) | null
  onend: (() => void) | null
  onerror: ((event: { readonly error: string }) => void) | null
}

/** A constructor of a browser recognition instance (injectable in tests). */
export interface SpeechRecognitionConstructor {
  new (): VoiceRecognitionLike
}

/**
 * Resolve the browser SpeechRecognition constructor (webkit-prefixed for
 * older Chrome/Edge), or undefined when the browser does not support it.
 * @returns the constructor, or undefined when unsupported.
 */
export function resolveSpeechRecognition(): SpeechRecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined
  const anyWindow = window as unknown as Record<string, unknown>
  const ctor = anyWindow.SpeechRecognition ?? anyWindow.webkitSpeechRecognition
  return ctor as SpeechRecognitionConstructor | undefined
}

/**
 * Create a browser recognition instance, or null when unsupported.
 * @returns a fresh recognition, or null when the browser lacks Web Speech.
 */
export function createBrowserRecognition(): VoiceRecognitionLike | null {
  const ctor = resolveSpeechRecognition()
  return ctor === undefined ? null : new ctor()
}

/**
 * Accumulates recognition transcript into a final + interim model. Interim
 * segments replace each other (live feedback) while final segments commit;
 * the full transcript is what the mic appends to the draft.
 */
export class TranscriptAccumulator {
  private finalParts: string[] = []
  private interimText = ''

  /** Commit one final segment. */
  appendFinal(text: string): void {
    this.finalParts.push(text)
    this.interimText = ''
  }

  /** Replace the current interim segment (live, non-committed). */
  setInterim(text: string): void {
    this.interimText = text
  }

  /** The full accumulated transcript (final segments + latest interim). */
  get transcript(): string {
    return [...this.finalParts, this.interimText].filter((part) => part.length > 0).join(' ')
  }

  /** Whether any final segment has committed. */
  get isFinal(): boolean {
    return this.finalParts.length > 0
  }

  /** Start a fresh recognition session. */
  reset(): void {
    this.finalParts = []
    this.interimText = ''
  }
}

/**
 * Fold one recognition result event into the accumulator.
 * @param acc - the accumulator to fold into.
 * @param event - the result event (results before `resultIndex` are unchanged).
 */
export function applyResults(acc: TranscriptAccumulator, event: { readonly resultIndex: number; readonly results: readonly VoiceRecognitionResult[] }): void {
  for (let i = event.resultIndex; i < event.results.length; i++) {
    const result = event.results[i]
    if (result === undefined) continue
    const text = result[0]?.transcript ?? ''
    if (result.isFinal) acc.appendFinal(text)
    else acc.setInterim(text)
  }
}

/** The text-to-speech surface used by voice-chat mode. */
export interface TtsSpeakerLike {
  speak(text: string): void
  stop(): void
  readonly speaking: boolean
  onend: (() => void) | null
}

/** Pick a natural (preferred) voice: Microsoft neural / Edge voices, else any Chinese voice. */
export function pickPreferredVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis?.getVoices?.() ?? []
  if (voices.length === 0) return undefined
  const natural = voices.find((v) => /natural/i.test(v.name) || v.name.includes('Online'))
  if (natural !== undefined) return natural
  return voices.find((v) => /zh/i.test(v.lang)) ?? voices[0]
}

/**
 * A TTS speaker over `speechSynthesis`, preferring a natural (Edge/neural)
 * voice. NOTE: browser `speechSynthesis` is best-effort — Chrome silently
 * drops `speak()` calls after ~15s of speech inactivity, so we `resume()`
 * (and cancel) before every utterance as the known workaround. Quality and
 * reliability are browser-vendor dependent.
 */
export function createBrowserSpeaker(): TtsSpeakerLike {
  const synth = window.speechSynthesis
  const voice = pickPreferredVoice()
  return {
    get speaking() {
      return synth.speaking
    },
    onend: null,
    speak(text: string) {
      if (text.trim().length === 0) return
      // Chrome's dead-zone bug: after a quiet gap, speak() is silently ignored
      // unless resume() re-activates the engine.
      synth.cancel()
      synth.resume()
      const utterance = new SpeechSynthesisUtterance(text)
      if (voice !== undefined) utterance.voice = voice
      utterance.rate = 1
      utterance.pitch = 1
      utterance.onend = () => this.onend?.()
      utterance.onerror = () => this.onend?.()
      synth.speak(utterance)
    },
    stop() {
      synth.cancel()
    },
  }
}

/** A fetch signature the host TTS speaker can be handed in tests. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/**
 * Strip markdown markup that must not be read aloud: bold/italic/strike spans,
 * inline and fenced code, links/images (keep the label), headers, list bullets,
 * blockquote markers, and HTML entities. Whitespace is collapsed to single
 * spaces so leftover syntax does not produce pauses mid-utterance.
 */
export function stripMarkdownForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/&(amp|lt|gt|quot|#39);/g, (m) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" })[m] ?? m)
    // Emoji and decorative symbols: Edge TTS often renders them as empty or
    // garbled audio, so a sentence like "信号满格～📡😄" otherwise sounds
    // skipped. Remove them (and variation selectors / ZWJ joins).
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{20E3}]/gu, '')
    .replace(/[\u{1F1E6}-\u{1F1FF}]{2}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Shared Web Audio context. Resumed inside the mic gesture so reply playback
 * through it is exempt from the browser autoplay policy (a plain
 * `HTMLMediaElement.play()` is blocked when it runs after the gesture window).
 */
let replyAudioCtx: AudioContext | undefined

/**
 * Unlock reply audio within a user gesture (the mic pointer-down): create and
 * resume the shared AudioContext so the reply is later playable. No-op when
 * Web Audio is unavailable — playback falls back to an `<audio>` element,
 * which is allowed once the user has interacted with the page.
 */
export function unlockReplyAudio(): void {
  try {
    replyAudioCtx ??= new AudioContext()
    if (replyAudioCtx.state === 'suspended') void replyAudioCtx.resume()
  } catch {
    replyAudioCtx = undefined
  }
}

/**
 * A TTS speaker preferring the host `/api/tts` route — Edge neural voices
 * synthesized server-side and served as MP3 — and falling back to the browser
 * `speechSynthesis` when the route is unreachable or fails. Playback runs
 * through the gesture-unlocked Web Audio context when available, else an
 * `<audio>` element, so it is not subject to the autoplay policy.
 */
export function createReplySpeaker(fetchImpl: FetchLike = globalThis.fetch.bind(globalThis)): TtsSpeakerLike {
  const audio = new Audio()
  let browser: TtsSpeakerLike | undefined
  let speaking = false
  let onEnd: (() => void) | null = null
  let activeSource: AudioBufferSourceNode | null = null
  let activeUrl: string | null = null

  const finish = (): void => {
    speaking = false
    activeSource = null
    activeUrl = null
    onEnd?.()
  }

  /** Play a synthesized MP3, preferring Web Audio; an `<audio>` element is the fallback. */
  const playBuffer = async (buffer: ArrayBuffer): Promise<void> => {
    const ctx = replyAudioCtx
    if (ctx !== undefined) {
      try {
        const decoded = await ctx.decodeAudioData(buffer.slice(0))
        const source = ctx.createBufferSource()
        source.buffer = decoded
        source.connect(ctx.destination)
        source.onended = () => { activeSource = null; finish() }
        activeSource = source
        source.start()
        return
      } catch {
        // decode failure → element playback below
      }
    }
    const url = URL.createObjectURL(new Blob([buffer], { type: 'audio/mpeg' }))
    activeUrl = url
    audio.src = url
    audio.onended = () => { activeUrl = null; finish() }
    audio.onerror = () => { const u = activeUrl; activeUrl = null; if (u !== null) URL.revokeObjectURL(u); finish() }
    try {
      await audio.play()
    } catch (error) {
      const u = activeUrl; activeUrl = null
      if (u !== null) URL.revokeObjectURL(u)
      throw error
    }
  }

  /**
   * Stop every playback path without firing the end callback (a manual stop
   * must not look like a natural end to the caller's queue logic).
   */
  const stopAll = (): void => {
    if (activeSource !== null) {
      activeSource.onended = null
      try { activeSource.stop() } catch { /* already stopped */ }
      activeSource = null
    }
    audio.onended = null
    audio.pause()
    const url = activeUrl; activeUrl = null
    if (url !== null) URL.revokeObjectURL(url)
    browser?.stop()
    browser = undefined
    speaking = false
  }

  return {
    get speaking() {
      return speaking
    },
    get onend() {
      return onEnd
    },
    set onend(callback: (() => void) | null) {
      onEnd = callback
    },
    speak(text: string) {
      const clean = stripMarkdownForSpeech(text)
      if (clean.trim().length === 0) return
      stopAll()
      speaking = true
      void fetchImpl(`/api/tts?text=${encodeURIComponent(clean)}`)
        .then((response) => {
          if (!response.ok) throw new Error(`host TTS responded ${response.status}`)
          return response.arrayBuffer()
        })
        .then((buffer) => playBuffer(buffer))
        .catch(() => {
          console.warn('[dsh-voice] host /api/tts failed; falling back to browser speechSynthesis')
          const fallback = createBrowserSpeaker()
          fallback.onend = finish
          browser = fallback
          fallback.speak(clean)
        })
    },
    stop() {
      stopAll()
    },
  }
}

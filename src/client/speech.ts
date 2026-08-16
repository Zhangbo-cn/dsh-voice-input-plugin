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
 * A TTS speaker preferring the host `/api/tts` route — Edge neural voices
 * synthesized server-side and served as MP3 — and falling back to the browser
 * `speechSynthesis` when the route is unreachable or fails. The browser
 * fallback keeps reply reading alive against a host without the tts-edge
 * capability, at the cost of the browser's less reliable voices.
 */
export function createReplySpeaker(fetchImpl: FetchLike = globalThis.fetch.bind(globalThis)): TtsSpeakerLike {
  const audio = new Audio()
  let browser: TtsSpeakerLike | undefined
  let speaking = false

  const speaker: TtsSpeakerLike = {
    get speaking() {
      return speaking
    },
    onend: null,
    speak(text: string) {
      if (text.trim().length === 0) return
      audio.pause()
      browser?.stop()
      speaking = true
      void fetchImpl(`/api/tts?text=${encodeURIComponent(text)}`)
        .then((response) => {
          if (!response.ok) throw new Error(`host TTS responded ${response.status}`)
          return response.blob()
        })
        .then((blob) => {
          const url = URL.createObjectURL(blob)
          audio.src = url
          audio.onended = () => { speaking = false; speaker.onend?.() }
          audio.onerror = () => { speaking = false; URL.revokeObjectURL(url) }
          return audio.play()
        })
        .catch(() => {
          const fallback = createBrowserSpeaker()
          fallback.onend = () => { speaking = false; speaker.onend?.() }
          browser = fallback
          fallback.speak(text)
        })
    },
    stop() {
      audio.pause()
      browser?.stop()
      speaking = false
    },
  }
  return speaker
}

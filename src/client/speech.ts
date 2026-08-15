/**
 * Browser Web Speech recognition plumbing for the mic control. The browser
 * `SpeechRecognition`/`webkitSpeechRecognition` API is wrapped behind a
 * structural type so recognition flow is unit-testable in jsdom with a fake.
 * @module @zhangbo-cn/dsh-client-ui-voice-input/src/client/speech
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

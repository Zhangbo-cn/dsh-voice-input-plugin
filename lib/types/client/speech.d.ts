/**
 * Browser Web Speech recognition plumbing for the mic control. The browser
 * `SpeechRecognition`/`webkitSpeechRecognition` API is wrapped behind a
 * structural type so recognition flow is unit-testable in jsdom with a fake.
 * @module @deepseek-ai/dsh-client-ui-voice-input/src/client/speech
 */
/** One recognition result entry (the minimal fields the mic control reads). */
export interface VoiceRecognitionResult {
    readonly isFinal: boolean;
    readonly 0: {
        readonly transcript: string;
    };
}
/** The structural surface of a browser recognition instance the mic uses. */
export interface VoiceRecognitionLike {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    start(): void;
    stop(): void;
    abort(): void;
    onresult: ((event: {
        readonly resultIndex: number;
        readonly results: readonly VoiceRecognitionResult[];
    }) => void) | null;
    onend: (() => void) | null;
    onerror: ((event: {
        readonly error: string;
    }) => void) | null;
}
/** A constructor of a browser recognition instance (injectable in tests). */
export interface SpeechRecognitionConstructor {
    new (): VoiceRecognitionLike;
}
/**
 * Resolve the browser SpeechRecognition constructor (webkit-prefixed for
 * older Chrome/Edge), or undefined when the browser does not support it.
 * @returns the constructor, or undefined when unsupported.
 */
export declare function resolveSpeechRecognition(): SpeechRecognitionConstructor | undefined;
/**
 * Create a browser recognition instance, or null when unsupported.
 * @returns a fresh recognition, or null when the browser lacks Web Speech.
 */
export declare function createBrowserRecognition(): VoiceRecognitionLike | null;
/**
 * Accumulates recognition transcript into a final + interim model. Interim
 * segments replace each other (live feedback) while final segments commit;
 * the full transcript is what the mic appends to the draft.
 */
export declare class TranscriptAccumulator {
    private finalParts;
    private interimText;
    /** Commit one final segment. */
    appendFinal(text: string): void;
    /** Replace the current interim segment (live, non-committed). */
    setInterim(text: string): void;
    /** The full accumulated transcript (final segments + latest interim). */
    get transcript(): string;
    /** Whether any final segment has committed. */
    get isFinal(): boolean;
    /** Start a fresh recognition session. */
    reset(): void;
}
/**
 * Fold one recognition result event into the accumulator.
 * @param acc - the accumulator to fold into.
 * @param event - the result event (results before `resultIndex` are unchanged).
 */
export declare function applyResults(acc: TranscriptAccumulator, event: {
    readonly resultIndex: number;
    readonly results: readonly VoiceRecognitionResult[];
}): void;
/** The text-to-speech surface used by voice-chat mode. */
export interface TtsSpeakerLike {
    speak(text: string): void;
    stop(): void;
    readonly speaking: boolean;
    onend: (() => void) | null;
}
/** Pick a natural (preferred) voice: Microsoft neural / Edge voices, else any Chinese voice. */
export declare function pickPreferredVoice(): SpeechSynthesisVoice | undefined;
/**
 * A TTS speaker over `speechSynthesis`, preferring a natural (Edge/neural)
 * voice. NOTE: browser `speechSynthesis` is best-effort — Chrome silently
 * drops `speak()` calls after ~15s of speech inactivity, so we `resume()`
 * (and cancel) before every utterance as the known workaround. Quality and
 * reliability are browser-vendor dependent.
 */
export declare function createBrowserSpeaker(): TtsSpeakerLike;
/** A fetch signature the host TTS speaker can be handed in tests. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
/**
 * Unlock reply audio within a user gesture (the mic pointer-down): create and
 * resume the shared AudioContext so the reply is later playable. No-op when
 * Web Audio is unavailable — playback falls back to an `<audio>` element,
 * which is allowed once the user has interacted with the page.
 */
export declare function unlockReplyAudio(): void;
/**
 * A TTS speaker preferring the host `/api/tts` route — Edge neural voices
 * synthesized server-side and served as MP3 — and falling back to the browser
 * `speechSynthesis` when the route is unreachable or fails. Playback runs
 * through the gesture-unlocked Web Audio context when available, else an
 * `<audio>` element, so it is not subject to the autoplay policy.
 */
export declare function createReplySpeaker(fetchImpl?: FetchLike): TtsSpeakerLike;
//# sourceMappingURL=speech.d.ts.map
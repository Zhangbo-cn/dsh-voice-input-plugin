/**
 * Voice-chat orchestration: keeps the mic listening continuously, submits
 * committed transcripts, reads the assistant's reply aloud, and barge-ins — a
 * new user utterance cuts the assistant's voice. The recognition and TTS
 * surfaces are injectable so the loop is unit-testable.
 * @module @deepseek-ai/dsh-client-ui-voice-input/src/client/chat
 */
import type { TtsSpeakerLike, VoiceRecognitionLike } from './speech.ts';
/** The controller's injectable surfaces. */
export interface VoiceChatControllerOptions {
    createRecognition: () => VoiceRecognitionLike | null;
    createSpeaker: () => TtsSpeakerLike;
    /** Called with a committed final transcript so the caller submits it. */
    onSubmit: (text: string) => void;
    language: string;
}
/**
 * The voice-chat loop. The caller drives it:
 * - `toggle()`/`start()`/`stop()` for the on/off switch,
 * - `handleAssistantText(text)` whenever the assistant's reply text updates.
 * While active the mic stays open; a new committed utterance barge-ins over
 * the assistant's voice, and a dropped recognition auto-recovers.
 */
export declare class VoiceChatController {
    private readonly options;
    private recognition;
    private speaker;
    private finalParts;
    private activeFlag;
    constructor(options: VoiceChatControllerOptions);
    /** Whether the voice-chat loop is running. */
    get active(): boolean;
    /** Toggle the loop on/off. */
    toggle(): void;
    /** Start listening. No-op while a recognition is already live. */
    start(): void;
    /**
     * Speak the assistant's reply. The mic stays open, so the user can talk
     * over it (barge-in).
     * @param text - the assistant's reply text.
     */
    handleAssistantText(text: string): void;
    /** Stop the loop: cancel recognition and any speech. */
    stop(): void;
    private commitFinal;
}
//# sourceMappingURL=chat.d.ts.map
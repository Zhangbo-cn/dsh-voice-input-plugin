/**
 * The single composer voice control:
 * - tap → toggle continuous monitoring: speech streams into the draft live
 *   (逐字输入). Monitoring keeps listening across silences by auto-restarting
 *   the recognizer on each segment end (Chrome's `continuous: true` fails to
 *   deliver results, so each segment runs `continuous: false` and restarts).
 * - press-and-hold → voice chat (record while held, release to send; the reply
 *   is read aloud).
 * Recognition starts on pointer-down (a user gesture, required by the Web
 * Speech API); tap vs hold is decided on release.
 * @module @deepseek-ai/dsh-client-ui-voice-input/src/client/MicButton
 */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { MicButtonInjected } from './index.ts';
export type MicButtonProps = PropsRuntime<'conversation.input.left'> & MicButtonInjected & PropsLocale<'voice'>;
/** Extract the assistant's visible text blocks from the streaming partial reply. */
export declare function extractPartialText(partial: {
    blocks: readonly {
        kind: string;
        text?: string;
    }[];
} | null | undefined): string;
/**
 * Split streamed reply text into speakable segments: completed sentences plus
 * delimiter-less runs past {@link STREAM_FLUSH_CHARS}. Each segment carries its
 * absolute end offset in `text` so the caller can track how much has been
 * handed to TTS (the trailing incomplete sentence stays un-spoken and is
 * re-evaluated later). `end` uses the regex `lastIndex`, so runs of
 * delimiters between sentences do not skew the offsets.
 */
export declare function splitStreamSegments(text: string): {
    segment: string;
    end: number;
}[];
/** Length of the longest common prefix of two strings. */
export declare function commonPrefixLength(left: string, right: string): number;
/**
 * The mic control. `useInput`/`useSession`/`inputActions` come from the
 * conversation standard kit; `language`/`interimResults` come from the
 * plugin's injected config face.
 */
export declare function MicButton({ useInput, useSession, inputActions, t, language, interimResults }: MicButtonProps): import("react").JSX.Element;
//# sourceMappingURL=MicButton.d.ts.map
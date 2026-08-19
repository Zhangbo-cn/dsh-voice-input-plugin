/**
 * Browser half of the voice-input plugin: registers the mic control into the
 * composer tool row (`conversation.input.left`). Recognition runs entirely in
 * the browser via the Web Speech API; no host round-trip.
 * @module @deepseek-ai/dsh-client-ui-voice-input/src/client
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { type VoiceKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        voice: VoiceKey;
    }
}
/** Deployment configuration for the mic control. */
export interface Config {
    /** Web Speech recognition language tag. Default `zh-CN`. */
    language?: string;
    /** Surface live (interim) transcript while speaking. Default true. */
    interimResults?: boolean;
}
/** The face injected into the mic component (fully resolved). */
export type MicButtonInjected = Required<Config>;
/** Apply config defaults (client plugins resolve their own Config). */
export declare function resolveMicConfig(config?: Config): MicButtonInjected;
export declare const inject: string[];
/**
 * Register the mic control into the composer tool row. Idempotent: a second
 * loader row for the same module (e.g. a bundle patch plus an overlay row)
 * must not re-register the locale or the slot, or the harness fails the entry
 * with "locale namespace 'voice' already has locale 'zh'".
 * @param ctx - the client context.
 * @param config - optional deployment configuration.
 */
export declare function apply(ctx: ClientContext, config?: Config): void;
//# sourceMappingURL=index.d.ts.map
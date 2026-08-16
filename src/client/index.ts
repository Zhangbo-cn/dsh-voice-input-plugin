/**
 * Browser half of the voice-input plugin: registers the mic control into the
 * composer tool row (`conversation.input.left`). Recognition runs entirely in
 * the browser via the Web Speech API; no host round-trip.
 * @module @deepseek-ai/dsh-client-ui-voice-input/src/client
 */

import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { MicButton } from './MicButton.tsx'
import { en, zh, type VoiceKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    voice: VoiceKey
  }
}

const NS = 'voice'

/** Deployment configuration for the mic control. */
export interface Config {
  /** Web Speech recognition language tag. Default `zh-CN`. */
  language?: string
  /** Surface live (interim) transcript while speaking. Default true. */
  interimResults?: boolean
}

/** The face injected into the mic component (fully resolved). */
export type MicButtonInjected = Required<Config>

/** Apply config defaults (client plugins resolve their own Config). */
export function resolveMicConfig(config: Config = {}): MicButtonInjected {
  return {
    language: config.language ?? 'zh-CN',
    interimResults: config.interimResults ?? true,
  }
}

export const inject = ['slots', 'locale']

/**
 * Register the mic control into the composer tool row.
 * @param ctx - the client context.
 * @param config - optional deployment configuration.
 */
export function apply(ctx: ClientContext, config: Config = {}): void {
  const resolved = resolveMicConfig(config)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-voice-input: dictionaries')
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left',
    id: 'voice-input',
    order: 100,
    locale: NS,
    inject: (_sessionId: SessionId): MicButtonInjected => resolved,
  }, MicButton))
}

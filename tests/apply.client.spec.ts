import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject, resolveMicConfig, type MicButtonInjected } from '../src/client/index.ts'
import { MicButton } from '../src/client/MicButton.tsx'

const SID = 's-voice' as SessionId

describe('ui-voice-input client apply', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['slots', 'locale'])
  })

  it('resolves config defaults', () => {
    expect(resolveMicConfig({})).toEqual({ language: 'zh-CN', interimResults: true })
    expect(resolveMicConfig({ language: 'en-US', interimResults: false })).toEqual({
      language: 'en-US', interimResults: false,
    })
  })

  it('registers the mic control once the composer tool row is declared', async () => {
    const ctx = new Context()
    const slots = new SlotRegistry(ctx)
    ctx.provide('locale', new LocaleRuntime(ctx))
    apply(ctx, {})
    // The injection waits for the conversation slot declaration; declare it now.
    slots.register({
      name: 'root',
      children: { 'conversation.input.left': { kind: 'list', scope: 'session' } },
    } as never, () => null)
    await Promise.resolve()
    const entries = ctx.slots.entries('conversation.input.left')
    expect(entries).toHaveLength(1)
    const entry = entries[0]!
    expect(entry.component).toBe(MicButton)
    const injected = (entry.inject as unknown as (id: SessionId) => MicButtonInjected)(SID)
    expect(injected).toEqual({ language: 'zh-CN', interimResults: true })
  })
})

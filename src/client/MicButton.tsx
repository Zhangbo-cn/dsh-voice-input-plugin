/**
 * Composer mic control: toggles browser Web Speech recognition and appends the
 * transcript to the draft via the official `inputActions.setDraft` write path.
 * Interim results give live feedback; final segments commit; the base draft is
 * captured at start so recognition only ever appends, never rewrites user text.
 * @module @zhangbo-cn/dsh-client-ui-voice-input/src/client/MicButton
 */

import { useRef, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { applyResults, createBrowserRecognition, TranscriptAccumulator, type VoiceRecognitionLike } from './speech.ts'
import type { MicButtonInjected } from './index.ts'

export type MicButtonProps = PropsRuntime<'conversation.input.left'> & MicButtonInjected & PropsLocale<'voice'>

/** The live mic-control state, mostly for accessibility and styling. */
type MicState = 'idle' | 'listening' | 'unsupported'

/**
 * The mic button. `useInput`/`inputActions` come from the conversation
 * standard kit; `language`/`continuous`/`interimResults` come from the
 * plugin's injected config face.
 */
export function MicButton({ useInput, inputActions, t, language, continuous, interimResults }: MicButtonProps) {
  const draft = useInput((state) => state.draft)
  const [state, setState] = useState<MicState>('idle')
  const recRef = useRef<VoiceRecognitionLike | null>(null)
  const baseRef = useRef('')
  const accRef = useRef(new TranscriptAccumulator())

  const stop = (): void => {
    // The last onresult already committed the final transcript to the draft;
    // stopping only ends the live session.
    recRef.current?.stop()
  }

  const start = (): void => {
    const rec = createBrowserRecognition()
    if (rec === null) {
      setState('unsupported')
      return
    }
    const acc = new TranscriptAccumulator()
    accRef.current = acc
    baseRef.current = draft
    rec.lang = language
    rec.continuous = continuous
    rec.interimResults = interimResults
    rec.onresult = (event) => {
      applyResults(acc, event)
      // Replace the whole appended transcript each event so interim updates
      // never duplicate; the base draft is untouched.
      inputActions.setDraft([baseRef.current, acc.transcript].filter((part) => part.length > 0).join(' '))
    }
    rec.onend = () => {
      recRef.current = null
      setState('idle')
    }
    rec.onerror = (event) => {
      setState(event.error === 'not-allowed' || event.error === 'service-not-allowed' ? 'unsupported' : 'idle')
    }
    rec.start()
    recRef.current = rec
    setState('listening')
  }

  const toggle = (): void => {
    if (state === 'listening') stop()
    else start()
  }

  const listening = state === 'listening'
  return (
    <button
      type="button"
      className="dsh-voice-input"
      onClick={toggle}
      aria-pressed={listening}
      aria-label={t('mic.label')}
      title={listening ? t('mic.title.listening') : t('mic.title')}
      disabled={state === 'unsupported'}
    >
      <span aria-hidden>{listening ? '🔴' : '🎤'}</span>
    </button>
  )
}

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

import { useEffect, useRef, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { applyResults, createBrowserRecognition, createReplySpeaker, TranscriptAccumulator, unlockReplyAudio, type TtsSpeakerLike, type VoiceRecognitionLike } from './speech.ts'
import type { MicButtonInjected } from './index.ts'

export type MicButtonProps = PropsRuntime<'conversation.input.left'> & MicButtonInjected & PropsLocale<'voice'>

type MicState = 'idle' | 'listening' | 'unsupported'

/** How long a press must be held before release counts as "hold to chat". */
const HOLD_THRESHOLD = 250
/** DeepSeek brand blue, used while the mic is listening. */
const DEEPSEEK_BLUE = '#4d6bfe'

/** Extract the assistant's visible text blocks from the streaming partial reply. */
export function extractPartialText(partial: { blocks: readonly { kind: string; text?: string }[] } | null | undefined): string {
  if (partial === null || partial === undefined) return ''
  return partial.blocks.filter((block) => block.kind === 'text').map((block) => block.text ?? '').join('')
}

/** Sentence-end delimiters used to cut streamed text into speakable segments. */
const SENTENCE_END = /[。！？!?…\n]$/
/** Flush a buffered (delimiter-less) sentence once it gets this long, so long sentences still stream. */
const STREAM_FLUSH_CHARS = 30

/**
 * Split streamed reply text into speakable segments: completed sentences plus
 * delimiter-less runs past {@link STREAM_FLUSH_CHARS}. Each segment carries its
 * absolute end offset in `text` so the caller can track how much has been
 * handed to TTS (the trailing incomplete sentence stays un-spoken and is
 * re-evaluated later). `end` uses the regex `lastIndex`, so runs of
 * delimiters between sentences do not skew the offsets.
 */
export function splitStreamSegments(text: string): { segment: string; end: number }[] {
  const result: { segment: string; end: number }[] = []
  const pattern = /[^。！？!?…\n]+[。！？!?…\n]*/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const part = match[0]
    const trimmed = part.trim()
    if (trimmed.length === 0) continue
    if (SENTENCE_END.test(trimmed) || trimmed.length >= STREAM_FLUSH_CHARS) {
      result.push({ segment: trimmed, end: pattern.lastIndex })
    }
  }
  return result
}

/** Length of the longest common prefix of two strings. */
export function commonPrefixLength(left: string, right: string): number {
  const max = Math.min(left.length, right.length)
  let i = 0
  while (i < max && left.charCodeAt(i) === right.charCodeAt(i)) i++
  return i
}

/**
 * The mic control. `useInput`/`useSession`/`inputActions` come from the
 * conversation standard kit; `language`/`interimResults` come from the
 * plugin's injected config face.
 */
export function MicButton({ useInput, useSession, inputActions, t, language, interimResults }: MicButtonProps) {
  const draft = useInput((state) => state.draft)
  const chatNodes = useSession((state) => state.chat.legacy.nodes)
  const chatNodesRef = useRef(chatNodes)
  chatNodesRef.current = chatNodes
  const [micState, setMicState] = useState<MicState>('idle')
  const [readingReply, setReadingReply] = useState(false)
  const recRef = useRef<VoiceRecognitionLike | null>(null)
  const monitoringRef = useRef(false)
  const baseRef = useRef('')
  const accRef = useRef(new TranscriptAccumulator())
  const holdTimerRef = useRef<number | null>(null)
  const holdingRef = useRef(false)
  const wasListeningRef = useRef(false)
  const setByUsRef = useRef(false)
  const lastDraftRef = useRef('')
  const chatArmedRef = useRef(false)
  const replySeqRef = useRef(-1)
  const lastUserSeqRef = useRef(-1)
  const micUsedAtRef = useRef(0)
  const speakerRef = useRef<TtsSpeakerLike | null>(null)
  if (speakerRef.current === null) speakerRef.current = createReplySpeaker()

  /** Stop the live recognizer and suppress its handlers, leaving monitoring state intact. */
  const pauseRecognizer = (): void => {
    const rec = recRef.current
    recRef.current = null
    if (rec !== null) {
      rec.onend = () => {}
      rec.onerror = () => {}
      rec.stop()
    }
  }

  /** The streaming reply partial, subscribed so reply reading starts while the model is still generating. */
  const partial = useSession((state) => state.partial)
  /** Whether reading paused a live recognizer (so stopping reading must resume it). */
  const readingPausedRef = useRef(false)
  /** Reply segments queued for sequential reading. */
  const ttsQueueRef = useRef<string[]>([])
  /** Whether a segment is currently being read (serializes the queue). */
  const ttsSpeakingRef = useRef(false)
  /** The streamed text already handed to TTS; trailing incomplete sentences are intentionally excluded. */
  const ttsSpokenPrefixRef = useRef('')
  /** Whether the reply has finalized (so a drained queue means reading is done). */
  const ttsFinalizedRef = useRef(false)
  /** A stop-tap on the mic consumes its pointer-up (no toggle/monitoring side effects). */
  const stopTapRef = useRef(false)

  /** End reply reading (naturally or by user stop): clear state and resume monitoring if paused. */
  const finishReading = (): void => {
    setReadingReply(false)
    if (readingPausedRef.current) {
      readingPausedRef.current = false
      if (monitoringRef.current) startRecognizer()
    }
  }

  /** Speak queued segments one at a time; once the queue drains after the reply finalizes, finish. */
  const pumpQueue = (): void => {
    const sp = speakerRef.current
    if (sp === null || ttsSpeakingRef.current) return
    const segment = ttsQueueRef.current.shift()
    if (segment === undefined) {
      if (ttsFinalizedRef.current) finishReading()
      return
    }
    ttsSpeakingRef.current = true
    sp.onend = () => { ttsSpeakingRef.current = false; pumpQueue() }
    console.info(`[dsh-voice] reading reply aloud: ${segment.slice(0, 40)}${segment.length > 40 ? '…' : ''}`)
    sp.speak(segment)
  }

  /** Queue reply segments for reading; pause recognition on the first so the reply is not echoed. */
  const enqueueReplySegments = (segments: string[]): void => {
    for (const segment of segments) {
      if (segment.trim().length > 0) ttsQueueRef.current.push(segment)
    }
    if (ttsQueueRef.current.length === 0) return
    if (!readingPausedRef.current) {
      const wasMonitoring = monitoringRef.current
      if (wasMonitoring) pauseRecognizer()
      readingPausedRef.current = wasMonitoring
    }
    setReadingReply(true)
    pumpQueue()
  }

  /** Stop the in-flight reply reading (user taps the mic while it reads). */
  const stopReading = (): void => {
    ttsQueueRef.current = []
    ttsFinalizedRef.current = true
    speakerRef.current?.stop()
    finishReading()
  }

  // Streaming reply reading: speak each completed sentence as the assistant
  // streams, so the reply is heard while the model is still generating. The
  // spoken prefix advances only past enqueued segments; a trailing incomplete
  // sentence stays un-spoken and is spoken when it completes or on finalize.
  useEffect(() => {
    if (!chatArmedRef.current) return
    const current = extractPartialText(partial)
    if (current.length === 0) return
    // On revision/shrink the already-spoken prefix stays historical; only text
    // after the common prefix is newly spoken.
    const covered = commonPrefixLength(current, ttsSpokenPrefixRef.current)
    ttsSpokenPrefixRef.current = current.slice(0, covered)
    const newText = current.slice(covered)
    const parts = splitStreamSegments(newText)
    if (parts.length === 0) return
    const segments: string[] = []
    let lastEnd = 0
    for (const part of parts) {
      segments.push(part.segment)
      lastEnd = part.end
    }
    ttsSpokenPrefixRef.current = current.slice(0, covered + lastEnd)
    enqueueReplySegments(segments)
  }, [partial])

  /**
   * Arm reply reading: only the assistant reply arriving after the current
   * maximum assistant seq will be spoken (baseline from nodes strictly before
   * `afterSeq`, so a same-batch reply is not skipped).
   */
  const armReplyReading = (afterSeq: number): void => {
    const maxSeq = chatNodesRef.current.reduce(
      (max, node) => node.kind === 'assistant' && node.seq < afterSeq ? Math.max(max, node.seq) : max,
      -1,
    )
    replySeqRef.current = maxSeq
    chatArmedRef.current = true
  }

  // When the draft changes externally (a send cleared it, or the user typed):
  // reset the append base + transcript, and — on a send — restart the
  // recognizer so it cannot re-emit the old transcript. Monitoring itself
  // continues (the user can keep talking after sending).
  useEffect(() => {
    if (draft === lastDraftRef.current) return
    if (!setByUsRef.current) {
      baseRef.current = draft
      accRef.current.reset()
      if (monitoringRef.current) restartRecognizer()
    }
    lastDraftRef.current = draft
    setByUsRef.current = false
  }, [draft])

  // A send that happens right after mic use arms reply reading for the next
  // assistant reply — covering both hold-to-talk and tap-monitoring sends,
  // not just the hold path. A long mic pause (5 min) treats typing as non-voice.
  useEffect(() => {
    for (let i = chatNodes.length - 1; i >= 0; i--) {
      const node = chatNodes[i]!
      if (node.kind === 'user' && node.seq > lastUserSeqRef.current) {
        lastUserSeqRef.current = node.seq
        if (Date.now() - micUsedAtRef.current < 5 * 60 * 1000) armReplyReading(node.seq)
        break
      }
    }
  }, [chatNodes])

  // Finalized tail: when the reply completes, speak any text not yet streamed
  // (a short no-delimiter reply, or the last incomplete sentence), then disarm.
  useEffect(() => {
    if (!chatArmedRef.current) return
    for (let i = chatNodes.length - 1; i >= 0; i--) {
      const node = chatNodes[i]!
      if (node.kind === 'assistant' && node.seq > replySeqRef.current) {
        ttsFinalizedRef.current = true
        replySeqRef.current = node.seq
        chatArmedRef.current = false
        const fullText = extractPartialText(node)
        const remaining = fullText.slice(commonPrefixLength(fullText, ttsSpokenPrefixRef.current))
        if (remaining.trim().length > 0) {
          enqueueReplySegments([remaining])
        } else if (ttsQueueRef.current.length === 0 && !ttsSpeakingRef.current) {
          finishReading()
        }
        break
      }
    }
  }, [chatNodes])

  /**
   * Start one recognition segment (continuous false — the reliable mode that
   * actually delivers interim results). On segment end, auto-restart while
   * monitoring stays on, so listening is continuous across silences.
   */
  const startRecognizer = (): void => {
    const rec = createBrowserRecognition()
    if (rec === null) { setMicState('unsupported'); return }
    const acc = accRef.current
    rec.lang = language
    rec.continuous = false
    rec.interimResults = interimResults
    rec.onresult = (event) => {
      applyResults(acc, event)
      setByUsRef.current = true
      inputActions.setDraft([baseRef.current, acc.transcript].filter((part) => part.length > 0).join(' '))
    }
    rec.onend = () => {
      recRef.current = null
      if (monitoringRef.current) startRecognizer() // keep monitoring across silences
      else setMicState('idle')
    }
    rec.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') setMicState('unsupported')
      else if (monitoringRef.current) startRecognizer()
    }
    rec.start()
    recRef.current = rec
    setMicState('listening')
  }

  /** Enter monitoring: fresh transcript base, then keep the recognizer running. */
  const beginMonitoring = (): void => {
    monitoringRef.current = true
    accRef.current = new TranscriptAccumulator()
    baseRef.current = draft
    lastDraftRef.current = draft
    startRecognizer()
  }

  const stopMonitoring = (): void => {
    monitoringRef.current = false
    const rec = recRef.current
    recRef.current = null
    rec?.stop()
  }

  /**
   * Stop the current recognizer and start a fresh one. Suppresses the old
   * recognizer's handlers so its `onend` cannot double-start, and drops any
   * stale transcript the old session might still emit.
   */
  const restartRecognizer = (): void => {
    const old = recRef.current
    if (old !== null) {
      recRef.current = null
      old.onend = () => {}
      old.onerror = () => {}
      old.stop()
    }
    startRecognizer()
  }

  /** Hold released → submit the transcript as a message (voice chat). */
  const submitChat = (): void => {
    monitoringRef.current = false
    // Baseline: only speak the assistant reply that arrives AFTER this submit.
    // The bounded baseline covers the same-batch case; the user-node effect
    // re-arms on the admitted message for tap-monitoring sends.
    armReplyReading(Infinity)
    const rec = recRef.current
    recRef.current = null
    rec?.stop()
    const text = accRef.current.transcript
    setMicState('idle')
    if (text.length > 0) {
      inputActions.setDraft(text)
      inputActions.submit()
    }
  }

  const onPointerDown = (): void => {
    if (micState === 'unsupported') return
    // A tap while the reply is being read aloud stops it (the mic is the
    // stop control for an over-long reply). The pointer-up is consumed so the
    // stop does not also toggle monitoring or submit anything.
    if (readingReply) {
      stopTapRef.current = true
      stopReading()
      return
    }
    stopTapRef.current = false
    // The pointer-down is a user gesture: unlock reply audio here so the
    // assistant's reply (which arrives seconds later) is exempt from the
    // browser autoplay policy.
    unlockReplyAudio()
    micUsedAtRef.current = Date.now()
    wasListeningRef.current = micState === 'listening'
    holdingRef.current = false
    if (!wasListeningRef.current) {
      beginMonitoring()
      holdTimerRef.current = window.setTimeout(() => { holdingRef.current = true }, HOLD_THRESHOLD)
    }
  }

  const onPointerUp = (): void => {
    if (stopTapRef.current) { stopTapRef.current = false; return }
    if (holdTimerRef.current !== null) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null }
    if (wasListeningRef.current) {
      stopMonitoring() // tap again → stop monitoring
    } else if (holdingRef.current) {
      holdingRef.current = false
      submitChat()
    }
    // A quick tap on idle keeps monitoring (toggle on).
  }

  const onPointerLeave = (): void => {
    // Only a hold-drag-away submits; a pointer drift during monitoring must
    // not stop the recognizer (the user may move the mouse while talking).
    if (holdingRef.current) {
      holdingRef.current = false
      submitChat()
    }
  }

  const listening = micState === 'listening'
  return (
    <span className="dsh-voice-control">
      <button
        type="button"
        className="dsh-voice-input"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        aria-pressed={listening}
        aria-label={t('mic.label')}
        data-reading={readingReply || undefined}
        title={readingReply ? t('mic.title.reading') : listening ? t('mic.title.listening') : t('mic.title')}
        disabled={micState === 'unsupported'}
      >
        <MicIcon listening={listening} readingReply={readingReply} />
      </button>
    </span>
  )
}

/** A linear mic icon; DeepSeek blue while listening/reading, theme primary otherwise. */
function MicIcon({ listening, readingReply }: { listening: boolean; readingReply: boolean }): React.ReactElement {
  const active = listening || readingReply
  return (
    <span className="dsh-voice-icon" aria-hidden="true">
      <style>
        {`@keyframes dsh-mic-pulse{0%,100%{opacity:1}50%{opacity:.45}}`
        + `.dsh-voice-input{border:none;background:transparent;padding:4px;cursor:pointer;display:inline-flex;align-items:center;line-height:0;color:inherit;border-radius:6px}`
        + `.dsh-voice-input:hover{background:var(--dsw-alias-interactive-bg-hover);opacity:1}`
        + `.dsh-voice-icon{display:inline-flex;width:17px;height:17px;color:${active ? DEEPSEEK_BLUE : 'var(--dsw-alias-label-secondary)'}}`
        + `.dsh-voice-icon svg{width:100%;height:100%}`
        + `.dsh-voice-input[aria-pressed="true"] .dsh-voice-icon{animation:dsh-mic-pulse 1s ease-in-out infinite}`
        + `.dsh-voice-input[data-reading] .dsh-voice-icon{animation:dsh-mic-pulse 1s ease-in-out infinite}`}
      </style>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
    </span>
  )
}

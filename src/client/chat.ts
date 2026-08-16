/**
 * Voice-chat orchestration: keeps the mic listening continuously, submits
 * committed transcripts, reads the assistant's reply aloud, and barge-ins — a
 * new user utterance cuts the assistant's voice. The recognition and TTS
 * surfaces are injectable so the loop is unit-testable.
 * @module @deepseek-ai/dsh-client-ui-voice-input/src/client/chat
 */

import type { TtsSpeakerLike, VoiceRecognitionLike } from './speech.ts'

/** The controller's injectable surfaces. */
export interface VoiceChatControllerOptions {
  createRecognition: () => VoiceRecognitionLike | null
  createSpeaker: () => TtsSpeakerLike
  /** Called with a committed final transcript so the caller submits it. */
  onSubmit: (text: string) => void
  language: string
}

/**
 * The voice-chat loop. The caller drives it:
 * - `toggle()`/`start()`/`stop()` for the on/off switch,
 * - `handleAssistantText(text)` whenever the assistant's reply text updates.
 * While active the mic stays open; a new committed utterance barge-ins over
 * the assistant's voice, and a dropped recognition auto-recovers.
 */
export class VoiceChatController {
  private recognition: VoiceRecognitionLike | null = null
  private speaker: TtsSpeakerLike | null = null
  private finalParts: string[] = []
  private activeFlag = false

  constructor(private readonly options: VoiceChatControllerOptions) {}

  /** Whether the voice-chat loop is running. */
  get active(): boolean {
    return this.activeFlag
  }

  /** Toggle the loop on/off. */
  toggle(): void {
    if (this.activeFlag) this.stop()
    else this.start()
  }

  /** Start listening. No-op while a recognition is already live. */
  start(): void {
    if (this.recognition !== null) return
    const rec = this.options.createRecognition()
    if (rec === null) return
    this.activeFlag = true
    this.finalParts = []
    rec.lang = this.options.language
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (event) => {
      let committed = false
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result === undefined) continue
        const text = result[0]?.transcript ?? ''
        if (result.isFinal) {
          this.finalParts.push(text)
          committed = true
        }
      }
      if (committed) this.commitFinal()
    }
    rec.onend = () => {
      this.recognition = null
      if (this.activeFlag) this.start() // auto-recover / keep listening
    }
    rec.onerror = () => {
      this.recognition = null
      if (this.activeFlag) this.start() // keep the loop alive across errors
    }
    rec.start()
    this.recognition = rec
  }

  /**
   * Speak the assistant's reply. The mic stays open, so the user can talk
   * over it (barge-in).
   * @param text - the assistant's reply text.
   */
  handleAssistantText(text: string): void {
    if (!this.activeFlag) return
    if (text.trim().length === 0) return
    const speaker = this.options.createSpeaker()
    this.speaker = speaker
    speaker.onend = () => {
      this.speaker = null
    }
    speaker.speak(text)
  }

  /** Stop the loop: cancel recognition and any speech. */
  stop(): void {
    this.activeFlag = false
    this.recognition?.abort()
    this.recognition = null
    this.speaker?.stop()
    this.speaker = null
  }

  private commitFinal(): void {
    if (this.finalParts.length === 0) return
    const text = this.finalParts.join(' ')
    this.finalParts = []
    // Barge-in: the user just said something — cut the assistant's voice.
    this.speaker?.stop()
    this.speaker = null
    this.options.onSubmit(text)
  }
}

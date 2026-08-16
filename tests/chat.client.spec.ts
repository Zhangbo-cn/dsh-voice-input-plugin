import { describe, expect, it, vi } from 'vitest'
import { VoiceChatController, type VoiceChatControllerOptions } from '../src/client/chat.ts'
import type { TtsSpeakerLike, VoiceRecognitionLike } from '../src/client/speech.ts'

class FakeRecognition implements VoiceRecognitionLike {
  lang = ''
  continuous = false
  interimResults = false
  onresult: VoiceRecognitionLike['onresult'] = null
  onend: (() => void) | null = null
  onerror: ((e: { error: string }) => void) | null = null
  started = false
  aborted = false

  start(): void { this.started = true }
  stop(): void { this.started = false }
  abort(): void { this.started = false; this.aborted = true }

  emitResult(resultIndex: number, results: { isFinal: boolean; 0: { transcript: string } }[]): void {
    this.onresult?.({ resultIndex, results })
  }
}

class FakeSpeaker implements TtsSpeakerLike {
  spoken: string[] = []
  stopped = false
  speaking = false
  onend: (() => void) | null = null

  speak(text: string): void { this.spoken.push(text); this.speaking = true }
  stop(): void { this.stopped = true; this.speaking = false }

  finish(): void { this.speaking = false; this.onend?.() }
}

interface Harness {
  controller: VoiceChatController
  recognitions: FakeRecognition[]
  speakers: FakeSpeaker[]
  onSubmit: ReturnType<typeof vi.fn>
}

function makeHarness(language = 'zh-CN'): Harness {
  const recognitions: FakeRecognition[] = []
  const speakers: FakeSpeaker[] = []
  const onSubmit = vi.fn()
  const options: VoiceChatControllerOptions = {
    createRecognition: () => { const r = new FakeRecognition(); recognitions.push(r); return r },
    createSpeaker: () => { const s = new FakeSpeaker(); speakers.push(s); return s },
    onSubmit,
    language,
  }
  const controller = new VoiceChatController(options)
  return { controller, recognitions, speakers, onSubmit }
}

describe('VoiceChatController', () => {
  it('starts recognition on toggle and stays inactive when unsupported', () => {
    const { controller, recognitions } = makeHarness()
    controller.toggle()
    expect(controller.active).toBe(true)
    expect(recognitions[0]!.started).toBe(true)
    expect(recognitions[0]!.lang).toBe('zh-CN')
    expect(recognitions[0]!.continuous).toBe(true)

    const unsupported = new VoiceChatController({
      createRecognition: () => null,
      createSpeaker: () => new FakeSpeaker(),
      onSubmit: () => {},
      language: 'zh-CN',
    })
    unsupported.toggle()
    expect(unsupported.active).toBe(false)
  })

  it('commits a final transcript to onSubmit', () => {
    const { controller, recognitions, onSubmit } = makeHarness()
    controller.toggle()
    recognitions[0]!.emitResult(0, [{ isFinal: true, 0: { transcript: '你好世界' } }])
    expect(onSubmit).toHaveBeenCalledWith('你好世界')
  })

  it('speaks the assistant reply while the mic stays open', () => {
    const { controller, speakers, recognitions } = makeHarness()
    controller.toggle()
    controller.handleAssistantText('这是一段回复')
    expect(speakers[0]!.spoken).toEqual(['这是一段回复'])
    expect(recognitions).toHaveLength(1)
    expect(recognitions[0]!.started).toBe(true)
  })

  it('barge-in: a new utterance while the assistant is speaking cuts the voice and submits', () => {
    const { controller, recognitions, speakers, onSubmit } = makeHarness()
    controller.toggle()
    controller.handleAssistantText('回复中')
    const speaker = speakers[0]!
    expect(speaker.stopped).toBe(false)
    recognitions[0]!.emitResult(0, [{ isFinal: true, 0: { transcript: '我打断你' } }])
    expect(speaker.stopped).toBe(true)
    expect(onSubmit).toHaveBeenCalledWith('我打断你')
  })

  it('auto-recovers the mic when recognition ends or errors while active', () => {
    const { controller, recognitions } = makeHarness()
    controller.toggle()
    recognitions[0]!.onend?.()
    expect(recognitions).toHaveLength(2)
    expect(recognitions[1]!.started).toBe(true)
  })

  it('stop cancels recognition and speech', () => {
    const { controller, recognitions, speakers } = makeHarness()
    controller.toggle()
    controller.handleAssistantText('回复')
    controller.stop()
    expect(controller.active).toBe(false)
    expect(recognitions[0]!.aborted).toBe(true)
    expect(speakers[0]!.stopped).toBe(true)
  })

  it('ignores empty replies', () => {
    const { controller, speakers } = makeHarness()
    controller.toggle()
    controller.handleAssistantText('   ')
    expect(speakers).toHaveLength(0)
  })
})

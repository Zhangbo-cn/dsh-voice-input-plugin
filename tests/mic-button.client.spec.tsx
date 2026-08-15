// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { zh } from '../src/client/locales.ts'
import { MicButton, type MicButtonProps } from '../src/client/MicButton.tsx'

/** A fake browser SpeechRecognition the component drives through `window.SpeechRecognition`. */
class FakeRecognition {
  static instances: FakeRecognition[] = []

  lang = ''
  continuous = false
  interimResults = false
  onresult: ((e: { resultIndex: number; results: { isFinal: boolean; 0: { transcript: string } }[] }) => void) | null = null
  onend: (() => void) | null = null
  onerror: ((e: { error: string }) => void) | null = null
  started = false

  constructor() {
    FakeRecognition.instances.push(this)
  }

  start(): void { this.started = true }
  stop(): void { this.started = false; this.onend?.() }
  abort(): void { this.started = false }

  emitResult(resultIndex: number, results: { isFinal: boolean; 0: { transcript: string } }[]): void {
    this.onresult?.({ resultIndex, results })
  }

  emitError(error: string): void {
    this.onerror?.({ error })
  }
}

beforeEach(() => {
  FakeRecognition.instances = []
  ;(window as unknown as Record<string, unknown>).SpeechRecognition = FakeRecognition
})

afterEach(() => {
  cleanup()
  delete (window as unknown as Record<string, unknown>).SpeechRecognition
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition
})

function renderButton(overrides: Partial<MicButtonProps> = {}): { setDraft: ReturnType<typeof vi.fn> } {
  const setDraft = vi.fn()
  const props = {
    useInput: (selector: (s: { draft: string }) => string) => selector({ draft: 'hello' }),
    inputActions: { setDraft },
    language: 'zh-CN',
    continuous: true,
    interimResults: true,
    t: (key: keyof typeof zh) => zh[key],
    ...overrides,
  } as unknown as MicButtonProps
  render(<MicButton {...props} />)
  return { setDraft }
}

describe('MicButton', () => {
  it('starts recognition on click and marks the button as pressed', () => {
    renderButton()
    const button = screen.getByRole('button', { name: '语音输入' })
    expect(button.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(button)
    expect(FakeRecognition.instances).toHaveLength(1)
    expect(FakeRecognition.instances[0]!.started).toBe(true)
    expect(button.getAttribute('aria-pressed')).toBe('true')
  })

  it('appends the final transcript to the existing draft without duplicating interim', () => {
    const { setDraft } = renderButton()
    fireEvent.click(screen.getByRole('button', { name: '语音输入' }))
    const rec = FakeRecognition.instances[0]!

    rec.emitResult(0, [{ isFinal: false, 0: { transcript: '你好' } }])
    expect(setDraft).toHaveBeenLastCalledWith('hello 你好')

    // A later interim segment REPLACES the earlier one (no duplication).
    rec.emitResult(0, [{ isFinal: false, 0: { transcript: '你好世界' } }])
    expect(setDraft).toHaveBeenLastCalledWith('hello 你好世界')

    // The final segment commits the same text once.
    rec.emitResult(0, [{ isFinal: true, 0: { transcript: '你好世界' } }])
    expect(setDraft).toHaveBeenLastCalledWith('hello 你好世界')
    expect(setDraft).toHaveBeenCalledTimes(3)
  })

  it('commits multiple final segments in order', () => {
    const { setDraft } = renderButton()
    fireEvent.click(screen.getByRole('button', { name: '语音输入' }))
    const rec = FakeRecognition.instances[0]!

    rec.emitResult(0, [{ isFinal: true, 0: { transcript: '第一句' } }])
    // The real API's results array grows; resultIndex points at the new head.
    rec.emitResult(1, [
      { isFinal: true, 0: { transcript: '第一句' } },
      { isFinal: true, 0: { transcript: '第二句' } },
    ])
    expect(setDraft).toHaveBeenLastCalledWith('hello 第一句 第二句')
  })

  it('returns to idle when recognition ends (click to stop)', () => {
    renderButton()
    const button = screen.getByRole('button', { name: '语音输入' })
    fireEvent.click(button)
    fireEvent.click(button)
    const rec = FakeRecognition.instances[0]!
    expect(rec.started).toBe(false)
    expect(button.getAttribute('aria-pressed')).toBe('false')
  })

  it('disables the button and surfaces the unsupported state when Web Speech is absent', () => {
    delete (window as unknown as Record<string, unknown>).SpeechRecognition
    const { setDraft } = renderButton()
    const button = screen.getByRole('button', { name: '语音输入' })
    fireEvent.click(button)
    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(FakeRecognition.instances).toHaveLength(0)
    expect(setDraft).not.toHaveBeenCalled()
  })

  it('uses the configured language and recognition options', () => {
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: '语音输入' }))
    const rec = FakeRecognition.instances[0]!
    expect(rec.lang).toBe('zh-CN')
    expect(rec.continuous).toBe(true)
    expect(rec.interimResults).toBe(true)
  })
})

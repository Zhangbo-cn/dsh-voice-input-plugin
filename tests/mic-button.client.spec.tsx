// @vitest-environment jsdom
import { act } from 'react'
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
}

beforeEach(() => {
  FakeRecognition.instances = []
  ;(window as unknown as Record<string, unknown>).SpeechRecognition = FakeRecognition
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  delete (window as unknown as Record<string, unknown>).SpeechRecognition
})

function renderButton(): { setDraft: ReturnType<typeof vi.fn>; submit: ReturnType<typeof vi.fn> } {
  const setDraft = vi.fn()
  const submit = vi.fn()
  const props = {
    useInput: (selector: (s: { draft: string }) => string) => selector({ draft: 'hello' }),
    useSession: (selector: (s: { chat: { legacy: { nodes: unknown[] } } }) => unknown) =>
      selector({ chat: { legacy: { nodes: [] } } }),
    inputActions: { setDraft, submit },
    language: 'zh-CN',
    interimResults: true,
    t: (key: keyof typeof zh) => zh[key],
  } as unknown as MicButtonProps
  render(<MicButton {...props} />)
  return { setDraft, submit }
}

describe('MicButton tap toggles continuous monitoring', () => {
  it('starts monitoring on the first tap (stays listening)', () => {
    renderButton()
    const button = screen.getByRole('button', { name: '语音输入' })
    fireEvent.pointerDown(button)
    expect(FakeRecognition.instances).toHaveLength(1)
    expect(FakeRecognition.instances[0]!.started).toBe(true)
    fireEvent.pointerUp(button)
    // A quick tap on idle keeps monitoring (toggle on).
    expect(button.getAttribute('aria-pressed')).toBe('true')
  })

  it('auto-restarts the recognizer to keep monitoring across silences', () => {
    vi.useFakeTimers()
    renderButton()
    const button = screen.getByRole('button', { name: '语音输入' })
    fireEvent.pointerDown(button)
    fireEvent.pointerUp(button)
    expect(FakeRecognition.instances).toHaveLength(1)
    // A segment ends (silence) while monitoring → the recognizer auto-restarts.
    FakeRecognition.instances[0]!.onend?.()
    expect(FakeRecognition.instances).toHaveLength(2)
    expect(FakeRecognition.instances[1]!.started).toBe(true)
  })

  it('streams the transcript into the draft live as the user speaks', () => {
    const { setDraft } = renderButton()
    const button = screen.getByRole('button', { name: '语音输入' })
    fireEvent.pointerDown(button)
    fireEvent.pointerUp(button)
    const rec = FakeRecognition.instances[0]!
    rec.emitResult(0, [{ isFinal: false, 0: { transcript: '你好' } }])
    expect(setDraft).toHaveBeenLastCalledWith('hello 你好')
    rec.emitResult(0, [{ isFinal: false, 0: { transcript: '你好世界' } }])
    expect(setDraft).toHaveBeenLastCalledWith('hello 你好世界')
  })

  it('stops monitoring when tapped again', () => {
    renderButton()
    const button = screen.getByRole('button', { name: '语音输入' })
    fireEvent.pointerDown(button)
    fireEvent.pointerUp(button)
    expect(button.getAttribute('aria-pressed')).toBe('true')
    // Tap again → stop.
    fireEvent.pointerDown(button)
    fireEvent.pointerUp(button)
    expect(button.getAttribute('aria-pressed')).toBe('false')
    expect(FakeRecognition.instances[0]!.started).toBe(false)
  })

  it('keeps monitoring when the pointer moves away', () => {
    renderButton()
    const button = screen.getByRole('button', { name: '语音输入' })
    fireEvent.pointerDown(button)
    fireEvent.pointerUp(button)
    expect(button.getAttribute('aria-pressed')).toBe('true')
    fireEvent.pointerLeave(button)
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(FakeRecognition.instances[0]!.started).toBe(true)
  })

  it('keeps monitoring with a fresh recognizer when the draft is cleared by a send', () => {
    const draftValue = { current: 'hello' }
    const props = {
      useInput: (selector: (s: { draft: string }) => string) => selector({ draft: draftValue.current }),
      useSession: (selector: (s: { chat: { legacy: { nodes: unknown[] } } }) => unknown) =>
        selector({ chat: { legacy: { nodes: [] } } }),
      inputActions: { setDraft: vi.fn(), submit: vi.fn() },
      language: 'zh-CN',
      interimResults: true,
      t: (key: keyof typeof zh) => zh[key],
    } as unknown as MicButtonProps
    const view = render(<MicButton {...props} />)
    const button = screen.getByRole('button', { name: '语音输入' })
    fireEvent.pointerDown(button)
    fireEvent.pointerUp(button)
    expect(FakeRecognition.instances).toHaveLength(1)
    expect(button.getAttribute('aria-pressed')).toBe('true')
    // A send clears the draft externally → monitoring continues on a fresh recognizer.
    draftValue.current = ''
    view.rerender(<MicButton {...props} />)
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(FakeRecognition.instances).toHaveLength(2)
    expect(FakeRecognition.instances[1]!.started).toBe(true)
  })

  it('disables the button when Web Speech is absent', () => {
    delete (window as unknown as Record<string, unknown>).SpeechRecognition
    renderButton()
    fireEvent.pointerDown(screen.getByRole('button', { name: '语音输入' }))
    expect((screen.getByRole('button', { name: '语音输入' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('MicButton voice-chat reply speaking', () => {
  /** Neutralize jsdom's unimplemented media/object-URL APIs so the host TTS path runs. */
  function stubMedia(): void {
    Object.defineProperty(HTMLMediaElement.prototype, 'play', { value: vi.fn().mockResolvedValue(undefined), configurable: true })
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', { value: vi.fn(), configurable: true })
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:fake'), configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
  }

  /** A full hold-to-chat run; returns the render view and mutable session nodes. */
  function holdAndSubmit(nodes: { current: { kind: string; seq: number; blocks: { kind: string; text: string }[] }[] }, submit: ReturnType<typeof vi.fn>): ReturnType<typeof render> {
    const setDraft = vi.fn()
    const props = {
      useInput: (selector: (s: { draft: string }) => string) => selector({ draft: 'hello' }),
      useSession: (selector: (s: { chat: { legacy: { nodes: typeof nodes.current } } }) => unknown) =>
        selector({ chat: { legacy: { nodes: nodes.current } } }),
      inputActions: { setDraft, submit },
      language: 'zh-CN',
      interimResults: true,
      t: (key: keyof typeof zh) => zh[key],
    } as unknown as MicButtonProps
    const view = render(<MicButton {...props} />)
    vi.useFakeTimers()
    fireEvent.pointerDown(screen.getByRole('button', { name: '语音输入' }))
    act(() => { vi.advanceTimersByTime(300) })
    const rec = FakeRecognition.instances[0]!
    rec.emitResult(0, [{ isFinal: true, 0: { transcript: '帮我查天气' } }])
    fireEvent.pointerUp(screen.getByRole('button', { name: '语音输入' }))
    expect(submit).toHaveBeenCalled()
    return view
  }

  it('reads the finalized reply once via the host /api/tts route after a hold-submit', () => {
    stubMedia()
    const fetchMock = vi.fn(async () => new Response('audio-data', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const nodes = { current: [] as { kind: string; seq: number; blocks: { kind: string; text: string }[] }[] }
    const submit = vi.fn()
    const view = holdAndSubmit(nodes, submit)
    expect(fetchMock).not.toHaveBeenCalled()

    // The assistant reply finalizes → a new assistant node appears → spoken once.
    nodes.current = [{ kind: 'assistant', seq: 5, blocks: [{ kind: 'text', text: '这是一段回复' }] }]
    view.rerender(<MicButton {...holdAndSubmitProps(nodes, submit)} />)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const calledUrl = fetchMock.mock.calls[0]![0] as string
    expect(calledUrl).toMatch(/^\/api\/tts\?text=/)
    expect(decodeURIComponent(calledUrl)).toContain('这是一段回复')

    // A later reply is NOT read (only the reply to the held message, once).
    nodes.current = [...nodes.current, { kind: 'assistant', seq: 6, blocks: [{ kind: 'text', text: '又一段' }] }]
    view.rerender(<MicButton {...holdAndSubmitProps(nodes, submit)} />)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('falls back to browser speechSynthesis when the host TTS route is unreachable', async () => {
    stubMedia()
    const speak = vi.fn()
    ;(window as unknown as Record<string, unknown>).speechSynthesis = { speak, cancel: vi.fn(), resume: vi.fn(), getVoices: () => [], speaking: false }
    ;(window as unknown as Record<string, unknown>).SpeechSynthesisUtterance = class {
      text: string
      voice?: unknown
      onend?: () => void
      onerror?: () => void
      constructor(text: string) { this.text = text }
    }
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('host unreachable') }))
    const nodes = { current: [] as { kind: string; seq: number; blocks: { kind: string; text: string }[] }[] }
    const submit = vi.fn()
    const view = holdAndSubmit(nodes, submit)

    nodes.current = [{ kind: 'assistant', seq: 5, blocks: [{ kind: 'text', text: '这是一段回复' }] }]
    await act(async () => { view.rerender(<MicButton {...holdAndSubmitProps(nodes, submit)} />) })
    expect(speak).toHaveBeenCalledTimes(1)
    const utterance = speak.mock.calls[0]![0] as { text: string }
    expect(utterance.text).toBe('这是一段回复')
  })

  it('reads the reply after a tap-monitoring send when the mic was used recently', () => {
    stubMedia()
    const fetchMock = vi.fn(async () => new Response('audio-data', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const nodes = { current: [] as { kind: string; seq: number; blocks: { kind: string; text: string }[] }[] }
    const view = render(<MicButton {...holdAndSubmitProps(nodes, vi.fn())} />)
    // A quick tap (monitoring toggle) counts as recent mic use for the arming gate.
    fireEvent.pointerDown(screen.getByRole('button', { name: '语音输入' }))
    fireEvent.pointerUp(screen.getByRole('button', { name: '语音输入' }))

    // A send admits a user message, then the assistant reply finalizes.
    nodes.current = [
      { kind: 'user', seq: 4, blocks: [] },
      { kind: 'assistant', seq: 5, blocks: [{ kind: 'text', text: '这是一段回复' }] },
    ]
    view.rerender(<MicButton {...holdAndSubmitProps(nodes, vi.fn())} />)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(decodeURIComponent(fetchMock.mock.calls[0]![0] as string)).toContain('这是一段回复')
  })

  it('does not read the reply after a typed send when the mic was never used', () => {
    stubMedia()
    const fetchMock = vi.fn(async () => new Response('audio-data', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const nodes = { current: [] as { kind: string; seq: number; blocks: { kind: string; text: string }[] }[] }
    const view = render(<MicButton {...holdAndSubmitProps(nodes, vi.fn())} />)
    // No mic gesture: a typed send admits a user message, then the reply finalizes.
    nodes.current = [
      { kind: 'user', seq: 4, blocks: [] },
      { kind: 'assistant', seq: 5, blocks: [{ kind: 'text', text: '这是一段回复' }] },
    ]
    view.rerender(<MicButton {...holdAndSubmitProps(nodes, vi.fn())} />)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

/** Build the MicButton props for a rerender; keeps the render() helper single-use. */
function holdAndSubmitProps(
  nodes: { current: { kind: string; seq: number; blocks: { kind: string; text: string }[] }[] },
  submit: ReturnType<typeof vi.fn>,
): MicButtonProps {
  return {
    useInput: (selector: (s: { draft: string }) => string) => selector({ draft: 'hello' }),
    useSession: (selector: (s: { chat: { legacy: { nodes: typeof nodes.current } } }) => unknown) =>
      selector({ chat: { legacy: { nodes: nodes.current } } }),
    inputActions: { setDraft: vi.fn(), submit },
    language: 'zh-CN',
    interimResults: true,
    t: (key: keyof typeof zh) => zh[key],
  } as unknown as MicButtonProps
}

describe('MicButton hold-to-chat', () => {
  it('submits the transcript when released after a long hold', () => {
    vi.useFakeTimers()
    const { setDraft, submit } = renderButton()
    const button = screen.getByRole('button', { name: '语音输入' })
    fireEvent.pointerDown(button)
    const rec = FakeRecognition.instances[0]!
    expect(rec.started).toBe(true)
    act(() => { vi.advanceTimersByTime(300) })
    rec.emitResult(0, [{ isFinal: true, 0: { transcript: '帮我查天气' } }])
    fireEvent.pointerUp(button)
    expect(setDraft).toHaveBeenCalledWith('帮我查天气')
    expect(submit).toHaveBeenCalled()
  })

  it('does not submit when a hold produced no speech', () => {
    vi.useFakeTimers()
    const { setDraft, submit } = renderButton()
    const button = screen.getByRole('button', { name: '语音输入' })
    fireEvent.pointerDown(button)
    act(() => { vi.advanceTimersByTime(300) })
    fireEvent.pointerUp(button)
    expect(setDraft).not.toHaveBeenCalled()
    expect(submit).not.toHaveBeenCalled()
  })
})

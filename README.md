# dsh-client-ui-voice-input

Composer **voice control** for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): a minimal linear mic button in the composer tool row that turns your speech into text — with a **tap-to-monitor** mode (continuous, live 逐字 streaming, send-anytime) and a **hold-to-talk** voice-chat mode (release to send, reply read aloud). Zero backend, zero API key — recognition and TTS run entirely in the browser via the Web Speech API.

`dsh-plugin` · TypeScript · React

## Features

- **Tap to monitor**: click the mic, speak — text streams into the draft live (逐字输入), the mic keeps listening even in silence, and you can send or keep adding speech anytime. Tap again to stop.
- **Hold to talk**: press-and-hold to record a voice-chat message, release to send it; the assistant's reply is read aloud (browser TTS, preferring natural/Edge neural voices).
- **Continuous across silences**: each recognition segment auto-restarts so monitoring never drops.
- **Respects the composer**: speech appends to the draft (base preserved); a send clears the draft cleanly without re-filling old text; monitoring continues after a send on a fresh recognizer.
- **DeepSeek-blue listening state**: the icon pulses in DeepSeek brand blue while listening; borderless linear icon, no clutter.
- **Configurable**: recognition language (default `zh-CN`) and interim results.

## Install

Add the package to your DSH web composition. If you develop from a [DeepSeek Harness checkout](https://github.com/deepseek-ai/deepseek-harness), mount it in the web-app browser roster (`packages/bundle/web-app/cordis.patch.yml`):

```yaml
- id: ui-voice-input
  name: '@zhangbo-cn/dsh-client-ui-voice-input'
```

Then build the client bundle with the repo's tsdown preset:

```sh
pnpm --filter @zhangbo-cn/dsh-client-ui-voice-input run bundle
```

## Usage

After refreshing the Web UI, the composer tool row shows a linear mic button.

### Voice input (tap)

1. **Click** the mic → the icon turns DeepSeek blue and pulses (listening).
2. **Speak** → text appears in the input box live, word by word.
3. Send anytime with the composer's send button; keep talking to add more.
4. **Click the mic again** to stop monitoring.

### Voice chat (hold)

1. **Press-and-hold** the mic (longer than ~250 ms) and speak.
2. **Release** → your message is sent.
3. The assistant's reply is read aloud automatically.

### Configuration

```yaml
- id: ui-voice-input
  name: '@zhangbo-cn/dsh-client-ui-voice-input'
  config:
    language: 'zh-CN'      # Web Speech recognition language tag
    interimResults: true   # stream live interim transcript into the draft
```

## How it works

```
MicButton (conversation.input.left)
  ├─ tap → beginMonitoring()
  │     → SpeechRecognition (continuous:false, interimResults)  // reliable results
  │     → onresult → TranscriptAccumulator → inputActions.setDraft(base + transcript)
  │     → onend (silence) → auto-restart (keep monitoring)      // continuous
  │     → tap again → stop
  └─ hold → submitChat()
        → on release: stop + inputActions.setDraft(text) + inputActions.submit()
        → reply → createBrowserSpeaker() → speechSynthesis (prefers natural voice)
```

- Recognition starts on pointer-down (a user gesture — required by the Web Speech API); tap vs hold is decided on release.
- `continuous: false` per segment is intentional: Chrome's `continuous: true` fails to deliver `onresult`, so monitoring is achieved by auto-restarting segments.
- The append base resets when the draft changes externally, so a send never lets stale voice text re-fill the box.

## Compatibility

| Browser | Mic (input, SpeechRecognition) | Reply playback (speechSynthesis) |
|---------|--------------------------------|----------------------------------|
| Chrome / Edge (Windows) | ✅ Web Speech | ✅ natural (Google / Edge neural) voices |
| Safari | ✅ webkitSpeechRecognition (re-trigger on each gesture) | ✅ natural OS voices |
| Firefox | ⚠️ **not supported — browser limitation** (Mozilla has not shipped `SpeechRecognition`; local on-device recognition is still early-stage) | ⚠️ `speechSynthesis` **is supported** (reply can be read aloud), but voices are OS-default / less natural |

Notes:
- **Firefox mic input**: this is a genuine browser limitation, not a plugin issue. The plugin feature-detects and disables the mic with a "not supported in this browser" hint. A cross-browser fallback would need `MediaRecorder` + an external transcription service (out of scope for a zero-backend plugin).
- **Reply playback**: `speechSynthesis` works in Firefox; only the voice quality differs (it falls back to the OS default voice rather than a natural neural voice).
- Requires a microphone and a browser with `speechSynthesis` for reply playback.

## Tests

```sh
npx vitest run   # 19 tests: tap monitoring, hold submit, auto-restart, send-clear, chat controller
```

## License

MIT

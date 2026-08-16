# dsh-client-ui-voice-input

Composer **voice control** for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): a minimal linear mic button in the composer tool row that turns your speech into text — with a **tap-to-monitor** mode (continuous, live 逐字 streaming, send-anytime) and a **hold-to-talk** voice-chat mode (release to send, reply read aloud). Zero API key: recognition runs in the browser via the Web Speech API; reply reading uses the host's Edge TTS (`/api/tts`) with a browser `speechSynthesis` fallback.

`dsh-plugin` · TypeScript · React

## Features

- **Tap to monitor**: click the mic, speak — text streams into the draft live (逐字输入), the mic keeps listening even in silence, and you can send or keep adding speech anytime. Tap again to stop.
- **Hold to talk**: press-and-hold to record a voice-chat message, release to send it; the assistant's reply is read aloud — host Edge neural TTS (`/api/tts`) first, browser `speechSynthesis` as fallback.
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

For **reliable reply reading**, also mount the host Edge TTS capability (`@deepseek-ai/dsh-tts-edge`), which registers `/api/tts`:

```yaml
- id: tts-edge
  name: '@deepseek-ai/dsh-tts-edge'
```

Without it, reply reading still works but falls back to the browser's `speechSynthesis` (less natural, occasionally silent on Chrome after an idle gap).

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

### Reply reading after any send

A send that follows mic use (within 5 minutes) — hold **or** tap-monitoring + the composer send button — arms reply reading for the next assistant reply. Typed sends without recent mic use do not trigger it.

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
        → reply → createReplySpeaker()
              → fetch /api/tts (host Edge neural MP3)
              → play via gesture-unlocked AudioContext (else <audio> element)
              → fallback: browser speechSynthesis
```

- Recognition starts on pointer-down (a user gesture — required by the Web Speech API); tap vs hold is decided on release.
- The same pointer-down gesture unlocks reply audio (a shared `AudioContext` is resumed), so the assistant's reply — which arrives seconds later — is exempt from the browser autoplay policy that would otherwise block a plain `HTMLMediaElement.play()`.
- `continuous: false` per segment is intentional: Chrome's `continuous: true` fails to deliver `onresult`, so monitoring is achieved by auto-restarting segments.
- The append base resets when the draft changes externally, so a send never lets stale voice text re-fill the box.
- While the reply is being read aloud, the mic icon stays highlighted (deep blue pulse) as a "reading" indicator; the console logs `[dsh-voice]` diagnostics for the attempt and any fallback.

## Compatibility

| Browser | Mic (input, SpeechRecognition) | Reply playback (host `/api/tts`, fallback `speechSynthesis`) |
|---------|--------------------------------|--------------------------------------------------------------|
| Chrome / Edge (Windows) | ✅ Web Speech | ✅ host Edge neural MP3; browser `speechSynthesis` fallback |
| Safari | ✅ webkitSpeechRecognition (re-trigger on each gesture) | ✅ host Edge neural MP3 (playable); browser fallback works |
| Firefox | ⚠️ **not supported — browser limitation** (Mozilla has not shipped `SpeechRecognition`; local on-device recognition is still early-stage) | ✅ host Edge neural MP3 (playable); `speechSynthesis` fallback supported but less natural |

Notes:
- **Firefox mic input**: this is a genuine browser limitation, not a plugin issue. The plugin feature-detects and disables the mic with a "not supported in this browser" hint. A cross-browser fallback would need `MediaRecorder` + an external transcription service (out of scope for a zero-backend plugin).
- **Reply playback**: the preferred path is the host's `/api/tts` (Microsoft Edge neural voices, synthesized server-side) — reliable and natural on every browser that can play MP3. Without the `tts-edge` host plugin, the client falls back to `speechSynthesis` (Chrome may silently drop `speak()` after an idle gap; voices are OS-default).
- Mic input requires a browser with Web Speech; reply playback requires either the `tts-edge` host plugin or a browser with `speechSynthesis`.

## Tests

```sh
npx vitest run   # 23 tests: tap monitoring, hold submit, auto-restart, send-clear, host/browser reply reading, tap-send arming
```

## License

MIT

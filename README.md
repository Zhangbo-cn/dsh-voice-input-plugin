# dsh-client-ui-voice-input

Composer **voice-input control** for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): a mic button in the composer tool row that transcribes **browser Web Speech recognition** into the draft via the official `inputActions.setDraft` write path.

- **Zero backend, zero key** — recognition runs entirely in the browser (Chrome/Edge → Google, Safari → Apple Web Speech).
- **Accuracy**: interim segments replace (no duplication), final segments commit, the pre-existing draft is preserved.
- **Convenience**: click to start / click to stop, listening state (`aria-pressed` + title), unsupported browsers degrade to a disabled button with a hint.
- **Configurable**: `language` (default `zh-CN`), `continuous`, `interimResults`.

Source distribution (`dsh-plugin` topic). The browser bundle is produced by the DSH web build's `tsdown` client preset; the package ships source + tests for a DSH checkout.

## How it works

```
MicButton (conversation.input.left)
  → window.SpeechRecognition / webkitSpeechRecognition
  → TranscriptAccumulator (final + interim, no duplication)
  → inputActions.setDraft(base + transcript)
```

## Install in a DSH checkout

Mount in the web-app browser roster (`packages/bundle/web-app/cordis.patch.yml`):

```yaml
- id: ui-voice-input
  name: '@zhangbo-cn/dsh-client-ui-voice-input'
```

Build the client bundle with the repo's tsdown preset:

```sh
pnpm --filter @zhangbo-cn/dsh-client-ui-voice-input run bundle
```

## Tests

```sh
npx vitest run   # 9 tests: transcript accuracy, toggling, unsupported state, apply wiring
```

## License

MIT

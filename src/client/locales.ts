/**
 * `voice` namespace dictionaries for the mic control.
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'mic.label': '语音输入',
  'mic.title': '语音输入（点击开始说话）',
  'mic.title.listening': '正在聆听…（点击停止）',
  'mic.unsupported': '当前浏览器不支持语音输入',
} satisfies Record<string, string>

/** The voice namespace key union. */
export type VoiceKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'mic.label': 'Voice input',
  'mic.title': 'Voice input (click to speak)',
  'mic.title.listening': 'Listening… (click to stop)',
  'mic.unsupported': 'Voice input is not supported in this browser',
} satisfies Record<VoiceKey, string>

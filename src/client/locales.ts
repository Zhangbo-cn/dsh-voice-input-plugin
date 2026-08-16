/**
 * `voice` namespace dictionaries for the mic control.
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'mic.label': '语音输入',
  'mic.title': '语音输入（点击说话，说完自动停止；按住说话，松开发送）',
  'mic.title.listening': '正在聆听…（说完自动停止）',
  'mic.title.reading': '正在朗读回复…',
  'mic.chat.title': '语音对话（按住说话，松开发送；回复自动朗读）',
  'mic.unsupported': '当前浏览器不支持语音输入',
} satisfies Record<string, string>

/** The voice namespace key union. */
export type VoiceKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'mic.label': 'Voice input',
  'mic.title': 'Voice input (click to speak; hold to talk, release to send)',
  'mic.title.listening': 'Listening… (auto-stops on silence)',
  'mic.title.reading': 'Reading the reply aloud…',
  'mic.chat.title': 'Voice chat (hold to talk, release to send; reply read aloud)',
  'mic.unsupported': 'Voice input is not supported in this browser',
} satisfies Record<VoiceKey, string>

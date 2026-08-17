/**
 * Text preparation for reply reading: markdown markup is stripped so the TTS
 * does not read `**` / backticks / header hashes aloud.
 */
import { describe, expect, it } from 'vitest'
import { stripMarkdownForSpeech } from '../src/client/speech.ts'

describe('stripMarkdownForSpeech', () => {
  it('strips bold and italic markers', () => {
    expect(stripMarkdownForSpeech('**加粗**和*斜体*')).toBe('加粗和斜体')
    expect(stripMarkdownForSpeech('__下划线__和_斜体_')).toBe('下划线和斜体')
  })

  it('strips inline and fenced code, keeping inline text', () => {
    expect(stripMarkdownForSpeech('用 `dsh plugin add` 安装')).toBe('用 dsh plugin add 安装')
    expect(stripMarkdownForSpeech('```js\nconst x = 1\n```')).toBe('')
  })

  it('keeps link and image labels, drops the URL', () => {
    expect(stripMarkdownForSpeech('[DeepSeek](https://deepseek.com)')).toBe('DeepSeek')
    expect(stripMarkdownForSpeech('![图](img.png)')).toBe('图')
  })

  it('strips headers, list bullets, and blockquotes', () => {
    expect(stripMarkdownForSpeech('## 标题\n- 列表项\n> 引用')).toBe('标题 列表项 引用')
  })

  it('collapses leftover whitespace and trims', () => {
    expect(stripMarkdownForSpeech('  一段    文字  ')).toBe('一段 文字')
  })

  it('decodes common HTML entities', () => {
    expect(stripMarkdownForSpeech('a &amp; b')).toBe('a & b')
  })

  it('removes strikethrough', () => {
    expect(stripMarkdownForSpeech('~~删除~~保留')).toBe('删除保留')
  })

  it('strips emoji and decorative symbols (Edge TTS otherwise renders them silently)', () => {
    expect(stripMarkdownForSpeech('信号满格～📡😄')).toBe('信号满格～')
    expect(stripMarkdownForSpeech('你好🚀再见')).toBe('你好再见')
  })
})

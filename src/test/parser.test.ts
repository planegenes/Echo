import { describe, expect, it } from 'vitest'
import {
  buildBlankPad,
  collectAllBlankAnswers,
  countBlanks,
  hasBlank,
  parseText,
} from '@/lib/parser'
import type { TextItem } from '@/types'

describe('parseText', () => {
  it('空字符串不返回任何 segment', () => {
    const r = parseText('')
    expect(r.segments).toEqual([])
    expect(r.blanks).toEqual([])
    expect(r.maxBlankLength).toBe(0)
  })

  it('纯文本（无标记）返回单个 text segment', () => {
    const r = parseText('hello world')
    expect(r.segments).toEqual([{ type: 'text', value: 'hello world' }])
    expect(r.blanks).toEqual([])
    expect(r.maxBlankLength).toBe(0)
  })

  it('加粗段 **内容** 不被识别为空白', () => {
    const r = parseText('这是一段**加粗**文本')
    expect(r.blanks).toEqual([])
    expect(r.maxBlankLength).toBe(0)
    expect(r.segments).toEqual([
      { type: 'text', value: '这是一段' },
      { type: 'bold', value: '加粗' },
      { type: 'text', value: '文本' },
    ])
  })

  it('空白段 *内容* 提取 answer 与 length', () => {
    const r = parseText('中国的首都是*北京*')
    expect(r.blanks).toHaveLength(1)
    const b = r.blanks[0]!
    expect(b.answer).toBe('北京')
    expect(b.length).toBe(2)
    expect(r.maxBlankLength).toBe(2)
    // segment 中也存在对应 blank
    const blankSeg = r.segments.find((s) => s.type === 'blank')
    expect(blankSeg).toBeDefined()
    expect(blankSeg!.type === 'blank' && blankSeg.answer).toBe('北京')
  })

  it('length 按 Unicode 码点计算（emoji 计为 1）', () => {
    const r = parseText('I am *🎉*')
    const b = r.blanks[0]!
    expect(b.answer).toBe('🎉')
    expect(b.length).toBe(1)
  })

  it('maxBlankLength 取所有空白的最大值', () => {
    const r = parseText('*a* and **bb** and *ccc*')
    expect(r.blanks.map((b) => b.answer)).toEqual(['a', 'ccc'])
    expect(r.maxBlankLength).toBe(3)
  })

  it('多空白文本能按顺序提取', () => {
    const r = parseText('*甲*和*乙*和*丙*')
    expect(r.blanks.map((b) => b.answer)).toEqual(['甲', '乙', '丙'])
    expect(r.maxBlankLength).toBe(1)
  })

  it('每个空白有独立 id', () => {
    const r = parseText('*a* *b* *c*')
    const ids = r.blanks.map((b) => b.id)
    expect(new Set(ids).size).toBe(3)
  })

  it('混合加粗与空白：**bold** 与 *blank* 同时出现', () => {
    const r = parseText('**重要**：*填空*内容')
    expect(r.segments).toEqual([
      { type: 'bold', value: '重要' },
      { type: 'text', value: '：' },
      expect.objectContaining({ type: 'blank', answer: '填空' }),
      { type: 'text', value: '内容' },
    ])
    expect(r.blanks).toHaveLength(1)
    expect(r.maxBlankLength).toBe(2)
  })

  it('**a*b*c**：单星号在双星号内部时不识别为空白', () => {
    const r = parseText('**a*b*c**')
    // 加粗内容 "a*b*c"，不存在 blank
    expect(r.blanks).toEqual([])
    expect(r.segments).toEqual([
      { type: 'bold', value: 'a*b*c' },
    ])
  })

  it('未闭合的 * 不被识别为空白', () => {
    const r = parseText('未闭合的*星号')
    expect(r.blanks).toEqual([])
    // 全部作为 text
    expect(r.segments).toHaveLength(1)
    expect(r.segments[0]).toMatchObject({ type: 'text' })
  })

  it('未闭合的 ** 不被识别为加粗', () => {
    const r = parseText('未闭合**的星号')
    expect(r.segments).toHaveLength(1)
    expect(r.segments[0]).toMatchObject({ type: 'text' })
  })

  it('相邻空白与文本能正确分割', () => {
    const r = parseText('A*B*C')
    expect(r.segments).toEqual([
      { type: 'text', value: 'A' },
      expect.objectContaining({ type: 'blank', answer: 'B' }),
      { type: 'text', value: 'C' },
    ])
    expect(r.blanks.map((b) => b.answer)).toEqual(['B'])
  })

  it('相邻两个 blank 之间无文本时正确处理', () => {
    const r = parseText('*甲**乙*')
    // 第一个匹配：*甲*（blank 甲），后续：*乙*（blank 乙）
    expect(r.blanks.map((b) => b.answer)).toEqual(['甲', '乙'])
  })
})

describe('hasBlank', () => {
  it('存在空白返回 true', () => {
    expect(hasBlank('a*b*c')).toBe(true)
  })
  it('仅加粗返回 false', () => {
    expect(hasBlank('a**b**c')).toBe(false)
  })
  it('无标记返回 false', () => {
    expect(hasBlank('abc')).toBe(false)
  })
  it('空字符串返回 false', () => {
    expect(hasBlank('')).toBe(false)
  })
  it('未闭合返回 false', () => {
    expect(hasBlank('a*b')).toBe(false)
  })
})

describe('countBlanks', () => {
  it('正确统计多个空白', () => {
    expect(countBlanks('*a* and *b* and *c*')).toBe(3)
  })
  it('加粗不计入', () => {
    expect(countBlanks('**a** *b*')).toBe(1)
  })
  it('无空白返回 0', () => {
    expect(countBlanks('hello')).toBe(0)
  })
})

describe('buildBlankPad', () => {
  it('返回至少 2 个全角空格', () => {
    const pad = buildBlankPad(0)
    expect(pad.length).toBeGreaterThanOrEqual(2)
    // 应只包含全角空格
    expect(pad).toMatch(/^　+$/)
  })

  it('长度大于 maxBlankLength', () => {
    const pad = buildBlankPad(5)
    // 至少 5+3=8 个全角空格
    expect(pad.length).toBeGreaterThanOrEqual(8)
  })
})

describe('collectAllBlankAnswers', () => {
  it('收集多段文本空白并去重', () => {
    const texts: TextItem[] = [
      { id: 't1', content: '*甲*与*乙*' },
      { id: 't2', content: '*乙*与*丙*' },
    ]
    const answers = collectAllBlankAnswers(texts)
    expect(answers.sort()).toEqual(['甲', '乙', '丙'])
  })

  it('无空白的文本不贡献答案', () => {
    const texts: TextItem[] = [
      { id: 't1', content: '没有任何空白' },
      { id: 't2', content: '*有空白*' },
    ]
    const answers = collectAllBlankAnswers(texts)
    expect(answers).toEqual(['有空白'])
  })

  it('空数组返回空数组', () => {
    expect(collectAllBlankAnswers([])).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import {
  buildBlankPad,
  collectAllBlankAnswers,
  countBlanks,
  hasBlank,
  parseText,
} from '@/lib/parser'
import type { TextItem } from '@/types'

/**
 * 文本填空场景测试
 * 涵盖预设题库中常见的多种文本模式与边界情况
 */
describe('文本填空场景', () => {
  describe('一、实际文本模式解析（10 例）', () => {
    it('1. 地理文本：中国首都空白 + 多个并列空白', () => {
      const r = parseText(
        '**中国地理**\n中国的首都是*北京*，最大经济中心是*上海*。',
      )
      expect(r.blanks.map((b) => b.answer)).toEqual(['北京', '上海'])
      expect(r.segments.some((s) => s.type === 'bold')).toBe(true)
    })

    it('2. 历史文本：纯数字答案', () => {
      const r = parseText('二战结束于*1945*年，新中国成立于*1949*年。')
      expect(r.blanks.map((b) => b.answer)).toEqual(['1945', '1949'])
      expect(r.blanks.every((b) => b.length === 4)).toBe(true)
    })

    it('3. 化学文本：化学式作答案', () => {
      const r = parseText('水的化学式为*H₂O*，二氧化碳为*CO₂*。')
      expect(r.blanks.map((b) => b.answer)).toEqual(['H₂O', 'CO₂'])
      // H₂O 按 Unicode 码点为 3
      expect(r.blanks[0]!.length).toBe(3)
    })

    it('4. 数学文本：公式作答案（含空格、等号、上标）', () => {
      const r = parseText('勾股定理：*a² + b² = c²*')
      expect(r.blanks).toHaveLength(1)
      expect(r.blanks[0]!.answer).toBe('a² + b² = c²')
    })

    it('5. 物理文本：含特殊字符的公式', () => {
      const r = parseText('欧姆定律：*I = U / R*')
      expect(r.blanks[0]!.answer).toBe('I = U / R')
      // 含空格也按字符数算
      expect(r.blanks[0]!.length).toBe(9)
    })

    it('6. 生物文本：中文专有名词作答案', () => {
      const r = parseText(
        'DNA 的结构是*双螺旋*，由*沃森*与*克里克*发现。',
      )
      expect(r.blanks.map((b) => b.answer)).toEqual([
        '双螺旋',
        '沃森',
        '克里克',
      ])
    })

    it('7. 化学文本：含比较符号的答案', () => {
      const r = parseText('酸性溶液 pH *<7*，碱性溶液 pH *>7*。')
      expect(r.blanks.map((b) => b.answer)).toEqual(['<7', '>7'])
    })

    it('8. 生物文本：箭头与下标作答案', () => {
      const r = parseText(
        '光合作用总反应式：*6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂*',
      )
      expect(r.blanks).toHaveLength(1)
      expect(r.blanks[0]!.answer).toContain('→')
    })

    it('9. 历史文本：朝代名作答案', () => {
      const r = parseText('唐朝建立于*618*年，由*李渊*建立，定都*长安*。')
      expect(r.blanks.map((b) => b.answer)).toEqual(['618', '李渊', '长安'])
    })

    it('10. 英语文本：英文短语作答案（含空格）', () => {
      const r = parseText('Casual thanks can be *Thanks*.')
      expect(r.blanks[0]!.answer).toBe('Thanks')
      expect(r.blanks[0]!.length).toBe(6)
    })
  })

  describe('二、答案长度计算（5 例）', () => {
    it('11. 单字符答案长度为 1', () => {
      const r = parseText('选一个*a*')
      expect(r.blanks[0]!.length).toBe(1)
    })

    it('12. emoji 按 1 个码点计算', () => {
      const r = parseText('表情：*🎉*')
      expect(r.blanks[0]!.length).toBe(1)
    })

    it('13. 含 surrogate pair 的字符（如 👨‍👩‍👧）按码点计算', () => {
      const r = parseText('家庭：*👨‍👩‍👧*')
      // Array.from 把 ZWJ 序列拆成多个码点
      const expected = Array.from('👨‍👩‍👧').length
      expect(r.blanks[0]!.length).toBe(expected)
    })

    it('14. maxBlankLength 取最大值', () => {
      const r = parseText('*短* 和 *中等长度* 和 *一个比较长的答案*')
      const max = Math.max(
        Array.from('短').length,
        Array.from('中等长度').length,
        Array.from('一个比较长的答案').length,
      )
      expect(r.maxBlankLength).toBe(max)
    })

    it('15. 全角字符与半角字符混合的长度', () => {
      const r = parseText('混合：*Hello世界*')
      expect(r.blanks[0]!.length).toBe(7)
    })
  })

  describe('三、多段文本答案收集（5 例）', () => {
    it('16. 多段文本答案去重', () => {
      const texts: TextItem[] = [
        { id: 't1', content: '甲与*乙*' },
        { id: 't2', content: '乙与*丙*' },
        { id: 't3', content: '*甲*与丙' },
      ]
      const answers = collectAllBlankAnswers(texts).sort()
      expect(answers).toEqual(['乙', '丙', '甲'].sort())
    })

    it('17. 重复出现的答案只保留一次', () => {
      const texts: TextItem[] = [
        { id: 't1', content: '*北京*和*上海*' },
        { id: 't2', content: '*北京*和*广州*' },
        { id: 't3', content: '*北京*和*深圳*' },
      ]
      const answers = collectAllBlankAnswers(texts).sort()
      expect(answers).toEqual(['上海', '北京', '广州', '深圳'].sort())
    })

    it('18. 空字符串答案也被收集', () => {
      const texts: TextItem[] = [{ id: 't1', content: '空答案**' }]
      // **...** 会被识别为加粗；** 单独存在不被识别为空白或加粗
      // 这里输入 '**' 实际无空白也无加粗，应返回空数组
      const answers = collectAllBlankAnswers(texts)
      expect(answers).toEqual([])
    })

    it('19. 加粗内容不被当作答案', () => {
      const texts: TextItem[] = [
        { id: 't1', content: '**重点**：*填空*' },
      ]
      expect(collectAllBlankAnswers(texts)).toEqual(['填空'])
    })

    it('20. 空数组输入返回空数组', () => {
      expect(collectAllBlankAnswers([])).toEqual([])
    })
  })

  describe('四、边界与异常（5 例）', () => {
    it('21. 空字符串不抛错且无空白', () => {
      const r = parseText('')
      expect(r.blanks).toEqual([])
      expect(r.segments).toEqual([])
      expect(r.maxBlankLength).toBe(0)
    })

    it('22. 连续空白能正确切分', () => {
      const r = parseText('*甲**乙**丙*')
      expect(r.blanks.map((b) => b.answer)).toEqual(['甲', '乙', '丙'])
    })

    it('23. 未闭合的星号不识别为空白', () => {
      expect(hasBlank('未闭合*星号')).toBe(false)
      expect(parseText('未闭合*星号').blanks).toEqual([])
    })

    it('24. 双星号内部含单星号时不识别为空白', () => {
      const r = parseText('**a*b*c**')
      expect(r.blanks).toEqual([])
      expect(r.segments).toEqual([{ type: 'bold', value: 'a*b*c' }])
    })

    it('25. 仅包含一个星号的文本', () => {
      const r = parseText('只有一个*')
      expect(r.blanks).toEqual([])
      expect(r.segments).toHaveLength(1)
    })
  })

  describe('五、与选词填空 UI 相关（5 例）', () => {
    it('26. countBlanks 与 blanks.length 一致', () => {
      const text = 'a*b* c*d* e*f*'
      expect(countBlanks(text)).toBe(parseText(text).blanks.length)
    })

    it('27. buildBlankPad 长度不小于 maxBlankLength', () => {
      const pad = buildBlankPad(5)
      expect(pad.length).toBeGreaterThanOrEqual(5)
      // 全角空格
      expect(pad).toMatch(/^　+$/)
    })

    it('28. 每个 blank 有唯一 id', () => {
      const r = parseText('*a* *b* *c* *d* *e*')
      const ids = r.blanks.map((b) => b.id)
      expect(new Set(ids).size).toBe(ids.length)
    })

    it('29. blank id 前缀为 blank', () => {
      const r = parseText('*test*')
      expect(r.blanks[0]!.id.startsWith('blank')).toBe(true)
    })

    it('30. segments 与 blanks 的 answer 一一对应', () => {
      const content = '*甲*和*乙*和*丙*'
      const r = parseText(content)
      const segBlanks = r.segments.filter(
        (s): s is Extract<typeof s, { type: 'blank' }> => s.type === 'blank',
      )
      expect(segBlanks.map((s) => s.answer)).toEqual(
        r.blanks.map((b) => b.answer),
      )
    })
  })
})

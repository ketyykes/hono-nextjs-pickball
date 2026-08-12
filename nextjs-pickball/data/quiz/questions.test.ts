import { describe, it, expect } from 'vitest'
import { QUESTION_BANK } from './questions'

// 題庫自身的不變量。useQuiz.test.ts 驗的是「抽出的 10 題」，
// 涵蓋不到題庫本身是否完整——那是這支測試的職責。
describe('QUESTION_BANK', () => {
  it('題庫至少提供 25 題', () => {
    expect(QUESTION_BANK.length).toBeGreaterThanOrEqual(25)
  })

  it('所有題目 id 全域唯一', () => {
    const ids = QUESTION_BANK.map((q) => q.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('multiple-choice 題目的 options 至少 2 個且 correctIndex 落在範圍內', () => {
    const multipleChoice = QUESTION_BANK.filter(
      (q) => q.type === 'multiple-choice',
    )
    expect(multipleChoice.length).toBeGreaterThan(0)

    multipleChoice.forEach((q) => {
      expect(q.options.length).toBeGreaterThanOrEqual(2)
      expect(q.correctIndex).toBeGreaterThanOrEqual(0)
      expect(q.correctIndex).toBeLessThan(q.options.length)
    })
  })

  it('true-false 題目的 correct 為 boolean', () => {
    const trueFalse = QUESTION_BANK.filter((q) => q.type === 'true-false')
    expect(trueFalse.length).toBeGreaterThan(0)

    trueFalse.forEach((q) => {
      expect(typeof q.correct).toBe('boolean')
    })
  })

  it('每題都有非空的 text 與 explanation', () => {
    QUESTION_BANK.forEach((q) => {
      expect(q.text.trim().length).toBeGreaterThan(0)
      expect(q.explanation.trim().length).toBeGreaterThan(0)
    })
  })

  it('題庫同時包含 multiple-choice 與 true-false 兩種題型', () => {
    const types = new Set(QUESTION_BANK.map((q) => q.type))
    expect(types.has('multiple-choice')).toBe(true)
    expect(types.has('true-false')).toBe(true)
  })

  it('serve-04 反映 2021 年後廢除 Let serve 的新規', () => {
    const question = QUESTION_BANK.find((q) => q.id === 'serve-04')
    expect(question).toBeDefined()

    // 新規：發球擦網後只要落在正確發球區就繼續比賽，不再重發。
    // 用「廢除／取消」等關鍵字守住語意，避免日後被改回舊規而無人察覺。
    const combined = `${question!.text}${question!.explanation}`
    expect(combined).toMatch(/廢除|取消|不再重發|繼續比賽/)
  })
})

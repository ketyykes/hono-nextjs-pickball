import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useQuiz } from './useQuiz'
import { QUESTION_BANK } from '@/data/quiz/questions'

describe('useQuiz', () => {
  it('初始化時從題庫隨機抽出 10 題', () => {
    const { result } = renderHook(() => useQuiz())
    expect(result.current.questions).toHaveLength(10)
  })

  it('初始化時所有題目都來自題庫', () => {
    const { result } = renderHook(() => useQuiz())
    const bankIds = new Set(QUESTION_BANK.map((q) => q.id))
    result.current.questions.forEach((q) => {
      expect(bankIds.has(q.id)).toBe(true)
    })
  })

  it('初始化時不重複抽題', () => {
    const { result } = renderHook(() => useQuiz())
    const ids = result.current.questions.map((q) => q.id)
    expect(new Set(ids).size).toBe(10)
  })

  it('初始 phase 為 answering，currentIndex 為 0', () => {
    const { result } = renderHook(() => useQuiz())
    expect(result.current.phase).toBe('answering')
    expect(result.current.currentIndex).toBe(0)
  })

  it('初始 selectedOption 為 null，answers 為空陣列', () => {
    const { result } = renderHook(() => useQuiz())
    expect(result.current.selectedOption).toBeNull()
    expect(result.current.answers).toHaveLength(0)
  })

  it('selectOption 後 phase 變為 revealed', () => {
    const { result } = renderHook(() => useQuiz())
    act(() => { result.current.selectOption(0) })
    expect(result.current.phase).toBe('revealed')
  })

  it('selectOption 選擇正確答案時 answers 新增 true', () => {
    const { result } = renderHook(() => useQuiz())
    const correctIndex = result.current.questions[0].shuffledCorrectIndex
    act(() => { result.current.selectOption(correctIndex) })
    expect(result.current.answers[0]).toBe(true)
  })

  it('selectOption 選擇錯誤答案時 answers 新增 false', () => {
    const { result } = renderHook(() => useQuiz())
    const wrongIndex = result.current.questions[0].shuffledCorrectIndex === 0 ? 1 : 0
    act(() => { result.current.selectOption(wrongIndex) })
    expect(result.current.answers[0]).toBe(false)
  })

  it('nextQuestion 後 currentIndex +1，phase 回到 answering，selectedOption 歸 null', () => {
    const { result } = renderHook(() => useQuiz())
    act(() => { result.current.selectOption(0) })
    act(() => { result.current.nextQuestion() })
    expect(result.current.currentIndex).toBe(1)
    expect(result.current.phase).toBe('answering')
    expect(result.current.selectedOption).toBeNull()
  })

  it('最後一題 nextQuestion 後 phase 變為 finished', () => {
    const { result } = renderHook(() => useQuiz())
    for (let i = 0; i < 10; i++) {
      act(() => { result.current.selectOption(0) })
      act(() => { result.current.nextQuestion() })
    }
    expect(result.current.phase).toBe('finished')
  })

  it('restart 後 currentIndex 歸零、answers 清空、phase 為 answering', () => {
    const { result } = renderHook(() => useQuiz())
    act(() => { result.current.selectOption(0) })
    act(() => { result.current.nextQuestion() })
    act(() => { result.current.restart() })
    expect(result.current.currentIndex).toBe(0)
    expect(result.current.answers).toHaveLength(0)
    expect(result.current.phase).toBe('answering')
    expect(result.current.selectedOption).toBeNull()
    expect(result.current.questions).toHaveLength(10)
  })

  it('revealed phase 呼叫 selectOption 不產生副作用', () => {
    const { result } = renderHook(() => useQuiz())
    act(() => { result.current.selectOption(0) })
    act(() => { result.current.selectOption(0) }) // revealed phase，應被 guard 攔截
    expect(result.current.answers).toHaveLength(1)
    expect(result.current.phase).toBe('revealed')
  })

  // 防 stale closure：同一 render 的 closure 內連續呼叫，
  // guard 必須能擋下第二次（無論 guard 寫在外層 closure 或 setState updater 內）。
  it('同一 closure 內連呼 selectOption 兩次應只記錄一次答案', () => {
    const { result } = renderHook(() => useQuiz())
    act(() => {
      result.current.selectOption(0)
      result.current.selectOption(1) // 同一 closure，phase 尚未 re-render 為 revealed
    })
    expect(result.current.answers).toHaveLength(1)
    expect(result.current.selectedOption).toBe(0)
    expect(result.current.phase).toBe('revealed')
  })

  it('同一 closure 內連呼 nextQuestion 兩次應只前進一題', () => {
    const { result } = renderHook(() => useQuiz())
    act(() => { result.current.selectOption(0) })
    act(() => {
      result.current.nextQuestion()
      result.current.nextQuestion() // 同一 closure，phase 尚未 re-render 為 answering
    })
    expect(result.current.currentIndex).toBe(1)
    expect(result.current.phase).toBe('answering')
  })
})

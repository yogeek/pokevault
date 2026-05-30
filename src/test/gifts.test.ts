import { describe, it, expect, beforeEach } from 'vitest'
import { getGifts, isGift, addGift, removeGift } from '@/lib/gifts'

describe('gift list', () => {
  beforeEach(() => localStorage.clear())

  it('starts empty for an unknown owner', () => {
    expect(getGifts('Alice')).toEqual([])
    expect(isGift('Alice', 'base1-4')).toBe(false)
  })

  it('adds and persists a gift', () => {
    addGift('Alice', 'base1-4')
    expect(getGifts('Alice')).toEqual(['base1-4'])
    expect(isGift('Alice', 'base1-4')).toBe(true)
  })

  it('is idempotent on duplicate add', () => {
    addGift('Alice', 'base1-4')
    addGift('Alice', 'base1-4')
    expect(getGifts('Alice')).toEqual(['base1-4'])
  })

  it('keeps separate lists per owner', () => {
    addGift('Alice', 'base1-4')
    addGift('Bob', 'jungle-3')
    expect(getGifts('Alice')).toEqual(['base1-4'])
    expect(getGifts('Bob')).toEqual(['jungle-3'])
  })

  it('removes a gift and cleans up the owner key', () => {
    addGift('Alice', 'base1-4')
    const after = removeGift('Alice', 'base1-4')
    expect(after).toEqual([])
    expect(isGift('Alice', 'base1-4')).toBe(false)
  })

  it('returns the updated list from add/remove', () => {
    expect(addGift('Alice', 'a')).toEqual(['a'])
    expect(addGift('Alice', 'b')).toEqual(['a', 'b'])
    expect(removeGift('Alice', 'a')).toEqual(['b'])
  })
})

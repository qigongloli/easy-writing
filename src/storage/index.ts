import { IndexedDbWritingStorage } from './indexeddb-writing-storage'
import { SqliteWritingStorage } from './sqlite-writing-storage'
import { isTauriRuntime, type WritingStorage } from './writing-storage'

let storage: WritingStorage | null = null

export const getWritingStorage = () => {
  if (!storage) {
    storage = isTauriRuntime()
      ? new SqliteWritingStorage()
      : new IndexedDbWritingStorage()
  }
  return storage
}

export * from './writing-storage'

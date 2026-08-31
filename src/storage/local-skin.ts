/**
 * 自定义背景图本地存储：图片以 dataURL 存 IndexedDB。
 * 不用 localStorage 是因为 10MB 级的图会撞它的容量上限。
 */

const DB_NAME = 'ew-skin-store'
const STORE_NAME = 'kv'
const CUSTOM_SKIN_KEY = 'customSkinImage'

const openDb = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

const withStore = async <T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> => {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode)
      const request = run(tx.objectStore(STORE_NAME))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}

export const saveCustomSkinImage = async (dataUrl: string) => {
  await withStore('readwrite', store => store.put(dataUrl, CUSTOM_SKIN_KEY))
}

export const loadCustomSkinImage = async (): Promise<string | null> => {
  try {
    const value = await withStore<unknown>('readonly', store => store.get(CUSTOM_SKIN_KEY))
    return typeof value === 'string' && value ? value : null
  } catch (error) {
    console.warn('读取自定义背景失败', error)
    return null
  }
}

export const clearCustomSkinImage = async () => {
  try {
    await withStore('readwrite', store => store.delete(CUSTOM_SKIN_KEY))
  } catch (error) {
    console.warn('清除自定义背景失败', error)
  }
}

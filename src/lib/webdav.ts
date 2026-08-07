import type { AppSettings } from '@/types'

/**
 * WebDAV 客户端
 * 使用标准 HTTP GET/PUT + Basic Auth
 * 文件名固定为 echo-snapshot.json
 */

const DEFAULT_FILENAME = 'echo-snapshot.json'

/** 检查 WebDAV 是否已配置 */
export function isWebDAVConfigured(settings: AppSettings): boolean {
  return !!(settings.webdavUrl && settings.webdavUsername)
}

/** 获取完整的 WebDAV 文件 URL */
function getFileUrl(settings: AppSettings): string {
  const base = settings.webdavUrl.replace(/\/+$/, '')
  // 若 URL 已以 .json 结尾则直接使用
  if (/\.\w+$/.test(base)) return base
  return `${base}/${DEFAULT_FILENAME}`
}

/** 构造 Basic Auth 头 */
function authHeaders(settings: AppSettings): Record<string, string> {
  const cred = `${settings.webdavUsername}:${settings.webdavPassword}`
  return { Authorization: 'Basic ' + btoa(cred) }
}

/** 从 WebDAV 拉取文件内容，文件不存在时返回 null */
export async function webdavPull(settings: AppSettings): Promise<string | null> {
  const url = getFileUrl(settings)
  const res = await fetch(url, {
    method: 'GET',
    headers: authHeaders(settings),
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`WebDAV 拉取失败: ${res.status} ${res.statusText}`)
  return await res.text()
}

/** 推送内容到 WebDAV（覆盖） */
export async function webdavPush(settings: AppSettings, content: string): Promise<void> {
  const url = getFileUrl(settings)
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      ...authHeaders(settings),
      'Content-Type': 'application/json',
    },
    body: content,
  })
  if (!res.ok) throw new Error(`WebDAV 推送失败: ${res.status} ${res.statusText}`)
}

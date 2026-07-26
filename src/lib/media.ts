import { API_BASE } from './api'

export function mediaUrl(path: string | null | undefined) {
  if (!path) return null
  if (/^https?:\/\//i.test(path)) return path

  const base = API_BASE.replace(/\/$/, '')
  const normalized = path.startsWith('/')
    ? path
    : path.startsWith('uploads/')
      ? `/${path}`
      : `/uploads/${path}`
  return `${base}${normalized}`
}

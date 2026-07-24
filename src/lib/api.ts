import {
  getAccessToken,
  getDeviceId,
  getRefreshToken,
  saveTokens,
} from './session-store'
import type {
  Bootstrap,
  FeedbackCategory,
  FeedbackReport,
  FeedbackStatus,
  User,
} from '../types'
import type { components } from '../../../packages/contracts/src/api'

export const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:8000'
type TokenResponse = components['schemas']['Token']

type RequestOptions = RequestInit & {
  tahfizId?: number
  retryAuth?: boolean
}

async function refreshAccessToken() {
  const refreshToken = await getRefreshToken()
  if (!refreshToken) return false
  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refresh_token: refreshToken,
      device_id: await getDeviceId(),
    }),
  })
  if (!response.ok) return false
    const tokens = await response.json() as TokenResponse
    await saveTokens(tokens.access_token, tokens.refresh_token)
  return true
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { tahfizId, retryAuth = true, ...fetchOptions } = options
  const accessToken = await getAccessToken()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(fetchOptions.body ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(tahfizId ? { 'X-Tahfiz-ID': String(tahfizId) } : {}),
        ...(fetchOptions.headers ?? {}),
      },
    })
    if (response.status === 401 && retryAuth && await refreshAccessToken()) {
      return request<T>(path, { ...options, retryAuth: false })
    }
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }))
      const detail = typeof error.detail === 'object'
        ? error.detail.code ?? error.detail.reason ?? JSON.stringify(error.detail)
        : error.detail
      throw new Error(detail || `HTTP ${response.status}`)
    }
    if (response.status === 204) return undefined as T
    return response.json()
  } finally {
    clearTimeout(timeout)
  }
}

export const api = {
  async login(username: string, password: string) {
    const deviceId = await getDeviceId()
    return request<TokenResponse>('/auth/login', {
      method: 'POST',
      retryAuth: false,
      body: JSON.stringify({
        username,
        password,
        device_id: deviceId,
        device_name: 'Zamzam mobile',
      }),
    })
  },
  me(tahfizId?: number) {
    return request<User>('/auth/me', { tahfizId })
  },
  bootstrap(tahfizId: number) {
    return request<Bootstrap>('/sync/v1/bootstrap?history_days=90', { tahfizId })
  },
  changes(tahfizId: number, cursor: number) {
    return request<{
      changes: Array<{
        cursor: number
        entity_type: string
        entity_key: string
        operation: string
        payload: Record<string, any> | null
      }>
      next_cursor: number
      has_more: boolean
    }>(`/sync/v1/changes?cursor=${cursor}&limit=500`, { tahfizId })
  },
  pushMutations(tahfizId: number, mutations: unknown[]) {
    return request<{ results: Record<string, any>[]; cursor: number }>('/sync/v1/mutations', {
      method: 'POST',
      tahfizId,
      body: JSON.stringify({ mutations }),
    })
  },
  confirmSession(tahfizId: number, sessionId: number, expectedVersion: number) {
    return request<{ version: number }>(`/sessions/${sessionId}/confirm`, {
      method: 'POST',
      tahfizId,
      body: JSON.stringify({ expected_version: expectedVersion }),
    })
  },
  createSession(tahfizId: number, sessionDate: string, defaultStatus = 'غياب') {
    return request<{ id: number }>(`/sessions/`, {
      method: 'POST',
      tahfizId,
      body: JSON.stringify({ session_date: sessionDate, default_status: defaultStatus }),
    })
  },
  updateSessionDate(tahfizId: number, sessionId: number, sessionDate: string) {
    return request<{ id: number; version: number }>(`/sessions/${sessionId}`, {
      method: 'PUT',
      tahfizId,
      body: JSON.stringify({ session_date: sessionDate }),
    })
  },
  reopenSession(tahfizId: number, sessionId: number, reason: string, expectedVersion: number) {
    return request<{ version: number }>(`/sessions/${sessionId}/reopen`, {
      method: 'POST',
      tahfizId,
      body: JSON.stringify({ reason, expected_version: expectedVersion }),
    })
  },
  deleteSession(tahfizId: number, sessionId: number) {
    return request<void>(`/sessions/${sessionId}`, { method: 'DELETE', tahfizId })
  },
  dashboard(tahfizId: number) {
    return request<Record<string, any>>('/reports/dashboard-summary', { tahfizId })
  },
  createFeedback(
    tahfizId: number,
    data: { category: FeedbackCategory; title: string; description: string; page_url?: string | null },
  ) {
    return request<FeedbackReport>('/feedback', {
      method: 'POST',
      tahfizId,
      body: JSON.stringify(data),
    })
  },
  platformFeedback(status?: FeedbackStatus) {
    return request<FeedbackReport[]>(`/platform/feedback${status ? `?status=${status}` : ''}`)
  },
  updatePlatformFeedback(id: number, status: FeedbackStatus, resolutionNote?: string | null) {
    return request<FeedbackReport>(`/platform/feedback/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, resolution_note: resolutionNote || null }),
    })
  },
  get(path: string, tahfizId?: number) {
    return request<any>(path, { tahfizId })
  },
  mutate(path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', tahfizId: number | undefined, body?: unknown) {
    return request<any>(path, {
      method,
      tahfizId,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  },
  revokeDevice(refreshToken: string) {
    return request<void>('/auth/revoke-device', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
  },
}

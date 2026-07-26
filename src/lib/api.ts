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
  TahfizInvitation,
  User,
} from '../types'
import type { components } from '../../contracts/src/api'

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

function isFormData(body: BodyInit | null | undefined): body is FormData {
  return typeof FormData !== 'undefined' && body instanceof FormData
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
        ...(fetchOptions.body && !isFormData(fetchOptions.body) ? { 'Content-Type': 'application/json' } : {}),
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
  signup(tahfizName: string, username: string, password: string, contactPhone?: string) {
    return request<{ message: string; tahfiz_id: number; status: string }>('/auth/signup', {
      method: 'POST',
      retryAuth: false,
      body: JSON.stringify({
        tahfiz_name: tahfizName,
        username,
        password,
        contact_phone: contactPhone?.trim() || null,
      }),
    })
  },
  invitationPreview(token: string) {
    return request<TahfizInvitation>(`/invitations/preview/${encodeURIComponent(token)}`, {
      retryAuth: false,
    })
  },
  registerWithInvitation(token: string, username: string, password: string) {
    return request<{ access_token: string; token_type: string }>(
      `/invitations/register/${encodeURIComponent(token)}`,
      {
        method: 'POST',
        retryAuth: false,
        body: JSON.stringify({ username, password }),
      },
    )
  },
  acceptInvitation(token: string) {
    return request<{ message: string; tahfiz_id: number; role: 'admin' | 'sheikh' }>(
      `/invitations/accept/${encodeURIComponent(token)}`,
      { method: 'POST' },
    )
  },
  me(tahfizId?: number) {
    return request<User>('/auth/me', { tahfizId })
  },
  setDefaultTahfiz(tahfizId: number) {
    return request<{ tahfiz_id: number; message: string }>('/auth/default-tahfiz', {
      method: 'POST',
      tahfizId,
      body: JSON.stringify({ tahfiz_id: tahfizId }),
    })
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
  uploadStudentPic(
    tahfizId: number,
    studentId: number,
    asset: { uri: string; fileName?: string | null; mimeType?: string | null },
  ) {
    const formData = new FormData()
    formData.append('file', {
      uri: asset.uri,
      name: asset.fileName || `student-${studentId}.jpg`,
      type: asset.mimeType || 'image/jpeg',
    } as unknown as Blob)
    return request<{ profile_pic?: string }>(`/students/${studentId}/upload-pic`, {
      method: 'POST',
      tahfizId,
      body: formData,
    })
  },
  moveStudentSheikh(tahfizId: number, studentId: number, sheikhId: number) {
    return request<void>(`/students/${studentId}/move-sheikh`, {
      method: 'POST',
      tahfizId,
      body: JSON.stringify({ sheikh_id: sheikhId }),
    })
  },
  reorderStudents(tahfizId: number, sheikhId: number, studentIds: number[]) {
    return request<void>(`/sheikhs/${sheikhId}/students/reorder`, {
      method: 'PUT',
      tahfizId,
      body: JSON.stringify({ student_ids: studentIds }),
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

import * as LocalAuthentication from 'expo-local-authentication'
import * as Network from 'expo-network'
import { useSQLiteContext } from 'expo-sqlite'
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { AppState } from 'react-native'

import { pendingCount, purgeLocalData } from '../db/database'
import { api } from '../lib/api'
import {
  clearSession,
  getActiveTahfiz,
  getRefreshToken,
  getSavedUser,
  saveActiveTahfiz,
  saveTokens,
  saveUser,
} from '../lib/session-store'
import { syncTahfiz, type SyncSummary } from '../sync/engine'
import { setBackgroundSyncEnabled } from '../sync/background'
import type { User } from '../types'

interface AppContextValue {
  ready: boolean
  user: User | null
  activeTahfizId: number | null
  locked: boolean
  syncing: boolean
  lastSync: SyncSummary | null
  login(username: string, password: string): Promise<void>
  logout(discardPending?: boolean): Promise<void>
  switchTahfiz(id: number): Promise<void>
  syncNow(allMemberships?: boolean): Promise<SyncSummary | null>
  unlock(): Promise<boolean>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext()
  const [ready, setReady] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [activeTahfizId, setActiveTahfizId] = useState<number | null>(null)
  const [locked, setLocked] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<SyncSummary | null>(null)

  useEffect(() => {
    Promise.all([getSavedUser(), getActiveTahfiz()]).then(([savedUser, tahfizId]) => {
      setUser(savedUser)
      setActiveTahfizId(tahfizId ?? savedUser?.tahfiz_id ?? null)
      setLocked(Boolean(savedUser))
      setReady(true)
    })
  }, [])

  useEffect(() => {
    void setBackgroundSyncEnabled(Boolean(user))
  }, [user])

  useEffect(() => {
    let backgroundedAt = 0
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') backgroundedAt = Date.now()
      if (state === 'active' && user) {
        if (backgroundedAt && Date.now() - backgroundedAt >= 5 * 60_000) setLocked(true)
        Network.getNetworkStateAsync().then((network) => {
          if (network.isConnected && !locked) void syncNow(false)
        })
      }
    })
    return () => subscription.remove()
  }, [user, locked, activeTahfizId])

  const unlock = useCallback(async () => {
    const hardware = await LocalAuthentication.hasHardwareAsync()
    const enrolled = hardware && await LocalAuthentication.isEnrolledAsync()
    if (!enrolled) {
      setLocked(false)
      return true
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'فتح زمزم',
      cancelLabel: 'إلغاء',
      fallbackLabel: 'استخدام رمز الجهاز',
      disableDeviceFallback: false,
    })
    if (result.success) setLocked(false)
    return result.success
  }, [])

  const syncNow = useCallback(async (allMemberships = false) => {
    if (!user || syncing) return null
    const network = await Network.getNetworkStateAsync()
    if (!network.isConnected) throw new Error('لا يوجد اتصال بالإنترنت')
    setSyncing(true)
    try {
      const ids = allMemberships
        ? user.memberships.filter((item) => item.tahfiz_status === 'active').map((item) => item.tahfiz_id)
        : activeTahfizId ? [activeTahfizId] : []
      let summary: SyncSummary = { pushed: 0, conflicts: 0, rejected: 0, cursor: 0 }
      for (const id of ids) {
        const item = await syncTahfiz(db, id)
        summary = {
          pushed: summary.pushed + item.pushed,
          conflicts: summary.conflicts + item.conflicts,
          rejected: summary.rejected + item.rejected,
          cursor: item.cursor,
        }
      }
      setLastSync(summary)
      return summary
    } finally {
      setSyncing(false)
    }
  }, [db, user, syncing, activeTahfizId])

  const login = useCallback(async (username: string, password: string) => {
    const tokens = await api.login(username.trim(), password)
    if (!tokens.refresh_token) throw new Error('لم يصدر الخادم جلسة آمنة للجهاز')
    await saveTokens(tokens.access_token, tokens.refresh_token)
    let currentUser: User
    try {
      currentUser = await api.me()
    } catch (error) {
      await clearSession()
      throw error
    }
    const firstTahfiz = currentUser.tahfiz_id
      ?? currentUser.memberships.find((item) => item.tahfiz_status === 'active')?.tahfiz_id
      ?? null
    await saveUser(currentUser)
    if (firstTahfiz) await saveActiveTahfiz(firstTahfiz)
    setUser(currentUser)
    setActiveTahfizId(firstTahfiz)
    setLocked(false)
    // The screen becomes usable before the all-membership preload completes.
    if (firstTahfiz) {
      const ids = currentUser.memberships
        .filter((item) => item.tahfiz_status === 'active')
        .map((item) => item.tahfiz_id)
      try { await syncTahfiz(db, firstTahfiz) } catch {}
      void Promise.allSettled(ids.filter((id) => id !== firstTahfiz).map((id) => syncTahfiz(db, id)))
    }
  }, [db])

  const switchTahfiz = useCallback(async (id: number) => {
    const platformSupport = user?.global_role === 'super_admin'
    if (!platformSupport && !user?.memberships.some((item) => item.tahfiz_id === id && item.tahfiz_status === 'active')) {
      throw new Error('لا توجد عضوية نشطة في هذا التحفيظ')
    }
    await saveActiveTahfiz(id)
    setActiveTahfizId(id)
  }, [user])

  const logout = useCallback(async (discardPending = false) => {
    const pending = await pendingCount(db)
    if (pending && !discardPending) throw new Error(`يوجد ${pending} تعديل غير متزامن`)
    const refreshToken = await getRefreshToken()
    if (refreshToken) {
      try { await api.revokeDevice(refreshToken) } catch {}
    }
    await purgeLocalData(db)
    await clearSession()
    setUser(null)
    setActiveTahfizId(null)
    setLocked(false)
  }, [db])

  const value = useMemo(() => ({
    ready, user, activeTahfizId, locked, syncing, lastSync,
    login, logout, switchTahfiz, syncNow, unlock,
  }), [
    ready, user, activeTahfizId, locked, syncing, lastSync,
    login, logout, switchTahfiz, syncNow, unlock,
  ])
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const value = useContext(AppContext)
  if (!value) throw new Error('useApp must be used inside AppProvider')
  return value
}

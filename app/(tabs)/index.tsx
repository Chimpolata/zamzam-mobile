import { useFocusEffect, useRouter } from 'expo-router'
import * as Network from 'expo-network'
import { useSQLiteContext } from 'expo-sqlite'
import React, { useCallback, useState } from 'react'
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

import { useApp } from '../../src/context/AppContext'
import { useTheme } from '../../src/theme'
import type { Session } from '../../src/types'

export default function DashboardScreen() {
  const db = useSQLiteContext()
  const router = useRouter()
  const { user, activeTahfizId, syncing, syncNow, lastSync } = useApp()
  const { colors, commonStyles } = useTheme()
  const styles = createStyles(colors, commonStyles)
  const [counts, setCounts] = useState({ sessions: 0, students: 0, pending: 0, conflicts: 0 })
  const [online, setOnline] = useState<boolean | null>(null)
  const [openSession, setOpenSession] = useState<(Omit<Session, 'is_confirmed'> & { is_confirmed: number }) | null>(null)
  const [error, setError] = useState('')
  const membership = user?.memberships.find((item) => item.tahfiz_id === activeTahfizId)

  const load = useCallback(async () => {
    if (!activeTahfizId) {
      setError('لم يتم اختيار حساب تحفيظ نشط.')
      return
    }
    setError('')
    try {
      const [sessions, students, pending, conflicts] = await Promise.all([
        db.getFirstAsync<{ count: number }>('SELECT COUNT(*) count FROM sessions WHERE tahfiz_id=?', activeTahfizId),
        db.getFirstAsync<{ count: number }>('SELECT COUNT(*) count FROM students WHERE tahfiz_id=?', activeTahfizId),
        db.getFirstAsync<{ count: number }>('SELECT COUNT(*) count FROM outbox WHERE tahfiz_id=?', activeTahfizId),
        db.getFirstAsync<{ count: number }>('SELECT COUNT(*) count FROM conflicts WHERE tahfiz_id=?', activeTahfizId),
      ])
      setCounts({
        sessions: sessions?.count ?? 0,
        students: students?.count ?? 0,
        pending: pending?.count ?? 0,
        conflicts: conflicts?.count ?? 0,
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'تعذر قراءة بيانات الرئيسية المحفوظة.')
    }

    const [networkResult, openSessionResult] = await Promise.allSettled([
      Network.getNetworkStateAsync(),
      db.getFirstAsync<Omit<Session, 'is_confirmed'> & { is_confirmed: number }>(
        `SELECT * FROM sessions
         WHERE tahfiz_id=? AND is_confirmed=0
         ORDER BY CASE WHEN date>=date('now') THEN 0 ELSE 1 END,
                  CASE WHEN date>=date('now') THEN date END ASC,
                  date DESC,id DESC
         LIMIT 1`,
        activeTahfizId,
      ),
    ])
    setOnline(networkResult.status === 'fulfilled' && Boolean(networkResult.value.isConnected))
    setOpenSession(openSessionResult.status === 'fulfilled' ? openSessionResult.value : null)
  }, [db, activeTahfizId])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  const refresh = async () => {
    let syncError = ''
    try {
      await syncNow(false)
    } catch (reason) {
      syncError = reason instanceof Error ? reason.message : 'تعذرت المزامنة.'
    } finally {
      await load()
      if (syncError) setError(syncError)
    }
  }

  return (
    <ScrollView
      style={commonStyles.screen}
      contentContainerStyle={commonStyles.content}
      refreshControl={<RefreshControl refreshing={syncing} onRefresh={() => void refresh()} />}
    >
      <View style={styles.welcome}>
        <View style={{ flex: 1 }}>
          <Text style={commonStyles.subtitle}>مرحباً، {user?.username}</Text>
          <Text style={commonStyles.title}>{membership?.tahfiz_name ?? 'زمزم'}</Text>
        </View>
        <View style={[styles.connection, { backgroundColor: online ? colors.successSurface : colors.warningSurface }]}>
          <Text style={{ color: online ? colors.success : colors.warning, fontWeight: '800' }}>
            {online ? 'متصل' : 'دون اتصال'}
          </Text>
        </View>
      </View>

      <View style={styles.grid}>
        <Stat label="الحلقات المحفوظة" value={counts.sessions} />
        <Stat label="الطلاب" value={counts.students} />
        <Stat label="بانتظار المزامنة" value={counts.pending} accent={counts.pending > 0} />
        <TouchableOpacity style={styles.stat} onPress={() => router.push('/conflicts')}>
          <Text style={[styles.statValue, counts.conflicts > 0 && { color: colors.danger }]}>{counts.conflicts}</Text>
          <Text style={styles.statLabel}>تعارضات تحتاج مراجعة</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={commonStyles.button} onPress={() => void refresh()} disabled={syncing}>
        {syncing ? <ActivityIndicator color="#fff" /> : <Text style={commonStyles.buttonText}>مزامنة الآن</Text>}
      </TouchableOpacity>
      {error ? (
        <TouchableOpacity style={styles.errorCard} onPress={() => void load()}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.retryText}>اضغط لإعادة المحاولة</Text>
        </TouchableOpacity>
      ) : null}
      {lastSync ? (
        <Text style={commonStyles.subtitle}>
          آخر مزامنة: دُفع {lastSync.pushed} تعديل، {lastSync.conflicts} تعارض
        </Text>
      ) : null}

      <TouchableOpacity
        style={styles.primaryCard}
        onPress={() => openSession
          ? router.push({ pathname: '/session/[id]', params: { id: String(openSession.id) } })
          : router.push('/(tabs)/sessions')}
      >
        <Text style={styles.primaryTitle}>{openSession ? 'متابعة الحلقة المفتوحة' : 'تسجيل حلقة اليوم'}</Text>
        <Text style={styles.primaryText}>
          {openSession
            ? `${new Date(`${openSession.date}T12:00:00`).toLocaleDateString('ar-EG', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            })} · اضغط لفتح الحضور والتقدم المحفوظين.`
            : 'الحضور والتقدم يعملان دون اتصال ويتم حفظهما فوراً على الجهاز.'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

function Stat({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  const { colors, commonStyles } = useTheme()
  const styles = createStyles(colors, commonStyles)
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, accent && { color: colors.warning }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors'], commonStyles: ReturnType<typeof useTheme>['commonStyles']) => StyleSheet.create({
  welcome: { ...commonStyles.card, flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  connection: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  grid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 },
  stat: { ...commonStyles.card, width: '48%', minHeight: 112, alignItems: 'center', justifyContent: 'center', gap: 7 },
  statValue: { fontSize: 30, fontWeight: '900', color: colors.primary },
  statLabel: { fontSize: 12, color: colors.muted, textAlign: 'center' },
  primaryCard: { ...commonStyles.card, backgroundColor: colors.primarySurface, borderColor: colors.primary, gap: 8 },
  primaryTitle: { fontSize: 19, fontWeight: '900', color: colors.primaryDark, textAlign: 'right' },
  primaryText: { color: colors.text, lineHeight: 22, textAlign: 'right' },
  errorCard: { ...commonStyles.card, borderColor: colors.danger, backgroundColor: colors.dangerSurface, gap: 4 },
  errorText: { color: colors.danger, textAlign: 'right', fontWeight: '800' },
  retryText: { color: colors.text, textAlign: 'right', fontSize: 11 },
})

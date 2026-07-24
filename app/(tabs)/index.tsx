import { useFocusEffect, useRouter } from 'expo-router'
import * as Network from 'expo-network'
import { useSQLiteContext } from 'expo-sqlite'
import React, { useCallback, useState } from 'react'
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

import { useApp } from '../../src/context/AppContext'
import { colors, commonStyles } from '../../src/theme'

export default function DashboardScreen() {
  const db = useSQLiteContext()
  const router = useRouter()
  const { user, activeTahfizId, syncing, syncNow, lastSync } = useApp()
  const [counts, setCounts] = useState({ sessions: 0, students: 0, pending: 0, conflicts: 0 })
  const [online, setOnline] = useState<boolean | null>(null)
  const membership = user?.memberships.find((item) => item.tahfiz_id === activeTahfizId)

  const load = useCallback(async () => {
    if (!activeTahfizId) return
    const [sessions, students, pending, conflicts, network] = await Promise.all([
      db.getFirstAsync<{ count: number }>('SELECT COUNT(*) count FROM sessions WHERE tahfiz_id=?', activeTahfizId),
      db.getFirstAsync<{ count: number }>('SELECT COUNT(*) count FROM students WHERE tahfiz_id=?', activeTahfizId),
      db.getFirstAsync<{ count: number }>('SELECT COUNT(*) count FROM outbox WHERE tahfiz_id=?', activeTahfizId),
      db.getFirstAsync<{ count: number }>('SELECT COUNT(*) count FROM conflicts WHERE tahfiz_id=?', activeTahfizId),
      Network.getNetworkStateAsync(),
    ])
    setCounts({
      sessions: sessions?.count ?? 0,
      students: students?.count ?? 0,
      pending: pending?.count ?? 0,
      conflicts: conflicts?.count ?? 0,
    })
    setOnline(Boolean(network.isConnected))
  }, [db, activeTahfizId])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  const refresh = async () => {
    try { await syncNow(false) } finally { await load() }
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
        <View style={[styles.connection, { backgroundColor: online ? '#d1fae5' : '#fef3c7' }]}>
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
      {lastSync ? (
        <Text style={commonStyles.subtitle}>
          آخر مزامنة: دُفع {lastSync.pushed} تعديل، {lastSync.conflicts} تعارض
        </Text>
      ) : null}

      <TouchableOpacity style={styles.primaryCard} onPress={() => router.push('/(tabs)/sessions')}>
        <Text style={styles.primaryTitle}>تسجيل حلقة اليوم</Text>
        <Text style={styles.primaryText}>الحضور والتقدم يعملان دون اتصال ويتم حفظهما فوراً على الجهاز.</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

function Stat({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, accent && { color: colors.warning }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  welcome: { ...commonStyles.card, flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  connection: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  grid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 },
  stat: { ...commonStyles.card, width: '48%', minHeight: 112, alignItems: 'center', justifyContent: 'center', gap: 7 },
  statValue: { fontSize: 30, fontWeight: '900', color: colors.primary },
  statLabel: { fontSize: 12, color: colors.muted, textAlign: 'center' },
  primaryCard: { ...commonStyles.card, backgroundColor: '#cffafe', borderColor: '#67e8f9', gap: 8 },
  primaryTitle: { fontSize: 19, fontWeight: '900', color: colors.primaryDark, textAlign: 'right' },
  primaryText: { color: colors.text, lineHeight: 22, textAlign: 'right' },
})

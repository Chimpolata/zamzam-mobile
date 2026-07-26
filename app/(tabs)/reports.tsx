import { useFocusEffect, useRouter } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import React, { useCallback, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

import { useApp } from '../../src/context/AppContext'
import { api } from '../../src/lib/api'
import { useTheme } from '../../src/theme'

export default function ReportsScreen() {
  const router = useRouter()
  const db = useSQLiteContext()
  const { activeTahfizId, user } = useApp()
  const { colors, commonStyles } = useTheme()
  const styles = createStyles(colors, commonStyles)
  const [summary, setSummary] = useState<Record<string, any> | null>(null)
  const [localSummary, setLocalSummary] = useState({
    total_students: 0,
    total_sessions: 0,
    attendance_records: 0,
    attendance_rate: 0,
    progress_entries: 0,
  })
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!activeTahfizId) return
    const [students, sessions, attendance, present, progress] = await Promise.all([
      db.getFirstAsync<{ count: number }>('SELECT COUNT(*) count FROM students WHERE tahfiz_id=?', activeTahfizId),
      db.getFirstAsync<{ count: number }>('SELECT COUNT(*) count FROM sessions WHERE tahfiz_id=?', activeTahfizId),
      db.getFirstAsync<{ count: number }>('SELECT COUNT(*) count FROM attendance WHERE tahfiz_id=?', activeTahfizId),
      db.getFirstAsync<{ count: number }>("SELECT COUNT(*) count FROM attendance WHERE tahfiz_id=? AND status='حاضر'", activeTahfizId),
      db.getFirstAsync<{ count: number }>('SELECT COUNT(*) count FROM quran_progress WHERE tahfiz_id=?', activeTahfizId),
    ])
    const attendanceCount = attendance?.count ?? 0
    setLocalSummary({
      total_students: students?.count ?? 0,
      total_sessions: sessions?.count ?? 0,
      attendance_records: attendanceCount,
      attendance_rate: attendanceCount ? Math.round(((present?.count ?? 0) / attendanceCount) * 100) : 0,
      progress_entries: progress?.count ?? 0,
    })
    try {
      setSummary(await api.dashboard(activeTahfizId))
      setError('')
    } catch {
      setSummary(null)
      setError('تعرض الإحصاءات الحالية البيانات المحفوظة على الجهاز.')
    }
  }, [db, activeTahfizId])
  useFocusEffect(useCallback(() => { void load() }, [load]))

  const displayedSummary = summary ?? localSummary

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.content}>
      <Text style={commonStyles.title}>التقارير</Text>
      {error ? <Text style={styles.warning}>{error}</Text> : null}
      {!displayedSummary && !error ? <ActivityIndicator color={colors.primary} /> : null}
      {displayedSummary ? (
        <View style={styles.grid}>
          {Object.entries(displayedSummary).filter(([, value]) => typeof value === 'number').slice(0, 6).map(([key, value]) => (
            <View key={key} style={styles.stat}>
              <Text style={styles.value}>{key === 'attendance_rate' ? `${String(value)}٪` : String(value)}</Text>
              <Text style={styles.label}>{labelFor(key)}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <TouchableOpacity style={styles.link} onPress={() => router.push('/attendance-history')}>
        <View style={styles.linkBody}>
          <Text style={styles.linkText}>سجل الحضور</Text>
          <Text style={styles.offline}>متاح دون اتصال · بحث وتصفية بالتاريخ والحالة</Text>
        </View>
        <Text style={styles.arrow}>‹</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.link} onPress={() => router.push('/progress-history')}>
        <View style={styles.linkBody}>
          <Text style={styles.linkText}>تقرير تقدم القرآن</Text>
          <Text style={styles.offline}>متاح دون اتصال · الحفظ والمراجعة والتقييمات</Text>
        </View>
        <Text style={styles.arrow}>‹</Text>
      </TouchableOpacity>
      {user?.role === 'admin' || user?.global_role === 'super_admin' ? (
        <TouchableOpacity
          style={styles.link}
          onPress={() => router.push('/warnings')}
        >
          <View style={styles.linkBody}>
            <Text style={styles.linkText}>الإنذارات</Text>
            <Text style={styles.online}>يتطلب اتصالاً بالإنترنت</Text>
          </View>
          <Text style={styles.arrow}>‹</Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  )
}

function labelFor(value: string) {
  const labels: Record<string, string> = {
    total_students: 'إجمالي الطلاب',
    total_sessions: 'الحلقات',
    upcoming_sessions: 'الحلقات المفتوحة',
    attendance_rate: 'نسبة الحضور',
    attendance_records: 'سجلات الحضور',
    progress_entries: 'مدخلات القرآن',
    total_sheikhs: 'الشيوخ',
  }
  return labels[value] ?? value.replaceAll('_', ' ')
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors'], commonStyles: ReturnType<typeof useTheme>['commonStyles']) => StyleSheet.create({
  warning: { color: colors.warning, textAlign: 'right' },
  grid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 9 },
  stat: { ...commonStyles.card, width: '48%', alignItems: 'center' },
  value: { fontSize: 26, color: colors.primary, fontWeight: '900' },
  label: { color: colors.muted, fontSize: 12, textAlign: 'center' },
  link: { ...commonStyles.card, minHeight: 60, flexDirection: 'row-reverse', alignItems: 'center' },
  linkBody: { flex: 1, gap: 4 },
  linkText: { color: colors.text, fontWeight: '800', textAlign: 'right' },
  offline: { color: colors.success, fontSize: 11, textAlign: 'right', fontWeight: '700' },
  online: { color: colors.primary, fontSize: 11, textAlign: 'right', fontWeight: '700' },
  arrow: { color: colors.primary, fontSize: 28 },
})

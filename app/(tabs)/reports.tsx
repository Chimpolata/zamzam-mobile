import { useFocusEffect, useRouter } from 'expo-router'
import React, { useCallback, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

import { useApp } from '../../src/context/AppContext'
import { api } from '../../src/lib/api'
import { colors, commonStyles } from '../../src/theme'

export default function ReportsScreen() {
  const router = useRouter()
  const { activeTahfizId } = useApp()
  const [summary, setSummary] = useState<Record<string, any> | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!activeTahfizId) return
    try {
      setSummary(await api.dashboard(activeTahfizId))
      setError('')
    } catch {
      setError('التقارير التفصيلية تحتاج اتصالاً بالإنترنت')
    }
  }, [activeTahfizId])
  useFocusEffect(useCallback(() => { void load() }, [load]))

  const links = [
    ['attendance', 'سجل الحضور', '/reports/attendance-grid'],
    ['progress', 'تقرير تقدم القرآن', '/reports/quran-progress'],
    ['warnings', 'الإنذارات', '/warnings'],
  ] as const

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.content}>
      <Text style={commonStyles.title}>التقارير</Text>
      {error ? <Text style={styles.warning}>{error}</Text> : null}
      {!summary && !error ? <ActivityIndicator color={colors.primary} /> : null}
      {summary ? (
        <View style={styles.grid}>
          {Object.entries(summary).filter(([, value]) => typeof value === 'number').slice(0, 6).map(([key, value]) => (
            <View key={key} style={styles.stat}>
              <Text style={styles.value}>{String(value)}</Text>
              <Text style={styles.label}>{labelFor(key)}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {links.map(([screen, label, endpoint]) => (
        <TouchableOpacity
          key={screen}
          style={styles.link}
          onPress={() => router.push({ pathname: '/online/[screen]', params: { screen, endpoint, label } })}
        >
          <Text style={styles.linkText}>{label}</Text>
          <Text style={styles.arrow}>‹</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  )
}

function labelFor(value: string) {
  const labels: Record<string, string> = {
    total_students: 'إجمالي الطلاب',
    total_sessions: 'الحلقات',
    upcoming_sessions: 'الحلقات المفتوحة',
    attendance_rate: 'نسبة الحضور',
    total_sheikhs: 'الشيوخ',
  }
  return labels[value] ?? value.replaceAll('_', ' ')
}

const styles = StyleSheet.create({
  warning: { color: colors.warning, textAlign: 'right' },
  grid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 9 },
  stat: { ...commonStyles.card, width: '48%', alignItems: 'center' },
  value: { fontSize: 26, color: colors.primary, fontWeight: '900' },
  label: { color: colors.muted, fontSize: 12, textAlign: 'center' },
  link: { ...commonStyles.card, minHeight: 60, flexDirection: 'row-reverse', alignItems: 'center' },
  linkText: { flex: 1, color: colors.text, fontWeight: '800', textAlign: 'right' },
  arrow: { color: colors.primary, fontSize: 28 },
})

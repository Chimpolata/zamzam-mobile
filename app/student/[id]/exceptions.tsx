import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

import { useApp } from '../../../src/context/AppContext'
import { api } from '../../../src/lib/api'
import { useTheme } from '../../../src/theme'

interface ExcusedDay {
  id?: number | null
  weekday: number
  note: string | null
}

const weekdayNames = ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد']

export default function StudentExceptionsScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>()
  const studentId = Number(id)
  const { activeTahfizId } = useApp()
  const { colors, commonStyles } = useTheme()
  const styles = createStyles(colors)
  const [days, setDays] = useState<ExcusedDay[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!activeTahfizId || !studentId) return
    setLoading(true)
    try {
      setDays(await api.get(`/students/${studentId}/excused-weekdays`, activeTahfizId) as ExcusedDay[])
    } catch (error) {
      Alert.alert('تعذر تحميل أيام العذر', error instanceof Error ? error.message : 'تحقق من الاتصال')
    } finally {
      setLoading(false)
    }
  }, [activeTahfizId, studentId])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  const toggle = (weekday: number) => {
    setDays((current) => current.some((item) => item.weekday === weekday)
      ? current.filter((item) => item.weekday !== weekday)
      : [...current, { weekday, note: null }].sort((a, b) => a.weekday - b.weekday))
  }

  const setNote = (weekday: number, note: string) => {
    setDays((current) => current.map((item) => item.weekday === weekday ? { ...item, note } : item))
  }

  const save = async () => {
    if (!activeTahfizId) return
    setSaving(true)
    try {
      await api.mutate(`/students/${studentId}/excused-weekdays`, 'PUT', activeTahfizId, {
        weekdays: days.map((item) => ({ weekday: item.weekday, note: item.note?.trim() || null })),
      })
      Alert.alert('تم الحفظ', 'تم تحديث أيام العذر الأسبوعية.')
      await load()
    } catch (error) {
      Alert.alert('تعذر الحفظ', error instanceof Error ? error.message : 'تحقق من البيانات')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: name ? `أيام عذر ${name}` : 'أيام العذر' }} />
      <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.content} keyboardShouldPersistTaps="handled">
        <Text style={commonStyles.title}>أيام العذر الأسبوعية</Text>
        <Text style={commonStyles.subtitle}>اختر الأيام المعتادة التي يُعذر فيها الطالب وأضف توضيحاً اختيارياً.</Text>
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
        <View style={styles.days}>
          {weekdayNames.map((label, weekday) => {
            const selected = days.some((item) => item.weekday === weekday)
            return (
              <TouchableOpacity
                key={weekday}
                onPress={() => toggle(weekday)}
                style={[styles.day, selected && styles.dayActive]}
              >
                <Text style={[styles.dayText, selected && styles.dayTextActive]}>{label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
        {days.map((item) => (
          <View key={item.weekday} style={commonStyles.card}>
            <Text style={styles.label}>{weekdayNames[item.weekday]}</Text>
            <TextInput
              value={item.note ?? ''}
              onChangeText={(value) => setNote(item.weekday, value)}
              placeholder="سبب أو ملاحظة اختيارية"
              style={commonStyles.input}
            />
          </View>
        ))}
        <TouchableOpacity disabled={saving} style={commonStyles.button} onPress={() => void save()}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={commonStyles.buttonText}>حفظ أيام العذر</Text>}
        </TouchableOpacity>
      </ScrollView>
    </>
  )
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  days: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  day: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10, backgroundColor: colors.input },
  dayActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayText: { color: colors.text, fontWeight: '800', fontSize: 12 },
  dayTextActive: { color: '#fff' },
  label: { color: colors.text, fontWeight: '900', textAlign: 'right', marginBottom: 9 },
})

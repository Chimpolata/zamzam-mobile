import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
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

type RangeType = 'page' | 'surah_ayah'

interface QuranRange {
  range_type: RangeType
  from_page: number | null
  to_page: number | null
  from_surah: number | null
  from_ayah: number | null
  to_surah: number | null
  to_ayah: number | null
}

interface ProgressEntry extends QuranRange {
  id: number
  session_date: string | null
  category: 'new_memorization' | 'recent_revision' | 'old_revision' | 'test'
  quality_score: number
  mistakes: number
  notes: string | null
  next_assignment: string | null
}

interface StudentGoal extends QuranRange {
  id: number
  target_date: string | null
  notes: string | null
  status: 'active' | 'completed' | 'cancelled'
  completed_at: string | null
}

interface ProgressRevision {
  id: number
  editor_username: string
  created_at: string
  before: Record<string, unknown>
  after: Record<string, unknown>
}

interface ProgressResponse {
  enabled: boolean
  entries: ProgressEntry[]
  goals: StudentGoal[]
  average_quality: number
  trend: Array<{ entry_id: number; session_date: string; quality_score: number; mistakes: number }>
  revisions: ProgressRevision[]
}

export default function StudentProgressScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>()
  const studentId = Number(id)
  const { activeTahfizId } = useApp()
  const { colors, commonStyles } = useTheme()
  const styles = createStyles(colors)
  const [data, setData] = useState<ProgressResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [goalOpen, setGoalOpen] = useState(false)
  const [rangeType, setRangeType] = useState<RangeType>('page')
  const [fromPage, setFromPage] = useState('1')
  const [toPage, setToPage] = useState('1')
  const [fromSurah, setFromSurah] = useState('1')
  const [fromAyah, setFromAyah] = useState('1')
  const [toSurah, setToSurah] = useState('1')
  const [toAyah, setToAyah] = useState('1')
  const [targetDate, setTargetDate] = useState('')
  const [goalNotes, setGoalNotes] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!activeTahfizId || !studentId) return
    setLoading(true)
    try {
      setData(await api.get(`/students/${studentId}/progress`, activeTahfizId) as ProgressResponse)
    } catch (error) {
      Alert.alert('تعذر تحميل تقدم الطالب', error instanceof Error ? error.message : 'تحقق من الاتصال')
    } finally {
      setLoading(false)
    }
  }, [activeTahfizId, studentId])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  const createGoal = async () => {
    if (!activeTahfizId) return
    const startPage = Number(fromPage)
    const endPage = Number(toPage)
    const startSurah = Number(fromSurah)
    const startAyah = Number(fromAyah)
    const endSurah = Number(toSurah)
    const endAyah = Number(toAyah)
    if (rangeType === 'page' && (startPage < 1 || endPage < startPage || endPage > 604)) {
      Alert.alert('تحقق من الصفحات', 'أدخل نطاقاً صحيحاً بين ١ و٦٠٤.')
      return
    }
    if (rangeType === 'surah_ayah' && (
      startSurah < 1 || startSurah > 114 || endSurah < startSurah || endSurah > 114
      || startAyah < 1 || endAyah < 1
    )) {
      Alert.alert('تحقق من السورة والآية', 'أدخل بداية ونهاية صحيحتين.')
      return
    }
    setBusy(true)
    try {
      await api.mutate(`/students/${studentId}/goals`, 'POST', activeTahfizId, {
        range_type: rangeType,
        from_page: rangeType === 'page' ? startPage : null,
        to_page: rangeType === 'page' ? endPage : null,
        from_surah: rangeType === 'surah_ayah' ? startSurah : null,
        from_ayah: rangeType === 'surah_ayah' ? startAyah : null,
        to_surah: rangeType === 'surah_ayah' ? endSurah : null,
        to_ayah: rangeType === 'surah_ayah' ? endAyah : null,
        target_date: targetDate.trim() || null,
        notes: goalNotes.trim() || null,
      })
      setGoalOpen(false)
      setGoalNotes('')
      setTargetDate('')
      await load()
    } catch (error) {
      Alert.alert('تعذر إضافة الهدف', error instanceof Error ? error.message : 'تحقق من البيانات')
    } finally {
      setBusy(false)
    }
  }

  const completeGoal = async (goal: StudentGoal) => {
    if (!activeTahfizId) return
    setBusy(true)
    try {
      await api.mutate(`/students/${studentId}/goals/${goal.id}`, 'PUT', activeTahfizId, {
        status: 'completed',
      })
      await load()
    } catch (error) {
      Alert.alert('تعذر إكمال الهدف', error instanceof Error ? error.message : 'حاول مرة أخرى')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: name ? `تقدم ${name}` : 'تقدم الطالب' }} />
      <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.content}>
        <Text style={commonStyles.title}>{name || 'تقدم الطالب'}</Text>
        <Text style={commonStyles.subtitle}>التفاصيل والأهداف تحتاج اتصالاً بالإنترنت؛ سجل آخر ٩٠ يوماً متاح أيضاً في التقارير دون اتصال.</Text>
        {loading && !data ? <ActivityIndicator color={colors.primary} /> : null}
        {data && !data.enabled ? (
          <View style={commonStyles.card}><Text style={commonStyles.subtitle}>متابعة القرآن غير مفعلة لهذا التحفيظ.</Text></View>
        ) : null}
        {data?.enabled ? (
          <>
            <View style={styles.summary}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{data.average_quality || '—'}</Text>
                <Text style={styles.statLabel}>متوسط التقييم</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{data.entries.length}</Text>
                <Text style={styles.statLabel}>المدخلات</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{data.goals.filter((goal) => goal.status === 'active').length}</Text>
                <Text style={styles.statLabel}>أهداف نشطة</Text>
              </View>
            </View>

            <View style={commonStyles.card}>
              <View style={styles.sectionHeader}>
                <TouchableOpacity style={styles.addGoal} onPress={() => setGoalOpen(true)}>
                  <Text style={styles.addGoalText}>+ هدف</Text>
                </TouchableOpacity>
                <Text style={styles.sectionTitle}>أهداف الطالب</Text>
              </View>
              {data.goals.length === 0 ? <Text style={commonStyles.subtitle}>لا توجد أهداف بعد.</Text> : null}
              {data.goals.map((goal) => (
                <View key={goal.id} style={styles.goal}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.goalRange}>{formatRange(goal)}</Text>
                    <Text style={commonStyles.subtitle}>
                      {goal.target_date ? `الموعد: ${goal.target_date}` : 'دون موعد'} · {goalStatus(goal.status)}
                    </Text>
                    {goal.notes ? <Text style={styles.notes}>{goal.notes}</Text> : null}
                  </View>
                  {goal.status === 'active' ? (
                    <TouchableOpacity disabled={busy} style={styles.complete} onPress={() => void completeGoal(goal)}>
                      <Text style={styles.completeText}>إكمال</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ))}
            </View>

            {data.trend.length ? (
              <View style={commonStyles.card}>
                <Text style={styles.sectionTitle}>اتجاه التقييم</Text>
                <View style={styles.trend}>
                  {data.trend.map((point) => (
                    <View key={point.entry_id} style={styles.trendItem}>
                      <Text style={styles.trendScore}>{point.quality_score}</Text>
                      <View style={[styles.trendBar, { height: Math.max(14, point.quality_score * 14) }]} />
                      <Text style={styles.trendDate}>{point.session_date.slice(5)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            <Text style={styles.sectionTitle}>أحدث المدخلات</Text>
            {data.entries.slice(0, 30).map((entry) => (
              <View key={entry.id} style={commonStyles.card}>
                <View style={styles.entryHeader}>
                  <View style={styles.score}>
                    <Text style={styles.scoreValue}>{entry.quality_score}/٥</Text>
                    <Text style={styles.scoreLabel}>{entry.mistakes} أخطاء</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.entryTitle}>{categoryLabel(entry.category)}</Text>
                    <Text style={styles.entryRange}>{formatRange(entry)}</Text>
                    <Text style={commonStyles.subtitle}>{entry.session_date || 'دون تاريخ'}</Text>
                  </View>
                </View>
                {entry.notes ? <Text style={styles.notes}>ملاحظات: {entry.notes}</Text> : null}
                {entry.next_assignment ? <Text style={styles.assignment}>التالي: {entry.next_assignment}</Text> : null}
              </View>
            ))}

            {data.revisions.length ? (
              <View style={commonStyles.card}>
                <Text style={styles.sectionTitle}>سجل التعديلات</Text>
                {data.revisions.slice(0, 10).map((revision) => (
                  <View key={revision.id} style={styles.revision}>
                    <Text style={styles.revisionTitle}>
                      {revision.editor_username} · {new Date(revision.created_at).toLocaleString('ar-EG')}
                    </Text>
                    <Text style={commonStyles.subtitle}>
                      التقييم {String(revision.before.quality_score ?? '—')} ← {String(revision.after.quality_score ?? '—')}
                      {' · '}الأخطاء {String(revision.before.mistakes ?? '—')} ← {String(revision.after.mistakes ?? '—')}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <Modal visible={goalOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setGoalOpen(false)}>
        <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.content} keyboardShouldPersistTaps="handled">
          <Text style={commonStyles.title}>هدف جديد</Text>
          <View style={styles.rangeChoices}>
            <Choice label="بالصفحات" active={rangeType === 'page'} onPress={() => setRangeType('page')} />
            <Choice label="بالسورة والآية" active={rangeType === 'surah_ayah'} onPress={() => setRangeType('surah_ayah')} />
          </View>
          {rangeType === 'page' ? (
            <View style={styles.inputRow}>
              <TextInput value={fromPage} onChangeText={setFromPage} keyboardType="number-pad" placeholder="من صفحة" style={[commonStyles.input, styles.half]} />
              <TextInput value={toPage} onChangeText={setToPage} keyboardType="number-pad" placeholder="إلى صفحة" style={[commonStyles.input, styles.half]} />
            </View>
          ) : (
            <>
              <View style={styles.inputRow}>
                <TextInput value={fromSurah} onChangeText={setFromSurah} keyboardType="number-pad" placeholder="من سورة" style={[commonStyles.input, styles.half]} />
                <TextInput value={fromAyah} onChangeText={setFromAyah} keyboardType="number-pad" placeholder="من آية" style={[commonStyles.input, styles.half]} />
              </View>
              <View style={styles.inputRow}>
                <TextInput value={toSurah} onChangeText={setToSurah} keyboardType="number-pad" placeholder="إلى سورة" style={[commonStyles.input, styles.half]} />
                <TextInput value={toAyah} onChangeText={setToAyah} keyboardType="number-pad" placeholder="إلى آية" style={[commonStyles.input, styles.half]} />
              </View>
            </>
          )}
          <TextInput value={targetDate} onChangeText={setTargetDate} placeholder="الموعد المستهدف YYYY-MM-DD (اختياري)" style={commonStyles.input} />
          <TextInput value={goalNotes} onChangeText={setGoalNotes} multiline placeholder="ملاحظات الهدف (اختياري)" style={[commonStyles.input, styles.goalNotes]} textAlignVertical="top" />
          <TouchableOpacity disabled={busy} style={commonStyles.button} onPress={() => void createGoal()}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={commonStyles.buttonText}>إضافة الهدف</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancel} onPress={() => setGoalOpen(false)}>
            <Text style={commonStyles.subtitle}>إلغاء</Text>
          </TouchableOpacity>
        </ScrollView>
      </Modal>
    </>
  )
}

function formatRange(value: QuranRange) {
  if (value.range_type === 'page') return `صفحات ${value.from_page ?? '—'}–${value.to_page ?? '—'}`
  return `سورة ${value.from_surah ?? '—'}:${value.from_ayah ?? '—'} إلى ${value.to_surah ?? '—'}:${value.to_ayah ?? '—'}`
}

function categoryLabel(value: ProgressEntry['category']) {
  return {
    new_memorization: 'حفظ جديد',
    recent_revision: 'مراجعة حديثة',
    old_revision: 'مراجعة قديمة',
    test: 'اختبار',
  }[value]
}

function goalStatus(value: StudentGoal['status']) {
  return { active: 'نشط', completed: 'مكتمل', cancelled: 'ملغي' }[value]
}

function Choice({ label, active, onPress }: { label: string; active: boolean; onPress(): void }) {
  const { colors } = useTheme()
  const styles = createStyles(colors)
  return (
    <TouchableOpacity onPress={onPress} style={[styles.choice, active && styles.choiceActive]}>
      <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text>
    </TouchableOpacity>
  )
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  summary: { flexDirection: 'row-reverse', gap: 8 },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, alignItems: 'center', padding: 12 },
  statValue: { color: colors.primary, fontWeight: '900', fontSize: 22 },
  statLabel: { color: colors.muted, fontSize: 10, textAlign: 'center' },
  sectionHeader: { flexDirection: 'row-reverse', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { flex: 1, color: colors.text, fontWeight: '900', fontSize: 16, textAlign: 'right' },
  addGoal: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  addGoalText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  goal: { flexDirection: 'row-reverse', gap: 8, alignItems: 'center', backgroundColor: colors.background, borderRadius: 12, padding: 10, marginTop: 8 },
  goalRange: { color: colors.text, fontWeight: '900', textAlign: 'right' },
  complete: { backgroundColor: colors.successSurface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  completeText: { color: colors.success, fontWeight: '900', fontSize: 12 },
  trend: { minHeight: 100, flexDirection: 'row', alignItems: 'flex-end', gap: 5, marginTop: 12 },
  trendItem: { flex: 1, minWidth: 16, alignItems: 'center', justifyContent: 'flex-end' },
  trendScore: { color: colors.muted, fontSize: 9 },
  trendBar: { width: '75%', maxWidth: 22, backgroundColor: colors.primary, borderTopLeftRadius: 5, borderTopRightRadius: 5 },
  trendDate: { color: colors.muted, fontSize: 8, marginTop: 3 },
  entryHeader: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 10 },
  entryTitle: { color: colors.text, fontWeight: '900', textAlign: 'right' },
  entryRange: { color: colors.primaryDark, fontWeight: '800', fontSize: 12, textAlign: 'right', marginVertical: 4 },
  score: { backgroundColor: colors.primarySurface, borderRadius: 12, padding: 8, alignItems: 'center' },
  scoreValue: { color: colors.primaryDark, fontWeight: '900' },
  scoreLabel: { color: colors.muted, fontSize: 9 },
  notes: { color: colors.text, textAlign: 'right', marginTop: 8, fontSize: 12 },
  assignment: { color: colors.primaryDark, backgroundColor: colors.primarySurface, borderRadius: 9, padding: 8, textAlign: 'right', marginTop: 8, fontSize: 12 },
  revision: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 9, marginTop: 9 },
  revisionTitle: { color: colors.text, fontSize: 11, fontWeight: '800', textAlign: 'right' },
  rangeChoices: { flexDirection: 'row-reverse', gap: 8 },
  choice: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, alignItems: 'center', justifyContent: 'center' },
  choiceActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  choiceText: { color: colors.text, fontWeight: '800', fontSize: 12 },
  choiceTextActive: { color: '#fff' },
  inputRow: { flexDirection: 'row-reverse', gap: 8 },
  half: { flex: 1 },
  goalNotes: { minHeight: 100, paddingTop: 14 },
  cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
})

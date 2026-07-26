import { useFocusEffect, useRouter } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import React, { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

import { useApp } from '../src/context/AppContext'
import { shareCsv } from '../src/lib/csv-export'
import { useTheme } from '../src/theme'

type ProgressCategory = 'new_memorization' | 'recent_revision' | 'old_revision' | 'test'

interface ProgressHistoryRow {
  id: number
  session_id: number
  student_id: number
  student_name: string
  sheikh_name: string | null
  date: string
  category: ProgressCategory
  range_type: 'page' | 'surah_ayah'
  from_page: number | null
  to_page: number | null
  from_surah: number | null
  from_ayah: number | null
  to_surah: number | null
  to_ayah: number | null
  quality_score: number
  mistakes: number
  notes: string | null
  next_assignment: string | null
  dirty: number
}

const categories: Array<['all' | ProgressCategory, string]> = [
  ['all', 'الكل'],
  ['new_memorization', 'حفظ جديد'],
  ['recent_revision', 'مراجعة حديثة'],
  ['old_revision', 'مراجعة قديمة'],
  ['test', 'اختبار'],
]

const initialFromDate = () => {
  const value = new Date()
  value.setDate(value.getDate() - 89)
  return value.toISOString().slice(0, 10)
}

export default function ProgressHistoryScreen() {
  const router = useRouter()
  const db = useSQLiteContext()
  const { activeTahfizId } = useApp()
  const { colors, commonStyles } = useTheme()
  const styles = createStyles(colors)
  const [rows, setRows] = useState<ProgressHistoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<'all' | ProgressCategory>('all')
  const [fromDate, setFromDate] = useState(initialFromDate)
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async () => {
    if (!activeTahfizId) {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      setRows(await db.getAllAsync<ProgressHistoryRow>(
        `SELECT p.id,p.session_id,p.student_id,s.name student_name,sh.name sheikh_name,se.date,
                p.category,p.range_type,p.from_page,p.to_page,p.from_surah,p.from_ayah,
                p.to_surah,p.to_ayah,p.quality_score,p.mistakes,p.notes,p.next_assignment,p.dirty
         FROM quran_progress p
         JOIN students s ON s.id=p.student_id
         JOIN sessions se ON se.id=p.session_id
         LEFT JOIN sheikhs sh ON sh.id=p.sheikh_id
         WHERE p.tahfiz_id=?
         ORDER BY se.date DESC,s.sort_order,s.name,p.category`,
        activeTahfizId,
      ))
    } finally {
      setLoading(false)
    }
  }, [db, activeTahfizId])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ar')
    return rows.filter((item) => (
      (!normalized
        || item.student_name.toLocaleLowerCase('ar').includes(normalized)
        || item.sheikh_name?.toLocaleLowerCase('ar').includes(normalized))
      && (category === 'all' || item.category === category)
      && (!fromDate || item.date >= fromDate)
      && (!toDate || item.date <= toDate)
    ))
  }, [rows, query, category, fromDate, toDate])

  const studentCount = useMemo(
    () => new Set(filtered.map((item) => item.student_id)).size,
    [filtered],
  )
  const averageQuality = filtered.length
    ? (filtered.reduce((sum, item) => sum + item.quality_score, 0) / filtered.length).toFixed(1)
    : '—'
  const mistakes = filtered.reduce((sum, item) => sum + item.mistakes, 0)
  const pending = filtered.filter((item) => item.dirty).length
  const exportFiltered = async () => {
    setExporting(true)
    try {
      await shareCsv(
        'zamzam-quran-progress.csv',
        ['التاريخ', 'الطالب', 'الشيخ', 'النوع', 'النطاق', 'التقييم', 'الأخطاء', 'الملاحظات', 'التكليف القادم', 'بانتظار المزامنة'],
        filtered.map((item) => [
          item.date,
          item.student_name,
          item.sheikh_name,
          categoryLabel(item.category),
          formatRange(item),
          item.quality_score,
          item.mistakes,
          item.notes,
          item.next_assignment,
          item.dirty ? 'نعم' : 'لا',
        ]),
      )
    } catch (reason) {
      Alert.alert('تعذر تصدير التقرير', reason instanceof Error ? reason.message : 'حاول مرة أخرى')
    } finally {
      setExporting(false)
    }
  }

  return (
    <FlatList
      style={commonStyles.screen}
      contentContainerStyle={commonStyles.content}
      data={filtered}
      keyExtractor={(item) => String(item.id)}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={(
        <View style={styles.header}>
          <Text style={commonStyles.title}>تقدم القرآن</Text>
          <Text style={commonStyles.subtitle}>
            سجل الحفظ والمراجعة المحفوظ على الجهاز متاح دون اتصال.
          </Text>
          <TouchableOpacity
            disabled={exporting || filtered.length === 0}
            style={[styles.exportButton, (exporting || filtered.length === 0) && { opacity: 0.5 }]}
            onPress={() => void exportFiltered()}
          >
            {exporting
              ? <ActivityIndicator color={colors.primary} />
              : <Text style={styles.exportButtonText}>تصدير النتائج الحالية CSV</Text>}
          </TouchableOpacity>
          <View style={styles.summary}>
            <Stat label="الطلاب" value={String(studentCount)} />
            <Stat label="متوسط التقييم" value={averageQuality} />
            <Stat label="الأخطاء" value={String(mistakes)} />
            <Stat label="بانتظار المزامنة" value={String(pending)} warning={pending > 0} />
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="ابحث باسم الطالب أو الشيخ"
            style={commonStyles.input}
          />
          <View style={styles.dateRow}>
            <TextInput
              value={toDate}
              onChangeText={setToDate}
              placeholder="إلى YYYY-MM-DD"
              style={[commonStyles.input, styles.dateInput]}
            />
            <TextInput
              value={fromDate}
              onChangeText={setFromDate}
              placeholder="من YYYY-MM-DD"
              style={[commonStyles.input, styles.dateInput]}
            />
          </View>
          <FlatList
            horizontal
            inverted
            data={categories}
            keyExtractor={(item) => item[0]}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filters}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => setCategory(item[0])}
                style={[styles.filter, category === item[0] && styles.filterActive]}
              >
                <Text style={[styles.filterText, category === item[0] && styles.filterTextActive]}>{item[1]}</Text>
              </TouchableOpacity>
            )}
          />
          {loading ? <ActivityIndicator color={colors.primary} /> : null}
        </View>
      )}
      ListEmptyComponent={!loading ? (
        <View style={commonStyles.card}>
          <Text style={commonStyles.subtitle}>لا توجد مدخلات مطابقة في البيانات المحفوظة.</Text>
        </View>
      ) : null}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={commonStyles.card}
          onPress={() => router.push({
            pathname: '/student/[id]/progress',
            params: { id: String(item.student_id), name: item.student_name },
          })}
        >
          <View style={styles.rowHeader}>
            <View style={styles.score}>
              <Text style={styles.scoreValue}>{item.quality_score}/٥</Text>
              <Text style={styles.scoreLabel}>{item.mistakes} أخطاء</Text>
            </View>
            <View style={styles.nameBlock}>
              <Text style={styles.name}>{item.student_name}</Text>
              <Text style={styles.meta}>
                {categoryLabel(item.category)} · {formatRange(item)}
              </Text>
              <Text style={styles.meta}>
                {new Date(`${item.date}T12:00:00`).toLocaleDateString('ar-EG', {
                  weekday: 'long', year: 'numeric', month: 'short', day: 'numeric',
                })}
              </Text>
              {item.sheikh_name ? <Text style={styles.meta}>الشيخ: {item.sheikh_name}</Text> : null}
            </View>
          </View>
          {item.dirty ? <Text style={styles.pending}>بانتظار المزامنة</Text> : null}
          {item.notes ? <Text style={styles.detail}>ملاحظات: {item.notes}</Text> : null}
          {item.next_assignment ? <Text style={styles.assignment}>التكليف القادم: {item.next_assignment}</Text> : null}
          <Text style={styles.openProfile}>فتح ملف الطالب والأهداف ←</Text>
        </TouchableOpacity>
      )}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
    />
  )
}

function categoryLabel(value: ProgressCategory) {
  return categories.find(([key]) => key === value)?.[1] ?? value
}

function formatRange(item: ProgressHistoryRow) {
  if (item.range_type === 'page') return `صفحة ${item.from_page ?? '—'}–${item.to_page ?? '—'}`
  return `س ${item.from_surah ?? '—'} آ ${item.from_ayah ?? '—'} ← س ${item.to_surah ?? '—'} آ ${item.to_ayah ?? '—'}`
}

function Stat({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  const { colors } = useTheme()
  const styles = createStyles(colors)
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, warning && { color: colors.warning }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  header: { gap: 12, marginBottom: 10 },
  summary: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  exportButton: { minHeight: 44, borderWidth: 1, borderColor: colors.primary, borderRadius: 12, backgroundColor: colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  exportButtonText: { color: colors.primaryDark, fontWeight: '900', fontSize: 12 },
  stat: {
    width: '48%', minHeight: 78, borderRadius: 14, backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', padding: 8,
  },
  statValue: { color: colors.primary, fontWeight: '900', fontSize: 22 },
  statLabel: { color: colors.muted, fontSize: 11, textAlign: 'center' },
  dateRow: { flexDirection: 'row-reverse', gap: 8 },
  dateInput: { flex: 1, minHeight: 46, textAlign: 'center' },
  filters: { gap: 8 },
  filter: {
    minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input,
  },
  filterActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  filterText: { color: colors.text, fontWeight: '800', fontSize: 12 },
  filterTextActive: { color: '#fff' },
  rowHeader: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 10 },
  nameBlock: { flex: 1, gap: 4 },
  name: { color: colors.text, fontWeight: '900', fontSize: 17, textAlign: 'right' },
  meta: { color: colors.muted, fontSize: 12, textAlign: 'right' },
  score: {
    minWidth: 68, backgroundColor: colors.primarySurface, borderRadius: 13,
    alignItems: 'center', paddingHorizontal: 9, paddingVertical: 8,
  },
  scoreValue: { color: colors.primaryDark, fontSize: 16, fontWeight: '900' },
  scoreLabel: { color: colors.muted, fontSize: 10 },
  pending: { color: colors.warning, fontSize: 11, fontWeight: '800', textAlign: 'right', marginTop: 8 },
  detail: {
    color: colors.text, textAlign: 'right', marginTop: 10, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  assignment: {
    color: colors.primaryDark, backgroundColor: colors.primarySurface,
    borderRadius: 10, padding: 9, textAlign: 'right', marginTop: 8,
  },
  openProfile: { color: colors.primary, fontWeight: '800', fontSize: 11, textAlign: 'right', marginTop: 8 },
})

import { useFocusEffect } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import React, { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

import { useApp } from '../src/context/AppContext'
import { api } from '../src/lib/api'
import { shareCsv } from '../src/lib/csv-export'
import { useTheme } from '../src/theme'

interface AttendanceHistoryRow {
  id: number
  session_id: number
  student_id: number
  student_name: string
  sheikh_name: string | null
  date: string
  status: string
  notes: string | null
  dirty: number
}

interface SavedAttendanceView {
  id: string
  name: string
  query: string
  status: string
  fromDate: string
  toDate: string
}

const initialFromDate = () => {
  const value = new Date()
  value.setDate(value.getDate() - 89)
  return value.toISOString().slice(0, 10)
}

export default function AttendanceHistoryScreen() {
  const db = useSQLiteContext()
  const { activeTahfizId, user } = useApp()
  const { colors, commonStyles } = useTheme()
  const styles = createStyles(colors)
  const [rows, setRows] = useState<AttendanceHistoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('الكل')
  const [fromDate, setFromDate] = useState(initialFromDate)
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [savedViews, setSavedViews] = useState<SavedAttendanceView[]>([])
  const [saveOpen, setSaveOpen] = useState(false)
  const [viewName, setViewName] = useState('')
  const [warningStudent, setWarningStudent] = useState<AttendanceHistoryRow | null>(null)
  const [warningSessions, setWarningSessions] = useState<Set<number>>(new Set())
  const [warningPreview, setWarningPreview] = useState<{ next_warning_number: number; remaining_warnings: number } | null>(null)
  const [warningBusy, setWarningBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const admin = user?.role === 'admin' || user?.global_role === 'super_admin'

  const load = useCallback(async () => {
    if (!activeTahfizId) {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [historyRows, savedRow] = await Promise.all([
        db.getAllAsync<AttendanceHistoryRow>(
          `SELECT a.id,a.session_id,a.student_id,s.name student_name,sh.name sheikh_name,
                  se.date,a.status,a.notes,a.dirty
           FROM attendance a
           JOIN students s ON s.id=a.student_id
           JOIN sessions se ON se.id=a.session_id
           LEFT JOIN sheikhs sh ON sh.id=a.sheikh_id
           WHERE a.tahfiz_id=?
           ORDER BY se.date DESC,s.sort_order,s.name`,
          activeTahfizId,
        ),
        db.getFirstAsync<{ value: string }>(
          'SELECT value FROM metadata WHERE key=?',
          `attendance_saved_views:${activeTahfizId}`,
        ),
      ])
      setRows(historyRows)
      try {
        setSavedViews(savedRow ? JSON.parse(savedRow.value) as SavedAttendanceView[] : [])
      } catch {
        setSavedViews([])
      }
    } finally {
      setLoading(false)
    }
  }, [db, activeTahfizId])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  const statuses = useMemo(
    () => ['الكل', ...Array.from(new Set(rows.map((item) => item.status)))],
    [rows],
  )
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ar')
    return rows.filter((item) => (
      (!normalized
        || item.student_name.toLocaleLowerCase('ar').includes(normalized)
        || item.sheikh_name?.toLocaleLowerCase('ar').includes(normalized))
      && (status === 'الكل' || item.status === status)
      && (!fromDate || item.date >= fromDate)
      && (!toDate || item.date <= toDate)
    ))
  }, [rows, query, status, fromDate, toDate])

  const sessionCount = useMemo(
    () => new Set(filtered.map((item) => item.session_id)).size,
    [filtered],
  )
  const presentCount = filtered.filter((item) => item.status === 'حاضر').length
  const pendingCount = filtered.filter((item) => item.dirty).length

  const persistViews = async (next: SavedAttendanceView[]) => {
    if (!activeTahfizId) return
    await db.runAsync(
      `INSERT INTO metadata(key,value) VALUES(?,?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      `attendance_saved_views:${activeTahfizId}`,
      JSON.stringify(next),
    )
    setSavedViews(next)
  }

  const saveCurrentView = async () => {
    const name = viewName.trim()
    if (!name) return
    const next = [
      ...savedViews.filter((item) => item.name !== name),
      {
        id: `${Date.now()}`,
        name,
        query,
        status,
        fromDate,
        toDate,
      },
    ]
    await persistViews(next)
    setViewName('')
    setSaveOpen(false)
  }

  const applyView = (view: SavedAttendanceView) => {
    setQuery(view.query)
    setStatus(view.status)
    setFromDate(view.fromDate)
    setToDate(view.toDate)
  }

  const absentRows = warningStudent
    ? rows.filter((item) => item.student_id === warningStudent.student_id && item.status === 'غياب')
    : []

  const openWarning = async (student: AttendanceHistoryRow) => {
    if (!activeTahfizId) return
    const absences = rows.filter((item) => item.student_id === student.student_id && item.status === 'غياب')
    setWarningStudent(student)
    setWarningSessions(new Set(absences.map((item) => item.session_id)))
    setWarningPreview(null)
    try {
      setWarningPreview(await api.get(
        `/students/${student.student_id}/warnings/preview`,
        activeTahfizId,
      ))
    } catch (reason) {
      Alert.alert('تعذر تحميل معاينة الإنذار', reason instanceof Error ? reason.message : 'تحقق من الاتصال')
    }
  }

  const sendWarning = async () => {
    if (!activeTahfizId || !warningStudent) return
    const labels = absentRows
      .filter((item) => warningSessions.has(item.session_id))
      .map((item) => new Date(`${item.date}T12:00:00`).toLocaleDateString('ar-EG', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      }))
    if (!labels.length) return
    setWarningBusy(true)
    try {
      await api.mutate(
        `/students/${warningStudent.student_id}/warnings/send`,
        'POST',
        activeTahfizId,
        { absent_dates: labels },
      )
      setWarningStudent(null)
      Alert.alert('تم الإرسال', `تم إنشاء وإرسال إنذار ${warningStudent.student_name}.`)
    } catch (reason) {
      Alert.alert('تعذر إرسال الإنذار', reason instanceof Error ? reason.message : 'تحقق من إعدادات WhatsEnd')
    } finally {
      setWarningBusy(false)
    }
  }

  const exportFiltered = async () => {
    setExporting(true)
    try {
      await shareCsv(
        'zamzam-attendance.csv',
        ['التاريخ', 'الطالب', 'الشيخ', 'الحالة', 'الملاحظات', 'بانتظار المزامنة'],
        filtered.map((item) => [
          item.date,
          item.student_name,
          item.sheikh_name,
          item.status,
          item.notes,
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
    <>
    <FlatList
      style={commonStyles.screen}
      contentContainerStyle={commonStyles.content}
      data={filtered}
      keyExtractor={(item) => String(item.id)}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={(
        <View style={styles.header}>
          <Text style={commonStyles.title}>سجل الحضور</Text>
          <Text style={commonStyles.subtitle}>
            آخر ٩٠ يوماً محفوظة في قاعدة البيانات المشفرة وتعمل دون اتصال.
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
            <Stat label="الحلقات" value={sessionCount} />
            <Stat label="حاضر" value={presentCount} />
            <Stat label="السجلات" value={filtered.length} />
            <Stat label="بانتظار المزامنة" value={pendingCount} warning={pendingCount > 0} />
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="ابحث باسم الطالب أو الشيخ"
            style={commonStyles.input}
          />
          <View style={styles.savedHeader}>
            <TouchableOpacity style={styles.saveView} onPress={() => setSaveOpen(true)}>
              <Text style={styles.saveViewText}>+ حفظ التصفية الحالية</Text>
            </TouchableOpacity>
            <Text style={styles.savedTitle}>التصفيات المحفوظة</Text>
          </View>
          {savedViews.length ? (
            <FlatList
              horizontal
              inverted
              data={savedViews}
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filters}
              renderItem={({ item }) => (
                <View style={styles.savedView}>
                  <TouchableOpacity onPress={() => applyView(item)} style={styles.savedViewApply}>
                    <Text style={styles.savedViewText}>{item.name}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityLabel={`حذف تصفية ${item.name}`}
                    onPress={() => void persistViews(savedViews.filter((view) => view.id !== item.id))}
                    style={styles.savedViewDelete}
                  >
                    <Text style={styles.savedViewDeleteText}>×</Text>
                  </TouchableOpacity>
                </View>
              )}
            />
          ) : <Text style={commonStyles.subtitle}>لا توجد تصفيات محفوظة على هذا الجهاز.</Text>}
          <View style={styles.dateRow}>
            <View style={styles.dateField}>
              <Text style={styles.fieldLabel}>إلى</Text>
              <TextInput
                value={toDate}
                onChangeText={setToDate}
                placeholder="YYYY-MM-DD"
                style={[commonStyles.input, styles.dateInput]}
              />
            </View>
            <View style={styles.dateField}>
              <Text style={styles.fieldLabel}>من</Text>
              <TextInput
                value={fromDate}
                onChangeText={setFromDate}
                placeholder="YYYY-MM-DD"
                style={[commonStyles.input, styles.dateInput]}
              />
            </View>
          </View>
          <FlatList
            horizontal
            inverted
            data={statuses}
            keyExtractor={(item) => item}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filters}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => setStatus(item)}
                style={[styles.filter, status === item && styles.filterActive]}
              >
                <Text style={[styles.filterText, status === item && styles.filterTextActive]}>{item}</Text>
              </TouchableOpacity>
            )}
          />
          {loading ? <ActivityIndicator color={colors.primary} /> : null}
        </View>
      )}
      ListEmptyComponent={!loading ? (
        <View style={commonStyles.card}>
          <Text style={commonStyles.subtitle}>لا توجد سجلات مطابقة في البيانات المحفوظة.</Text>
        </View>
      ) : null}
      renderItem={({ item }) => (
        <View style={commonStyles.card}>
          <View style={styles.rowHeader}>
            <View style={styles.statusBlock}>
              <Text style={styles.status}>{item.status}</Text>
              {item.dirty ? <Text style={styles.pending}>بانتظار المزامنة</Text> : null}
            </View>
            <View style={styles.nameBlock}>
              <Text style={styles.name}>{item.student_name}</Text>
              <Text style={styles.meta}>
                {new Date(`${item.date}T12:00:00`).toLocaleDateString('ar-EG', {
                  weekday: 'long', year: 'numeric', month: 'short', day: 'numeric',
                })}
              </Text>
              {item.sheikh_name ? <Text style={styles.meta}>الشيخ: {item.sheikh_name}</Text> : null}
            </View>
          </View>
          {item.notes ? <Text style={styles.notes}>{item.notes}</Text> : null}
          {admin && item.status === 'غياب' ? (
            <TouchableOpacity style={styles.warningButton} onPress={() => void openWarning(item)}>
              <Text style={styles.warningButtonText}>معاينة وإرسال إنذار الغياب</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
    />
    <Modal visible={saveOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSaveOpen(false)}>
      <View style={[commonStyles.screen, commonStyles.content]}>
        <Text style={commonStyles.title}>حفظ التصفية</Text>
        <Text style={commonStyles.subtitle}>ستُحفظ داخل قاعدة البيانات المشفرة لهذا التحفيظ وتعمل دون اتصال.</Text>
        <TextInput
          value={viewName}
          onChangeText={setViewName}
          autoFocus
          placeholder="اسم التصفية"
          style={commonStyles.input}
          onSubmitEditing={() => void saveCurrentView()}
        />
        <TouchableOpacity disabled={!viewName.trim()} style={[commonStyles.button, !viewName.trim() && { opacity: 0.5 }]} onPress={() => void saveCurrentView()}>
          <Text style={commonStyles.buttonText}>حفظ</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancel} onPress={() => setSaveOpen(false)}>
          <Text style={commonStyles.subtitle}>إلغاء</Text>
        </TouchableOpacity>
      </View>
    </Modal>
    <Modal visible={Boolean(warningStudent)} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setWarningStudent(null)}>
      <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.content}>
        <Text style={commonStyles.title}>إنذار غياب {warningStudent?.student_name}</Text>
        <Text style={commonStyles.subtitle}>اختر تواريخ الغياب التي ستظهر في رسالة مجموعة الشيخ.</Text>
        {warningPreview ? (
          <View style={styles.warningPreview}>
            <Text style={styles.warningPreviewText}>رقم الإنذار التالي: {warningPreview.next_warning_number}</Text>
            <Text style={styles.warningPreviewText}>المتبقي بعده: {warningPreview.remaining_warnings}</Text>
          </View>
        ) : <ActivityIndicator color={colors.primary} />}
        {absentRows.map((item) => (
          <TouchableOpacity
            key={item.session_id}
            style={[styles.absenceChoice, warningSessions.has(item.session_id) && styles.absenceChoiceActive]}
            onPress={() => setWarningSessions((current) => {
              const next = new Set(current)
              if (next.has(item.session_id)) next.delete(item.session_id)
              else next.add(item.session_id)
              return next
            })}
          >
            <Text style={[styles.absenceChoiceText, warningSessions.has(item.session_id) && styles.absenceChoiceTextActive]}>
              {warningSessions.has(item.session_id) ? '✓ ' : ''}
              {new Date(`${item.date}T12:00:00`).toLocaleDateString('ar-EG', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
              })}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          disabled={warningBusy || !warningPreview || warningSessions.size === 0}
          style={[commonStyles.button, (warningBusy || !warningPreview || warningSessions.size === 0) && { opacity: 0.5 }]}
          onPress={() => void sendWarning()}
        >
          {warningBusy ? <ActivityIndicator color="#fff" /> : <Text style={commonStyles.buttonText}>إنشاء الإنذار وإرساله</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancel} onPress={() => setWarningStudent(null)}>
          <Text style={commonStyles.subtitle}>إلغاء</Text>
        </TouchableOpacity>
      </ScrollView>
    </Modal>
    </>
  )
}

function Stat({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) {
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
  savedHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  savedTitle: { flex: 1, color: colors.text, fontWeight: '900', textAlign: 'right' },
  saveView: { backgroundColor: colors.primarySurface, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  saveViewText: { color: colors.primaryDark, fontWeight: '800', fontSize: 11 },
  exportButton: { minHeight: 44, borderWidth: 1, borderColor: colors.primary, borderRadius: 12, backgroundColor: colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  exportButtonText: { color: colors.primaryDark, fontWeight: '900', fontSize: 12 },
  savedView: { flexDirection: 'row-reverse', borderRadius: 999, borderWidth: 1, borderColor: colors.primary, overflow: 'hidden' },
  savedViewApply: { paddingHorizontal: 13, paddingVertical: 9, backgroundColor: colors.primarySurface },
  savedViewText: { color: colors.primaryDark, fontWeight: '900', fontSize: 12 },
  savedViewDelete: { width: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.dangerSurface },
  savedViewDeleteText: { color: colors.danger, fontWeight: '900', fontSize: 18 },
  summary: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  stat: {
    width: '48%', minHeight: 78, borderRadius: 14, backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', padding: 8,
  },
  statValue: { color: colors.primary, fontWeight: '900', fontSize: 22 },
  statLabel: { color: colors.muted, fontSize: 11, textAlign: 'center' },
  dateRow: { flexDirection: 'row-reverse', gap: 8 },
  dateField: { flex: 1, gap: 4 },
  fieldLabel: { color: colors.muted, textAlign: 'right', fontSize: 11, fontWeight: '700' },
  dateInput: { minHeight: 46, textAlign: 'center' },
  warningButton: { marginTop: 10, backgroundColor: colors.warningSurface, borderRadius: 11, padding: 10, alignItems: 'center' },
  warningButtonText: { color: colors.warning, fontWeight: '900', fontSize: 12 },
  warningPreview: { flexDirection: 'row-reverse', justifyContent: 'space-around', backgroundColor: colors.warningSurface, borderRadius: 13, padding: 12 },
  warningPreviewText: { color: colors.warning, fontWeight: '900', fontSize: 12 },
  absenceChoice: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, borderRadius: 12, padding: 12 },
  absenceChoiceActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  absenceChoiceText: { color: colors.text, textAlign: 'right', fontWeight: '800' },
  absenceChoiceTextActive: { color: '#fff' },
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
  statusBlock: { alignItems: 'flex-start', gap: 4 },
  status: {
    color: colors.primaryDark, backgroundColor: colors.primarySurface,
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, fontWeight: '900', fontSize: 12,
  },
  pending: { color: colors.warning, fontSize: 10, fontWeight: '800' },
  notes: {
    color: colors.text, textAlign: 'right', marginTop: 10, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
})

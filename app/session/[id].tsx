import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

import { useApp } from '../../src/context/AppContext'
import {
  pendingCount,
  queueAttendance,
  queueProgress,
  sessionAttendance,
  attendanceStatusStreak,
} from '../../src/db/database'
import { api } from '../../src/lib/api'
import { getDeviceId } from '../../src/lib/session-store'
import { useTheme } from '../../src/theme'
import type { Session } from '../../src/types'

interface AttendanceRow {
  id: number
  name: string
  phone: string | null
  profile_pic: string | null
  status: string
  notes: string | null
  sheikh_id: number | null
  attendance_id: number
  attendance_revision: number
  dirty: number
}

interface LocalProgressRow {
  id: number
  student_id: number
  category: 'new_memorization' | 'recent_revision' | 'old_revision' | 'test'
  range_type: 'page' | 'surah_ayah'
  from_surah: number | null
  from_ayah: number | null
  to_surah: number | null
  to_ayah: number | null
  from_page: number | null
  to_page: number | null
  quality_score: number
  mistakes: number
  notes: string | null
  next_assignment: string | null
  dirty: number
}

interface SheikhRow {
  id: number
  name: string
}

const STATUS_PALETTES: Record<string, { background: string; border: string; text: string }> = {
  green: { background: '#ecfdf5', border: '#86efac', text: '#047857' },
  slate: { background: '#f8fafc', border: '#cbd5e1', text: '#475569' },
  amber: { background: '#fffbeb', border: '#fde68a', text: '#a16207' },
  sky: { background: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' },
  violet: { background: '#f5f3ff', border: '#ddd6fe', text: '#6d28d9' },
  rose: { background: '#fff1f2', border: '#fecdd3', text: '#be123c' },
}
const DARK_STATUS_PALETTES: Record<string, { background: string; border: string; text: string }> = {
  green: { background: '#064e3b', border: '#047857', text: '#a7f3d0' },
  slate: { background: '#334155', border: '#64748b', text: '#e2e8f0' },
  amber: { background: '#713f12', border: '#a16207', text: '#fde68a' },
  sky: { background: '#1e3a8a', border: '#1d4ed8', text: '#bfdbfe' },
  violet: { background: '#4c1d95', border: '#7c3aed', text: '#ddd6fe' },
  rose: { background: '#881337', border: '#be123c', text: '#fecdd3' },
}

function statusPalette(key?: string, dark = false) {
  const palettes = dark ? DARK_STATUS_PALETTES : STATUS_PALETTES
  return palettes[key || 'violet'] || palettes.violet
}

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const sessionId = Number(id)
  const router = useRouter()
  const db = useSQLiteContext()
  const { activeTahfizId, syncNow, syncing, user } = useApp()
  const { colors, commonStyles, isDark } = useTheme()
  const styles = createStyles(colors, commonStyles)
  const [session, setSession] = useState<(Omit<Session, 'is_confirmed'> & { is_confirmed: number }) | null>(null)
  const [students, setStudents] = useState<AttendanceRow[]>([])
  const [progress, setProgress] = useState<LocalProgressRow[]>([])
  const [statuses, setStatuses] = useState<string[]>([])
  const [statusColors, setStatusColors] = useState<Record<string, string>>({})
  const [thresholdLimit, setThresholdLimit] = useState(3)
  const [thresholdEnabled, setThresholdEnabled] = useState(true)
  const [thresholdStatus, setThresholdStatus] = useState('غياب بعذر')
  const [query, setQuery] = useState('')
  const [statusMenuStudent, setStatusMenuStudent] = useState<AttendanceRow | null>(null)
  const [thresholdAlert, setThresholdAlert] = useState<{ student: AttendanceRow; streak: number } | null>(null)
  const [progressEnabled, setProgressEnabled] = useState(false)
  const [sheikhSelectionEnabled, setSheikhSelectionEnabled] = useState(true)
  const [sheikhs, setSheikhs] = useState<SheikhRow[]>([])
  const [pendingStatuses, setPendingStatuses] = useState<Record<number, string>>({})
  const pendingStatusesRef = useRef<Record<number, string>>({})
  const savedStatusesRef = useRef<Record<number, string>>({})
  const [pendingSheikhs, setPendingSheikhs] = useState<Record<number, number>>({})
  const pendingSheikhsRef = useRef<Record<number, number>>({})
  const savedSheikhsRef = useRef<Record<number, number | null>>({})
  const [savingAttendance, setSavingAttendance] = useState(false)
  const [sheikhMenuStudent, setSheikhMenuStudent] = useState<AttendanceRow | null>(null)
  const [progressStudent, setProgressStudent] = useState<AttendanceRow | null>(null)
  const [notesStudent, setNotesStudent] = useState<AttendanceRow | null>(null)
  const [bulkProgressOpen, setBulkProgressOpen] = useState(false)
  const [adjacent, setAdjacent] = useState<{ previous: number | null; next: number | null }>({
    previous: null,
    next: null,
  })
  const admin = user?.role === 'admin' || user?.global_role === 'super_admin'

  const load = useCallback(async () => {
    if (!activeTahfizId || !sessionId) return
    const [sessionRow, attendanceRows, progressRows, tahfiz, sessionRows, sheikhRows] = await Promise.all([
      db.getFirstAsync<Omit<Session, 'is_confirmed'> & { is_confirmed: number }>('SELECT * FROM sessions WHERE id=? AND tahfiz_id=?', sessionId, activeTahfizId),
      sessionAttendance<AttendanceRow>(db, sessionId),
      db.getAllAsync<LocalProgressRow>('SELECT * FROM quran_progress WHERE session_id=? ORDER BY student_id,category', sessionId),
      db.getFirstAsync<{ attendance_statuses: string; attendance_status_colors: string; excused_absence_streak_limit: number; attendance_streak_alert_enabled: number; attendance_sheikh_selection_enabled: number; restrict_sheikh_student_access: number; attendance_streak_status: string; progress_tracking_enabled: number }>(
        'SELECT attendance_statuses,attendance_status_colors,excused_absence_streak_limit,attendance_streak_alert_enabled,attendance_sheikh_selection_enabled,restrict_sheikh_student_access,attendance_streak_status,progress_tracking_enabled FROM tahfiz WHERE id=?',
        activeTahfizId,
      ),
      db.getAllAsync<{ id: number }>(
        'SELECT id FROM sessions WHERE tahfiz_id=? ORDER BY date,id',
        activeTahfizId,
      ),
      db.getAllAsync<SheikhRow>('SELECT id,name FROM sheikhs WHERE tahfiz_id=? ORDER BY name', activeTahfizId),
    ])
    setSession(sessionRow)
    savedStatusesRef.current = Object.fromEntries(attendanceRows.map((row) => [row.id, row.status]))
    savedSheikhsRef.current = Object.fromEntries(attendanceRows.map((row) => [row.id, row.sheikh_id]))
    setStudents(attendanceRows.map((row) => ({
      ...row,
      status: pendingStatusesRef.current[row.id] ?? row.status,
      sheikh_id: pendingSheikhsRef.current[row.id] ?? row.sheikh_id,
    })))
    setProgress(progressRows)
    setStatuses(tahfiz ? JSON.parse(tahfiz.attendance_statuses) : ['حاضر', 'غياب', 'غياب بعذر', 'لا ينطبق'])
    setStatusColors(tahfiz ? JSON.parse(tahfiz.attendance_status_colors) : {
      'حاضر': 'green', 'غياب': 'slate', 'غياب بعذر': 'amber', 'لا ينطبق': 'sky',
    })
    setThresholdLimit(tahfiz?.excused_absence_streak_limit ?? 3)
    setThresholdEnabled(Boolean(tahfiz?.attendance_streak_alert_enabled))
    setThresholdStatus(tahfiz?.attendance_streak_status || 'غياب بعذر')
    setProgressEnabled(Boolean(tahfiz?.progress_tracking_enabled))
    setSheikhSelectionEnabled(tahfiz?.attendance_sheikh_selection_enabled !== 0)
    setSheikhs(sheikhRows)
    const currentIndex = sessionRows.findIndex((row) => row.id === sessionId)
    setAdjacent({
      previous: currentIndex > 0 ? sessionRows[currentIndex - 1].id : null,
      next: currentIndex >= 0 && currentIndex < sessionRows.length - 1 ? sessionRows[currentIndex + 1].id : null,
    })
  }, [db, activeTahfizId, sessionId])
  useFocusEffect(useCallback(() => { void load() }, [load]))

  const changeStatus = (student: AttendanceRow, status: string) => {
    if (!activeTahfizId || session?.is_confirmed) return
    setStudents((current) => current.map((item) => item.id === student.id ? { ...item, status } : item))
    setPendingStatuses((current) => {
      const next = { ...current }
      if (savedStatusesRef.current[student.id] === status) delete next[student.id]
      else next[student.id] = status
      pendingStatusesRef.current = next
      return next
    })
  }

  const changeSheikh = (student: AttendanceRow, sheikhId: number) => {
    if (!activeTahfizId || session?.is_confirmed) return
    setStudents((current) => current.map((item) => item.id === student.id ? { ...item, sheikh_id: sheikhId } : item))
    setPendingSheikhs((current) => {
      const next = { ...current }
      if (savedSheikhsRef.current[student.id] === sheikhId) delete next[student.id]
      else next[student.id] = sheikhId
      pendingSheikhsRef.current = next
      return next
    })
  }

  const saveAttendance = async () => {
    if (!activeTahfizId || session?.is_confirmed || savingAttendance) return
    const statusChanges = Object.entries(pendingStatusesRef.current)
    const changedStudentIds = [...new Set([
      ...Object.keys(pendingStatusesRef.current),
      ...Object.keys(pendingSheikhsRef.current),
    ])].map(Number)
    if (!changedStudentIds.length) return
    setSavingAttendance(true)
    try {
      const deviceId = await getDeviceId()
      const previousStreaks = new Map<number, number>()
      await Promise.all(changedStudentIds.map(async (id) => {
        previousStreaks.set(id, await attendanceStatusStreak(db, activeTahfizId, id))
      }))
      for (const studentId of changedStudentIds) {
        const student = students.find((item) => item.id === studentId)
        if (!student) continue
        await queueAttendance(
          db, deviceId, activeTahfizId, sessionId, student.id,
          pendingStatusesRef.current[student.id] ?? student.status,
          student.notes,
          pendingSheikhsRef.current[student.id] ?? student.sheikh_id,
        )
      }
      pendingStatusesRef.current = {}
      pendingSheikhsRef.current = {}
      setPendingStatuses({})
      setPendingSheikhs({})
      await load()
      for (const [studentId] of statusChanges) {
        const student = students.find((item) => item.id === Number(studentId))
        if (!student) continue
        const currentStreak = await attendanceStatusStreak(db, activeTahfizId, student.id)
        if (thresholdEnabled && (previousStreaks.get(student.id) ?? 0) <= thresholdLimit && currentStreak > thresholdLimit) {
          setThresholdAlert({ student, streak: currentStreak })
          setTimeout(() => setThresholdAlert(current => current?.student.id === student.id && current.streak === currentStreak ? null : current), 8000)
        }
      }
      try {
        await syncNow(false)
        await load()
        Alert.alert('تم الحفظ', 'حُفظت تغييرات الحضور وتمت مزامنتها.')
      } catch {
        Alert.alert('تم الحفظ على الجهاز', 'سيتم إرسال التغييرات عند توفر الاتصال.')
      }
    } catch (error) {
      Alert.alert('تعذر الحفظ', error instanceof Error ? error.message : 'حاول مرة أخرى')
    } finally {
      setSavingAttendance(false)
    }
  }

  const pendingStatusCount = new Set([...Object.keys(pendingStatuses), ...Object.keys(pendingSheikhs)]).size
  const confirm = async () => {
    if (!activeTahfizId || !session || !admin) return
    Alert.alert(
      'تأكيد الحلقة',
      'ستتم مزامنة كل التعديلات والتحقق منها قبل إغلاق الحلقة.',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'مزامنة وتأكيد',
          onPress: async () => {
            try {
              const summary = await syncNow(false)
              if (summary?.conflicts || summary?.rejected) {
                Alert.alert('تحتاج مراجعة', 'راجع تعارضات المزامنة قبل تأكيد الحلقة.')
                return
              }
              if (await pendingCount(db, activeTahfizId)) {
                Alert.alert('لم تكتمل المزامنة', 'ما زالت هناك تعديلات بانتظار الإرسال.')
                return
              }
              await api.confirmSession(activeTahfizId, session.id, session.version)
              await syncNow(false)
              await load()
              Alert.alert('تم', 'تم تأكيد الحلقة بنجاح.')
            } catch (error) {
              Alert.alert('تعذر التأكيد', error instanceof Error ? error.message : 'تحقق من الاتصال')
            }
          },
        },
      ],
    )
  }

  const present = useMemo(() => students.filter((item) => item.status === 'حاضر').length, [students])
  const filteredStudents = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ar')
    return students
      .filter(item => !normalized
        || item.name.toLocaleLowerCase('ar').includes(normalized)
        || item.phone?.toLocaleLowerCase('ar').includes(normalized))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar', { sensitivity: 'base' }))
  }, [students, query])
  if (!session) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>

  return (
    <View style={commonStyles.screen}>
      <FlatList
        data={filteredStudents}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[commonStyles.content, { paddingBottom: session.is_confirmed ? 20 : 118 }]}
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 10 }}>
          <View style={[styles.summary, { marginBottom: 0 }]}>
            <TouchableOpacity
              disabled={!adjacent.previous}
              style={[styles.navButton, !adjacent.previous && styles.navDisabled]}
              onPress={() => adjacent.previous && router.replace({
                pathname: '/session/[id]',
                params: { id: String(adjacent.previous) },
              })}
            >
              <Text style={styles.navButtonText}>‹</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.date}>{new Date(`${session.date}T12:00:00`).toLocaleDateString('ar-EG', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
              })}</Text>
              <Text style={commonStyles.subtitle}>{present} حاضر من {students.length}</Text>
            </View>
            <TouchableOpacity
              disabled={!adjacent.next}
              style={[styles.navButton, !adjacent.next && styles.navDisabled]}
              onPress={() => adjacent.next && router.replace({
                pathname: '/session/[id]',
                params: { id: String(adjacent.next) },
              })}
            >
              <Text style={styles.navButtonText}>›</Text>
            </TouchableOpacity>
            <Text style={[styles.state, { color: session.is_confirmed ? colors.muted : colors.success }]}>
              {session.is_confirmed ? 'مؤكدة' : pendingStatusCount ? 'تغييرات غير محفوظة' : 'محفوظة محلياً'}
            </Text>
          </View>
          {progressEnabled && present > 0 && !session.is_confirmed ? (
            <TouchableOpacity style={styles.bulkProgressButton} onPress={() => setBulkProgressOpen(true)}>
              <Text style={styles.bulkProgressButtonText}>تطبيق متابعة قرآن موحدة على الحاضرين ({present})</Text>
            </TouchableOpacity>
          ) : null}
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="ابحث باسم الطالب أو الهاتف"
            placeholderTextColor={colors.muted}
            style={[commonStyles.input, styles.searchInput]}
          />
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.student}>
            {(() => {
              const studentProgress = progress.filter((entry) => entry.student_id === item.id)
              return (
                <>
            <View style={styles.studentHeader}>
              <TouchableOpacity
                style={{ flex: 1 }}
                onPress={() => router.push({ pathname: '/student/[id]', params: { id: String(item.id), name: item.name } })}
              >
                <Text style={styles.studentName}>{item.name}</Text>
                {item.dirty ? <Text style={styles.pending}>بانتظار المزامنة</Text> : null}
              </TouchableOpacity>
              {pendingStatuses[item.id] || pendingSheikhs[item.id] ? <Text style={styles.unsavedStudent}>غير محفوظ</Text> : null}
            </View>
            {sheikhSelectionEnabled && sheikhs.length ? (
              <TouchableOpacity
                disabled={Boolean(session.is_confirmed)}
                style={styles.sheikhButton}
                onPress={() => setSheikhMenuStudent(item)}
              >
                <Text style={styles.sheikhButtonText}>
                  الشيخ: {sheikhs.find((sheikh) => sheikh.id === item.sheikh_id)?.name || 'غير محدد'}  ⌄
                </Text>
              </TouchableOpacity>
            ) : null}
            <View style={[styles.splitStatus, { borderColor: statusPalette(statusColors[item.status], isDark).border, backgroundColor: statusPalette(statusColors[item.status], isDark).background }]}>
              <TouchableOpacity
                disabled={Boolean(session.is_confirmed)}
                onPress={() => {
                  const index = statuses.indexOf(item.status)
                  const next = statuses[(index + 1 + statuses.length) % statuses.length]
                  changeStatus(item, next)
                }}
                style={styles.cycleStatus}
              >
                <Text style={[styles.cycleStatusText, { color: statusPalette(statusColors[item.status], isDark).text }]}>{item.status}</Text>
              </TouchableOpacity>
              <TouchableOpacity disabled={Boolean(session.is_confirmed)} onPress={() => setStatusMenuStudent(item)} style={[styles.statusArrow, { borderRightColor: statusPalette(statusColors[item.status], isDark).border }]}>
                <Text style={[styles.statusArrowText, { color: statusPalette(statusColors[item.status], isDark).text }]}>⌄</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              disabled={Boolean(session.is_confirmed)}
              style={styles.notesButton}
              onPress={() => setNotesStudent(item)}
            >
              <Text style={styles.notesButtonText}>
                {item.notes ? `ملاحظة الحضور: ${item.notes}` : 'إضافة ملاحظة للحضور'}
              </Text>
            </TouchableOpacity>
            {studentProgress.length ? (
              <View style={styles.progressSummary}>
                {studentProgress.map((entry) => (
                  <Text key={entry.id} style={styles.progressSummaryText}>
                    {progressCategoryLabel(entry.category)} · {progressRangeLabel(entry)}
                    {entry.dirty ? ' · بانتظار المزامنة' : ''}
                  </Text>
                ))}
              </View>
            ) : null}
            {progressEnabled && item.status === 'حاضر' && !session.is_confirmed ? (
              <TouchableOpacity style={styles.progressButton} onPress={() => setProgressStudent(item)}>
                <Text style={styles.progressButtonText}>
                  {studentProgress.length ? `تعديل تقدم القرآن (${studentProgress.length})` : 'تسجيل تقدم القرآن'}
                </Text>
              </TouchableOpacity>
            ) : null}
                </>
              )
            })()}
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListFooterComponent={
          !session.is_confirmed && admin ? (
            <TouchableOpacity disabled={syncing} style={[commonStyles.button, { marginTop: 10 }]} onPress={() => void confirm()}>
              {syncing ? <ActivityIndicator color="#fff" /> : <Text style={commonStyles.buttonText}>مزامنة وتأكيد الحلقة</Text>}
            </TouchableOpacity>
          ) : <View style={{ height: 20 }} />
        }
      />
      <ProgressModal
        student={progressStudent}
        entries={progress.filter((entry) => entry.student_id === progressStudent?.id)}
        sessionId={sessionId}
        tahfizId={activeTahfizId}
        onClose={() => setProgressStudent(null)}
        onSaved={load}
      />
      <Modal visible={Boolean(statusMenuStudent)} transparent animationType="fade" onRequestClose={() => setStatusMenuStudent(null)}>
        <TouchableOpacity activeOpacity={1} style={styles.menuBackdrop} onPress={() => setStatusMenuStudent(null)}>
          <View style={[commonStyles.card, styles.statusMenu]}>
            <Text style={commonStyles.title}>حالة {statusMenuStudent?.name}</Text>
            {statuses.map(status => {
              const palette = statusPalette(statusColors[status], isDark)
              return (
                <TouchableOpacity
                  key={status}
                  style={[styles.statusMenuOption, { borderColor: palette.border, backgroundColor: palette.background }]}
                  onPress={() => {
                    const student = statusMenuStudent
                    setStatusMenuStudent(null)
                    if (student && student.status !== status) changeStatus(student, status)
                  }}
                >
                  <Text style={[styles.statusMenuOptionText, { color: palette.text }]}>{statusMenuStudent?.status === status ? '✓  ' : ''}{status}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </TouchableOpacity>
      </Modal>
      <Modal visible={Boolean(sheikhMenuStudent)} transparent animationType="fade" onRequestClose={() => setSheikhMenuStudent(null)}>
        <TouchableOpacity activeOpacity={1} style={styles.menuBackdrop} onPress={() => setSheikhMenuStudent(null)}>
          <View style={[commonStyles.card, styles.statusMenu]}>
            <Text style={commonStyles.title}>شيخ {sheikhMenuStudent?.name}</Text>
            {sheikhs.map((sheikh) => (
              <TouchableOpacity
                key={sheikh.id}
                style={styles.sheikhMenuOption}
                onPress={() => {
                  const student = sheikhMenuStudent
                  setSheikhMenuStudent(null)
                  if (student && student.sheikh_id !== sheikh.id) changeSheikh(student, sheikh.id)
                }}
              >
                <Text style={styles.sheikhMenuOptionText}>{sheikhMenuStudent?.sheikh_id === sheikh.id ? '✓  ' : ''}{sheikh.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
      {thresholdAlert ? (
        <TouchableOpacity
          style={[commonStyles.card, styles.thresholdAlert]}
          onPress={() => router.push({ pathname: '/student/[id]', params: { id: String(thresholdAlert.student.id), name: thresholdAlert.student.name } })}
        >
          <Text style={styles.thresholdAlertTitle}>{thresholdAlert.student.name}</Text>
          <Text style={styles.thresholdAlertText}>تجاوز حد «{thresholdStatus}» المتتالي: {thresholdAlert.streak} مرات (الحد {thresholdLimit}). اضغط لفتح الملف.</Text>
        </TouchableOpacity>
      ) : null}
      <AttendanceNotesModal
        student={notesStudent}
        sessionId={sessionId}
        tahfizId={activeTahfizId}
        onClose={() => setNotesStudent(null)}
        onSaved={load}
      />
      <BulkProgressModal
        visible={bulkProgressOpen}
        students={students.filter((item) => item.status === 'حاضر')}
        entries={progress}
        sessionId={sessionId}
        tahfizId={activeTahfizId}
        onClose={() => setBulkProgressOpen(false)}
        onSaved={load}
      />
      {!session.is_confirmed ? (
        <View style={styles.saveBar}>
          <Text style={[styles.saveHint, pendingStatusCount ? styles.saveHintActive : null]}>
            {pendingStatusCount
              ? `لديك ${pendingStatusCount} تغييرات حضور غير محفوظة`
              : 'غيّر حالات الحضور ثم اضغط حفظ'}
          </Text>
          <TouchableOpacity
            disabled={!pendingStatusCount || savingAttendance}
            style={[commonStyles.button, styles.saveButton, (!pendingStatusCount || savingAttendance) && styles.saveButtonDisabled]}
            onPress={() => void saveAttendance()}
          >
            {savingAttendance
              ? <ActivityIndicator color="#fff" />
              : <Text style={commonStyles.buttonText}>{pendingStatusCount ? `حفظ تغييرات الحضور (${pendingStatusCount})` : 'لا توجد تغييرات للحفظ'}</Text>}
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  )
}

function ProgressModal({
  student,
  entries,
  sessionId,
  tahfizId,
  onClose,
  onSaved,
}: {
  student: AttendanceRow | null
  entries: LocalProgressRow[]
  sessionId: number
  tahfizId: number | null
  onClose(): void
  onSaved(): Promise<void>
}) {
  const db = useSQLiteContext()
  const { colors, commonStyles } = useTheme()
  const styles = createStyles(colors, commonStyles)
  const [fromPage, setFromPage] = useState('')
  const [toPage, setToPage] = useState('')
  const [fromSurah, setFromSurah] = useState('')
  const [fromAyah, setFromAyah] = useState('')
  const [toSurah, setToSurah] = useState('')
  const [toAyah, setToAyah] = useState('')
  const [rangeType, setRangeType] = useState<'page' | 'surah_ayah'>('page')
  const [category, setCategory] = useState<'new_memorization' | 'recent_revision' | 'old_revision' | 'test'>('new_memorization')
  const [quality, setQuality] = useState('4')
  const [mistakes, setMistakes] = useState('0')
  const [notes, setNotes] = useState('')
  const [nextAssignment, setNextAssignment] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!student) return
    setCategory(entries[0]?.category ?? 'new_memorization')
  }, [student?.id])

  useEffect(() => {
    if (!student) return
    const existing = entries.find((entry) => entry.category === category)
    setRangeType(existing?.range_type ?? 'page')
    setFromPage(existing?.from_page === null || existing?.from_page === undefined ? '' : String(existing.from_page))
    setToPage(existing?.to_page === null || existing?.to_page === undefined ? '' : String(existing.to_page))
    setFromSurah(existing?.from_surah === null || existing?.from_surah === undefined ? '' : String(existing.from_surah))
    setFromAyah(existing?.from_ayah === null || existing?.from_ayah === undefined ? '' : String(existing.from_ayah))
    setToSurah(existing?.to_surah === null || existing?.to_surah === undefined ? '' : String(existing.to_surah))
    setToAyah(existing?.to_ayah === null || existing?.to_ayah === undefined ? '' : String(existing.to_ayah))
    setQuality(String(existing?.quality_score ?? 4))
    setMistakes(String(existing?.mistakes ?? 0))
    setNotes(existing?.notes ?? '')
    setNextAssignment(existing?.next_assignment ?? '')
  }, [student?.id, category, entries])

  const save = async () => {
    if (!student || !tahfizId) return
    const start = Number(fromPage)
    const end = Number(toPage)
    const surahStart = Number(fromSurah)
    const ayahStart = Number(fromAyah)
    const surahEnd = Number(toSurah)
    const ayahEnd = Number(toAyah)
    if (rangeType === 'page' && (start < 1 || end < start || end > 604)) {
      Alert.alert('تحقق من الصفحات', 'أدخل نطاقاً صحيحاً بين ١ و٦٠٤.')
      return
    }
    if (rangeType === 'surah_ayah' && (
      surahStart < 1 || surahStart > 114 || surahEnd < surahStart || surahEnd > 114
      || ayahStart < 1 || ayahEnd < 1
    )) {
      Alert.alert('تحقق من السورة والآية', 'أدخل بداية ونهاية صحيحتين للنطاق.')
      return
    }
    setSaving(true)
    try {
      await queueProgress(db, await getDeviceId(), tahfizId, {
        session_id: sessionId,
        student_id: student.id,
        sheikh_id: student.sheikh_id,
        category,
        range_type: rangeType,
        from_page: rangeType === 'page' ? start : null,
        to_page: rangeType === 'page' ? end : null,
        from_surah: rangeType === 'surah_ayah' ? surahStart : null,
        from_ayah: rangeType === 'surah_ayah' ? ayahStart : null,
        to_surah: rangeType === 'surah_ayah' ? surahEnd : null,
        to_ayah: rangeType === 'surah_ayah' ? ayahEnd : null,
        quality_score: Math.max(1, Math.min(5, Number(quality))),
        mistakes: Math.max(0, Number(mistakes)),
        notes: notes.trim() || null,
        next_assignment: nextAssignment.trim() || null,
      })
      await onSaved()
      onClose()
    } catch (error) {
      Alert.alert('تعذر الحفظ', error instanceof Error ? error.message : 'حاول مرة أخرى')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal visible={Boolean(student)} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.content} keyboardShouldPersistTaps="handled">
        <Text style={commonStyles.title}>تقدم {student?.name}</Text>
        <Text style={commonStyles.subtitle}>اختر النوع والنطاق ثم سجّل التقييم.</Text>
        <View style={styles.statuses}>
          {([
            ['new_memorization', 'حفظ جديد'],
            ['recent_revision', 'مراجعة حديثة'],
            ['old_revision', 'مراجعة قديمة'],
            ['test', 'اختبار'],
          ] as const).map(([value, label]) => (
            <TouchableOpacity key={value} onPress={() => setCategory(value)} style={[styles.status, category === value && styles.statusSelected]}>
              <Text style={[styles.statusText, category === value && styles.statusTextSelected]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.formRow}>
          <TouchableOpacity onPress={() => setRangeType('page')} style={[styles.rangeChoice, rangeType === 'page' && styles.statusSelected]}>
            <Text style={[styles.statusText, rangeType === 'page' && styles.statusTextSelected]}>بالصفحات</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setRangeType('surah_ayah')} style={[styles.rangeChoice, rangeType === 'surah_ayah' && styles.statusSelected]}>
            <Text style={[styles.statusText, rangeType === 'surah_ayah' && styles.statusTextSelected]}>بالسورة والآية</Text>
          </TouchableOpacity>
        </View>
        {rangeType === 'page' ? (
          <View style={styles.formRow}>
            <TextInput value={fromPage} onChangeText={setFromPage} keyboardType="number-pad" placeholder="من صفحة" style={[commonStyles.input, styles.half]} />
            <TextInput value={toPage} onChangeText={setToPage} keyboardType="number-pad" placeholder="إلى صفحة" style={[commonStyles.input, styles.half]} />
          </View>
        ) : (
          <>
            <View style={styles.formRow}>
              <TextInput value={fromSurah} onChangeText={setFromSurah} keyboardType="number-pad" placeholder="من سورة ١-١١٤" style={[commonStyles.input, styles.half]} />
              <TextInput value={fromAyah} onChangeText={setFromAyah} keyboardType="number-pad" placeholder="من آية" style={[commonStyles.input, styles.half]} />
            </View>
            <View style={styles.formRow}>
              <TextInput value={toSurah} onChangeText={setToSurah} keyboardType="number-pad" placeholder="إلى سورة" style={[commonStyles.input, styles.half]} />
              <TextInput value={toAyah} onChangeText={setToAyah} keyboardType="number-pad" placeholder="إلى آية" style={[commonStyles.input, styles.half]} />
            </View>
          </>
        )}
        <View style={styles.formRow}>
          <TextInput value={quality} onChangeText={setQuality} keyboardType="number-pad" placeholder="التقييم ١-٥" style={[commonStyles.input, styles.half]} />
          <TextInput value={mistakes} onChangeText={setMistakes} keyboardType="number-pad" placeholder="الأخطاء" style={[commonStyles.input, styles.half]} />
        </View>
        <TextInput value={notes} onChangeText={setNotes} multiline placeholder="ملاحظات اختيارية" style={[commonStyles.input, { minHeight: 100, textAlignVertical: 'top', paddingTop: 14 }]} />
        <TextInput value={nextAssignment} onChangeText={setNextAssignment} multiline placeholder="التكليف القادم (اختياري)" style={[commonStyles.input, { minHeight: 82, textAlignVertical: 'top', paddingTop: 14 }]} />
        <TouchableOpacity style={commonStyles.button} disabled={saving} onPress={() => void save()}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={commonStyles.buttonText}>حفظ على الجهاز</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancel} onPress={onClose}><Text style={{ color: colors.muted, fontWeight: '700' }}>إلغاء</Text></TouchableOpacity>
      </ScrollView>
    </Modal>
  )
}

function AttendanceNotesModal({
  student,
  sessionId,
  tahfizId,
  onClose,
  onSaved,
}: {
  student: AttendanceRow | null
  sessionId: number
  tahfizId: number | null
  onClose(): void
  onSaved(): Promise<void>
}) {
  const db = useSQLiteContext()
  const { colors, commonStyles } = useTheme()
  const styles = createStyles(colors, commonStyles)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setNotes(student?.notes ?? '')
  }, [student?.id, student?.notes])

  const save = async () => {
    if (!student || !tahfizId) return
    setSaving(true)
    try {
      await queueAttendance(
        db,
        await getDeviceId(),
        tahfizId,
        sessionId,
        student.id,
        student.status,
        notes.trim() || null,
        student.sheikh_id,
      )
      await onSaved()
      onClose()
    } catch (error) {
      Alert.alert('تعذر حفظ الملاحظة', error instanceof Error ? error.message : 'حاول مرة أخرى')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal visible={Boolean(student)} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[commonStyles.screen, commonStyles.content]}>
        <Text style={commonStyles.title}>ملاحظة حضور {student?.name}</Text>
        <Text style={commonStyles.subtitle}>تُحفظ الملاحظة على الجهاز وتُرسل في المزامنة القادمة.</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          multiline
          autoFocus
          placeholder="ملاحظة اختيارية"
          style={[commonStyles.input, styles.notesInput]}
          textAlignVertical="top"
        />
        <TouchableOpacity disabled={saving} style={commonStyles.button} onPress={() => void save()}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={commonStyles.buttonText}>حفظ على الجهاز</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancel} onPress={onClose}>
          <Text style={{ color: colors.muted, fontWeight: '700' }}>إلغاء</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  )
}

function BulkProgressModal({
  visible,
  students,
  entries,
  sessionId,
  tahfizId,
  onClose,
  onSaved,
}: {
  visible: boolean
  students: AttendanceRow[]
  entries: LocalProgressRow[]
  sessionId: number
  tahfizId: number | null
  onClose(): void
  onSaved(): Promise<void>
}) {
  const db = useSQLiteContext()
  const { colors, commonStyles } = useTheme()
  const styles = createStyles(colors, commonStyles)
  const [category, setCategory] = useState<LocalProgressRow['category']>('new_memorization')
  const [rangeType, setRangeType] = useState<LocalProgressRow['range_type']>('page')
  const [fromPage, setFromPage] = useState('')
  const [toPage, setToPage] = useState('')
  const [fromSurah, setFromSurah] = useState('')
  const [fromAyah, setFromAyah] = useState('')
  const [toSurah, setToSurah] = useState('')
  const [toAyah, setToAyah] = useState('')
  const [quality, setQuality] = useState('3')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!tahfizId || students.length === 0) return
    const pageStart = Number(fromPage)
    const pageEnd = Number(toPage)
    const surahStart = Number(fromSurah)
    const ayahStart = Number(fromAyah)
    const surahEnd = Number(toSurah)
    const ayahEnd = Number(toAyah)
    if (rangeType === 'page' && (pageStart < 1 || pageEnd < pageStart || pageEnd > 604)) {
      Alert.alert('تحقق من الصفحات', 'أدخل نطاقاً صحيحاً بين ١ و٦٠٤.')
      return
    }
    if (rangeType === 'surah_ayah' && (
      surahStart < 1 || surahStart > 114 || surahEnd < surahStart || surahEnd > 114
      || ayahStart < 1 || ayahEnd < 1
    )) {
      Alert.alert('تحقق من السورة والآية', 'أدخل بداية ونهاية صحيحتين للنطاق.')
      return
    }
    setSaving(true)
    try {
      const deviceId = await getDeviceId()
      for (const student of students) {
        const existing = entries.find((entry) => entry.student_id === student.id && entry.category === category)
        await queueProgress(db, deviceId, tahfizId, {
          session_id: sessionId,
          student_id: student.id,
          sheikh_id: student.sheikh_id,
          category,
          range_type: rangeType,
          from_page: rangeType === 'page' ? pageStart : null,
          to_page: rangeType === 'page' ? pageEnd : null,
          from_surah: rangeType === 'surah_ayah' ? surahStart : null,
          from_ayah: rangeType === 'surah_ayah' ? ayahStart : null,
          to_surah: rangeType === 'surah_ayah' ? surahEnd : null,
          to_ayah: rangeType === 'surah_ayah' ? ayahEnd : null,
          quality_score: Math.max(1, Math.min(5, Number(quality))),
          mistakes: existing?.mistakes ?? 0,
          notes: existing?.notes ?? null,
          next_assignment: existing?.next_assignment ?? null,
        })
      }
      await onSaved()
      onClose()
      Alert.alert('تم الحفظ', `حُفظت المتابعة محلياً لـ ${students.length} طلاب وستُرسل في المزامنة القادمة.`)
    } catch (error) {
      Alert.alert('تعذر تطبيق المتابعة', error instanceof Error ? error.message : 'حاول مرة أخرى')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.content} keyboardShouldPersistTaps="handled">
        <Text style={commonStyles.title}>متابعة موحدة للحاضرين</Text>
        <Text style={commonStyles.subtitle}>سيُطبّق النطاق على {students.length} طلاب، ويمكن تعديل الاستثناءات بعد ذلك.</Text>
        <View style={styles.statuses}>
          {([
            ['new_memorization', 'حفظ جديد'],
            ['recent_revision', 'مراجعة حديثة'],
            ['old_revision', 'مراجعة قديمة'],
            ['test', 'اختبار'],
          ] as const).map(([value, label]) => (
            <TouchableOpacity key={value} onPress={() => setCategory(value)} style={[styles.status, category === value && styles.statusSelected]}>
              <Text style={[styles.statusText, category === value && styles.statusTextSelected]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.formRow}>
          <TouchableOpacity onPress={() => setRangeType('page')} style={[styles.rangeChoice, rangeType === 'page' && styles.statusSelected]}>
            <Text style={[styles.statusText, rangeType === 'page' && styles.statusTextSelected]}>بالصفحات</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setRangeType('surah_ayah')} style={[styles.rangeChoice, rangeType === 'surah_ayah' && styles.statusSelected]}>
            <Text style={[styles.statusText, rangeType === 'surah_ayah' && styles.statusTextSelected]}>بالسورة والآية</Text>
          </TouchableOpacity>
        </View>
        {rangeType === 'page' ? (
          <View style={styles.formRow}>
            <TextInput value={fromPage} onChangeText={setFromPage} keyboardType="number-pad" placeholder="من صفحة" style={[commonStyles.input, styles.half]} />
            <TextInput value={toPage} onChangeText={setToPage} keyboardType="number-pad" placeholder="إلى صفحة" style={[commonStyles.input, styles.half]} />
          </View>
        ) : (
          <>
            <View style={styles.formRow}>
              <TextInput value={fromSurah} onChangeText={setFromSurah} keyboardType="number-pad" placeholder="من سورة" style={[commonStyles.input, styles.half]} />
              <TextInput value={fromAyah} onChangeText={setFromAyah} keyboardType="number-pad" placeholder="من آية" style={[commonStyles.input, styles.half]} />
            </View>
            <View style={styles.formRow}>
              <TextInput value={toSurah} onChangeText={setToSurah} keyboardType="number-pad" placeholder="إلى سورة" style={[commonStyles.input, styles.half]} />
              <TextInput value={toAyah} onChangeText={setToAyah} keyboardType="number-pad" placeholder="إلى آية" style={[commonStyles.input, styles.half]} />
            </View>
          </>
        )}
        <TextInput value={quality} onChangeText={setQuality} keyboardType="number-pad" placeholder="التقييم ١-٥" style={commonStyles.input} />
        <TouchableOpacity disabled={saving} style={commonStyles.button} onPress={() => void save()}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={commonStyles.buttonText}>حفظ للجميع على الجهاز</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancel} onPress={onClose}><Text style={commonStyles.subtitle}>إلغاء</Text></TouchableOpacity>
      </ScrollView>
    </Modal>
  )
}

function progressCategoryLabel(category: LocalProgressRow['category']) {
  return {
    new_memorization: 'حفظ جديد',
    recent_revision: 'مراجعة حديثة',
    old_revision: 'مراجعة قديمة',
    test: 'اختبار',
  }[category]
}

function progressRangeLabel(entry: LocalProgressRow) {
  if (entry.range_type === 'page') return `صفحة ${entry.from_page ?? '—'}–${entry.to_page ?? '—'}`
  return `س ${entry.from_surah ?? '—'} آ ${entry.from_ayah ?? '—'} ← س ${entry.to_surah ?? '—'} آ ${entry.to_ayah ?? '—'}`
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors'], commonStyles: ReturnType<typeof useTheme>['commonStyles']) => StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  summary: { ...commonStyles.card, flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 10 },
  navButton: { width: 36, height: 42, borderRadius: 12, backgroundColor: colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  navDisabled: { opacity: 0.3 },
  navButtonText: { color: colors.primaryDark, fontSize: 28, fontWeight: '900', lineHeight: 30 },
  date: { color: colors.text, fontSize: 17, fontWeight: '900', textAlign: 'right' },
  state: { fontWeight: '800', fontSize: 12 },
  student: { ...commonStyles.card, gap: 11 },
  studentHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  studentName: { color: colors.text, fontWeight: '900', fontSize: 17, textAlign: 'right' },
  searchInput: { marginTop: 2 },
  pending: { color: colors.warning, fontSize: 11, textAlign: 'right' },
  unsavedStudent: { color: colors.warning, fontSize: 11, fontWeight: '900' },
  statuses: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 7 },
  status: { borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 8 },
  statusSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  statusText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  statusTextSelected: { color: '#fff' },
  splitStatus: { minHeight: 50, borderWidth: 1, borderRadius: 13, flexDirection: 'row-reverse', overflow: 'hidden' },
  cycleStatus: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  cycleStatusText: { flexShrink: 1, fontSize: 13, fontWeight: '900', lineHeight: 19, textAlign: 'center' },
  statusArrow: { width: 46, borderRightWidth: 1, alignItems: 'center', justifyContent: 'center' },
  statusArrowText: { fontSize: 20, fontWeight: '900', lineHeight: 22 },
  sheikhButton: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center', padding: 10 },
  sheikhButtonText: { color: colors.text, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  sheikhMenuOption: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 13, alignItems: 'center', justifyContent: 'center', padding: 10 },
  sheikhMenuOptionText: { color: colors.text, fontWeight: '900', fontSize: 14 },
  menuBackdrop: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(2, 6, 23, 0.55)' },
  statusMenu: { gap: 9, maxWidth: 440, width: '100%', alignSelf: 'center' },
  statusMenuOption: { minHeight: 48, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center', padding: 10 },
  statusMenuOptionText: { fontWeight: '900', fontSize: 14 },
  thresholdAlert: { position: 'absolute', top: 12, left: 12, right: 12, zIndex: 50, borderColor: '#fbbf24', backgroundColor: '#fffbeb' },
  thresholdAlertTitle: { color: '#92400e', textAlign: 'right', fontWeight: '900', fontSize: 15 },
  thresholdAlertText: { color: '#a16207', textAlign: 'right', fontSize: 12, lineHeight: 20, marginTop: 3 },
  notesButton: { backgroundColor: colors.surfaceMuted, borderRadius: 12, padding: 10 },
  notesButtonText: { color: colors.text, textAlign: 'right', fontWeight: '700', fontSize: 12 },
  progressSummary: { backgroundColor: colors.background, borderRadius: 12, padding: 10, gap: 5 },
  progressSummaryText: { color: colors.muted, textAlign: 'right', fontSize: 11, fontWeight: '700' },
  progressButton: { backgroundColor: colors.primarySurface, borderRadius: 12, padding: 11, alignItems: 'center' },
  progressButtonText: { color: colors.primaryDark, fontWeight: '800' },
  bulkProgressButton: { minHeight: 48, backgroundColor: colors.primarySurface, borderWidth: 1, borderColor: colors.primary, borderRadius: 13, alignItems: 'center', justifyContent: 'center', padding: 10 },
  bulkProgressButtonText: { color: colors.primaryDark, fontWeight: '900', textAlign: 'center' },
  saveBar: {
    position: 'absolute', left: 12, right: 12, bottom: 10, padding: 10, gap: 7,
    borderWidth: 1, borderColor: colors.primary, borderRadius: 16,
    backgroundColor: colors.surface,
  },
  saveHint: { color: colors.muted, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  saveHintActive: { color: colors.warning },
  saveButton: { minHeight: 50 },
  saveButtonDisabled: { opacity: 0.5 },
  formRow: { flexDirection: 'row-reverse', gap: 10 },
  half: { flex: 1 },
  rangeChoice: { flex: 1, minHeight: 45, borderWidth: 1, borderColor: colors.border, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  notesInput: { minHeight: 140, paddingTop: 14 },
})

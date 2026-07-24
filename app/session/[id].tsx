import { useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import React, { useCallback, useMemo, useState } from 'react'
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
} from '../../src/db/database'
import { api } from '../../src/lib/api'
import { getDeviceId } from '../../src/lib/session-store'
import { colors, commonStyles } from '../../src/theme'
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

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const sessionId = Number(id)
  const db = useSQLiteContext()
  const { activeTahfizId, syncNow, syncing } = useApp()
  const [session, setSession] = useState<(Omit<Session, 'is_confirmed'> & { is_confirmed: number }) | null>(null)
  const [students, setStudents] = useState<AttendanceRow[]>([])
  const [statuses, setStatuses] = useState<string[]>([])
  const [savingId, setSavingId] = useState<number | null>(null)
  const [progressStudent, setProgressStudent] = useState<AttendanceRow | null>(null)

  const load = useCallback(async () => {
    if (!activeTahfizId || !sessionId) return
    const [sessionRow, attendanceRows, tahfiz] = await Promise.all([
      db.getFirstAsync<Omit<Session, 'is_confirmed'> & { is_confirmed: number }>('SELECT * FROM sessions WHERE id=? AND tahfiz_id=?', sessionId, activeTahfizId),
      sessionAttendance<AttendanceRow>(db, sessionId),
      db.getFirstAsync<{ attendance_statuses: string }>('SELECT attendance_statuses FROM tahfiz WHERE id=?', activeTahfizId),
    ])
    setSession(sessionRow)
    setStudents(attendanceRows)
    setStatuses(tahfiz ? JSON.parse(tahfiz.attendance_statuses) : ['حاضر', 'غياب', 'غياب بعذر', 'لا ينطبق'])
  }, [db, activeTahfizId, sessionId])
  useFocusEffect(useCallback(() => { void load() }, [load]))

  const changeStatus = async (student: AttendanceRow, status: string) => {
    if (!activeTahfizId || session?.is_confirmed) return
    setSavingId(student.id)
    try {
      await queueAttendance(
        db, await getDeviceId(), activeTahfizId, sessionId, student.id,
        status, student.notes, student.sheikh_id,
      )
      await load()
    } catch (error) {
      Alert.alert('تعذر الحفظ', error instanceof Error ? error.message : 'حاول مرة أخرى')
    } finally {
      setSavingId(null)
    }
  }

  const confirm = async () => {
    if (!activeTahfizId || !session) return
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
  if (!session) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>

  return (
    <View style={commonStyles.screen}>
      <FlatList
        data={students}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={commonStyles.content}
        ListHeaderComponent={
          <View style={styles.summary}>
            <View style={{ flex: 1 }}>
              <Text style={styles.date}>{new Date(`${session.date}T12:00:00`).toLocaleDateString('ar-EG', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
              })}</Text>
              <Text style={commonStyles.subtitle}>{present} حاضر من {students.length}</Text>
            </View>
            <Text style={[styles.state, { color: session.is_confirmed ? colors.muted : colors.success }]}>
              {session.is_confirmed ? 'مؤكدة' : 'محفوظة محلياً'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.student}>
            <View style={styles.studentHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.studentName}>{item.name}</Text>
                {item.dirty ? <Text style={styles.pending}>بانتظار المزامنة</Text> : null}
              </View>
              {savingId === item.id ? <ActivityIndicator color={colors.primary} /> : null}
            </View>
            <View style={styles.statuses}>
              {statuses.map((status) => (
                <TouchableOpacity
                  key={status}
                  disabled={Boolean(session.is_confirmed)}
                  onPress={() => void changeStatus(item, status)}
                  style={[styles.status, item.status === status && styles.statusSelected]}
                >
                  <Text style={[styles.statusText, item.status === status && styles.statusTextSelected]}>{status}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {item.status === 'حاضر' && !session.is_confirmed ? (
              <TouchableOpacity style={styles.progressButton} onPress={() => setProgressStudent(item)}>
                <Text style={styles.progressButtonText}>تسجيل تقدم القرآن</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListFooterComponent={
          !session.is_confirmed ? (
            <TouchableOpacity disabled={syncing} style={[commonStyles.button, { marginTop: 10 }]} onPress={() => void confirm()}>
              {syncing ? <ActivityIndicator color="#fff" /> : <Text style={commonStyles.buttonText}>مزامنة وتأكيد الحلقة</Text>}
            </TouchableOpacity>
          ) : <View style={{ height: 20 }} />
        }
      />
      <ProgressModal
        student={progressStudent}
        sessionId={sessionId}
        tahfizId={activeTahfizId}
        onClose={() => setProgressStudent(null)}
      />
    </View>
  )
}

function ProgressModal({
  student,
  sessionId,
  tahfizId,
  onClose,
}: {
  student: AttendanceRow | null
  sessionId: number
  tahfizId: number | null
  onClose(): void
}) {
  const db = useSQLiteContext()
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
  const [saving, setSaving] = useState(false)

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
        next_assignment: null,
      })
      onClose()
      setFromPage('')
      setToPage('')
      setFromSurah('')
      setFromAyah('')
      setToSurah('')
      setToAyah('')
      setNotes('')
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
        <TouchableOpacity style={commonStyles.button} disabled={saving} onPress={() => void save()}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={commonStyles.buttonText}>حفظ على الجهاز</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancel} onPress={onClose}><Text style={{ color: colors.muted, fontWeight: '700' }}>إلغاء</Text></TouchableOpacity>
      </ScrollView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  summary: { ...commonStyles.card, flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 10 },
  date: { color: colors.text, fontSize: 17, fontWeight: '900', textAlign: 'right' },
  state: { fontWeight: '800', fontSize: 12 },
  student: { ...commonStyles.card, gap: 11 },
  studentHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  studentName: { color: colors.text, fontWeight: '900', fontSize: 17, textAlign: 'right' },
  pending: { color: colors.warning, fontSize: 11, textAlign: 'right' },
  statuses: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 7 },
  status: { borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 8 },
  statusSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  statusText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  statusTextSelected: { color: '#fff' },
  progressButton: { backgroundColor: '#ecfeff', borderRadius: 12, padding: 11, alignItems: 'center' },
  progressButtonText: { color: colors.primaryDark, fontWeight: '800' },
  formRow: { flexDirection: 'row-reverse', gap: 10 },
  half: { flex: 1 },
  rangeChoice: { flex: 1, minHeight: 45, borderWidth: 1, borderColor: colors.border, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
})

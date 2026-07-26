import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import React, { useCallback, useState } from 'react'
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

import { useApp } from '../../src/context/AppContext'
import { attendanceStatusStreak } from '../../src/db/database'
import { api } from '../../src/lib/api'
import { mediaUrl } from '../../src/lib/media'
import { useTheme } from '../../src/theme'

interface LocalStudent {
  id: number
  name: string
  phone: string | null
  student_code: string | null
  birthday: string | null
  registration_date: string | null
  profile_pic: string | null
  status: string
  sheikh_name: string | null
}

export default function StudentProfileScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>()
  const studentId = Number(id)
  const router = useRouter()
  const db = useSQLiteContext()
  const { activeTahfizId } = useApp()
  const { colors, commonStyles } = useTheme()
  const styles = createStyles(colors)
  const [student, setStudent] = useState<LocalStudent | null>(null)
  const [remote, setRemote] = useState<Record<string, any> | null>(null)
  const [summary, setSummary] = useState({ total: 0, present: 0, absent: 0, excused: 0, streak: 0, limit: 3, status: 'غياب بعذر', enabled: true, progress: 0 })
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!activeTahfizId || !studentId) return
    setLoading(true)
    const [localStudent, attendanceRows, progressRow, settings] = await Promise.all([
      db.getFirstAsync<LocalStudent>(
        `SELECT s.id,s.name,s.phone,s.student_code,s.birthday,s.registration_date,s.profile_pic,s.status,sh.name sheikh_name
         FROM students s LEFT JOIN sheikhs sh ON sh.id=s.sheikh_id
         WHERE s.id=? AND s.tahfiz_id=?`,
        studentId, activeTahfizId,
      ),
      db.getAllAsync<{ status: string; count: number }>(
        'SELECT status,COUNT(*) count FROM attendance WHERE tahfiz_id=? AND student_id=? GROUP BY status',
        activeTahfizId, studentId,
      ),
      db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) count FROM quran_progress WHERE tahfiz_id=? AND student_id=?',
        activeTahfizId, studentId,
      ),
      db.getFirstAsync<{ excused_absence_streak_limit: number; attendance_streak_status: string; attendance_streak_alert_enabled: number }>(
        'SELECT excused_absence_streak_limit,attendance_streak_status,attendance_streak_alert_enabled FROM tahfiz WHERE id=?',
        activeTahfizId,
      ),
    ])
    setStudent(localStudent)
    const counts = Object.fromEntries(attendanceRows.map(row => [row.status, row.count]))
    setSummary({
      total: attendanceRows.reduce((sum, row) => sum + row.count, 0),
      present: counts['حاضر'] || 0,
      absent: counts['غياب'] || 0,
      excused: counts['غياب بعذر'] || 0,
      streak: await attendanceStatusStreak(db, activeTahfizId, studentId),
      limit: settings?.excused_absence_streak_limit ?? 3,
      status: settings?.attendance_streak_status || 'غياب بعذر',
      enabled: Boolean(settings?.attendance_streak_alert_enabled),
      progress: progressRow?.count ?? 0,
    })
    try {
      setRemote(await api.get(`/students/${studentId}/profile`, activeTahfizId))
    } catch {
      setRemote(null)
    } finally {
      setLoading(false)
    }
  }, [activeTahfizId, db, studentId])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  if (loading && !student) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
  if (!student) return <View style={styles.center}><Text style={commonStyles.subtitle}>الطالب غير موجود في البيانات المحلية.</Text></View>

  const profileImage = mediaUrl(remote?.profile_pic || student.profile_pic)
  const parentPhones = remote?.parent_phones || []
  const warnings = remote?.warnings || []

  return (
    <>
      <Stack.Screen options={{ title: name || student.name }} />
      <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.content}>
        <View style={[commonStyles.card, styles.identity]}>
          {profileImage ? <Image source={{ uri: profileImage }} style={styles.avatar} /> : <View style={[styles.avatar, styles.avatarPlaceholder]}><Text style={styles.avatarLetter}>{student.name.charAt(0)}</Text></View>}
          <Text style={commonStyles.title}>{student.name}</Text>
          <Text style={commonStyles.subtitle}>{student.student_code ? `رقم الطالب: ${student.student_code}` : `المعرف: ${student.id}`}</Text>
          <View style={styles.badges}>
            <Text style={styles.badge}>{student.status}</Text>
            {student.sheikh_name ? <Text style={styles.badge}>{student.sheikh_name}</Text> : null}
          </View>
        </View>

        <View style={styles.stats}>
          <Stat label="السجلات" value={summary.total} />
          <Stat label="حاضر" value={summary.present} />
          <Stat label="غياب" value={summary.absent} />
          <Stat label="بعذر" value={summary.excused} />
        </View>

        {summary.enabled ? <View style={[commonStyles.card, summary.streak > summary.limit && styles.warningCard]}>
          <Text style={styles.sectionTitle}>سلسلة «{summary.status}» الحالية: {summary.streak}</Text>
          <Text style={commonStyles.subtitle}>حد التنبيه: أكثر من {summary.limit}</Text>
        </View> : null}

        <View style={commonStyles.card}>
          <Text style={styles.sectionTitle}>البيانات الأساسية</Text>
          <Detail label="الهاتف" value={student.phone} />
          <Detail label="تاريخ الميلاد" value={student.birthday} />
          <Detail label="تاريخ التسجيل" value={student.registration_date} />
          <Detail label="سجلات متابعة القرآن" value={String(summary.progress)} />
        </View>

        <View style={commonStyles.card}>
          <Text style={styles.sectionTitle}>أولياء الأمور</Text>
          {parentPhones.length ? parentPhones.map((phone: Record<string, any>) => (
            <Detail key={phone.id ?? phone.phone_number} label={phone.name || phone.parent_type} value={phone.phone_number} />
          )) : <Text style={commonStyles.subtitle}>{remote ? 'لا توجد أرقام مسجلة.' : 'تظهر عند توفر اتصال بالإنترنت.'}</Text>}
        </View>

        <View style={commonStyles.card}>
          <Text style={styles.sectionTitle}>الإنذارات ({warnings.length})</Text>
          {warnings.length ? warnings.slice(0, 8).map((warning: Record<string, any>) => (
            <View key={warning.id} style={styles.warningRow}><Text style={styles.warningTitle}>إنذار {warning.warning_number}</Text><Text style={styles.warningText}>{warning.reason}</Text></View>
          )) : <Text style={commonStyles.subtitle}>{remote ? 'لا توجد إنذارات.' : 'تظهر عند توفر اتصال بالإنترنت.'}</Text>}
        </View>

        <View style={styles.links}>
          <TouchableOpacity style={styles.link} onPress={() => router.push({ pathname: '/student/[id]/progress', params: { id: String(student.id), name: student.name } })}><Text style={styles.linkText}>تقدم القرآن والأهداف</Text></TouchableOpacity>
          <TouchableOpacity style={styles.link} onPress={() => router.push({ pathname: '/student/[id]/exceptions', params: { id: String(student.id), name: student.name } })}><Text style={styles.linkText}>أيام العذر</Text></TouchableOpacity>
        </View>
      </ScrollView>
    </>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  const { colors, commonStyles } = useTheme()
  return <View style={[commonStyles.card, { flex: 1, minWidth: 75, alignItems: 'center' }]}><Text style={{ color: colors.text, fontWeight: '900', fontSize: 20 }}>{value}</Text><Text style={{ color: colors.muted, fontSize: 10 }}>{label}</Text></View>
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  const { colors } = useTheme()
  return <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', gap: 12, paddingVertical: 8 }}><Text style={{ color: colors.muted }}>{label}</Text><Text style={{ color: colors.text, fontWeight: '700' }}>{value || '—'}</Text></View>
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: 24 },
  identity: { alignItems: 'center' },
  avatar: { width: 100, height: 100, borderRadius: 50, marginBottom: 10 },
  avatarPlaceholder: { backgroundColor: colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: colors.primaryDark, fontWeight: '900', fontSize: 34 },
  badges: { flexDirection: 'row-reverse', gap: 8, marginTop: 10 },
  badge: { color: colors.primaryDark, backgroundColor: colors.primarySurface, paddingHorizontal: 11, paddingVertical: 5, borderRadius: 99, fontWeight: '800', fontSize: 11 },
  stats: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  sectionTitle: { color: colors.text, textAlign: 'right', fontWeight: '900', fontSize: 15, marginBottom: 5 },
  warningCard: { borderColor: '#f59e0b', backgroundColor: '#fffbeb' },
  warningRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 9 },
  warningTitle: { color: colors.danger, textAlign: 'right', fontWeight: '900' },
  warningText: { color: colors.text, textAlign: 'right', marginTop: 3, fontSize: 12 },
  links: { flexDirection: 'row-reverse', gap: 8 },
  link: { flex: 1, minHeight: 48, backgroundColor: colors.primarySurface, borderRadius: 13, alignItems: 'center', justifyContent: 'center', padding: 8 },
  linkText: { color: colors.primaryDark, fontWeight: '900', textAlign: 'center', fontSize: 12 },
})

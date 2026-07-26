import { useFocusEffect, useRouter } from 'expo-router'
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

import { useApp } from '../src/context/AppContext'
import { api } from '../src/lib/api'
import { useTheme } from '../src/theme'

interface WarningRow {
  id: number
  student_id: number
  student_name: string
  sheikh_id: number | null
  sheikh_name: string | null
  reason: string
  warning_number: number
  sent: boolean
  sent_at: string | null
  created_at: string
}

interface StudentRow {
  id: number
  name: string
  sheikh?: { id: number; name: string } | null
}

export default function WarningsScreen() {
  const router = useRouter()
  const { activeTahfizId } = useApp()
  const { colors, commonStyles } = useTheme()
  const styles = createStyles(colors)
  const [items, setItems] = useState<WarningRow[]>([])
  const [students, setStudents] = useState<StudentRow[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<WarningRow | null | undefined>(undefined)
  const [studentId, setStudentId] = useState<number | null>(null)
  const [studentQuery, setStudentQuery] = useState('')
  const [reason, setReason] = useState('')

  const load = useCallback(async () => {
    if (!activeTahfizId) return
    setLoading(true)
    try {
      const [warnings, studentRows] = await Promise.all([
        api.get('/warnings', activeTahfizId) as Promise<WarningRow[]>,
        api.get('/students', activeTahfizId) as Promise<StudentRow[]>,
      ])
      setItems(warnings)
      setStudents(studentRows)
      setSelected((current) => new Set([...current].filter((id) => warnings.some((item) => item.id === id && !item.sent))))
    } catch (error) {
      Alert.alert('تعذر تحميل الإنذارات', error instanceof Error ? error.message : 'تحقق من الاتصال')
    } finally {
      setLoading(false)
    }
  }, [activeTahfizId])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ar')
    return items.filter((item) => !normalized
      || item.student_name.toLocaleLowerCase('ar').includes(normalized)
      || item.sheikh_name?.toLocaleLowerCase('ar').includes(normalized)
      || item.reason.toLocaleLowerCase('ar').includes(normalized))
  }, [items, query])

  const visibleStudents = useMemo(() => {
    const normalized = studentQuery.trim().toLocaleLowerCase('ar')
    return students.filter((item) => !normalized
      || item.name.toLocaleLowerCase('ar').includes(normalized)
      || item.sheikh?.name.toLocaleLowerCase('ar').includes(normalized))
  }, [students, studentQuery])

  const openCreate = () => {
    setEditing(null)
    setStudentId(null)
    setStudentQuery('')
    setReason('')
  }

  const openEdit = (item: WarningRow) => {
    setEditing(item)
    setStudentId(item.student_id)
    setReason(item.reason)
  }

  const save = async () => {
    if (!activeTahfizId || !reason.trim() || (!editing && !studentId)) return
    setBusy(true)
    try {
      if (editing) {
        await api.mutate(`/warnings/${editing.id}`, 'PUT', activeTahfizId, { reason: reason.trim() })
      } else {
        await api.mutate(`/students/${studentId}/warnings`, 'POST', activeTahfizId, { reason: reason.trim() })
      }
      setEditing(undefined)
      await load()
    } catch (error) {
      Alert.alert('تعذر حفظ الإنذار', error instanceof Error ? error.message : 'تحقق من البيانات')
    } finally {
      setBusy(false)
    }
  }

  const remove = (item: WarningRow) => {
    if (!activeTahfizId) return
    Alert.alert('حذف الإنذار', `حذف إنذار ${item.student_name}؟`, [
      { text: 'تراجع', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          setBusy(true)
          try {
            await api.mutate(`/warnings/${item.id}`, 'DELETE', activeTahfizId)
            await load()
          } catch (error) {
            Alert.alert('تعذر الحذف', error instanceof Error ? error.message : 'حاول مرة أخرى')
          } finally {
            setBusy(false)
          }
        },
      },
    ])
  }

  const sendSelected = async () => {
    if (!activeTahfizId || selected.size === 0) return
    setBusy(true)
    try {
      const response = await api.mutate('/warnings/send', 'POST', activeTahfizId, {
        warning_ids: [...selected],
      }) as { results: Array<{ warning_id: number; success: boolean; error?: string }> }
      const failed = response.results.filter((item) => !item.success)
      setSelected(new Set())
      await load()
      Alert.alert(
        failed.length ? 'اكتمل الإرسال مع ملاحظات' : 'تم الإرسال',
        failed.length
          ? `${response.results.length - failed.length} نجح، ${failed.length} تعذر. ${failed[0]?.error ?? ''}`
          : `تم إرسال ${response.results.length} إنذار.`,
      )
    } catch (error) {
      Alert.alert('تعذر إرسال الإنذارات', error instanceof Error ? error.message : 'تحقق من إعدادات WhatsEnd')
    } finally {
      setBusy(false)
    }
  }

  const toggle = (id: number) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <>
      <FlatList
        style={commonStyles.screen}
        contentContainerStyle={commonStyles.content}
        data={visibleItems}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={(
          <View style={styles.header}>
            <Text style={commonStyles.title}>الإنذارات</Text>
            <Text style={commonStyles.subtitle}>إدارة الإنذارات وإرسال المحدد عبر مجموعة الشيخ.</Text>
            <View style={styles.topActions}>
              <TouchableOpacity style={[commonStyles.button, styles.flex]} onPress={openCreate}>
                <Text style={commonStyles.buttonText}>+ إنذار</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={busy || selected.size === 0}
                style={[styles.send, styles.flex, selected.size === 0 && styles.disabled]}
                onPress={() => void sendSelected()}
              >
                <Text style={styles.sendText}>إرسال المحدد ({selected.size})</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="بحث بالطالب أو الشيخ أو السبب"
              style={commonStyles.input}
            />
            <View style={styles.summary}>
              <Text style={styles.summaryText}>{items.length} إنذار</Text>
              <Text style={styles.summaryText}>{items.filter((item) => item.sent).length} مُرسل</Text>
              <Text style={styles.summaryText}>{items.filter((item) => !item.sent).length} غير مُرسل</Text>
            </View>
            {loading ? <ActivityIndicator color={colors.primary} /> : null}
          </View>
        )}
        ListEmptyComponent={!loading ? (
          <View style={commonStyles.card}><Text style={commonStyles.subtitle}>لا توجد إنذارات مطابقة.</Text></View>
        ) : null}
        renderItem={({ item }) => (
          <TouchableOpacity style={commonStyles.card} onPress={() => !item.sent && toggle(item.id)} onLongPress={() => openEdit(item)}>
            <View style={styles.rowHeader}>
              {!item.sent ? (
                <View style={[styles.check, selected.has(item.id) && styles.checkActive]}>
                  <Text style={styles.checkText}>{selected.has(item.id) ? '✓' : ''}</Text>
                </View>
              ) : <Text style={styles.sent}>تم الإرسال ✓</Text>}
              <View style={{ flex: 1 }}>
                <TouchableOpacity onPress={(event) => {
                  event.stopPropagation()
                  router.push({ pathname: '/student/[id]', params: { id: String(item.student_id), name: item.student_name } })
                }}>
                  <Text style={styles.student}>{item.student_name}</Text>
                </TouchableOpacity>
                <Text style={commonStyles.subtitle}>
                  الإنذار {item.warning_number} · {item.sheikh_name || 'دون شيخ'}
                </Text>
              </View>
            </View>
            <Text style={styles.reason}>{item.reason}</Text>
            <Text style={styles.date}>{new Date(item.created_at).toLocaleString('ar-EG')}</Text>
            <View style={styles.rowActions}>
              <TouchableOpacity style={styles.edit} onPress={() => openEdit(item)}>
                <Text style={styles.editText}>تعديل</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.delete} onPress={() => remove(item)}>
                <Text style={styles.deleteText}>حذف</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      />

      <Modal visible={editing !== undefined} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditing(undefined)}>
        <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.content} keyboardShouldPersistTaps="handled">
          <Text style={commonStyles.title}>{editing ? 'تعديل الإنذار' : 'إنذار جديد'}</Text>
          {!editing ? (
            <>
              <TextInput
                value={studentQuery}
                onChangeText={setStudentQuery}
                placeholder="ابحث عن الطالب"
                style={commonStyles.input}
              />
              <View style={styles.studentChoices}>
                {visibleStudents.slice(0, 40).map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => setStudentId(item.id)}
                    style={[styles.studentChoice, studentId === item.id && styles.studentChoiceActive]}
                  >
                    <Text style={[styles.studentChoiceText, studentId === item.id && styles.studentChoiceTextActive]}>
                      {item.name}{item.sheikh?.name ? ` · ${item.sheikh.name}` : ''}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : (
            <Text style={styles.editingStudent}>{editing.student_name} · الإنذار {editing.warning_number}</Text>
          )}
          <TextInput
            value={reason}
            onChangeText={setReason}
            multiline
            autoFocus={Boolean(editing)}
            placeholder="سبب الإنذار"
            style={[commonStyles.input, styles.reasonInput]}
            textAlignVertical="top"
          />
          <TouchableOpacity
            disabled={busy || !reason.trim() || (!editing && !studentId)}
            style={[commonStyles.button, (!reason.trim() || (!editing && !studentId)) && styles.disabled]}
            onPress={() => void save()}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={commonStyles.buttonText}>حفظ الإنذار</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancel} onPress={() => setEditing(undefined)}>
            <Text style={commonStyles.subtitle}>إلغاء</Text>
          </TouchableOpacity>
        </ScrollView>
      </Modal>
    </>
  )
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  header: { gap: 12, marginBottom: 10 },
  topActions: { flexDirection: 'row-reverse', gap: 8 },
  flex: { flex: 1 },
  send: { minHeight: 48, borderRadius: 14, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' },
  sendText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  disabled: { opacity: 0.45 },
  summary: { flexDirection: 'row-reverse', justifyContent: 'space-around', backgroundColor: colors.surfaceMuted, borderRadius: 12, padding: 10 },
  summaryText: { color: colors.muted, fontSize: 11, fontWeight: '800' },
  rowHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  student: { color: colors.text, fontWeight: '900', fontSize: 17, textAlign: 'right' },
  check: { width: 28, height: 28, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkText: { color: '#fff', fontWeight: '900' },
  sent: { color: colors.success, fontSize: 11, fontWeight: '900' },
  reason: { color: colors.text, lineHeight: 21, textAlign: 'right', marginTop: 12 },
  date: { color: colors.muted, fontSize: 10, textAlign: 'right', marginTop: 8 },
  rowActions: { flexDirection: 'row-reverse', gap: 8, marginTop: 10 },
  edit: { backgroundColor: colors.primarySurface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  editText: { color: colors.primaryDark, fontWeight: '800', fontSize: 11 },
  delete: { backgroundColor: colors.dangerSurface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  deleteText: { color: colors.danger, fontWeight: '800', fontSize: 11 },
  studentChoices: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  studentChoice: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: colors.input },
  studentChoiceActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  studentChoiceText: { color: colors.text, fontWeight: '700', fontSize: 12 },
  studentChoiceTextActive: { color: '#fff' },
  editingStudent: { color: colors.primary, fontWeight: '900', textAlign: 'right' },
  reasonInput: { minHeight: 140, paddingTop: 14 },
  cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
})

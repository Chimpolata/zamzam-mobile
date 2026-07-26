import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

import { useApp } from '../../src/context/AppContext'
import { api } from '../../src/lib/api'
import { mediaUrl } from '../../src/lib/media'
import { useTheme } from '../../src/theme'

export default function OnlineDataScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ screen?: string; endpoint?: string; label?: string }>()
  const { activeTahfizId } = useApp()
  const { colors, commonStyles } = useTheme()
  const styles = createStyles(colors, commonStyles)
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Record<string, any> | null | undefined>(undefined)
  const [reorderingId, setReorderingId] = useState<number | null>(null)
  const [studentQuery, setStudentQuery] = useState('')

  const load = async () => {
    if (!params.endpoint) return
    setLoading(true)
    setError('')
    try {
      setData(await api.get(params.endpoint, activeTahfizId ?? undefined))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'هذه الصفحة تحتاج اتصالاً بالإنترنت')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, [activeTahfizId, params.endpoint])

  const rawItems = Array.isArray(data)
    ? data
    : Array.isArray(data?.students)
      ? data.students
      : data ? [data] : []
  const normalizedStudentQuery = studentQuery.trim().toLocaleLowerCase('ar')
  const items = params.screen === 'students'
    ? rawItems.filter((item: Record<string, any>) => (
      !normalizedStudentQuery
      || String(item.name ?? '').toLocaleLowerCase('ar').includes(normalizedStudentQuery)
      || String(item.student_id ?? '').toLocaleLowerCase('ar').includes(normalizedStudentQuery)
      || String(item.phone ?? '').toLocaleLowerCase('ar').includes(normalizedStudentQuery)
      || String(item.sheikh?.name ?? '').toLocaleLowerCase('ar').includes(normalizedStudentQuery)
    ))
    : rawItems
  const canEdit = ['students', 'sheikhs', 'users', 'invitations', 'settings', 'filters'].includes(params.screen ?? '')
  const createOnly = params.screen === 'invitations'

  const reorderStudent = async (student: Record<string, any>, direction: -1 | 1) => {
    if (!activeTahfizId) return
    const sheikhId = Number(student.sheikh_id ?? student.sheikh?.id)
    if (!sheikhId) return
    const peers = items
      .filter((candidate: Record<string, any>) => Number(candidate.sheikh_id ?? candidate.sheikh?.id) === sheikhId)
      .sort((a: Record<string, any>, b: Record<string, any>) =>
        Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0) || String(a.name).localeCompare(String(b.name), 'ar'))
    const index = peers.findIndex((candidate: Record<string, any>) => candidate.id === student.id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= peers.length) return
    const ids = peers.map((candidate: Record<string, any>) => candidate.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    setReorderingId(student.id)
    try {
      await api.reorderStudents(activeTahfizId, sheikhId, ids)
      await load()
    } catch (reason) {
      Alert.alert('تعذر تغيير الترتيب', reason instanceof Error ? reason.message : 'حاول مرة أخرى')
    } finally {
      setReorderingId(null)
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: params.label ?? 'زمزم' }} />
      <ScrollView
        style={commonStyles.screen}
        contentContainerStyle={commonStyles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
      >
        {loading && !data ? <ActivityIndicator color={colors.primary} /> : null}
        {canEdit ? (
          <TouchableOpacity style={commonStyles.button} onPress={() => setEditing(params.screen === 'settings' ? data : null)}>
            <Text style={commonStyles.buttonText}>{params.screen === 'settings' ? 'تعديل الإعدادات' : `إضافة ${params.label ?? 'سجل'}`}</Text>
          </TouchableOpacity>
        ) : null}
        {params.screen === 'students' ? (
          <TextInput value={studentQuery} onChangeText={setStudentQuery} placeholder="ابحث باسم الطالب أو رقمه أو هاتفه أو الشيخ" placeholderTextColor={colors.muted} style={commonStyles.input} />
        ) : null}
        {error ? <View style={commonStyles.card}><Text style={styles.error}>{error}</Text></View> : null}
        {!loading && !error && items.length === 0 ? (
          <View style={commonStyles.card}><Text style={commonStyles.subtitle}>لا توجد بيانات.</Text></View>
        ) : null}
        {items.map((item: any, index: number) => (
          <TouchableOpacity
            disabled={!canEdit || createOnly || params.screen === 'settings'}
            onPress={() => setEditing(item)}
            key={String(item.id ?? item.student_id ?? index)}
            style={[commonStyles.card, { gap: 7 }]}
          >
            <View style={styles.itemHeading}>
              {params.screen === 'students' && mediaUrl(item.profile_pic) ? (
                <Image source={{ uri: mediaUrl(item.profile_pic)! }} style={styles.avatar} />
              ) : null}
              <Text style={styles.itemTitle}>{displayTitle(item, index)}</Text>
            </View>
            {Object.entries(item)
              .filter(([key, value]) => visibleField(key, value))
              .slice(0, 8)
              .map(([key, value]) => (
                <View key={key} style={styles.field}>
                  <Text style={styles.fieldValue}>{formatValue(value)}</Text>
                  <Text style={styles.fieldLabel}>{fieldLabel(key)}</Text>
                </View>
              ))}
            {canEdit && !createOnly && params.screen !== 'settings' ? <Text style={styles.editHint}>اضغط للتعديل أو الحذف</Text> : null}
            {params.screen === 'students' ? (
              <View style={{ gap: 8 }}>
                <View style={styles.studentLinks}>
                  <TouchableOpacity
                    style={styles.progressLink}
                    onPress={(event) => {
                      event.stopPropagation()
                      router.push({ pathname: '/student/[id]', params: { id: String(item.id), name: item.name } })
                    }}
                  >
                    <Text style={styles.progressLinkText}>فتح ملف الطالب</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.progressLink}
                    onPress={(event) => {
                      event.stopPropagation()
                      router.push({
                        pathname: '/student/[id]/progress',
                        params: { id: String(item.id), name: item.name },
                      })
                    }}
                  >
                    <Text style={styles.progressLinkText}>تقدم القرآن والأهداف</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.progressLink}
                    onPress={(event) => {
                      event.stopPropagation()
                      router.push({
                        pathname: '/student/[id]/exceptions',
                        params: { id: String(item.id), name: item.name },
                      })
                    }}
                  >
                    <Text style={styles.progressLinkText}>أيام العذر</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.orderButtons}>
                  <TouchableOpacity
                    disabled={reorderingId !== null}
                    style={styles.orderButton}
                    onPress={(event) => { event.stopPropagation(); void reorderStudent(item, -1) }}
                  >
                    <Text style={styles.orderButtonText}>تحريك لأعلى ↑</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={reorderingId !== null}
                    style={styles.orderButton}
                    onPress={(event) => { event.stopPropagation(); void reorderStudent(item, 1) }}
                  >
                    <Text style={styles.orderButtonText}>تحريك لأسفل ↓</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </TouchableOpacity>
        ))}
      </ScrollView>
      <RecordEditor
        screen={params.screen ?? ''}
        item={editing}
        tahfizId={activeTahfizId ?? undefined}
        onClose={() => setEditing(undefined)}
        onSaved={async () => { setEditing(undefined); await load() }}
      />
    </>
  )
}

type EditorField = {
  key: string
  label: string
  section?: string
  keyboard?: 'default' | 'phone-pad' | 'number-pad'
  secure?: boolean
  boolean?: boolean
}

const editorFields: Record<string, EditorField[]> = {
  students: [
    { key: 'name', label: 'اسم الطالب' },
    { key: 'phone', label: 'هاتف الطالب', keyboard: 'phone-pad' },
    { key: 'student_id', label: 'رقم الطالب' },
    { key: 'birthday', label: 'تاريخ الميلاد YYYY-MM-DD' },
    { key: 'registration_date', label: 'تاريخ التسجيل YYYY-MM-DD' },
    { key: 'sheikh_id', label: 'رقم الشيخ', keyboard: 'number-pad' },
    { key: 'status', label: 'الحالة: مقيد، مستبعد، منقطع، ضيف، غير مقيد' },
    { key: 'parent_phone_1', label: 'هاتف ولي الأمر الأول', keyboard: 'phone-pad' },
    { key: 'parent_type_1', label: 'صلة ولي الأمر الأول: أب، أم، أخ، أخت، جد، جدة، أرضي' },
    { key: 'parent_name_1', label: 'اسم ولي الأمر الأول' },
    { key: 'parent_phone_2', label: 'هاتف ولي الأمر الثاني', keyboard: 'phone-pad' },
    { key: 'parent_type_2', label: 'صلة ولي الأمر الثاني' },
    { key: 'parent_name_2', label: 'اسم ولي الأمر الثاني' },
    { key: 'parent_phone_3', label: 'هاتف ولي الأمر الثالث', keyboard: 'phone-pad' },
    { key: 'parent_type_3', label: 'صلة ولي الأمر الثالث' },
    { key: 'parent_name_3', label: 'اسم ولي الأمر الثالث' },
  ],
  sheikhs: [
    { key: 'name', label: 'اسم الشيخ' },
    { key: 'phone', label: 'الهاتف', keyboard: 'phone-pad' },
    { key: 'whatsapp_group_id', label: 'معرف مجموعة واتساب' },
  ],
  users: [
    { key: 'username', label: 'اسم المستخدم' },
    { key: 'password', label: 'كلمة المرور', secure: true },
    { key: 'role', label: 'الصلاحية: admin أو sheikh' },
    { key: 'sheikh_id', label: 'رقم الشيخ', keyboard: 'number-pad' },
  ],
  invitations: [
    { key: 'role', label: 'الصلاحية: admin أو sheikh' },
    { key: 'sheikh_id', label: 'رقم الشيخ', keyboard: 'number-pad' },
    { key: 'expires_hours', label: 'مدة الدعوة بالساعات', keyboard: 'number-pad' },
  ],
  filters: [
    { key: 'name', label: 'اسم التصفية' },
    { key: 'data', label: 'قواعد التصفية بصيغة JSON' },
  ],
  settings: [
    { key: 'name', label: 'اسم التحفيظ', section: 'بيانات التحفيظ' },
    { key: 'description', label: 'الوصف', section: 'بيانات التحفيظ' },
    { key: 'contact_phone', label: 'هاتف التواصل', keyboard: 'phone-pad', section: 'بيانات التحفيظ' },
    { key: 'attendance_statuses', label: 'حالات الحضور مفصولة بفاصلة', section: 'الحضور والحفظ' },
    { key: 'attendance_sheikh_selection_enabled', label: 'اختيار الشيخ أثناء تسجيل الحضور', boolean: true, section: 'الحضور والحفظ' },
    { key: 'progress_tracking_enabled', label: 'تفعيل متابعة القرآن', boolean: true, section: 'الحضور والحفظ' },
    { key: 'attendance_streak_alert_enabled', label: 'تنبيه تكرار حالة حضور متتالية', boolean: true, section: 'التنبيهات' },
    { key: 'attendance_streak_limit', label: 'حد تكرار الحالة المتتالية', keyboard: 'number-pad', section: 'التنبيهات' },
    { key: 'max_warnings', label: 'الحد الأقصى للإنذارات', keyboard: 'number-pad', section: 'التنبيهات' },
    { key: 'week_start_day', label: 'بداية الأسبوع ٠-٦', keyboard: 'number-pad', section: 'الفترات' },
    { key: 'month_start_day', label: 'بداية الشهر ١-٢٨', keyboard: 'number-pad', section: 'الفترات' },
    { key: 'whatsend_enabled', label: 'تفعيل تكامل WhatSend', boolean: true, section: 'التكاملات الاختيارية' },
    { key: 'whatsend_api_url', label: 'رابط WhatsEnd API', section: 'التكاملات الاختيارية' },
    { key: 'whatsend_groups_url', label: 'رابط مجموعات WhatsEnd', section: 'التكاملات الاختيارية' },
    { key: 'whatsend_api_key', label: 'مفتاح WhatsEnd (اتركه فارغاً للاحتفاظ بالحالي)', secure: true, section: 'التكاملات الاختيارية' },
  ],
}

function RecordEditor({
  screen,
  item,
  tahfizId,
  onClose,
  onSaved,
}: {
  screen: string
  item: Record<string, any> | null | undefined
  tahfizId?: number
  onClose(): void
  onSaved(): Promise<void>
}) {
  const { colors, commonStyles } = useTheme()
  const styles = createStyles(colors, commonStyles)
  const fields = editorFields[screen] ?? []
  const [values, setValues] = useState<Record<string, any>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (item === undefined) return
    const next: Record<string, any> = {}
    for (const field of fields) {
      const parentMatch = /^parent_(phone|type|name)_(\d)$/.exec(field.key)
      const parent = parentMatch ? item?.parent_phones?.[Number(parentMatch[2]) - 1] : null
      const raw = parentMatch
        ? parent?.[parentMatch[1] === 'phone' ? 'phone_number' : parentMatch[1] === 'type' ? 'parent_type' : 'name']
        : field.key === 'sheikh_id'
          ? item?.sheikh_id ?? item?.sheikh?.id
          : item?.[field.key]
      next[field.key] = field.key === 'attendance_statuses' && Array.isArray(raw)
        ? raw.join('، ')
        : raw ?? (parentMatch?.[1] === 'type' ? 'أب' : defaultValue(screen, field.key))
    }
    if (screen === 'settings') {
      next.attendance_status_colors = item?.attendance_status_colors ?? {
        'حاضر': 'green', 'غياب': 'slate', 'غياب بعذر': 'amber', 'لا ينطبق': 'sky',
      }
      next.excused_absence_reset_statuses = item?.attendance_streak_reset_statuses ?? item?.excused_absence_reset_statuses ?? ['حاضر']
      next.attendance_streak_status = item?.attendance_streak_status ?? 'غياب بعذر'
      next.attendance_streak_limit = item?.attendance_streak_limit ?? item?.excused_absence_streak_limit ?? 3
      next.attendance_streak_alert_enabled = item?.attendance_streak_alert_enabled ?? true
      next.attendance_sheikh_selection_enabled = item?.attendance_sheikh_selection_enabled ?? true
      next.whatsend_enabled = item?.whatsend_enabled ?? true
    }
    setValues(next)
  }, [item, screen])

  const save = async () => {
    if (!tahfizId && screen !== 'platform') return
    const body: Record<string, any> = {}
    for (const field of fields) {
      const raw = values[field.key]
      if (/^parent_(phone|type|name)_\d$/.test(field.key)) continue
      if ((field.key === 'password' || field.key === 'whatsend_api_key') && item && !raw) continue
      if (field.key === 'attendance_statuses') {
        body[field.key] = String(raw).split(/[،,]/).map((value) => value.trim()).filter(Boolean)
      } else if (field.boolean) {
        body[field.key] = Boolean(raw)
      } else if (field.keyboard === 'number-pad') {
        body[field.key] = raw === '' || raw === null ? null : Number(raw)
      } else {
        body[field.key] = raw === '' ? null : raw
      }
    }
    if (screen === 'settings') {
      body.attendance_status_colors = values.attendance_status_colors ?? {}
      body.excused_absence_reset_statuses = values.excused_absence_reset_statuses ?? []
      body.attendance_streak_reset_statuses = values.excused_absence_reset_statuses ?? []
      body.attendance_streak_status = values.attendance_streak_status
    }
    if (screen === 'students') {
      const editedParents = [1, 2, 3].map((index) => ({
        phone_number: String(values[`parent_phone_${index}`] ?? '').trim(),
        parent_type: String(values[`parent_type_${index}`] ?? 'أب').trim() || 'أب',
        name: String(values[`parent_name_${index}`] ?? '').trim() || null,
      })).filter((parent) => parent.phone_number)
      const extraParents = (item?.parent_phones ?? []).slice(3).map((parent: Record<string, any>) => ({
        phone_number: parent.phone_number,
        parent_type: parent.parent_type,
        name: parent.name ?? null,
      }))
      body.parent_phones = [...editedParents, ...extraParents]
    }
    const originalSheikhId = Number(item?.sheikh_id ?? item?.sheikh?.id)
    const nextSheikhId = Number(body.sheikh_id)
    const shouldMoveStudent = screen === 'students' && Boolean(item?.id) && Boolean(nextSheikhId)
      && nextSheikhId !== originalSheikhId
    if (screen === 'students' && item?.id) delete body.sheikh_id
    setBusy(true)
    try {
      const endpoint = editorEndpoint(screen, item ?? null)
      await api.mutate(endpoint, item && screen !== 'invitations' ? 'PUT' : 'POST', tahfizId, body)
      if (shouldMoveStudent && tahfizId) {
        await api.moveStudentSheikh(tahfizId, item!.id, nextSheikhId)
      }
      await onSaved()
    } catch (reason) {
      Alert.alert('تعذر الحفظ', reason instanceof Error ? reason.message : 'تحقق من البيانات')
    } finally {
      setBusy(false)
    }
  }

  const remove = () => {
    if (!item?.id) return
    Alert.alert('تأكيد الحذف', 'قد يؤثر هذا الإجراء في سجلات مرتبطة. هل تريد المتابعة؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          setBusy(true)
          try {
            await api.mutate(deleteEndpoint(screen, item.id), 'DELETE', tahfizId)
            await onSaved()
          } catch (reason) {
            Alert.alert('تعذر الحذف', reason instanceof Error ? reason.message : 'حاول مرة أخرى')
          } finally {
            setBusy(false)
          }
        },
      },
    ])
  }

  const pickStudentPhoto = async () => {
    if (!item?.id || !tahfizId) return
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('إذن الصور مطلوب', 'اسمح لزمزم بالوصول إلى الصور لاختيار صورة الطالب.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })
    if (result.canceled || !result.assets[0]) return
    setBusy(true)
    try {
      await api.uploadStudentPic(tahfizId, item.id, result.assets[0])
      await onSaved()
    } catch (reason) {
      Alert.alert('تعذر رفع الصورة', reason instanceof Error ? reason.message : 'حاول مرة أخرى')
    } finally {
      setBusy(false)
    }
  }

  const visibleFields = fields.filter((field) => {
    if (screen !== 'settings') return true
    if (field.key === 'attendance_streak_limit' && !values.attendance_streak_alert_enabled) return false
    if (field.key.startsWith('whatsend_') && field.key !== 'whatsend_enabled' && !values.whatsend_enabled) return false
    return true
  })

  return (
    <Modal visible={item !== undefined} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.content} keyboardShouldPersistTaps="handled">
        <Text style={commonStyles.title}>{item ? 'تعديل السجل' : 'إضافة سجل'}</Text>
        {screen === 'students' && item?.id ? (
          <View style={styles.photoEditor}>
            {mediaUrl(item.profile_pic) ? (
              <Image source={{ uri: mediaUrl(item.profile_pic)! }} style={styles.photoPreview} />
            ) : (
              <View style={[styles.photoPreview, styles.photoPlaceholder]}>
                <Text style={styles.photoPlaceholderText}>لا توجد صورة</Text>
              </View>
            )}
            <TouchableOpacity disabled={busy} style={styles.photoButton} onPress={() => void pickStudentPhoto()}>
              <Text style={styles.photoButtonText}>اختيار أو تغيير صورة الطالب</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {visibleFields.map((field, index) => <React.Fragment key={field.key}>
          {field.section && visibleFields[index - 1]?.section !== field.section ? (
            <View style={styles.editorSectionHeader}>
              <Text style={styles.editorSectionTitle}>{field.section}</Text>
            </View>
          ) : null}
          {field.key === 'attendance_statuses' ? (
          <StatusSettingsEditor
            value={String(values.attendance_statuses ?? '')}
            colors={values.attendance_status_colors ?? {}}
            resetStatuses={values.excused_absence_reset_statuses ?? []}
            trackedStatus={values.attendance_streak_status ?? 'غياب بعذر'}
            onChange={(attendanceStatuses, attendanceColors, resetStatuses, trackedStatus) => setValues(current => ({
              ...current,
              attendance_statuses: attendanceStatuses.join('، '),
              attendance_status_colors: attendanceColors,
              excused_absence_reset_statuses: resetStatuses,
              attendance_streak_status: trackedStatus,
            }))}
          />
        ) : field.boolean ? (
          <View style={styles.switchRow}>
            <Switch value={Boolean(values[field.key])} onValueChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))} />
            <Text style={styles.switchLabel}>{field.label}</Text>
          </View>
        ) : (
          <TextInput
            value={values[field.key] === null || values[field.key] === undefined ? '' : String(values[field.key])}
            onChangeText={(value) => setValues((current) => ({ ...current, [field.key]: value }))}
            placeholder={field.label}
            secureTextEntry={field.secure}
            keyboardType={field.keyboard ?? 'default'}
            autoCapitalize={field.key === 'username' || field.key === 'role' ? 'none' : 'sentences'}
            style={commonStyles.input}
          />
        )}
        </React.Fragment>)}
        <TouchableOpacity disabled={busy} style={commonStyles.button} onPress={() => void save()}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={commonStyles.buttonText}>حفظ</Text>}
        </TouchableOpacity>
        {item?.id && !['settings', 'invitations'].includes(screen) ? (
          <TouchableOpacity disabled={busy} style={styles.deleteButton} onPress={remove}>
            <Text style={styles.deleteText}>حذف السجل</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.cancelButton} onPress={onClose}><Text style={commonStyles.subtitle}>إلغاء</Text></TouchableOpacity>
      </ScrollView>
    </Modal>
  )
}

const STATUS_COLOR_OPTIONS = [
  ['green', '#10b981'], ['slate', '#64748b'], ['amber', '#f59e0b'],
  ['sky', '#0ea5e9'], ['violet', '#8b5cf6'], ['rose', '#f43f5e'],
] as const

function StatusSettingsEditor({
  value,
  colors,
  resetStatuses,
  trackedStatus,
  onChange,
}: {
  value: string
  colors: Record<string, string>
  resetStatuses: string[]
  trackedStatus: string
  onChange(statuses: string[], colors: Record<string, string>, resetStatuses: string[], trackedStatus: string): void
}) {
  const { colors: themeColors, commonStyles } = useTheme()
  const styles = createStyles(themeColors, commonStyles)
  const [newStatus, setNewStatus] = useState('')
  const statuses = value.split(/[،,]/).map(status => status.trim()).filter(Boolean)

  const updateStatuses = (next: string[]) => {
    const nextColors = Object.fromEntries(next.map(status => [status, colors[status] || 'violet']))
    onChange(next, nextColors, resetStatuses.filter(status => next.includes(status)), next.includes(trackedStatus) ? trackedStatus : next[0])
  }

  return (
    <View style={styles.statusSettings}>
      <Text style={styles.statusSettingsTitle}>حالات الحضور وترتيبها وألوانها</Text>
      {statuses.map((status, index) => (
        <View key={status} style={styles.statusSettingRow}>
          <Text style={styles.statusSettingName}>{index + 1}. {status}</Text>
          <View style={styles.statusColorChoices}>
            {STATUS_COLOR_OPTIONS.map(([key, color]) => (
              <TouchableOpacity
                key={key}
                accessibilityLabel={`اختيار لون ${key} لحالة ${status}`}
                accessibilityState={{ selected: (colors[status] || 'violet') === key }}
                onPress={() => onChange(statuses, { ...colors, [status]: key }, resetStatuses, trackedStatus)}
                style={[styles.statusColor, { backgroundColor: color }, (colors[status] || 'violet') === key && styles.statusColorSelected]}
              />
            ))}
          </View>
          <View style={styles.statusActions}>
            <TouchableOpacity disabled={index === 0} onPress={() => {
              const next = [...statuses]
              ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
              updateStatuses(next)
            }} style={[styles.smallStatusButton, index === 0 && { opacity: 0.3 }]}><Text style={styles.smallStatusButtonText}>↑</Text></TouchableOpacity>
            <TouchableOpacity disabled={index === statuses.length - 1} onPress={() => {
              const next = [...statuses]
              ;[next[index + 1], next[index]] = [next[index], next[index + 1]]
              updateStatuses(next)
            }} style={[styles.smallStatusButton, index === statuses.length - 1 && { opacity: 0.3 }]}><Text style={styles.smallStatusButtonText}>↓</Text></TouchableOpacity>
            <TouchableOpacity disabled={statuses.length === 1} onPress={() => updateStatuses(statuses.filter(item => item !== status))} style={styles.smallStatusButton}><Text style={[styles.smallStatusButtonText, { color: themeColors.danger }]}>حذف</Text></TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={() => onChange(statuses, colors, resetStatuses.filter(item => item !== status), status)}
            style={[styles.resetStatusToggle, trackedStatus === status && styles.resetStatusToggleActive]}
          >
            <Text style={styles.resetStatusToggleText}>{trackedStatus === status ? '✓ الحالة التي يتم عدّها' : 'استخدمها لعداد التنبيه'}</Text>
          </TouchableOpacity>
          {status !== trackedStatus ? (
            <TouchableOpacity
              onPress={() => onChange(statuses, colors, resetStatuses.includes(status) ? resetStatuses.filter(item => item !== status) : [...resetStatuses, status], trackedStatus)}
              style={[styles.resetStatusToggle, resetStatuses.includes(status) && styles.resetStatusToggleActive]}
            >
              <Text style={styles.resetStatusToggleText}>{resetStatuses.includes(status) ? '✓ يصفّر عداد الحالة' : 'لا يصفّر العداد'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ))}
      <View style={styles.addStatusRow}>
        <TextInput value={newStatus} onChangeText={setNewStatus} placeholder="حالة جديدة" placeholderTextColor={themeColors.muted} style={[commonStyles.input, { flex: 1 }]} />
        <TouchableOpacity onPress={() => {
          const status = newStatus.trim()
          if (!status || statuses.includes(status)) return
          setNewStatus('')
          onChange([...statuses, status], { ...colors, [status]: 'violet' }, resetStatuses, trackedStatus)
        }} style={styles.addStatusButton}><Text style={styles.addStatusButtonText}>إضافة</Text></TouchableOpacity>
      </View>
    </View>
  )
}

function defaultValue(screen: string, field: string) {
  const defaults: Record<string, Record<string, any>> = {
    students: { status: 'مقيد' },
    users: { role: 'sheikh' },
    invitations: { role: 'sheikh', expires_hours: 48 },
    filters: { data: '[]' },
  }
  return defaults[screen]?.[field] ?? ''
}

function editorEndpoint(screen: string, item: Record<string, any> | null) {
  if (screen === 'settings') return '/tahfiz/settings'
  const roots: Record<string, string> = {
    students: '/students',
    sheikhs: '/sheikhs',
    users: '/users',
    invitations: '/invitations/',
    filters: '/saved-filters/',
  }
  const root = roots[screen]
  return item?.id && screen !== 'invitations'
    ? `${root.replace(/\/$/, '')}/${item.id}`
    : root
}

function deleteEndpoint(screen: string, id: number) {
  const roots: Record<string, string> = {
    students: '/students',
    sheikhs: '/sheikhs',
    users: '/users',
    filters: '/saved-filters',
  }
  return `${roots[screen]}/${id}`
}

function displayTitle(item: any, index: number) {
  return item.name ?? item.student_name ?? item.username ?? item.tahfiz_name ?? item.date ?? `سجل ${index + 1}`
}

function visibleField(key: string, value: unknown) {
  return !['id', 'name', 'student_name', 'username', 'profile_pic', 'before', 'after'].includes(key)
    && ['string', 'number', 'boolean'].includes(typeof value)
}

function formatValue(value: unknown) {
  if (typeof value === 'boolean') return value ? 'نعم' : 'لا'
  return String(value ?? '—')
}

function fieldLabel(key: string) {
  const labels: Record<string, string> = {
    phone: 'الهاتف', status: 'الحالة', role: 'الصلاحية', sheikh_name: 'الشيخ',
    attendance_rate: 'نسبة الحضور', total_sessions: 'الحلقات', present: 'حاضر',
    absent: 'غياب', average_quality: 'متوسط التقييم', entries: 'المدخلات',
    created_at: 'تاريخ الإنشاء', expires_at: 'انتهاء الدعوة',
  }
  return labels[key] ?? key.replaceAll('_', ' ')
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors'], commonStyles: ReturnType<typeof useTheme>['commonStyles']) => StyleSheet.create({
  error: { color: colors.warning, textAlign: 'right', fontWeight: '800' },
  itemHeading: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  itemTitle: { flex: 1, color: colors.text, textAlign: 'right', fontSize: 17, fontWeight: '900' },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primarySurface },
  field: { flexDirection: 'row-reverse', justifyContent: 'space-between', gap: 12 },
  fieldLabel: { color: colors.muted, fontSize: 12, textAlign: 'right' },
  fieldValue: { color: colors.text, fontSize: 12, fontWeight: '700', flexShrink: 1, textAlign: 'left' },
  editHint: { color: colors.primary, fontSize: 11, fontWeight: '700', textAlign: 'right', marginTop: 4 },
  studentLinks: { flexDirection: 'row-reverse', gap: 8 },
  progressLink: { flex: 1, backgroundColor: colors.primarySurface, borderRadius: 10, padding: 10, marginTop: 4 },
  progressLinkText: { color: colors.primaryDark, fontWeight: '900', fontSize: 12, textAlign: 'center' },
  orderButtons: { flexDirection: 'row-reverse', gap: 8 },
  orderButton: { flex: 1, minHeight: 36, borderWidth: 1, borderColor: colors.border, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  orderButtonText: { color: colors.text, fontWeight: '800', fontSize: 11 },
  statusSettings: { ...commonStyles.card, gap: 10 },
  statusSettingsTitle: { color: colors.text, textAlign: 'right', fontWeight: '900' },
  statusSettingRow: { borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 10, gap: 9 },
  statusSettingName: { color: colors.text, textAlign: 'right', fontWeight: '900' },
  statusColorChoices: { flexDirection: 'row-reverse', gap: 9, justifyContent: 'flex-start' },
  statusColor: { width: 25, height: 25, borderRadius: 13 },
  statusColorSelected: { borderWidth: 3, borderColor: colors.text },
  statusActions: { flexDirection: 'row-reverse', gap: 7 },
  smallStatusButton: { minWidth: 40, minHeight: 34, paddingHorizontal: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  smallStatusButtonText: { color: colors.text, fontWeight: '900', fontSize: 11 },
  resetStatusToggle: { borderRadius: 9, padding: 8, backgroundColor: colors.surfaceMuted },
  resetStatusToggleActive: { backgroundColor: colors.primarySurface },
  resetStatusToggleText: { color: colors.text, textAlign: 'right', fontWeight: '700', fontSize: 11 },
  addStatusRow: { flexDirection: 'row-reverse', gap: 8, alignItems: 'center' },
  addStatusButton: { minHeight: 48, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  addStatusButtonText: { color: '#fff', fontWeight: '900' },
  switchRow: { ...commonStyles.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { color: colors.text, fontWeight: '800', textAlign: 'right' },
  editorSectionHeader: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  editorSectionTitle: { color: colors.primaryDark, fontSize: 16, fontWeight: '900', textAlign: 'right' },
  photoEditor: { ...commonStyles.card, alignItems: 'center', gap: 12 },
  photoPreview: { width: 112, height: 112, borderRadius: 56, backgroundColor: colors.primarySurface },
  photoPlaceholder: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  photoPlaceholderText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  photoButton: { minHeight: 44, alignSelf: 'stretch', borderRadius: 12, backgroundColor: colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  photoButtonText: { color: colors.primaryDark, fontWeight: '900', textAlign: 'center' },
  deleteButton: { minHeight: 50, borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.dangerSurface, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: colors.danger, fontWeight: '900' },
  cancelButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
})

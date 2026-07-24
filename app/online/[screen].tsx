import { Stack, useLocalSearchParams } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
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
import { useTheme } from '../../src/theme'

export default function OnlineDataScreen() {
  const params = useLocalSearchParams<{ screen?: string; endpoint?: string; label?: string }>()
  const { activeTahfizId } = useApp()
  const { colors, commonStyles } = useTheme()
  const styles = createStyles(colors, commonStyles)
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Record<string, any> | null | undefined>(undefined)

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

  const items = Array.isArray(data)
    ? data
    : Array.isArray(data?.students)
      ? data.students
      : data ? [data] : []
  const canEdit = ['students', 'sheikhs', 'users', 'invitations', 'settings', 'filters'].includes(params.screen ?? '')
  const createOnly = params.screen === 'invitations' || params.screen === 'filters'

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
            <Text style={styles.itemTitle}>{displayTitle(item, index)}</Text>
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
    { key: 'name', label: 'اسم التحفيظ' },
    { key: 'description', label: 'الوصف' },
    { key: 'contact_phone', label: 'هاتف التواصل', keyboard: 'phone-pad' },
    { key: 'max_warnings', label: 'الحد الأقصى للإنذارات', keyboard: 'number-pad' },
    { key: 'week_start_day', label: 'بداية الأسبوع ٠-٦', keyboard: 'number-pad' },
    { key: 'month_start_day', label: 'بداية الشهر ١-٢٨', keyboard: 'number-pad' },
    { key: 'attendance_statuses', label: 'حالات الحضور مفصولة بفاصلة' },
    { key: 'progress_tracking_enabled', label: 'تفعيل متابعة القرآن', boolean: true },
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
      const raw = item?.[field.key]
      next[field.key] = field.key === 'attendance_statuses' && Array.isArray(raw)
        ? raw.join('، ')
        : raw ?? defaultValue(screen, field.key)
    }
    setValues(next)
  }, [item, screen])

  const save = async () => {
    if (!tahfizId && screen !== 'platform') return
    const body: Record<string, any> = {}
    for (const field of fields) {
      const raw = values[field.key]
      if (field.key === 'password' && item && !raw) continue
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
    if (screen === 'students' && !item) body.parent_phones = []
    setBusy(true)
    try {
      const endpoint = editorEndpoint(screen, item ?? null)
      await api.mutate(endpoint, item && !['invitations', 'filters'].includes(screen) ? 'PUT' : 'POST', tahfizId, body)
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

  return (
    <Modal visible={item !== undefined} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.content} keyboardShouldPersistTaps="handled">
        <Text style={commonStyles.title}>{item ? 'تعديل السجل' : 'إضافة سجل'}</Text>
        {fields.map((field) => field.boolean ? (
          <View key={field.key} style={styles.switchRow}>
            <Switch value={Boolean(values[field.key])} onValueChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))} />
            <Text style={styles.switchLabel}>{field.label}</Text>
          </View>
        ) : (
          <TextInput
            key={field.key}
            value={values[field.key] === null || values[field.key] === undefined ? '' : String(values[field.key])}
            onChangeText={(value) => setValues((current) => ({ ...current, [field.key]: value }))}
            placeholder={field.label}
            secureTextEntry={field.secure}
            keyboardType={field.keyboard ?? 'default'}
            autoCapitalize={field.key === 'username' || field.key === 'role' ? 'none' : 'sentences'}
            style={commonStyles.input}
          />
        ))}
        <TouchableOpacity disabled={busy} style={commonStyles.button} onPress={() => void save()}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={commonStyles.buttonText}>حفظ</Text>}
        </TouchableOpacity>
        {item?.id && !['settings', 'invitations', 'filters'].includes(screen) ? (
          <TouchableOpacity disabled={busy} style={styles.deleteButton} onPress={remove}>
            <Text style={styles.deleteText}>حذف السجل</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.cancelButton} onPress={onClose}><Text style={commonStyles.subtitle}>إلغاء</Text></TouchableOpacity>
      </ScrollView>
    </Modal>
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
  return item?.id && !['invitations', 'filters'].includes(screen) ? `${root}/${item.id}` : root
}

function deleteEndpoint(screen: string, id: number) {
  const roots: Record<string, string> = { students: '/students', sheikhs: '/sheikhs', users: '/users' }
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
  itemTitle: { color: colors.text, textAlign: 'right', fontSize: 17, fontWeight: '900' },
  field: { flexDirection: 'row-reverse', justifyContent: 'space-between', gap: 12 },
  fieldLabel: { color: colors.muted, fontSize: 12, textAlign: 'right' },
  fieldValue: { color: colors.text, fontSize: 12, fontWeight: '700', flexShrink: 1, textAlign: 'left' },
  editHint: { color: colors.primary, fontSize: 11, fontWeight: '700', textAlign: 'right', marginTop: 4 },
  switchRow: { ...commonStyles.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { color: colors.text, fontWeight: '800', textAlign: 'right' },
  deleteButton: { minHeight: 50, borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.dangerSurface, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: colors.danger, fontWeight: '900' },
  cancelButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
})

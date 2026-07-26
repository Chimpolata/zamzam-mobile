import { useFocusEffect, useRouter } from 'expo-router'
import React, { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

import { useApp } from '../src/context/AppContext'
import { api } from '../src/lib/api'
import { shareDatabaseExport } from '../src/lib/database-export'
import { useTheme } from '../src/theme'

type TahfizStatus = 'pending' | 'active' | 'rejected' | 'suspended'
type PlatformAction = 'approve' | 'reject' | 'suspend' | 'reactivate'

interface PlatformTahfiz {
  id: number
  name: string
  contact_phone: string | null
  status: TahfizStatus
  status_reason: string | null
  owner_username: string | null
  created_at: string
  approved_at: string | null
}

interface PlatformMembership {
  id: number
  tahfiz_id: number
  tahfiz_name: string
  tahfiz_status: TahfizStatus
  role: 'admin' | 'sheikh'
  sheikh_id: number | null
  is_active: boolean
}

interface PlatformUser {
  id: number
  username: string
  is_active: boolean
  default_tahfiz_id: number | null
  memberships: PlatformMembership[]
}

const statusLabels: Record<TahfizStatus, string> = {
  pending: 'قيد المراجعة',
  active: 'نشط',
  rejected: 'مرفوض',
  suspended: 'موقوف',
}

export default function PlatformScreen() {
  const router = useRouter()
  const { user, switchTahfiz } = useApp()
  const { colors, commonStyles } = useTheme()
  const styles = createStyles(colors, commonStyles)
  const [items, setItems] = useState<PlatformTahfiz[]>([])
  const [users, setUsers] = useState<PlatformUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | TahfizStatus>('all')
  const [section, setSection] = useState<'tahfiz' | 'users'>('tahfiz')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [reasonAction, setReasonAction] = useState<{ item: PlatformTahfiz; action: 'reject' | 'suspend' } | null>(null)
  const [reason, setReason] = useState('')
  const [selectedUser, setSelectedUser] = useState<PlatformUser | null>(null)
  const [granting, setGranting] = useState(false)
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async () => {
    if (user?.global_role !== 'super_admin') {
      router.replace('/(tabs)')
      return
    }
    setLoading(true)
    setError('')
    try {
      const [nextItems, nextUsers] = await Promise.all([
        api.get('/platform/tahfiz') as Promise<PlatformTahfiz[]>,
        api.get('/platform/users') as Promise<PlatformUser[]>,
      ])
      setItems(nextItems)
      setUsers(nextUsers)
      if (selectedUser) {
        setSelectedUser(nextUsers.find((item) => item.id === selectedUser.id) ?? null)
      }
    } catch (reasonValue) {
      setError(reasonValue instanceof Error ? reasonValue.message : 'تعذر تحميل بيانات المنصة')
    } finally {
      setLoading(false)
    }
  }, [user?.global_role, router, selectedUser?.id])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ar')
    return items.filter((item) => (
      (status === 'all' || item.status === status)
      && (!normalized || [item.name, item.owner_username ?? '', item.contact_phone ?? '']
        .some((value) => value.toLocaleLowerCase('ar').includes(normalized)))
    ))
  }, [items, query, status])

  const visibleUsers = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ar')
    return users.filter((item) => !normalized || item.username.toLocaleLowerCase('ar').includes(normalized))
  }, [users, query])

  const runAction = async (item: PlatformTahfiz, action: PlatformAction, actionReason?: string) => {
    setBusyId(item.id)
    try {
      await api.mutate(`/platform/tahfiz/${item.id}/${action}`, 'POST', undefined, {
        reason: actionReason?.trim() || null,
      })
      setReasonAction(null)
      setReason('')
      await load()
    } catch (reasonValue) {
      Alert.alert('تعذر تنفيذ الإجراء', reasonValue instanceof Error ? reasonValue.message : 'حاول مرة أخرى')
    } finally {
      setBusyId(null)
    }
  }

  const openSupport = async (item: PlatformTahfiz) => {
    setBusyId(item.id)
    try {
      await api.mutate(`/platform/tahfiz/${item.id}/support-access`, 'POST', undefined)
      await switchTahfiz(item.id)
      router.replace('/(tabs)')
    } catch (reasonValue) {
      Alert.alert('تعذر فتح مساحة الدعم', reasonValue instanceof Error ? reasonValue.message : 'حاول مرة أخرى')
      setBusyId(null)
    }
  }

  const revokeMembership = (membership: PlatformMembership) => {
    if (!selectedUser) return
    Alert.alert(
      'إلغاء الصلاحية',
      `إلغاء وصول ${selectedUser.username} إلى ${membership.tahfiz_name}؟`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'إلغاء الوصول',
          style: 'destructive',
          onPress: async () => {
            setGranting(true)
            try {
              await api.mutate(
                `/platform/users/${selectedUser.id}/memberships/${membership.tahfiz_id}`,
                'DELETE',
                undefined,
              )
              await load()
            } catch (reasonValue) {
              Alert.alert('تعذر إلغاء الصلاحية', reasonValue instanceof Error ? reasonValue.message : 'حاول مرة أخرى')
            } finally {
              setGranting(false)
            }
          },
        },
      ],
    )
  }

  const grantMembership = async (tahfiz: PlatformTahfiz) => {
    if (!selectedUser) return
    setGranting(true)
    try {
      await api.mutate(`/platform/users/${selectedUser.id}/memberships`, 'POST', undefined, {
        tahfiz_id: tahfiz.id,
        role: 'admin',
        sheikh_id: null,
      })
      await load()
    } catch (reasonValue) {
      Alert.alert('تعذر منح الصلاحية', reasonValue instanceof Error ? reasonValue.message : 'حاول مرة أخرى')
    } finally {
      setGranting(false)
    }
  }

  const counts = {
    all: items.length,
    pending: items.filter((item) => item.status === 'pending').length,
    active: items.filter((item) => item.status === 'active').length,
    attention: items.filter((item) => item.status === 'rejected' || item.status === 'suspended').length,
  }
  const listData: Array<PlatformTahfiz | PlatformUser> = section === 'tahfiz' ? visibleItems : visibleUsers
  const exportPlatformDatabase = async () => {
    setExporting(true)
    try {
      await shareDatabaseExport({
        path: '/export-db',
        fileName: 'zamzam-platform-full.db',
      })
    } catch (reasonValue) {
      Alert.alert('تعذر التصدير', reasonValue instanceof Error ? reasonValue.message : 'حاول مرة أخرى')
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <FlatList<PlatformTahfiz | PlatformUser>
        style={commonStyles.screen}
        contentContainerStyle={commonStyles.content}
        data={listData}
        keyExtractor={(item) => `${section}-${item.id}`}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
        ListHeaderComponent={(
          <View style={styles.header}>
            <Text style={commonStyles.title}>لوحة منصة زمزم</Text>
            <Text style={commonStyles.subtitle}>مراجعة الحسابات وإدارة صلاحيات الوصول ومساحات الدعم.</Text>
            <TouchableOpacity
              disabled={exporting}
              style={[commonStyles.button, exporting && styles.disabled]}
              onPress={() => void exportPlatformDatabase()}
            >
              {exporting
                ? <ActivityIndicator color="#fff" />
                : <Text style={commonStyles.buttonText}>تصدير قاعدة بيانات المنصة كاملة</Text>}
            </TouchableOpacity>
            <View style={styles.summary}>
              <Stat label="الكل" value={counts.all} />
              <Stat label="نشطة" value={counts.active} />
              <Stat label="قيد المراجعة" value={counts.pending} warning={counts.pending > 0} />
              <Stat label="تحتاج متابعة" value={counts.attention} danger={counts.attention > 0} />
            </View>
            <View style={styles.sections}>
              <SectionButton label="حسابات التحفيظ" active={section === 'tahfiz'} onPress={() => setSection('tahfiz')} />
              <SectionButton label="صلاحيات المستخدمين" active={section === 'users'} onPress={() => setSection('users')} />
            </View>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={section === 'tahfiz' ? 'بحث بالاسم أو المستخدم أو الهاتف' : 'بحث باسم المستخدم'}
              style={commonStyles.input}
            />
            {section === 'tahfiz' ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
                {(['all', 'pending', 'active', 'suspended', 'rejected'] as const).map((value) => (
                  <TouchableOpacity
                    key={value}
                    onPress={() => setStatus(value)}
                    style={[styles.filter, status === value && styles.filterActive]}
                  >
                    <Text style={[styles.filterText, status === value && styles.filterTextActive]}>
                      {value === 'all' ? 'الكل' : statusLabels[value]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {loading && items.length === 0 ? <ActivityIndicator color={colors.primary} /> : null}
          </View>
        )}
        ListEmptyComponent={!loading ? (
          <View style={commonStyles.card}><Text style={commonStyles.subtitle}>لا توجد نتائج مطابقة.</Text></View>
        ) : null}
        renderItem={({ item }) => section === 'tahfiz' && 'status' in item
          ? (
            <TahfizCard
              item={item}
              busy={busyId === item.id}
              onAction={(action) => {
                if (action === 'reject' || action === 'suspend') {
                  setReason('')
                  setReasonAction({ item, action })
                } else {
                  void runAction(item, action)
                }
              }}
              onSupport={() => void openSupport(item)}
            />
          ) : (
            <TouchableOpacity style={commonStyles.card} onPress={() => setSelectedUser(item as PlatformUser)}>
              <Text style={styles.userName}>{(item as PlatformUser).username}</Text>
              <Text style={commonStyles.subtitle}>
                {(item as PlatformUser).memberships.filter((membership) => membership.is_active).length} صلاحيات نشطة
              </Text>
              <Text style={styles.editHint}>اضغط لإدارة الوصول</Text>
            </TouchableOpacity>
          )}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      />

      <Modal visible={Boolean(reasonAction)} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setReasonAction(null)}>
        <View style={[commonStyles.screen, commonStyles.content]}>
          <Text style={commonStyles.title}>{reasonAction?.action === 'reject' ? 'رفض طلب التحفيظ' : 'إيقاف حساب التحفيظ'}</Text>
          <Text style={commonStyles.subtitle}>{reasonAction?.item.name}</Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            multiline
            autoFocus
            placeholder="اكتب سبباً واضحاً يظهر لمدير التحفيظ"
            style={[commonStyles.input, styles.reasonInput]}
            textAlignVertical="top"
          />
          <TouchableOpacity
            disabled={!reason.trim() || busyId === reasonAction?.item.id}
            style={[commonStyles.button, !reason.trim() && styles.disabled]}
            onPress={() => reasonAction && void runAction(reasonAction.item, reasonAction.action, reason)}
          >
            <Text style={commonStyles.buttonText}>تأكيد الإجراء</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancel} onPress={() => setReasonAction(null)}>
            <Text style={commonStyles.subtitle}>إلغاء</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal visible={Boolean(selectedUser)} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedUser(null)}>
        <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.content}>
          <Text style={commonStyles.title}>صلاحيات {selectedUser?.username}</Text>
          <Text style={commonStyles.subtitle}>يمكن ربط الحساب بأكثر من تحفيظ بصلاحية مدير.</Text>
          {selectedUser?.memberships.filter((membership) => membership.is_active).map((membership) => (
            <View key={membership.id} style={styles.membership}>
              <View style={{ flex: 1 }}>
                <Text style={styles.membershipName}>{membership.tahfiz_name}</Text>
                <Text style={commonStyles.subtitle}>{membership.role === 'admin' ? 'مدير' : 'شيخ'}</Text>
              </View>
              <TouchableOpacity disabled={granting} onPress={() => revokeMembership(membership)}>
                <Text style={styles.revoke}>إلغاء</Text>
              </TouchableOpacity>
            </View>
          ))}
          <Text style={styles.sectionTitle}>منح صلاحية مدير</Text>
          {items
            .filter((item) => item.status === 'active'
              && !selectedUser?.memberships.some((membership) => membership.tahfiz_id === item.id && membership.is_active))
            .map((item) => (
              <TouchableOpacity key={item.id} disabled={granting} style={styles.grant} onPress={() => void grantMembership(item)}>
                <Text style={styles.grantText}>{item.name}</Text>
                <Text style={styles.add}>+ منح</Text>
              </TouchableOpacity>
            ))}
          <TouchableOpacity style={styles.cancel} onPress={() => setSelectedUser(null)}>
            <Text style={commonStyles.subtitle}>إغلاق</Text>
          </TouchableOpacity>
        </ScrollView>
      </Modal>
    </>
  )
}

function TahfizCard({
  item,
  busy,
  onAction,
  onSupport,
}: {
  item: PlatformTahfiz
  busy: boolean
  onAction(action: PlatformAction): void
  onSupport(): void
}) {
  const { colors, commonStyles } = useTheme()
  const styles = createStyles(colors, commonStyles)
  return (
    <View style={commonStyles.card}>
      <View style={styles.tahfizHeader}>
        <Text style={styles.status}>{statusLabels[item.status]}</Text>
        <Text style={styles.tahfizName}>{item.name}</Text>
      </View>
      <Text style={commonStyles.subtitle}>المستخدم: {item.owner_username || 'غير محدد'}</Text>
      <Text style={commonStyles.subtitle}>التواصل: {item.contact_phone || 'غير محدد'}</Text>
      <Text style={commonStyles.subtitle}>
        تاريخ الطلب: {new Date(item.created_at).toLocaleDateString('ar-EG')}
      </Text>
      {item.status_reason ? <Text style={styles.statusReason}>السبب: {item.status_reason}</Text> : null}
      <View style={styles.actions}>
        {item.status === 'pending' ? (
          <>
            <Action label="موافقة وتفعيل" disabled={busy} primary onPress={() => onAction('approve')} />
            <Action label="رفض" disabled={busy} danger onPress={() => onAction('reject')} />
          </>
        ) : null}
        {item.status === 'active' ? (
          <>
            <Action label="دخول للدعم" disabled={busy} primary onPress={onSupport} />
            <Action label="إيقاف الحساب" disabled={busy} danger onPress={() => onAction('suspend')} />
          </>
        ) : null}
        {item.status === 'rejected' || item.status === 'suspended' ? (
          <Action label="إعادة التفعيل" disabled={busy} primary onPress={() => onAction('reactivate')} />
        ) : null}
      </View>
    </View>
  )
}

function Action({ label, disabled, primary, danger, onPress }: {
  label: string
  disabled: boolean
  primary?: boolean
  danger?: boolean
  onPress(): void
}) {
  const { colors, commonStyles } = useTheme()
  const styles = createStyles(colors, commonStyles)
  return (
    <TouchableOpacity
      disabled={disabled}
      onPress={onPress}
      style={[styles.action, primary && styles.actionPrimary, danger && styles.actionDanger, disabled && styles.disabled]}
    >
      <Text style={[styles.actionText, primary && styles.actionPrimaryText, danger && styles.actionDangerText]}>{label}</Text>
    </TouchableOpacity>
  )
}

function Stat({ label, value, warning, danger }: { label: string; value: number; warning?: boolean; danger?: boolean }) {
  const { colors, commonStyles } = useTheme()
  const styles = createStyles(colors, commonStyles)
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, warning && { color: colors.warning }, danger && { color: colors.danger }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

function SectionButton({ label, active, onPress }: { label: string; active: boolean; onPress(): void }) {
  const { colors, commonStyles } = useTheme()
  const styles = createStyles(colors, commonStyles)
  return (
    <TouchableOpacity onPress={onPress} style={[styles.sectionButton, active && styles.sectionButtonActive]}>
      <Text style={[styles.sectionButtonText, active && styles.sectionButtonTextActive]}>{label}</Text>
    </TouchableOpacity>
  )
}

const createStyles = (
  colors: ReturnType<typeof useTheme>['colors'],
  commonStyles: ReturnType<typeof useTheme>['commonStyles'],
) => StyleSheet.create({
  header: { gap: 12, marginBottom: 10 },
  summary: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  stat: {
    width: '48%', minHeight: 78, borderRadius: 14, backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  statValue: { color: colors.primary, fontWeight: '900', fontSize: 23 },
  statLabel: { color: colors.muted, fontSize: 11 },
  sections: { flexDirection: 'row-reverse', gap: 8 },
  sectionButton: {
    flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input,
  },
  sectionButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  sectionButtonText: { color: colors.text, fontWeight: '800', fontSize: 12 },
  sectionButtonTextActive: { color: '#fff' },
  filters: { flexDirection: 'row-reverse', gap: 8 },
  filter: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9 },
  filterActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.text, fontWeight: '800', fontSize: 12 },
  filterTextActive: { color: '#fff' },
  error: { color: colors.danger, backgroundColor: colors.dangerSurface, borderRadius: 12, padding: 10, textAlign: 'right' },
  tahfizHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 8 },
  tahfizName: { flex: 1, color: colors.text, textAlign: 'right', fontWeight: '900', fontSize: 18 },
  status: { color: colors.primaryDark, backgroundColor: colors.primarySurface, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, fontWeight: '900', fontSize: 11 },
  statusReason: { color: colors.warning, backgroundColor: colors.warningSurface, borderRadius: 10, padding: 9, textAlign: 'right', marginTop: 8 },
  actions: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  action: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  actionPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  actionDanger: { backgroundColor: colors.dangerSurface, borderColor: colors.danger },
  actionText: { color: colors.text, fontWeight: '800', fontSize: 12 },
  actionPrimaryText: { color: '#fff' },
  actionDangerText: { color: colors.danger },
  disabled: { opacity: 0.5 },
  reasonInput: { minHeight: 140, paddingTop: 14 },
  cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  userName: { color: colors.text, fontWeight: '900', fontSize: 17, textAlign: 'right' },
  editHint: { color: colors.primary, fontSize: 11, fontWeight: '800', textAlign: 'right', marginTop: 8 },
  membership: { ...commonStyles.card, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  membershipName: { color: colors.text, fontWeight: '900', textAlign: 'right' },
  revoke: { color: colors.danger, fontWeight: '900', padding: 8 },
  sectionTitle: { color: colors.text, fontWeight: '900', textAlign: 'right', marginTop: 8 },
  grant: { ...commonStyles.card, flexDirection: 'row-reverse', alignItems: 'center' },
  grantText: { flex: 1, color: colors.text, fontWeight: '800', textAlign: 'right' },
  add: { color: colors.primary, fontWeight: '900' },
})

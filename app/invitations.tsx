import { useFocusEffect } from 'expo-router'
import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

import { useApp } from '../src/context/AppContext'
import { api } from '../src/lib/api'
import { useTheme } from '../src/theme'

interface InvitationRow {
  id: number
  role: 'admin' | 'sheikh'
  sheikh_id: number | null
  sheikh_name: string | null
  creator_username: string | null
  status: 'active' | 'used' | 'revoked' | 'expired'
  expires_at: string
}

interface SheikhRow {
  id: number
  name: string
}

interface ShareableInvitation extends InvitationRow {
  token: string
  path: string
}

const statusLabels = {
  active: 'نشطة',
  used: 'مقبولة',
  revoked: 'ملغاة',
  expired: 'منتهية',
}

export default function InvitationsScreen() {
  const { activeTahfizId } = useApp()
  const { colors, commonStyles } = useTheme()
  const styles = createStyles(colors)
  const [items, setItems] = useState<InvitationRow[]>([])
  const [sheikhs, setSheikhs] = useState<SheikhRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editorOpen, setEditorOpen] = useState(false)
  const [role, setRole] = useState<'admin' | 'sheikh'>('sheikh')
  const [sheikhId, setSheikhId] = useState<number | null>(null)
  const [hours, setHours] = useState(48)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!activeTahfizId) return
    setLoading(true)
    try {
      const [nextItems, nextSheikhs] = await Promise.all([
        api.get('/invitations/', activeTahfizId) as Promise<InvitationRow[]>,
        api.get('/sheikhs', activeTahfizId) as Promise<SheikhRow[]>,
      ])
      setItems(nextItems)
      setSheikhs(nextSheikhs)
    } catch (reason) {
      Alert.alert('تعذر تحميل الدعوات', reason instanceof Error ? reason.message : 'تحقق من الاتصال')
    } finally {
      setLoading(false)
    }
  }, [activeTahfizId])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  const shareInvitation = async (invitation: ShareableInvitation) => {
    const url = `https://zamzam-web.fly.dev${invitation.path}`
    await Share.share({
      title: 'دعوة للانضمام إلى زمزم',
      message: `دعوة للانضمام إلى التحفيظ عبر زمزم:\n${url}`,
      url,
    })
  }

  const create = async () => {
    if (!activeTahfizId) return
    setBusy(true)
    try {
      const invitation = await api.mutate('/invitations/', 'POST', activeTahfizId, {
        role,
        sheikh_id: role === 'sheikh' ? sheikhId : null,
        expires_hours: hours,
      }) as ShareableInvitation
      setEditorOpen(false)
      await load()
      await shareInvitation(invitation)
    } catch (reason) {
      Alert.alert('تعذر إنشاء الدعوة', reason instanceof Error ? reason.message : 'تحقق من البيانات')
    } finally {
      setBusy(false)
    }
  }

  const resend = async (item: InvitationRow) => {
    if (!activeTahfizId) return
    setBusy(true)
    try {
      const invitation = await api.mutate(`/invitations/${item.id}/resend`, 'POST', activeTahfizId) as ShareableInvitation
      await load()
      await shareInvitation(invitation)
    } catch (reason) {
      Alert.alert('تعذر إعادة إصدار الدعوة', reason instanceof Error ? reason.message : 'حاول مرة أخرى')
    } finally {
      setBusy(false)
    }
  }

  const revoke = (item: InvitationRow) => {
    if (!activeTahfizId) return
    Alert.alert('إلغاء الدعوة', 'لن يعمل رابط الدعوة بعد الإلغاء. هل تريد المتابعة؟', [
      { text: 'تراجع', style: 'cancel' },
      {
        text: 'إلغاء الدعوة',
        style: 'destructive',
        onPress: async () => {
          setBusy(true)
          try {
            await api.mutate(`/invitations/${item.id}`, 'DELETE', activeTahfizId)
            await load()
          } catch (reason) {
            Alert.alert('تعذر إلغاء الدعوة', reason instanceof Error ? reason.message : 'حاول مرة أخرى')
          } finally {
            setBusy(false)
          }
        },
      },
    ])
  }

  return (
    <>
      <FlatList
        style={commonStyles.screen}
        contentContainerStyle={commonStyles.content}
        data={items}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={(
          <View style={styles.header}>
            <Text style={commonStyles.title}>دعوات الانضمام</Text>
            <Text style={commonStyles.subtitle}>أنشئ روابط مؤقتة وشاركها من الجهاز، أو ألغِها وأعد إصدارها.</Text>
            <TouchableOpacity style={commonStyles.button} onPress={() => setEditorOpen(true)}>
              <Text style={commonStyles.buttonText}>إنشاء دعوة جديدة</Text>
            </TouchableOpacity>
            {loading ? <ActivityIndicator color={colors.primary} /> : null}
          </View>
        )}
        ListEmptyComponent={!loading ? (
          <View style={commonStyles.card}><Text style={commonStyles.subtitle}>لا توجد دعوات بعد.</Text></View>
        ) : null}
        renderItem={({ item }) => (
          <View style={commonStyles.card}>
            <View style={styles.rowHeader}>
              <Text style={[styles.status, item.status === 'active' && styles.statusActive]}>{statusLabels[item.status]}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>
                  {item.role === 'admin' ? 'دعوة مدير' : `دعوة شيخ${item.sheikh_name ? ` — ${item.sheikh_name}` : ''}`}
                </Text>
                <Text style={commonStyles.subtitle}>أنشأها {item.creator_username || '—'}</Text>
              </View>
            </View>
            <Text style={styles.expiry}>تنتهي {new Date(item.expires_at).toLocaleString('ar-EG')}</Text>
            {item.status !== 'used' ? (
              <View style={styles.actions}>
                <TouchableOpacity disabled={busy} style={styles.resend} onPress={() => void resend(item)}>
                  <Text style={styles.resendText}>إعادة إصدار ومشاركة</Text>
                </TouchableOpacity>
                {item.status === 'active' ? (
                  <TouchableOpacity disabled={busy} style={styles.revoke} onPress={() => revoke(item)}>
                    <Text style={styles.revokeText}>إلغاء</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      />

      <Modal visible={editorOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditorOpen(false)}>
        <View style={[commonStyles.screen, commonStyles.content]}>
          <Text style={commonStyles.title}>دعوة جديدة</Text>
          <Text style={commonStyles.subtitle}>سيظهر نظام المشاركة فور إنشاء الرابط.</Text>
          <View style={styles.choices}>
            <Choice label="شيخ" active={role === 'sheikh'} onPress={() => setRole('sheikh')} />
            <Choice label="مدير" active={role === 'admin'} onPress={() => { setRole('admin'); setSheikhId(null) }} />
          </View>
          {role === 'sheikh' ? (
            <View style={commonStyles.card}>
              <Text style={styles.fieldLabel}>ربط الدعوة بشيخ (اختياري)</Text>
              <View style={styles.choices}>
                <Choice label="بدون ربط" active={sheikhId === null} onPress={() => setSheikhId(null)} />
                {sheikhs.map((item) => (
                  <Choice key={item.id} label={item.name} active={sheikhId === item.id} onPress={() => setSheikhId(item.id)} />
                ))}
              </View>
            </View>
          ) : null}
          <TextInput
            value={String(hours)}
            onChangeText={(value) => setHours(Math.max(1, Math.min(168, Number(value) || 1)))}
            keyboardType="number-pad"
            placeholder="مدة الصلاحية بالساعات (١-١٦٨)"
            style={commonStyles.input}
          />
          <View style={styles.choices}>
            {[24, 48, 168].map((value) => (
              <Choice key={value} label={value === 24 ? 'يوم' : value === 48 ? 'يومان' : 'أسبوع'} active={hours === value} onPress={() => setHours(value)} />
            ))}
          </View>
          <TouchableOpacity disabled={busy} style={commonStyles.button} onPress={() => void create()}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={commonStyles.buttonText}>إنشاء ومشاركة الرابط</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancel} onPress={() => setEditorOpen(false)}>
            <Text style={commonStyles.subtitle}>إلغاء</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  )
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
  header: { gap: 12, marginBottom: 10 },
  rowHeader: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 8 },
  title: { color: colors.text, fontWeight: '900', fontSize: 16, textAlign: 'right' },
  status: { color: colors.muted, backgroundColor: colors.surfaceMuted, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, fontSize: 11, fontWeight: '900' },
  statusActive: { color: colors.success, backgroundColor: colors.successSurface },
  expiry: { color: colors.muted, fontSize: 11, textAlign: 'right', marginTop: 10 },
  actions: { flexDirection: 'row-reverse', gap: 8, marginTop: 12 },
  resend: { flex: 1, minHeight: 42, backgroundColor: colors.primarySurface, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  resendText: { color: colors.primaryDark, fontWeight: '800', fontSize: 12 },
  revoke: { minHeight: 42, paddingHorizontal: 18, backgroundColor: colors.dangerSurface, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  revokeText: { color: colors.danger, fontWeight: '900' },
  choices: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  choice: { minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, justifyContent: 'center', paddingHorizontal: 14 },
  choiceActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  choiceText: { color: colors.text, fontWeight: '800', fontSize: 12 },
  choiceTextActive: { color: '#fff' },
  fieldLabel: { color: colors.text, fontWeight: '900', textAlign: 'right', marginBottom: 10 },
  cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
})

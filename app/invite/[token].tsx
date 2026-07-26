import { useLocalSearchParams, useRouter } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'

import { useApp } from '../../src/context/AppContext'
import { api } from '../../src/lib/api'
import { useTheme } from '../../src/theme'
import type { TahfizInvitation } from '../../src/types'

const statusLabels = {
  active: 'صالحة للاستخدام',
  used: 'تم استخدام الدعوة',
  revoked: 'تم إلغاء الدعوة',
  expired: 'انتهت صلاحية الدعوة',
}

export default function InvitationScreen() {
  const { token = '' } = useLocalSearchParams<{ token: string }>()
  const router = useRouter()
  const { user, refreshAccount } = useApp()
  const { colors, commonStyles } = useTheme()
  const styles = createStyles(colors)
  const [invitation, setInvitation] = useState<TahfizInvitation | null>(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    api.invitationPreview(token)
      .then(setInvitation)
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'تعذر تحميل الدعوة'))
      .finally(() => setLoading(false))
  }, [token])

  const accept = async () => {
    setAccepting(true)
    setError('')
    try {
      const result = await api.acceptInvitation(token)
      await refreshAccount(result.tahfiz_id)
      router.replace('/(tabs)')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'تعذر قبول الدعوة')
      setAccepting(false)
    }
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
  }
  if (!invitation) {
    return (
      <View style={styles.center}>
        <View style={commonStyles.card}><Text style={styles.error}>{error || 'الدعوة غير موجودة'}</Text></View>
      </View>
    )
  }

  const canAccept = invitation.available && invitation.status === 'active'
  return (
    <View style={styles.center}>
      <View style={[commonStyles.card, styles.card]}>
        <Text style={styles.icon}>✉</Text>
        <Text style={styles.eyebrow}>دعوة للانضمام إلى تحفيظ</Text>
        <Text style={[commonStyles.title, styles.centerText]}>{invitation.tahfiz_name}</Text>
        <View style={styles.details}>
          <Text style={styles.detail}>الصلاحية: {invitation.role === 'admin' ? 'مدير' : 'مستخدم / شيخ'}</Text>
          {invitation.sheikh_name ? <Text style={styles.detail}>الشيخ المرتبط: {invitation.sheikh_name}</Text> : null}
          <Text style={styles.detail}>حالة الرابط: {statusLabels[invitation.status]}</Text>
          <Text style={styles.expiry}>
            تنتهي: {new Date(invitation.expires_at).toLocaleString('ar-EG')}
          </Text>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {user ? (
          <TouchableOpacity disabled={!canAccept || accepting} style={[commonStyles.button, !canAccept && styles.disabled]} onPress={() => void accept()}>
            {accepting
              ? <ActivityIndicator color="#fff" />
              : <Text style={commonStyles.buttonText}>{canAccept ? 'قبول الدعوة والانضمام' : statusLabels[invitation.status]}</Text>}
          </TouchableOpacity>
        ) : canAccept ? (
          <>
            <TouchableOpacity
              style={commonStyles.button}
              onPress={() => router.push({ pathname: '/signup', params: { invite: token } })}
            >
              <Text style={commonStyles.buttonText}>إنشاء حساب جديد والانضمام</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.outline}
              onPress={() => router.push({ pathname: '/login', params: { invite: token } })}
            >
              <Text style={styles.outlineText}>لدي حساب — تسجيل الدخول</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.disabledMessage}><Text style={styles.detail}>{statusLabels[invitation.status]}</Text></View>
        )}
      </View>
    </View>
  )
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', padding: 18, backgroundColor: colors.background },
  card: { gap: 14 },
  centerText: { textAlign: 'center' },
  icon: { fontSize: 42, textAlign: 'center' },
  eyebrow: { color: colors.primary, fontWeight: '900', textAlign: 'center' },
  details: { backgroundColor: colors.primarySurface, borderRadius: 14, padding: 14, gap: 8 },
  detail: { color: colors.text, textAlign: 'right', fontWeight: '700' },
  expiry: { color: colors.muted, fontSize: 12, textAlign: 'right' },
  error: { color: colors.danger, textAlign: 'right', fontWeight: '700' },
  disabled: { opacity: 0.5 },
  outline: {
    minHeight: 48, borderWidth: 1, borderColor: colors.primary, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  outlineText: { color: colors.primary, fontWeight: '800' },
  disabledMessage: { padding: 12, opacity: 0.6 },
})

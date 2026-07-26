import { useRouter } from 'expo-router'
import React, { useState } from 'react'
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

import { useApp } from '../src/context/AppContext'
import { useTheme } from '../src/theme'

const labels = {
  pending: 'طلبك قيد المراجعة',
  rejected: 'لم تتم الموافقة على الطلب',
  suspended: 'تم إيقاف التحفيظ مؤقتاً',
  active: 'تم تفعيل التحفيظ',
}

export default function PendingScreen() {
  const router = useRouter()
  const { user, refreshAccount, logout } = useApp()
  const { colors, commonStyles } = useTheme()
  const styles = createStyles(colors)
  const [busy, setBusy] = useState(false)
  const membership = user?.memberships[0]
  const status = user?.tahfiz?.status ?? membership?.tahfiz_status ?? 'pending'

  const refresh = async () => {
    setBusy(true)
    try {
      const current = await refreshAccount(user?.default_tahfiz_id ?? undefined)
      if (current.global_role === 'super_admin'
        || current.memberships.some((item) => item.tahfiz_status === 'active')) {
        router.replace('/(tabs)')
      }
    } catch (reason) {
      Alert.alert('تعذر تحديث الحالة', reason instanceof Error ? reason.message : 'تحقق من الاتصال')
    } finally {
      setBusy(false)
    }
  }

  const signOut = async () => {
    await logout(true)
    router.replace('/login')
  }

  return (
    <View style={styles.screen}>
      <View style={commonStyles.card}>
        <Text style={styles.icon}>⏳</Text>
        <Text style={[commonStyles.title, styles.center]}>{labels[status]}</Text>
        <Text style={[commonStyles.subtitle, styles.center]}>
          {user?.tahfiz?.name ?? membership?.tahfiz_name}
        </Text>
        {user?.tahfiz?.status_reason ? (
          <Text style={styles.reason}>{user.tahfiz.status_reason}</Text>
        ) : null}
        <TouchableOpacity disabled={busy} style={commonStyles.button} onPress={() => void refresh()}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={commonStyles.buttonText}>تحديث الحالة</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.logout} onPress={() => void signOut()}>
          <Text style={styles.logoutText}>تسجيل الخروج</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: 22, backgroundColor: colors.background },
  icon: { fontSize: 52, textAlign: 'center', marginBottom: 10 },
  center: { textAlign: 'center', marginBottom: 12 },
  reason: {
    color: colors.warning, backgroundColor: colors.warningSurface, borderRadius: 12,
    padding: 12, textAlign: 'right', marginBottom: 16,
  },
  logout: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  logoutText: { color: colors.danger, fontWeight: '800' },
})

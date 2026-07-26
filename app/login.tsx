import { useLocalSearchParams, useRouter } from 'expo-router'
import React, { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

import { useApp } from '../src/context/AppContext'
import { api } from '../src/lib/api'
import { useTheme } from '../src/theme'

export default function LoginScreen() {
  const router = useRouter()
  const { invite, registered } = useLocalSearchParams<{ invite?: string; registered?: string }>()
  const { login, refreshAccount } = useApp()
  const { colors, commonStyles } = useTheme()
  const styles = createStyles(colors, commonStyles)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!username.trim() || !password) return
    setBusy(true)
    setError('')
    try {
      const user = await login(username, password)
      if (invite) {
        const result = await api.acceptInvitation(invite)
        await refreshAccount(result.tahfiz_id)
        router.replace('/(tabs)')
        return
      }
      const hasActiveTahfiz = user.global_role === 'super_admin'
        || user.memberships.some((item) => item.tahfiz_status === 'active')
      router.replace(hasActiveTahfiz ? '/(tabs)' : '/pending')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'تعذر تسجيل الدخول')
    } finally {
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}
    >
      <View style={styles.hero}>
        <Image source={require('../assets/icon.png')} style={styles.logo} accessibilityLabel="شعار زمزم" />
        <Text style={styles.brand}>زمزم</Text>
        <Text style={styles.tagline}>إدارة التحفيظ، حتى عند انقطاع الإنترنت</Text>
      </View>
      <View style={styles.panel}>
        <Text style={commonStyles.title}>تسجيل الدخول</Text>
        {registered === '1' ? (
          <Text style={styles.success}>تم إرسال طلب التسجيل. يمكنك الدخول لمتابعة حالة المراجعة.</Text>
        ) : null}
        <TextInput
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="اسم المستخدم"
          accessibilityLabel="اسم المستخدم"
          style={commonStyles.input}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="كلمة المرور"
          accessibilityLabel="كلمة المرور"
          style={commonStyles.input}
          onSubmitEditing={() => void submit()}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TouchableOpacity
          disabled={busy || !username.trim() || !password}
          onPress={() => void submit()}
          style={[commonStyles.button, busy && styles.disabled]}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={commonStyles.buttonText}>دخول آمن</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/signup')} style={styles.signup}>
          <Text style={styles.signupText}>ليس لديك حساب؟ سجّل تحفيظك</Text>
        </TouchableOpacity>
        <Text style={styles.note}>يتطلب أول دخول اتصالاً بالإنترنت. بعده يمكنك تسجيل الحضور والتقدم دون اتصال.</Text>
      </View>
    </KeyboardAvoidingView>
  )
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors'], commonStyles: ReturnType<typeof useTheme>['commonStyles']) => StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: 22, backgroundColor: colors.background },
  hero: { alignItems: 'center', marginBottom: 28, gap: 8 },
  logo: { width: 96, height: 96, borderRadius: 22 },
  brand: { color: colors.primary, fontWeight: '900', fontSize: 38 },
  tagline: { color: colors.muted, textAlign: 'center', fontSize: 15 },
  panel: { ...commonStyles.card, gap: 14 },
  error: { color: colors.danger, textAlign: 'right', fontWeight: '700' },
  success: {
    color: colors.success, backgroundColor: colors.successSurface,
    borderRadius: 12, padding: 10, textAlign: 'right', fontWeight: '700',
  },
  note: { color: colors.muted, fontSize: 12, lineHeight: 20, textAlign: 'center' },
  disabled: { opacity: 0.55 },
  signup: { minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  signupText: { color: colors.primary, fontWeight: '800', textAlign: 'center' },
})

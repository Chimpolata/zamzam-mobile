import { useRouter } from 'expo-router'
import React, { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

import { useApp } from '../src/context/AppContext'
import { useTheme } from '../src/theme'

export default function LoginScreen() {
  const router = useRouter()
  const { login } = useApp()
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
      await login(username, password)
      router.replace('/(tabs)')
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
        <Text style={styles.logo}>زمزم</Text>
        <Text style={styles.tagline}>إدارة التحفيظ، حتى عند انقطاع الإنترنت</Text>
      </View>
      <View style={styles.panel}>
        <Text style={commonStyles.title}>تسجيل الدخول</Text>
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
        <Text style={styles.note}>يتطلب أول دخول اتصالاً بالإنترنت. بعده يمكنك تسجيل الحضور والتقدم دون اتصال.</Text>
      </View>
    </KeyboardAvoidingView>
  )
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors'], commonStyles: ReturnType<typeof useTheme>['commonStyles']) => StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: 22, backgroundColor: colors.background },
  hero: { alignItems: 'center', marginBottom: 28, gap: 8 },
  logo: { color: colors.primary, fontWeight: '900', fontSize: 52 },
  tagline: { color: colors.muted, textAlign: 'center', fontSize: 15 },
  panel: { ...commonStyles.card, gap: 14 },
  error: { color: colors.danger, textAlign: 'right', fontWeight: '700' },
  note: { color: colors.muted, fontSize: 12, lineHeight: 20, textAlign: 'center' },
  disabled: { opacity: 0.55 },
})

import { useLocalSearchParams, useRouter } from 'expo-router'
import React, { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from 'react-native'

import { useApp } from '../src/context/AppContext'
import { api } from '../src/lib/api'
import { useTheme } from '../src/theme'

export default function SignupScreen() {
  const { invite } = useLocalSearchParams<{ invite?: string }>()
  const router = useRouter()
  const { login } = useApp()
  const { colors, commonStyles } = useTheme()
  const styles = createStyles(colors)
  const [tahfizName, setTahfizName] = useState('')
  const [phone, setPhone] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (username.trim().length < 3 || password.length < 8 || (!invite && tahfizName.trim().length < 2)) return
    setBusy(true)
    setError('')
    try {
      if (invite) {
        await api.registerWithInvitation(invite, username.trim(), password)
        await login(username.trim(), password)
        router.replace('/(tabs)')
        return
      }
      await api.signup(tahfizName.trim(), username.trim(), password, phone)
      router.replace({ pathname: '/login', params: { registered: '1' } })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'تعذر إرسال الطلب')
    } finally {
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={commonStyles.screen}>
      <ScrollView contentContainerStyle={commonStyles.content} keyboardShouldPersistTaps="handled">
        <Text style={commonStyles.title}>{invite ? 'إنشاء حساب وقبول الدعوة' : 'تسجيل تحفيظ جديد'}</Text>
        <Text style={commonStyles.subtitle}>
          {invite
            ? 'أنشئ حسابك وسيتم ربطه بالتحفيظ المدعو إليه مباشرة.'
            : 'سيُراجع طلب التحفيظ قبل تفعيل الحساب.'}
        </Text>
        {!invite ? (
          <>
            <TextInput
              value={tahfizName}
              onChangeText={setTahfizName}
              placeholder="اسم التحفيظ"
              style={commonStyles.input}
            />
            <TextInput
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="رقم التواصل (اختياري)"
              style={commonStyles.input}
            />
          </>
        ) : null}
        <TextInput
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="اسم المستخدم (٣ أحرف على الأقل)"
          style={commonStyles.input}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="كلمة المرور (٨ أحرف على الأقل)"
          style={commonStyles.input}
          onSubmitEditing={() => void submit()}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TouchableOpacity
          disabled={busy || username.trim().length < 3 || password.length < 8 || (!invite && tahfizName.trim().length < 2)}
          onPress={() => void submit()}
          style={[commonStyles.button, busy && styles.disabled]}
        >
          {busy
            ? <ActivityIndicator color="#fff" />
            : <Text style={commonStyles.buttonText}>{invite ? 'إنشاء الحساب والانضمام' : 'إرسال طلب التسجيل'}</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>العودة لتسجيل الدخول</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  error: { color: colors.danger, fontWeight: '700', textAlign: 'right' },
  disabled: { opacity: 0.5 },
  back: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  backText: { color: colors.primary, fontWeight: '800' },
})

import { Stack } from 'expo-router'
import { SQLiteProvider } from 'expo-sqlite'
import { StatusBar } from 'expo-status-bar'
import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { AppProvider, useApp } from '../src/context/AppContext'
import { encryptedDatabaseName, migrateDatabase } from '../src/db/database'
import { ThemeProvider, useTheme } from '../src/theme'

function LockedGate({ children }: { children: React.ReactNode }) {
  const { ready, user, locked, unlock } = useApp()
  const { colors, commonStyles } = useTheme()
  const styles = createStyles(colors, commonStyles)
  if (!ready) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
  }
  if (user && locked) {
    return (
      <View style={styles.lock}>
        <Image
          source={require('../assets/icon.png')}
          style={styles.logo}
          accessibilityLabel="شعار زمزم"
        />
        <Text style={styles.brand}>زمزم</Text>
        <Text style={commonStyles.title}>بياناتك محمية</Text>
        <Text style={commonStyles.subtitle}>افتح التطبيق ببصمة الجهاز أو رمز القفل</Text>
        <Text onPress={() => void unlock()} style={styles.unlock}>فتح التطبيق</Text>
      </View>
    )
  }
  return children
}

export default function RootLayout() {
  const [databaseName, setDatabaseName] = useState<string | null>(null)

  useEffect(() => {
    void encryptedDatabaseName().then(setDatabaseName)
  }, [])

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        {databaseName ? (
          <SQLiteProvider databaseName={databaseName} onInit={migrateDatabase}>
            <AppProvider>
              <AppNavigation />
            </AppProvider>
          </SQLiteProvider>
        ) : <DatabaseLoading />}
      </ThemeProvider>
    </SafeAreaProvider>
  )
}

function DatabaseLoading() {
  const { colors } = useTheme()
  return <View style={[baseStyles.loading, { backgroundColor: colors.background }]}><ActivityIndicator size="large" color={colors.primary} /></View>
}

function AppNavigation() {
  const { colors, isDark } = useTheme()
  return (
    <LockedGate>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{
        headerTitleAlign: 'center',
        headerTintColor: colors.text,
        headerStyle: { backgroundColor: colors.surface },
        contentStyle: { backgroundColor: colors.background },
      }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="signup" options={{ title: 'تسجيل تحفيظ جديد' }} />
        <Stack.Screen name="pending" options={{ headerShown: false }} />
        <Stack.Screen name="invite/[token]" options={{ title: 'دعوة للانضمام' }} />
        <Stack.Screen name="platform" options={{ title: 'إدارة المنصة' }} />
        <Stack.Screen name="invitations" options={{ title: 'دعوات الانضمام' }} />
        <Stack.Screen name="warnings" options={{ title: 'الإنذارات' }} />
        <Stack.Screen name="student/[id]" options={{ title: 'ملف الطالب' }} />
        <Stack.Screen name="student/[id]/progress" options={{ title: 'تقدم الطالب' }} />
        <Stack.Screen name="student/[id]/exceptions" options={{ title: 'أيام العذر' }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="session/[id]" options={{ title: 'تسجيل الحلقة' }} />
        <Stack.Screen name="attendance-history" options={{ title: 'سجل الحضور' }} />
        <Stack.Screen name="progress-history" options={{ title: 'تقدم القرآن' }} />
        <Stack.Screen name="conflicts" options={{ title: 'تعارضات المزامنة' }} />
        <Stack.Screen name="feedback" options={{ title: 'الملاحظات والبلاغات' }} />
        <Stack.Screen name="online/[screen]" options={{ title: 'زمزم' }} />
      </Stack>
    </LockedGate>
  )
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors'], commonStyles: ReturnType<typeof useTheme>['commonStyles']) => StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  lock: { flex: 1, padding: 28, gap: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  logo: { width: 104, height: 104, borderRadius: 24 },
  brand: { fontSize: 34, fontWeight: '900', color: colors.primary },
  unlock: {
    overflow: 'hidden', color: '#fff', backgroundColor: colors.primary, fontSize: 17,
    fontWeight: '800', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 16,
  },
})

const baseStyles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})

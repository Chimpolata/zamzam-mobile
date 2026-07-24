import { Stack } from 'expo-router'
import { SQLiteProvider } from 'expo-sqlite'
import { StatusBar } from 'expo-status-bar'
import React from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { AppProvider, useApp } from '../src/context/AppContext'
import { migrateDatabase } from '../src/db/database'
import { colors, commonStyles } from '../src/theme'

function LockedGate({ children }: { children: React.ReactNode }) {
  const { ready, user, locked, unlock } = useApp()
  if (!ready) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
  }
  if (user && locked) {
    return (
      <View style={styles.lock}>
        <Text style={styles.logo}>زمزم</Text>
        <Text style={commonStyles.title}>بياناتك محمية</Text>
        <Text style={commonStyles.subtitle}>افتح التطبيق ببصمة الجهاز أو رمز القفل</Text>
        <Text onPress={() => void unlock()} style={styles.unlock}>فتح التطبيق</Text>
      </View>
    )
  }
  return children
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SQLiteProvider databaseName="zamzam-mobile.db" onInit={migrateDatabase}>
        <AppProvider>
          <LockedGate>
            <StatusBar style="auto" />
            <Stack screenOptions={{
              headerTitleAlign: 'center',
              headerTintColor: colors.text,
              headerStyle: { backgroundColor: colors.surface },
              contentStyle: { backgroundColor: colors.background },
            }}>
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="login" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="session/[id]" options={{ title: 'تسجيل الحلقة' }} />
              <Stack.Screen name="conflicts" options={{ title: 'تعارضات المزامنة' }} />
              <Stack.Screen name="feedback" options={{ title: 'الملاحظات والبلاغات' }} />
              <Stack.Screen name="online/[screen]" options={{ title: 'زمزم' }} />
            </Stack>
          </LockedGate>
        </AppProvider>
      </SQLiteProvider>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  lock: { flex: 1, padding: 28, gap: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  logo: { fontSize: 44, fontWeight: '900', color: colors.primary },
  unlock: {
    overflow: 'hidden', color: '#fff', backgroundColor: colors.primary, fontSize: 17,
    fontWeight: '800', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 16,
  },
})

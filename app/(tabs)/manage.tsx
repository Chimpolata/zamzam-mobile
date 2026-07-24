import { useRouter } from 'expo-router'
import React from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native'

import { useApp } from '../../src/context/AppContext'
import { useTheme } from '../../src/theme'

export default function ManageScreen() {
  const router = useRouter()
  const { user } = useApp()
  const { colors, commonStyles } = useTheme()
  const styles = createStyles(colors, commonStyles)
  const admin = user?.role === 'admin' || user?.role === 'super_admin'
  const items = [
    ['students', 'الطلاب', '/students', true],
    ['sheikhs', 'الشيوخ', '/sheikhs', true],
    ['warnings', 'الإنذارات', '/warnings', true],
    ['users', 'المستخدمون والصلاحيات', '/users', admin],
    ['invitations', 'الدعوات', '/invitations/', admin],
    ['filters', 'التصفيات المحفوظة', '/saved-filters/', true],
  ] as const
  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.content}>
      <Text style={commonStyles.title}>الإدارة</Text>
      <Text style={commonStyles.subtitle}>تحتاج إجراءات الإدارة اتصالاً بالإنترنت في هذا الإصدار.</Text>
      {items.filter((item) => item[3]).map(([screen, label, endpoint]) => (
        <TouchableOpacity
          key={screen}
          style={styles.item}
          onPress={() => router.push({ pathname: '/online/[screen]', params: { screen, endpoint, label } })}
        >
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.online}>متصل</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  )
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors'], commonStyles: ReturnType<typeof useTheme>['commonStyles']) => StyleSheet.create({
  item: { ...commonStyles.card, minHeight: 64, flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  label: { flex: 1, color: colors.text, textAlign: 'right', fontWeight: '800' },
  online: { color: colors.primary, fontSize: 11, fontWeight: '700' },
})

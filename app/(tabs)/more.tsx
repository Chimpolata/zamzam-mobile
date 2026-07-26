import { useRouter } from 'expo-router'
import React from 'react'
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

import { useApp } from '../../src/context/AppContext'
import { shareDatabaseExport } from '../../src/lib/database-export'
import { type ThemeMode, useTheme } from '../../src/theme'

export default function MoreScreen() {
  const router = useRouter()
  const { user, activeTahfizId, switchTahfiz, logout } = useApp()
  const { colors, commonStyles, mode, setMode } = useTheme()
  const styles = createStyles(colors, commonStyles)
  const [exporting, setExporting] = React.useState(false)
  const admin = user?.role === 'admin' || user?.global_role === 'super_admin'
  const signOut = async () => {
    try {
      await logout(false)
      router.replace('/login')
    } catch (error) {
      Alert.alert(
        'تعديلات غير متزامنة',
        error instanceof Error ? `${error.message}. هل تريد حذفها وتسجيل الخروج؟` : 'هل تريد المتابعة؟',
        [
          { text: 'إلغاء', style: 'cancel' },
          {
            text: 'حذف وتسجيل الخروج',
            style: 'destructive',
            onPress: async () => {
              await logout(true)
              router.replace('/login')
            },
          },
        ],
      )
    }
  }
  const exportTahfiz = async () => {
    if (!activeTahfizId) return
    setExporting(true)
    try {
      await shareDatabaseExport({
        path: '/tahfiz/export-db',
        fileName: `zamzam-tahfiz-${activeTahfizId}.db`,
        tahfizId: activeTahfizId,
      })
    } catch (reason) {
      Alert.alert('تعذر التصدير', reason instanceof Error ? reason.message : 'حاول مرة أخرى')
    } finally {
      setExporting(false)
    }
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.content}>
      <Text style={commonStyles.title}>المزيد</Text>
      <View style={commonStyles.card}>
        <Text style={styles.section}>التبديل بين التحفيظات</Text>
        {user?.memberships.filter((item) => item.tahfiz_status === 'active').map((membership) => (
          <TouchableOpacity
            key={membership.id}
            onPress={() => void switchTahfiz(membership.tahfiz_id)}
            style={[styles.membership, membership.tahfiz_id === activeTahfizId && styles.membershipActive]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.membershipName}>{membership.tahfiz_name}</Text>
              <Text style={commonStyles.subtitle}>{membership.role === 'admin' ? 'مدير' : 'شيخ'}</Text>
            </View>
            {membership.tahfiz_id === activeTahfizId ? <Text style={styles.current}>الحالي ✓</Text> : null}
          </TouchableOpacity>
        ))}
      </View>
      <View style={commonStyles.card}>
        <Text style={styles.section}>مظهر التطبيق</Text>
        <View style={styles.themeChoices}>
          {([
            ['system', 'حسب الجهاز'],
            ['light', 'فاتح'],
            ['dark', 'داكن'],
          ] as Array<[ThemeMode, string]>).map(([value, label]) => (
            <TouchableOpacity
              key={value}
              onPress={() => void setMode(value)}
              style={[styles.themeChoice, mode === value && styles.themeChoiceActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === value }}
            >
              <Text style={[styles.themeChoiceText, mode === value && styles.themeChoiceTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      {admin ? (
        <Menu label="إعدادات التحفيظ" onPress={() => router.push({
          pathname: '/online/[screen]', params: { screen: 'settings', endpoint: '/tahfiz/settings', label: 'إعدادات التحفيظ' },
        })} />
      ) : null}
      {admin ? (
        <Menu label={exporting ? 'جاري تجهيز النسخة...' : 'تصدير قاعدة بيانات التحفيظ'} onPress={() => {
          if (!exporting) void exportTahfiz()
        }} />
      ) : null}
      <Menu label="تعارضات المزامنة" onPress={() => router.push('/conflicts')} />
      {user?.global_role === 'super_admin' ? (
        <>
          <Menu label="بلاغات المستخدمين" onPress={() => router.push('/feedback')} />
          <Menu label="إدارة المنصة" onPress={() => router.push('/platform')} />
        </>
      ) : (
        <Menu label="إرسال ملاحظة أو بلاغ" onPress={() => router.push('/feedback')} />
      )}
      <Menu label="عن التطبيق والأمان" onPress={() => Alert.alert(
        'زمزم للتحفيظ',
        'قاعدة البيانات المحلية مشفرة. يعمل تسجيل الحضور وتقدم القرآن دون اتصال، بينما تتطلب الإدارة اتصالاً بالإنترنت.',
      )} />
      <TouchableOpacity style={styles.logout} onPress={() => void signOut()}>
        <Text style={styles.logoutText}>تسجيل الخروج</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

function Menu({ label, onPress }: { label: string; onPress(): void }) {
  const { colors, commonStyles } = useTheme()
  const styles = createStyles(colors, commonStyles)
  return <TouchableOpacity style={styles.menu} onPress={onPress}><Text style={styles.menuLabel}>{label}</Text><Text style={styles.arrow}>‹</Text></TouchableOpacity>
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors'], commonStyles: ReturnType<typeof useTheme>['commonStyles']) => StyleSheet.create({
  section: { color: colors.text, fontWeight: '900', textAlign: 'right', marginBottom: 10 },
  membership: { flexDirection: 'row-reverse', alignItems: 'center', borderRadius: 13, padding: 11, gap: 8 },
  membershipActive: { backgroundColor: colors.primarySurface },
  membershipName: { color: colors.text, fontWeight: '800', textAlign: 'right' },
  current: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  themeChoices: { flexDirection: 'row-reverse', gap: 8 },
  themeChoice: { flex: 1, minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.input },
  themeChoiceActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  themeChoiceText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  themeChoiceTextActive: { color: '#ffffff' },
  menu: { ...commonStyles.card, flexDirection: 'row-reverse', alignItems: 'center', minHeight: 60 },
  menuLabel: { flex: 1, textAlign: 'right', color: colors.text, fontWeight: '800' },
  arrow: { color: colors.primary, fontSize: 28 },
  logout: { minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.dangerSurface, alignItems: 'center', justifyContent: 'center' },
  logoutText: { color: colors.danger, fontWeight: '900' },
})

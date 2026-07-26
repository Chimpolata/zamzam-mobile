import { Redirect } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'

import { useApp } from '../src/context/AppContext'
import { useTheme } from '../src/theme'

export default function Index() {
  const { ready, user } = useApp()
  const { colors } = useTheme()
  if (!ready) return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}><ActivityIndicator color={colors.primary} /></View>
  if (!user) return <Redirect href="/login" />
  const hasActiveTahfiz = user.global_role === 'super_admin'
    || user.memberships.some((item) => item.tahfiz_status === 'active')
  return <Redirect href={hasActiveTahfiz ? '/(tabs)' : '/pending'} />
}

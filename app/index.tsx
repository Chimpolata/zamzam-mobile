import { Redirect } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'

import { useApp } from '../src/context/AppContext'
import { colors } from '../src/theme'

export default function Index() {
  const { ready, user } = useApp()
  if (!ready) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator color={colors.primary} /></View>
  return <Redirect href={user ? '/(tabs)' : '/login'} />
}

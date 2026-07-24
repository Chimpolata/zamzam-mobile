import { Tabs } from 'expo-router'
import React from 'react'
import { type ColorValue, Text } from 'react-native'

import { colors } from '../../src/theme'

const icon = (symbol: string, color: ColorValue) => <Text style={{ color, fontSize: 19 }}>{symbol}</Text>

export default function TabLayout() {
  return (
    <Tabs screenOptions={{
      headerTitleAlign: 'center',
      headerStyle: { backgroundColor: colors.surface },
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.muted,
      tabBarStyle: { height: 68, paddingBottom: 8, paddingTop: 6 },
    }}>
      <Tabs.Screen name="index" options={{ title: 'الرئيسية', tabBarIcon: ({ color }) => icon('⌂', color) }} />
      <Tabs.Screen name="sessions" options={{ title: 'الحلقات', tabBarIcon: ({ color }) => icon('◫', color) }} />
      <Tabs.Screen name="reports" options={{ title: 'التقارير', tabBarIcon: ({ color }) => icon('▥', color) }} />
      <Tabs.Screen name="manage" options={{ title: 'الإدارة', tabBarIcon: ({ color }) => icon('♙', color) }} />
      <Tabs.Screen name="more" options={{ title: 'المزيد', tabBarIcon: ({ color }) => icon('•••', color) }} />
    </Tabs>
  )
}

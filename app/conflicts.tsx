import { useFocusEffect } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import React, { useCallback, useState } from 'react'
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

import { useApp } from '../src/context/AppContext'
import { listConflicts, resolveConflict } from '../src/db/database'
import { getDeviceId } from '../src/lib/session-store'
import { colors, commonStyles } from '../src/theme'
import type { SyncConflict } from '../src/types'

export default function ConflictsScreen() {
  const db = useSQLiteContext()
  const { activeTahfizId, syncNow } = useApp()
  const [items, setItems] = useState<SyncConflict[]>([])

  const load = useCallback(async () => {
    if (activeTahfizId) setItems(await listConflicts(db, activeTahfizId))
  }, [db, activeTahfizId])
  useFocusEffect(useCallback(() => { void load() }, [load]))

  const choose = async (item: SyncConflict, choice: 'server' | 'local') => {
    try {
      await resolveConflict(db, item, choice, await getDeviceId())
      await load()
      if (choice === 'local') await syncNow(false)
    } catch (error) {
      Alert.alert('تعذر حل التعارض', error instanceof Error ? error.message : 'حاول مرة أخرى')
    }
  }

  return (
    <FlatList
      style={commonStyles.screen}
      contentContainerStyle={commonStyles.content}
      data={items}
      keyExtractor={(item) => String(item.id)}
      ListEmptyComponent={
        <View style={commonStyles.card}>
          <Text style={styles.empty}>لا توجد تعارضات. كل التعديلات متوافقة.</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={[commonStyles.card, { gap: 12 }]}>
          <Text style={styles.title}>
            {item.entity_type === 'attendance' ? 'تعارض في الحضور' : 'تعارض في تقدم القرآن'}
          </Text>
          <Text style={commonStyles.subtitle}>السجل: {item.entity_key}</Text>
          <View style={styles.compare}>
            <Version title="نسخة الجهاز" value={item.local} />
            <Version title="نسخة الخادم" value={item.server} />
          </View>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.local} onPress={() => void choose(item, 'local')}>
              <Text style={styles.localText}>اعتماد نسخة الجهاز</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.server} onPress={() => void choose(item, 'server')}>
              <Text style={styles.serverText}>اعتماد الخادم</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
    />
  )
}

function Version({ title, value }: { title: string; value: Record<string, unknown> | null }) {
  const fields = value
    ? Object.entries(value).filter(([key]) => ['status', 'notes', 'quality_score', 'mistakes', 'from_page', 'to_page'].includes(key))
    : []
  return (
    <View style={styles.version}>
      <Text style={styles.versionTitle}>{title}</Text>
      {fields.length
        ? fields.map(([key, field]) => <Text key={key} style={styles.field}>{key}: {String(field ?? '—')}</Text>)
        : <Text style={styles.field}>السجل غير موجود</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  title: { color: colors.danger, textAlign: 'right', fontWeight: '900', fontSize: 17 },
  empty: { color: colors.success, fontWeight: '800', textAlign: 'center' },
  compare: { flexDirection: 'row-reverse', gap: 8 },
  version: { flex: 1, backgroundColor: colors.background, borderRadius: 12, padding: 10, gap: 4 },
  versionTitle: { color: colors.text, fontWeight: '800', textAlign: 'right' },
  field: { color: colors.muted, fontSize: 11, textAlign: 'right' },
  actions: { flexDirection: 'row-reverse', gap: 8 },
  local: { flex: 1, backgroundColor: colors.primary, padding: 12, borderRadius: 12, alignItems: 'center' },
  localText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  server: { flex: 1, borderColor: colors.border, borderWidth: 1, padding: 12, borderRadius: 12, alignItems: 'center' },
  serverText: { color: colors.text, fontWeight: '800', fontSize: 12 },
})

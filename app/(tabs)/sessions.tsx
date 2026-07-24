import { useFocusEffect, useRouter } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import React, { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'

import { useApp } from '../../src/context/AppContext'
import { listSessions } from '../../src/db/database'
import { api } from '../../src/lib/api'
import { colors, commonStyles } from '../../src/theme'
import type { Session } from '../../src/types'

export default function SessionsScreen() {
  const db = useSQLiteContext()
  const router = useRouter()
  const { activeTahfizId, user, syncNow } = useApp()
  const [sessions, setSessions] = useState<Array<Omit<Session, 'is_confirmed'> & { is_confirmed: number }>>([])
  const [editing, setEditing] = useState<(Omit<Session, 'is_confirmed'> & { is_confirmed: number }) | null | undefined>(undefined)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const admin = user?.role === 'admin' || user?.role === 'super_admin'

  const load = useCallback(async () => {
    if (activeTahfizId) setSessions(await listSessions(db, activeTahfizId))
  }, [db, activeTahfizId])
  useFocusEffect(useCallback(() => { void load() }, [load]))

  const openEditor = (session: (Omit<Session, 'is_confirmed'> & { is_confirmed: number }) | null) => {
    setEditing(session)
    setDate(session?.date ?? new Date().toISOString().slice(0, 10))
    setReason('')
  }

  const save = async () => {
    if (!activeTahfizId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      Alert.alert('تحقق من التاريخ', 'استخدم الصيغة YYYY-MM-DD')
      return
    }
    setBusy(true)
    try {
      if (!editing) await api.createSession(activeTahfizId, date)
      else if (editing.is_confirmed) {
        if (reason.trim().length < 3) throw new Error('اكتب سبب إعادة الفتح')
        await api.reopenSession(activeTahfizId, editing.id, reason.trim(), editing.version)
      } else {
        await api.updateSessionDate(activeTahfizId, editing.id, date)
      }
      await syncNow(false)
      await load()
      setEditing(undefined)
    } catch (error) {
      Alert.alert('تعذر الحفظ', error instanceof Error ? error.message : 'حاول مرة أخرى')
    } finally {
      setBusy(false)
    }
  }

  const remove = (session: Omit<Session, 'is_confirmed'> & { is_confirmed: number }) => {
    if (!activeTahfizId) return
    Alert.alert('حذف الحلقة', 'سيُحذف سجل الحلقة المرتبط. هل تريد المتابعة؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteSession(activeTahfizId, session.id)
            await syncNow(false)
            await load()
          } catch (error) {
            Alert.alert('تعذر الحذف', error instanceof Error ? error.message : 'حاول مرة أخرى')
          }
        },
      },
    ])
  }

  return (
    <>
    <FlatList
      style={commonStyles.screen}
      contentContainerStyle={commonStyles.content}
      data={sessions}
      keyExtractor={(item) => String(item.id)}
      ListHeaderComponent={
        <View style={{ gap: 5, marginBottom: 8 }}>
          <View style={styles.heading}>
            <Text style={[commonStyles.title, { flex: 1 }]}>الحلقات المحفوظة</Text>
            {admin ? <TouchableOpacity style={styles.add} onPress={() => openEditor(null)}><Text style={styles.addText}>+ حلقة</Text></TouchableOpacity> : null}
          </View>
          <Text style={commonStyles.subtitle}>المفتوحة وكل الحلقات خلال آخر ٩٠ يوماً</Text>
        </View>
      }
      ListEmptyComponent={
        <View style={commonStyles.card}><Text style={commonStyles.subtitle}>اسحب للمزامنة من الرئيسية لتحميل الحلقات.</Text></View>
      }
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.row}
          onPress={() => router.push({ pathname: '/session/[id]', params: { id: String(item.id) } })}
          onLongPress={() => admin && openEditor(item)}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.date}>{new Date(`${item.date}T12:00:00`).toLocaleDateString('ar-EG', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            })}</Text>
            <Text style={commonStyles.subtitle}>الإصدار {item.version}</Text>
          </View>
          {admin ? <TouchableOpacity onPress={() => remove(item)} hitSlop={10}><Text style={styles.delete}>حذف</Text></TouchableOpacity> : null}
          <View style={[styles.badge, { backgroundColor: item.is_confirmed ? '#e2e8f0' : '#d1fae5' }]}>
            <Text style={{ color: item.is_confirmed ? colors.muted : colors.success, fontWeight: '800' }}>
              {item.is_confirmed ? 'مؤكدة' : 'مفتوحة'}
            </Text>
          </View>
        </TouchableOpacity>
      )}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
    />
    <Modal visible={editing !== undefined} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditing(undefined)}>
      <View style={[commonStyles.screen, commonStyles.content]}>
        <Text style={commonStyles.title}>{editing?.is_confirmed ? 'إعادة فتح الحلقة' : editing ? 'تعديل الحلقة' : 'حلقة جديدة'}</Text>
        {editing?.is_confirmed ? (
          <TextInput value={reason} onChangeText={setReason} placeholder="سبب إعادة الفتح" multiline style={[commonStyles.input, { minHeight: 90 }]} />
        ) : (
          <TextInput value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" style={commonStyles.input} />
        )}
        <TouchableOpacity disabled={busy} style={commonStyles.button} onPress={() => void save()}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={commonStyles.buttonText}>حفظ</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancel} onPress={() => setEditing(undefined)}><Text style={commonStyles.subtitle}>إلغاء</Text></TouchableOpacity>
      </View>
    </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  row: { ...commonStyles.card, flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  date: { fontSize: 16, fontWeight: '800', color: colors.text, textAlign: 'right' },
  badge: { borderRadius: 20, paddingHorizontal: 11, paddingVertical: 6 },
  heading: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  add: { backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 9 },
  addText: { color: '#fff', fontWeight: '900' },
  delete: { color: colors.danger, fontSize: 11, fontWeight: '800' },
  cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
})

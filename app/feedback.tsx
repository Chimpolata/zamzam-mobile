import { useFocusEffect } from 'expo-router'
import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

import { useApp } from '../src/context/AppContext'
import { api } from '../src/lib/api'
import { colors, commonStyles } from '../src/theme'
import type { FeedbackCategory, FeedbackReport, FeedbackStatus } from '../src/types'

const categoryLabels: Record<FeedbackCategory, string> = {
  bug: 'مشكلة تقنية',
  suggestion: 'اقتراح تحسين',
  other: 'ملاحظة أخرى',
}

const statusLabels: Record<FeedbackStatus, string> = {
  open: 'جديد',
  in_review: 'قيد المراجعة',
  resolved: 'تم الحل',
  not_an_issue: 'ليست مشكلة',
}

export default function FeedbackScreen() {
  const { user, activeTahfizId } = useApp()
  const superAdmin = user?.global_role === 'super_admin'

  if (superAdmin) return <FeedbackReview />
  return <FeedbackForm tahfizId={activeTahfizId} />
}

function FeedbackForm({ tahfizId }: { tahfizId: number | null }) {
  const [category, setCategory] = useState<FeedbackCategory>('bug')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!tahfizId) {
      Alert.alert('لا يوجد تحفيظ محدد', 'اختر مساحة التحفيظ ثم حاول مرة أخرى.')
      return
    }
    setBusy(true)
    try {
      await api.createFeedback(tahfizId, {
        category,
        title: title.trim(),
        description: description.trim(),
        page_url: 'mobile:/feedback',
      })
      setTitle('')
      setDescription('')
      setCategory('bug')
      Alert.alert('تم الإرسال', 'وصلت ملاحظتك إلى إدارة المنصة. شكراً لمساعدتنا.')
    } catch (reason) {
      Alert.alert('تعذر الإرسال', reason instanceof Error ? reason.message : 'تحقق من اتصال الإنترنت')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.content} keyboardShouldPersistTaps="handled">
      <Text style={commonStyles.title}>شاركنا ملاحظتك</Text>
      <Text style={commonStyles.subtitle}>أبلغ عن مشكلة واجهتك أو اقترح تحسيناً للتطبيق.</Text>

      <View style={commonStyles.card}>
        <Text style={styles.label}>نوع الملاحظة</Text>
        <View style={styles.choiceRow}>
          {(Object.keys(categoryLabels) as FeedbackCategory[]).map(value => (
            <TouchableOpacity
              key={value}
              onPress={() => setCategory(value)}
              style={[styles.choice, category === value && styles.choiceActive]}
            >
              <Text style={[styles.choiceText, category === value && styles.choiceTextActive]}>{categoryLabels[value]}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TextInput
        value={title}
        onChangeText={setTitle}
        maxLength={120}
        placeholder="عنوان مختصر للمشكلة أو الاقتراح"
        style={commonStyles.input}
        textAlign="right"
      />
      <TextInput
        value={description}
        onChangeText={setDescription}
        maxLength={4000}
        multiline
        numberOfLines={7}
        placeholder="اشرح ما حدث والخطوات التي أدت إليه..."
        style={[commonStyles.input, styles.description]}
        textAlign="right"
        textAlignVertical="top"
      />
      <Text style={commonStyles.subtitle}>يتطلب إرسال البلاغ اتصالاً بالإنترنت.</Text>
      <TouchableOpacity
        disabled={busy || title.trim().length < 5 || description.trim().length < 10}
        style={[commonStyles.button, (busy || title.trim().length < 5 || description.trim().length < 10) && styles.disabled]}
        onPress={() => void submit()}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={commonStyles.buttonText}>إرسال الملاحظة</Text>}
      </TouchableOpacity>
    </ScrollView>
  )
}

function FeedbackReview() {
  const [items, setItems] = useState<FeedbackReport[]>([])
  const [filter, setFilter] = useState<'all' | FeedbackStatus>('open')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<FeedbackReport | null>(null)
  const [nextStatus, setNextStatus] = useState<FeedbackStatus>('in_review')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setItems(await api.platformFeedback(filter === 'all' ? undefined : filter))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'تعذر تحميل البلاغات')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  const openReview = (item: FeedbackReport) => {
    setSelected(item)
    setNextStatus(item.status === 'open' ? 'in_review' : item.status)
    setNote(item.resolution_note || '')
  }

  const save = async () => {
    if (!selected) return
    setBusy(true)
    try {
      await api.updatePlatformFeedback(selected.id, nextStatus, note)
      setSelected(null)
      await load()
    } catch (reason) {
      Alert.alert('تعذر الحفظ', reason instanceof Error ? reason.message : 'حاول مرة أخرى')
    } finally {
      setBusy(false)
    }
  }

  const filters: Array<'all' | FeedbackStatus> = ['open', 'in_review', 'resolved', 'not_an_issue', 'all']

  return (
    <>
      <ScrollView
        style={commonStyles.screen}
        contentContainerStyle={commonStyles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
      >
        <Text style={commonStyles.title}>بلاغات المستخدمين</Text>
        <Text style={commonStyles.subtitle}>المراجعة متاحة لمدير المنصة فقط.</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {filters.map(value => (
            <TouchableOpacity key={value} onPress={() => setFilter(value)} style={[styles.filter, filter === value && styles.filterActive]}>
              <Text style={[styles.filterText, filter === value && styles.filterTextActive]}>
                {value === 'all' ? 'الكل' : statusLabels[value]}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {error ? <View style={commonStyles.card}><Text style={styles.error}>{error}</Text></View> : null}
        {loading && items.length === 0 ? <ActivityIndicator color={colors.primary} /> : null}
        {!loading && items.length === 0 ? <View style={commonStyles.card}><Text style={commonStyles.subtitle}>لا توجد بلاغات هنا.</Text></View> : null}
        {items.map(item => (
          <TouchableOpacity key={item.id} style={commonStyles.card} onPress={() => openReview(item)}>
            <View style={styles.reportHeader}>
              <Text style={styles.status}>{statusLabels[item.status]}</Text>
              <Text style={styles.category}>{categoryLabels[item.category]}</Text>
            </View>
            <Text style={styles.reportTitle}>{item.title}</Text>
            <Text style={styles.reportDescription}>{item.description}</Text>
            <Text style={commonStyles.subtitle}>{item.reporter_username} · {item.tahfiz_name || 'غير محدد'}</Text>
            {item.page_url ? <Text style={styles.page}>{item.page_url}</Text> : null}
            {item.resolution_note ? <Text style={styles.note}>ملاحظة المراجعة: {item.resolution_note}</Text> : null}
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Modal visible={Boolean(selected)} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelected(null)}>
        <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.content} keyboardShouldPersistTaps="handled">
          <Text style={commonStyles.title}>مراجعة البلاغ</Text>
          <Text style={styles.reportTitle}>{selected?.title}</Text>
          <Text style={commonStyles.subtitle}>اختر الحالة الجديدة وأضف توضيحاً عند الحاجة.</Text>
          <View style={styles.choiceRow}>
            {(Object.keys(statusLabels) as FeedbackStatus[]).map(value => (
              <TouchableOpacity key={value} onPress={() => setNextStatus(value)} style={[styles.choice, nextStatus === value && styles.choiceActive]}>
                <Text style={[styles.choiceText, nextStatus === value && styles.choiceTextActive]}>{statusLabels[value]}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            value={note}
            onChangeText={setNote}
            maxLength={2000}
            multiline
            numberOfLines={5}
            placeholder="ملاحظة المراجعة أو الإجراء المتخذ"
            style={[commonStyles.input, styles.description]}
            textAlign="right"
            textAlignVertical="top"
          />
          <TouchableOpacity disabled={busy} style={commonStyles.button} onPress={() => void save()}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={commonStyles.buttonText}>حفظ الحالة</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancel} onPress={() => setSelected(null)}><Text style={commonStyles.subtitle}>إلغاء</Text></TouchableOpacity>
        </ScrollView>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  label: { color: colors.text, fontWeight: '900', textAlign: 'right', marginBottom: 12 },
  choiceRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  choice: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff' },
  choiceActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  choiceText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  choiceTextActive: { color: '#fff' },
  description: { minHeight: 140, paddingTop: 14 },
  disabled: { opacity: 0.5 },
  filters: { flexDirection: 'row-reverse', gap: 8, paddingVertical: 4 },
  filter: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: '#fff' },
  filterActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.text, fontWeight: '800', fontSize: 12 },
  filterTextActive: { color: '#fff' },
  error: { color: colors.danger, textAlign: 'right', fontWeight: '700' },
  reportHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', gap: 8 },
  status: { color: colors.warning, fontWeight: '900', fontSize: 12 },
  category: { color: colors.primary, fontWeight: '900', fontSize: 12 },
  reportTitle: { color: colors.text, fontWeight: '900', fontSize: 17, textAlign: 'right', marginTop: 10 },
  reportDescription: { color: colors.text, lineHeight: 22, textAlign: 'right', marginVertical: 8 },
  page: { color: colors.muted, fontSize: 11, textAlign: 'left', marginTop: 6 },
  note: { color: colors.text, backgroundColor: '#f1f5f9', borderRadius: 10, padding: 10, textAlign: 'right', marginTop: 10 },
  cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
})

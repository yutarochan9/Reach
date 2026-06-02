import { useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Platform, ActivityIndicator,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { Colors } from '../constants/colors'

const CATEGORIES = [
  { key: 'bug', label: '不具合・バグ報告', icon: 'bug-outline' as const },
  { key: 'feature', label: '機能の要望', icon: 'bulb-outline' as const },
  { key: 'account', label: 'アカウントについて', icon: 'person-outline' as const },
  { key: 'billing', label: '課金・プランについて', icon: 'card-outline' as const },
  { key: 'other', label: 'その他', icon: 'chatbubble-outline' as const },
]

export default function ContactScreen() {
  const [category, setCategory] = useState<string | null>(null)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)

  const handleSend = async () => {
    if (!category || !body.trim()) return
    setSending(true)

    const { data: { user } } = await supabase.auth.getUser()
    const catLabel = CATEGORIES.find(c => c.key === category)?.label ?? category

    await supabase.from('contact_messages').insert({
      user_id: user?.id ?? null,
      category,
      body: body.trim(),
    }).then(({ error }) => {
      if (error) console.error('contact insert error:', error)
    })

    setSending(false)
    setDone(true)
  }

  if (done) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.replace('/(tabs)/mypage' as any)} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={Colors.accent} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>お問い合わせ</Text>
          <View style={{ width: 32 }} />
        </View>
        <View style={styles.doneWrap}>
          <View style={styles.doneIcon}>
            <Ionicons name="checkmark-circle" size={56} color={Colors.accent} />
          </View>
          <Text style={styles.doneTitle}>送信しました</Text>
          <Text style={styles.doneSub}>お問い合わせを受け付けました。{'\n'}内容を確認の上、ご連絡いたします。</Text>
          <TouchableOpacity style={styles.doneBtn} onPress={() => router.replace('/(tabs)/mypage' as any)}>
            <Text style={styles.doneBtnText}>戻る</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/(tabs)/mypage' as any)} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>お問い合わせ</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.fieldLabel}>カテゴリ</Text>
        <View style={styles.categoryGrid}>
          {CATEGORIES.map(c => (
            <TouchableOpacity
              key={c.key}
              style={[styles.categoryItem, category === c.key && styles.categoryItemActive]}
              onPress={() => setCategory(c.key)}
              activeOpacity={0.7}
            >
              <Ionicons name={c.icon} size={20} color={category === c.key ? Colors.white : Colors.accent} />
              <Text style={[styles.categoryLabel, category === c.key && styles.categoryLabelActive]}>
                {c.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.fieldLabel}>内容</Text>
        <TextInput
          style={styles.textarea}
          placeholder="詳細をできるだけ具体的に入力してください..."
          placeholderTextColor={Colors.textLight}
          value={body}
          onChangeText={setBody}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
        />

        <TouchableOpacity
          style={[styles.sendBtn, (!category || !body.trim() || sending) && styles.btnDisabled]}
          onPress={handleSend}
          disabled={!category || !body.trim() || sending}
        >
          {sending
            ? <ActivityIndicator color={Colors.white} />
            : <>
                <Ionicons name="send-outline" size={18} color={Colors.white} />
                <Text style={styles.sendBtnText}>送信する</Text>
              </>
          }
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.header, paddingTop: 36, paddingHorizontal: 16, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backButton: { padding: 4, width: 32 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: Colors.text },
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  fieldLabel: {
    fontSize: 12, fontWeight: '700', color: Colors.textLight,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8,
  },
  fieldHint: { fontSize: 11, color: Colors.textLight },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryItem: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: Colors.accent, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, backgroundColor: Colors.white,
  },
  categoryItemActive: { backgroundColor: Colors.accent },
  categoryLabel: { fontSize: 13, fontWeight: '600', color: Colors.accent },
  categoryLabelActive: { color: Colors.white },
  textarea: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 12,
    padding: 14, fontSize: 15, color: Colors.text, backgroundColor: Colors.white,
    minHeight: 140,
  },
  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.accent, borderRadius: 12, paddingVertical: 16, marginTop: 8,
  },
  sendBtnText: { color: Colors.white, fontWeight: '700', fontSize: 16 },
  btnDisabled: { opacity: 0.45 },
  doneWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  doneIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: `${Colors.accent}15`, alignItems: 'center', justifyContent: 'center' },
  doneTitle: { fontSize: 22, fontWeight: '800', color: Colors.text },
  doneSub: { fontSize: 14, color: Colors.textLight, textAlign: 'center', lineHeight: 22 },
  doneBtn: { backgroundColor: Colors.accent, borderRadius: 12, paddingHorizontal: 32, paddingVertical: 14, marginTop: 8 },
  doneBtnText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
})

import { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { Colors } from '../constants/colors'

const REASONS = [
  { key: 'spam', label: 'スパム・宣伝' },
  { key: 'harassment', label: 'ハラスメント・嫌がらせ' },
  { key: 'hate', label: 'ヘイトスピーチ・差別的な内容' },
  { key: 'violence', label: '暴力・危険なコンテンツ' },
  { key: 'adult', label: '不適切な成人向けコンテンツ' },
  { key: 'misinformation', label: '虚偽情報・誤解を招く内容' },
  { key: 'other', label: 'その他' },
]

export default function ReportScreen() {
  const { userId, broadcastId, displayName } = useLocalSearchParams<{
    userId?: string
    broadcastId?: string
    displayName?: string
  }>()
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const handleSubmit = async () => {
    if (!reason) return
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }
    const { error } = await supabase.from('reports').insert({
      reporter_id: user.id,
      reported_user_id: userId ?? null,
      reported_broadcast_id: broadcastId ?? null,
      reason,
      details: details.trim() || null,
    })
    setLoading(false)
    if (error) {
      Alert.alert('エラー', '送信できませんでした。後ほど再試行してください。')
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', gap: 16 }]}>
        <Ionicons name="checkmark-circle" size={64} color="#38A169" />
        <Text style={styles.doneTitle}>報告を受け付けました</Text>
        <Text style={styles.doneDesc}>ご報告ありがとうございます。内容を確認し、適切に対応します。</Text>
        <TouchableOpacity style={styles.doneBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/home' as any)}>
          <Text style={styles.doneBtnText}>閉じる</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/home' as any)} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>報告する</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {displayName && (
          <View style={styles.targetBox}>
            <Ionicons name={broadcastId ? 'megaphone-outline' : 'person-outline'} size={18} color={Colors.textLight} />
            <Text style={styles.targetText}>
              {broadcastId ? `投稿：${displayName}` : `ユーザー：${displayName}`}
            </Text>
          </View>
        )}

        <Text style={styles.sectionLabel}>報告の理由</Text>
        <View style={styles.section}>
          {REASONS.map((item, i) => (
            <View key={item.key}>
              {i > 0 && <View style={styles.divider} />}
              <TouchableOpacity
                style={styles.reasonRow}
                onPress={() => setReason(item.key)}
              >
                <View style={[styles.radio, reason === item.key && styles.radioSelected]}>
                  {reason === item.key && <View style={styles.radioDot} />}
                </View>
                <Text style={[styles.reasonLabel, reason === item.key && { color: Colors.accent }]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <Text style={styles.sectionLabel}>詳細（任意）</Text>
        <TextInput
          style={styles.detailInput}
          placeholder="具体的な状況を教えてください（任意）"
          placeholderTextColor={Colors.textLight}
          value={details}
          onChangeText={setDetails}
          multiline
          numberOfLines={4}
          maxLength={500}
        />
        <Text style={styles.charCount}>{details.length}/500</Text>

        <TouchableOpacity
          style={[styles.submitBtn, (!reason || loading) && styles.btnDisabled]}
          onPress={handleSubmit}
          disabled={!reason || loading}
        >
          {loading
            ? <ActivityIndicator color={Colors.white} />
            : <Text style={styles.submitBtnText}>報告を送信</Text>
          }
        </TouchableOpacity>

        <Text style={styles.note}>
          報告内容は運営チームが確認します。虚偽の報告を繰り返した場合、アカウントが制限される場合があります。
        </Text>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.header,
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: { padding: 4, width: 32 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  content: { padding: 16, gap: 8 },
  targetBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.white,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 8,
  },
  targetText: { fontSize: 13, color: Colors.text },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.textLight,
    textTransform: 'uppercase', letterSpacing: 0.5,
    paddingHorizontal: 4, paddingTop: 8, paddingBottom: 4,
  },
  section: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginBottom: 8,
  },
  divider: { height: 1, backgroundColor: Colors.border, marginLeft: 46 },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  radioSelected: { borderColor: Colors.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.accent },
  reasonLabel: { fontSize: 15, color: Colors.text },
  detailInput: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    fontSize: 14,
    color: Colors.text,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  charCount: { fontSize: 11, color: Colors.textLight, textAlign: 'right', marginTop: 4 },
  submitBtn: { backgroundColor: Colors.accent, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  btnDisabled: { opacity: 0.45 },
  submitBtnText: { color: Colors.white, fontWeight: '700', fontSize: 16 },
  note: { fontSize: 11, color: Colors.textLight, lineHeight: 18, textAlign: 'center', paddingTop: 8 },
  doneTitle: { fontSize: 20, fontWeight: '800', color: Colors.text },
  doneDesc: { fontSize: 14, color: Colors.textLight, textAlign: 'center', paddingHorizontal: 32, lineHeight: 22 },
  doneBtn: { backgroundColor: Colors.accent, borderRadius: 12, paddingHorizontal: 40, paddingVertical: 14 },
  doneBtnText: { color: Colors.white, fontWeight: '700', fontSize: 16 },
})

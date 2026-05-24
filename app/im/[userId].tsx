import { useLocalSearchParams } from 'expo-router'
import IMChatPanel from '../components/IMChatPanel'

export default function IMScreen() {
  const { userId: partnerId } = useLocalSearchParams<{ userId: string }>()
  return <IMChatPanel partnerId={partnerId} />
}

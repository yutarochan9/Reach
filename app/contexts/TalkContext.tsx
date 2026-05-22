import { createContext, useContext } from 'react'

export type TalkContextType = {
  selectedTalkId: string | null
  setSelectedTalkId: (id: string | null) => void
  isDesktop: boolean
}

export const TalkContext = createContext<TalkContextType>({
  selectedTalkId: null,
  setSelectedTalkId: () => {},
  isDesktop: false,
})

export const useTalkContext = () => useContext(TalkContext)

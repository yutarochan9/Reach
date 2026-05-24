import { createContext, useContext } from 'react'

export type TalkContextType = {
  selectedTalkId: string | null
  setSelectedTalkId: (id: string | null) => void
  selectedDmId: string | null
  setSelectedDmId: (id: string | null) => void
  isDesktop: boolean
}

export const TalkContext = createContext<TalkContextType>({
  selectedTalkId: null,
  setSelectedTalkId: () => {},
  selectedDmId: null,
  setSelectedDmId: () => {},
  isDesktop: false,
})

export const useTalkContext = () => useContext(TalkContext)

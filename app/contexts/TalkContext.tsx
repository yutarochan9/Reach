import { createContext, useContext } from 'react'

export type TalkContextType = {
  selectedTalkId: string | null
  setSelectedTalkId: (id: string | null) => void
  selectedDmId: string | null
  setSelectedDmId: (id: string | null) => void
  isDesktop: boolean
  dmReloadKey: number
  triggerDmReload: () => void
}

export const TalkContext = createContext<TalkContextType>({
  selectedTalkId: null,
  setSelectedTalkId: () => {},
  selectedDmId: null,
  setSelectedDmId: () => {},
  isDesktop: false,
  dmReloadKey: 0,
  triggerDmReload: () => {},
})

export const useTalkContext = () => useContext(TalkContext)

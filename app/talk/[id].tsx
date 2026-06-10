import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image, Modal, Pressable, Linking,
  useWindowDimensions, ScrollView, Share, Animated,
} from 'react-native'
const isWeb = Platform.OS === 'web'

// html2canvas をモジュール読み込み時に事前ロード（iOS Safari の gesture context を保持するため）
// ユーザーがシェアボタンを押す前にモジュールを準備しておく
let _html2canvas: ((el: HTMLElement, opts?: any) => Promise<HTMLCanvasElement>) | null = null
if (isWeb && typeof window !== 'undefined') {
  import('html2canvas').then(m => { _html2canvas = m.default }).catch(() => {})
}

import AsyncStorage from '@react-native-async-storage/async-storage'
import { useLocalSearchParams, router } from 'expo-router'
import Head from 'expo-router/head'
// react-native-view-shot / expo-sharing はネイティブ専用（将来対応）

// セッション内メモリキャッシュ（5分TTL）
const richMenuMem = new Map<string, { value: any; expiresAt: number }>()
import { Ionicons } from '@expo/vector-icons'
import { Video, ResizeMode } from 'expo-av'
import { supabase } from '../../lib/supabase'
import { Colors } from '../../constants/colors'
import { sendPushToUsers } from '../../lib/notifications'

type Broadcast = {
  id: string
  content: string
  image_url: string | null
  image_link_url: string | null
  video_url: string | null
  created_at: string
  block_order: number
  group_id: string | null
  public_reactions: boolean
  is_subscriber_only: boolean
}

type BroadcastGroup = {
  anchorId: string
  group_id: string | null
  blocks: Broadcast[]
  like_count: number
  liked: boolean
  read_count: number
  public_reactions: boolean
  comment_count: number
  is_subscriber_only: boolean
}

export default function TalkDetailScreen() {
  const { width } = useWindowDimensions()
  const isDesktop = isWeb && width >= 900
  const params = useLocalSearchParams<{ id: string }>()
  const senderId = Array.isArray(params.id) ? params.id[0] : params.id
  const [myId, setMyId] = useState<string | null>(null)
  const [isSelf, setIsSelf] = useState(false)
  const [loading, setLoading] = useState(true)
  const [senderName, setSenderName] = useState('')
  const [senderAvatar, setSenderAvatar] = useState<string | null>(null)
  const [senderIsOfficial, setSenderIsOfficial] = useState(false)
  const [senderBio, setSenderBio] = useState<string | null>(null)
  const [senderUsername, setSenderUsername] = useState<string | null>(null)
  const [isFollowing, setIsFollowing] = useState(false)
  const [isSubscriber, setIsSubscriber] = useState(false)
  const [isPrivateGated, setIsPrivateGated] = useState(false) // 鍵垢で未承認フォロワーの場合
  const [isAdmin, setIsAdmin] = useState(false) // 管理者は鍵垢もバイパス可能
  const [groups, setGroups] = useState<BroadcastGroup[]>([])
  // 画像の自然サイズキャッシュ（URL → {w, h}）
  const [imageSizes, setImageSizes] = useState<Record<string, { w: number; h: number }>>({})
  const [imText, setImText] = useState('')
  const IM_LINE_H = 22
  const IM_MIN_H  = IM_LINE_H + 20
  const IM_MAX_H  = IM_LINE_H * 5 + 20
  const [imInputH, setImInputH] = useState(IM_MIN_H)
  const [longPressGroup, setLongPressGroup] = useState<BroadcastGroup | null>(null)
  const [richMenu, setRichMenu] = useState<{ buttons: any[]; is_active: boolean; panel_bg_image?: string | null } | null>(null)
  const [richMenuLoading, setRichMenuLoading] = useState(true)
  const [tileVisible, setTileVisible] = useState(false)
  const tileLoadedRef = useRef(0)
  const [tileOpen, setTileOpen] = useState(true)
  const flatListRef = useRef<FlatList>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const firstUnreadIndexRef = useRef<number>(-1)   // 最初の未読グループのインデックス（-1=全既読）
  const initialScrollDoneRef = useRef(false)        // 初回スクロール済みフラグ
  const userScrolledUpRef = useRef(false)           // ユーザーが手動で上にスクロールしたフラグ
  const prevScrollYRef = useRef(0)                  // スクロール方向検出用
  const tileGridAnim = useRef(new Animated.Value(1)).current  // タイルアニメーション 1=open,0=closed
  const tileClosedByScrollRef = useRef(false)       // スクロールで閉じたか
  const tileOpenRef = useRef(true)                  // stale closure回避用
  // メッセージグループのDOM要素をシェア用にキャッシュ（id → DOM node）
  const groupRefs = useRef<Map<string, any>>(new Map())
  // フッター（タイムスタンプ+シェアボタン）のDOM要素キャッシュ（キャプチャ前に非表示にする）
  const footerRefs = useRef<Map<string, any>>(new Map())
  const [webKbHeight, setWebKbHeight] = useState(0)
  // 検索
  const [searchActive, setSearchActive] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // 検索フィルター済みグループ
  // キーワード検索 + 日付部分一致（例: "2025-05" "5月" "05-20" など）を1つの入力で賄う
  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim()
    if (!searchActive || !q) return groups
    const qLower = q.toLowerCase()
    return groups.filter(g => {
      const anchor = g.blocks[0]
      if (!anchor) return false
      // 日付文字列（YYYY-MM-DD / YYYY/MM/DD どちらでも部分一致）
      const dateStr = anchor.created_at.slice(0, 10) // "2025-05-20"
      const dateSlash = dateStr.replace(/-/g, '/')   // "2025/05/20"
      const d = new Date(anchor.created_at)
      const dateJa = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
      if (dateStr.includes(q) || dateSlash.includes(q) || dateJa.includes(q)) return true
      // コンテンツのキーワード一致
      return g.blocks.some(b => b.content.toLowerCase().includes(qLower))
    })
  }, [groups, searchActive, searchQuery])

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return
    const vv = (window as any).visualViewport
    if (!vv) return
    const update = () => setWebKbHeight(Math.max(0, window.innerHeight - vv.height))
    vv.addEventListener('resize', update)
    return () => vv.removeEventListener('resize', update)
  }, [])

  // タイル: メモリ→AsyncStorage→ネットワーク の順に即時表示
  useEffect(() => {
    const key = `rich_menu_${senderId}`

    // 1. メモリキャッシュ（5分TTL・同セッション内は即時・同期）
    const cached = richMenuMem.get(senderId)
    if (cached && cached.expiresAt > Date.now()) {
      setRichMenu(cached.value)
      setRichMenuLoading(false)
    } else {
      // 2. AsyncStorageキャッシュ（アプリ再起動後も即時）
      AsyncStorage.getItem(key).then(cached => {
        if (cached) {
          try {
            const parsed = JSON.parse(cached)
            richMenuMem.set(senderId, { value: parsed, expiresAt: Date.now() + 5 * 60 * 1000 })
            setRichMenu(parsed)
          } catch {}
        }
        setRichMenuLoading(false)
      }).catch(() => setRichMenuLoading(false))
    }

    // 3. ネットワーク（常にバックグラウンドで最新化）
    supabase.from('tiles')
      .select('buttons, is_active, panel_bg_image')
      .eq('creator_id', senderId)
      .maybeSingle()
      .then(({ data: menu }) => {
        const val = menu?.is_active ? menu : null
        richMenuMem.set(senderId, { value: val, expiresAt: Date.now() + 5 * 60 * 1000 })
        setRichMenu(val)
        if (val) AsyncStorage.setItem(key, JSON.stringify(val)).catch(() => {})
        else AsyncStorage.removeItem(key).catch(() => {})
      })
  }, [senderId])

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      setMyId(user?.id ?? null)
      const self = user?.id === senderId
      setIsSelf(self)

      const [{ data: profile }, { data: broadcasts }, myFollowResult, viewerProfileResult] = await Promise.all([
        supabase.from('profiles').select('display_name, avatar_url, is_official, bio, username, is_private').eq('id', senderId).single(),
        supabase.from('broadcasts')
          .select('id, content, image_url, image_link_url, video_url, created_at, block_order, group_id, public_reactions, is_subscriber_only')
          .eq('sender_id', senderId)
          .eq('status', 'published')
          .or(`recipient_id.is.null,recipient_id.eq.${user?.id ?? 'none'}`)
          .order('created_at', { ascending: true }),
        user && !self
          ? supabase.from('follows').select('follower_id').eq('follower_id', user.id).eq('following_id', senderId).maybeSingle()
          : Promise.resolve({ data: null }),
        // 閲覧者の管理者フラグを取得（鍵垢バイパス・分析への影響排除のため）
        user && !self
          ? supabase.from('profiles').select('is_admin').eq('id', user.id).single()
          : Promise.resolve({ data: null }),
      ])

      const viewerIsAdmin = !!(viewerProfileResult as any)?.data?.is_admin
      setIsAdmin(viewerIsAdmin)

      setSenderName(profile?.display_name ?? '')
      setSenderAvatar(profile?.avatar_url ?? null)
      setSenderIsOfficial((profile as any)?.is_official ?? false)
      setSenderBio((profile as any)?.bio ?? null)
      setSenderUsername((profile as any)?.username ?? null)
      const following = !!(myFollowResult as any)?.data
      setIsFollowing(following)

      // 鍵アカウントで未フォローなら配信を表示しない（管理者はバイパス）
      const senderIsPrivate = (profile as any)?.is_private ?? false
      if (senderIsPrivate && !self && !following && !viewerIsAdmin) {
        setIsPrivateGated(true)
        setLoading(false)
        return
      }

      // サブスク確認：失敗してもメイン処理に影響させない
      let subscribed = false
      if (user && !self) {
        try {
          const { data: subData } = await supabase
            .from('subscriptions')
            .select('id')
            .eq('subscriber_id', user.id)
            .eq('creator_id', senderId)
            .eq('status', 'active')
            .maybeSingle()
          subscribed = !!subData
        } catch {}
      }
      setIsSubscriber(subscribed)

      // サブスク限定配信は、クリエイター本人またはサブスク登録者のみ表示
      const allBcs = (broadcasts ?? []) as Broadcast[]
      const bcs = self || subscribed ? allBcs : allBcs.filter(b => !b.is_subscriber_only)
      const bcIds = bcs.map(b => b.id)

      const [{ data: reactions }, { data: reads }, { data: commentCounts }] = await Promise.all([
        bcIds.length > 0
          ? supabase.from('reactions').select('broadcast_id, user_id').in('broadcast_id', bcIds)
          : Promise.resolve({ data: [] }),
        bcIds.length > 0 && user
          ? supabase.from('broadcast_reads').select('broadcast_id, user_id').in('broadcast_id', bcIds)
          : Promise.resolve({ data: [] }),
        bcIds.length > 0
          ? supabase.from('messages').select('broadcast_id').in('broadcast_id', bcIds)
          : Promise.resolve({ data: [] }),
      ])

      const likeMap: Record<string, { count: number; liked: boolean }> = {}
      const readMap: Record<string, number> = {}
      const countMap: Record<string, number> = {}
      for (const r of (reactions ?? [])) {
        if (!likeMap[r.broadcast_id]) likeMap[r.broadcast_id] = { count: 0, liked: false }
        likeMap[r.broadcast_id].count++
        if (user && r.user_id === user.id) likeMap[r.broadcast_id].liked = true
      }
      for (const r of (reads ?? [])) readMap[r.broadcast_id] = (readMap[r.broadcast_id] ?? 0) + 1
      for (const r of (commentCounts ?? [])) countMap[(r as any).broadcast_id] = (countMap[(r as any).broadcast_id] ?? 0) + 1

      const groupMap = new Map<string, Broadcast[]>()
      const groupOrder: string[] = []
      for (const b of bcs) {
        const key = b.group_id ?? b.id
        if (!groupMap.has(key)) { groupMap.set(key, []); groupOrder.push(key) }
        groupMap.get(key)!.push(b)
      }

      const result: BroadcastGroup[] = groupOrder.map(key => {
        const blocks = groupMap.get(key)!.sort((a, b) => a.block_order - b.block_order)
        const anchor = blocks[0]
        return {
          anchorId: anchor.id,
          group_id: anchor.group_id,
          blocks,
          like_count: likeMap[anchor.id]?.count ?? 0,
          liked: likeMap[anchor.id]?.liked ?? false,
          read_count: readMap[anchor.id] ?? 0,
          public_reactions: anchor.public_reactions,
          comment_count: countMap[anchor.id] ?? 0,
          is_subscriber_only: anchor.is_subscriber_only ?? false,
        }
      })
      setGroups(result)

      // 管理者は既読・閲覧数に影響しないようスキップ
      if (user && !self && bcIds.length > 0 && !viewerIsAdmin) {
        const alreadyRead = new Set(
          (reads ?? []).filter((r: any) => r.user_id === user.id).map((r: any) => r.broadcast_id)
        )
        const toMark = bcIds.filter(id => !alreadyRead.has(id))

        // 最初の未読グループ���インデックスを記録（スクロール用）
        if (!initialScrollDoneRef.current) {
          let firstUnread = -1
          for (let i = 0; i < result.length; i++) {
            if (!alreadyRead.has(result[i].anchorId)) {
              firstUnread = i
              break
            }
          }
          firstUnreadIndexRef.current = firstUnread
        }

        // 既読マーク（talk_reads + broadcast_reads）
        await supabase.from('talk_reads').upsert(
          { user_id: user.id, sender_id: senderId, last_read_at: new Date().toISOString() },
          { onConflict: 'user_id,sender_id' }
        )
        if (toMark.length > 0) {
          await supabase.from('broadcast_reads').upsert(
            toMark.map(id => ({ broadcast_id: id, user_id: user.id })),
            { onConflict: 'broadcast_id,user_id' }
          )
        }

        // トーク一覧のバッジをクリアするためにAsyncStorageへ記録
        await AsyncStorage.setItem('last_read_talk', senderId)
      }
    } catch (e) {
      console.error('talk/[id] load error:', e)
    } finally {
      setLoading(false)
    }
  }, [senderId])

  useEffect(() => { load() }, [load])

  // groups が更新されたら、含まれる画像URLのサイズを取得
  useEffect(() => {
    const urls = groups.flatMap(g =>
      g.blocks.map(b => b.image_url).filter((u): u is string => !!u)
    )
    urls.forEach(url => {
      setImageSizes(prev => {
        if (prev[url]) return prev          // 既に取得済みならスキップ
        Image.getSize(url, (w, h) => {
          setImageSizes(p => ({ ...p, [url]: { w, h } }))
        }, () => {})
        return prev
      })
    })
  }, [groups])

  // 画像サイズ確定後も最下部へスクロール（全既読・自分の配信の場合）
  // 画像が非同期で読み込まれると onContentSizeChange が追従しないことがあるため
  useEffect(() => {
    if (firstUnreadIndexRef.current <= 0 && groups.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: false })
    }
  }, [imageSizes])

  // ロード完了時スクロール（LINE方式）:
  // 未読あり → 最初の未読へ / 全既読 → 最下部へ
  useEffect(() => {
    if (loading || groups.length === 0 || initialScrollDoneRef.current) return
    initialScrollDoneRef.current = true
    userScrolledUpRef.current = false

    const idx = firstUnreadIndexRef.current
    if (idx > 0) {
      // 未読あり: LINEと同様、最初の未読メッセージの位置へ
      const tryScroll = () => {
        try {
          flatListRef.current?.scrollToIndex({ index: idx, animated: false, viewPosition: 0 })
        } catch {
          flatListRef.current?.scrollToEnd({ animated: false })
        }
      }
      setTimeout(tryScroll, 100)
      setTimeout(tryScroll, 400)
    } else {
      // 全既読: 最下部へ
      const scrollBottom = () => flatListRef.current?.scrollToEnd({ animated: false })
      scrollBottom()
      setTimeout(scrollBottom, 200)
    }
  }, [loading, groups.length])

  // URL と最大幅からアスペクト比を保ったサイズを返す
  const getImgStyle = (url: string, maxW: number) => {
    const size = imageSizes[url]
    if (!size) return { width: maxW, height: Math.round(maxW * 9 / 16) }  // デフォルト16:9
    const ratio = size.h / size.w
    const w = Math.min(maxW, size.w)
    const h = Math.min(Math.round(w * ratio), 360)   // 縦長でも最大360px
    return { width: w, height: h }
  }

  // richMenu が確定したら画像を事前ロードし、全部揃ったら一斉表示
  useEffect(() => {
    if (richMenuLoading) return
    if (!richMenu || !richMenu.buttons?.length) {
      setTileVisible(false)
      return
    }
    const imgUrls = richMenu.buttons
      .map((b: any) => b.bgImage)
      .filter(Boolean) as string[]
    const panelBg = richMenu.panel_bg_image
    const allUrls = panelBg ? [panelBg, ...imgUrls] : imgUrls

    if (allUrls.length === 0) {
      setTileVisible(true)
      return
    }
    tileLoadedRef.current = 0
    setTileVisible(false)
    allUrls.forEach(url => {
      if (isWeb && typeof window !== 'undefined') {
        const img = new window.Image()
        img.onload = img.onerror = () => {
          tileLoadedRef.current++
          if (tileLoadedRef.current >= allUrls.length) setTileVisible(true)
        }
        img.src = url
      } else {
        Image.prefetch(url)
          .catch(() => {})
          .finally(() => {
            tileLoadedRef.current++
            if (tileLoadedRef.current >= allUrls.length) setTileVisible(true)
          })
      }
    })
  }, [richMenu, richMenuLoading])

  useEffect(() => {
    if (!myId || !senderId) return
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
    const channel = supabase
      .channel(`talk-detail-${senderId}-${myId}-${Date.now()}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'broadcasts',
        filter: `sender_id=eq.${senderId}`,
      }, (payload) => {
        try {
          const bc = payload.new as any
          if (bc.status !== 'published') return
          // サブスク限定配信は非サブスクユーザーには表示しない
          if (bc.is_subscriber_only && !isSelf && !isSubscriber) return
          const newBlock: Broadcast = {
            id: bc.id, content: bc.content, image_url: bc.image_url ?? null,
            image_link_url: bc.image_link_url ?? null, video_url: bc.video_url ?? null,
            created_at: bc.created_at, block_order: bc.block_order,
            group_id: bc.group_id ?? null, public_reactions: bc.public_reactions ?? false,
            is_subscriber_only: bc.is_subscriber_only ?? false,
          }
          setGroups(prev => {
            if (bc.group_id) {
              const existing = prev.find(g => g.group_id === bc.group_id)
              if (existing) {
                return prev.map(g =>
                  g.group_id === bc.group_id
                    ? { ...g, blocks: [...g.blocks, newBlock].sort((a, b) => a.block_order - b.block_order) }
                    : g
                )
              }
            }
            return [...prev, {
              anchorId: bc.id, group_id: bc.group_id ?? null, blocks: [newBlock],
              like_count: 0, liked: false, read_count: 0,
              public_reactions: bc.public_reactions ?? false, comment_count: 0,
              is_subscriber_only: bc.is_subscriber_only ?? false,
            }]
          })
          setTimeout(() => flatListRef.current?.scrollToEnd(), 100)
          if (myId !== senderId) {
            supabase.from('broadcast_reads').upsert(
              { broadcast_id: bc.id, user_id: myId },
              { onConflict: 'broadcast_id,user_id' }
            ).catch(() => {})
          }
        } catch {}
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reactions' }, (payload) => {
        setGroups(prev => prev.map(g =>
          g.anchorId === payload.new.broadcast_id
            ? { ...g, like_count: g.like_count + 1, liked: payload.new.user_id === myId ? true : g.liked }
            : g
        ))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'reactions' }, (payload) => {
        setGroups(prev => prev.map(g =>
          g.anchorId === payload.old?.broadcast_id
            ? { ...g, like_count: Math.max(0, g.like_count - 1), liked: payload.old?.user_id === myId ? false : g.liked }
            : g
        ))
      })
      .subscribe()
    channelRef.current = channel
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current).catch(() => {})
        channelRef.current = null
      }
    }
  }, [myId, senderId])

  const handleLike = async (group: BroadcastGroup) => {
    if (!myId) { router.push('/(auth)/login' as any); return }
    if (isSelf) return
    if (group.liked) {
      await supabase.from('reactions').delete()
        .eq('broadcast_id', group.anchorId).eq('user_id', myId).eq('type', 'like')
      setGroups(prev => prev.map(g =>
        g.anchorId === group.anchorId ? { ...g, like_count: Math.max(0, g.like_count - 1), liked: false } : g
      ))
    } else {
      await supabase.from('reactions').insert({ broadcast_id: group.anchorId, user_id: myId, type: 'like' })
      setGroups(prev => prev.map(g =>
        g.anchorId === group.anchorId ? { ...g, like_count: g.like_count + 1, liked: true } : g
      ))
    }
  }

  // スクリーンショットを Supabase Storage にアップロードする。
  // URL短縮のため公開URLでなくタイムスタンプのみ使い、シェアURLは ?s=<ts> で構築する。
  // middleware.ts が ?s= を読んで Storage URL を再構築して og:image に使う。
  const uploadShareImage = async (blob: Blob, ts: number): Promise<boolean> => {
    try {
      const jwt = process.env.EXPO_PUBLIC_SUPABASE_STORAGE_JWT
      if (!jwt) return false
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://mljnbtgaikilcpjjofsh.supabase.co'
      // ファイル名は「送信者ID-タイムスタンプ.png」（重複しない一意な名前）
      const fileName = `${senderId}-${ts}.png`
      const res = await fetch(
        `${supabaseUrl}/storage/v1/object/share-images/${fileName}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${jwt}`,
            'Content-Type': 'image/png',
          },
          body: blob,
        }
      )
      return res.ok
    } catch {
      return false
    }
  }

  // メッセージグループのスクリーンショットを撮って Supabase にアップロード後、
  // og:image 付きのシェア URL を作成して共有する。
  // アップロード失敗時はURLシェア（OGP はデフォルトのReachロゴ）にフォールバック。
  const handleShare = async (group: BroadcastGroup) => {
    const talkUrl = `https://reachapp.jp/talk/${senderId}`

    if (isWeb && typeof window !== 'undefined') {
      // --- Web: スクリーンショット → Supabase アップロード → OGP 付き URL シェア ---
      const el = groupRefs.current.get(group.anchorId) as HTMLElement | undefined
      if (el && _html2canvas) {
        try {
          // --- onclone でクローン DOM を操作（ライブ DOM は一切変えない → ガクつきなし）---
          // footerRef の DOM id を使ってクローン内の対応要素を特定する
          const footerEl = footerRefs.current.get(group.anchorId) as HTMLElement | undefined
          // フッターに一時的な id を付けてクローン内で検索できるようにする
          const FOOTER_CLONE_ID = '__reach_share_footer__'
          if (footerEl) footerEl.id = FOOTER_CLONE_ID

          // html2canvas でメッセージバブル領域をキャプチャ
          // onclone: キャプチャ用クローンDOMだけを変更する（実画面は変化しない）
          const rawCanvas = await _html2canvas(el, {
            useCORS: true,
            allowTaint: false,
            scale: 2,
            backgroundColor: null, // 透明にして後でフレームを自前で追加
            logging: false,
            onclone: (_doc: Document, clonedEl: HTMLElement) => {
              // フッターを非表示（タイムスタンプ・シェアボタン・···）
              const clonedFooter = clonedEl.querySelector(`#${FOOTER_CLONE_ID}`) as HTMLElement | null
              if (clonedFooter) clonedFooter.style.display = 'none'

              // コンテンツ幅を元のまま保ちつつ左右に余白を追加する
              // border-box のまま width を「元幅 + padding分」に広げることで
              // content area = 元の幅（バブル幅が変わらない）、左右に余白が生まれる
              // ※box-sizing を content-box に変えると html2canvas が描画できなくなるため禁止
              const PAD_L = 80  // アバター(36px)+gap(8px)+余白を確保
              const PAD_R = 24  // メッセージ右端に余裕
              clonedEl.style.width = (el.offsetWidth + PAD_L + PAD_R) + 'px'
              clonedEl.style.paddingLeft = PAD_L + 'px'
              clonedEl.style.paddingRight = PAD_R + 'px'
            },
          })

          // 付けた一時 id を削除
          if (footerEl) footerEl.removeAttribute('id')

          // --- 固定サイズのフレームキャンバスを作成 ---
          // 縦は固定（長いメッセージははみ出してクリップ）、横はアプリの幅に合わせる
          const SCALE = 2
          const PAD_T = 16 * SCALE      // 上パディング（少し余白）
          // 固定コンテンツ高さ = 150px（3/4 of 200）。左・下は端まで切り捨て
          const FIXED_CONTENT_H = 175 * SCALE

          const framed = document.createElement('canvas')
          framed.width  = rawCanvas.width   // 左右はそのまま（onclone側で余白確保済み）
          framed.height = FIXED_CONTENT_H + PAD_T
          const ctx = framed.getContext('2d')!

          // 背景（アプリのベース色）
          ctx.fillStyle = '#F5F5F0'
          ctx.fillRect(0, 0, framed.width, framed.height)

          // コンテンツ領域をクリップして固定高さ内だけ描画（下ははみ出してカット）
          ctx.save()
          ctx.beginPath()
          ctx.rect(0, PAD_T, rawCanvas.width, FIXED_CONTENT_H)
          ctx.clip()
          ctx.drawImage(rawCanvas, 0, PAD_T)
          ctx.restore()

          const blob = await new Promise<Blob>((resolve, reject) =>
            framed.toBlob(b => (b ? resolve(b) : reject(new Error('blob null'))), 'image/png')
          )

          // タイムスタンプでファイル名を一意化しアップロード
          // シェアURLは ?s=<タイムスタンプ> のみ（短い）で、
          // middleware.ts がタイムスタンプとcreator IDからStorage URLを再構築する
          const ts = Date.now()
          const uploaded = await uploadShareImage(blob, ts)

          // URL シェア → SNS bot がクロール → OGP カードにスクショが表示される
          const shareUrl = uploaded ? `${talkUrl}?s=${ts}` : talkUrl

          // URL シェア → X bot がクロール → OGP カードにスクショが表示される
          if (navigator.share) {
            await navigator.share({ title: `${senderName} | Reach`, url: shareUrl })
            return
          }
          // Web Share API 自体非対応 → Twitter intent で開く
          window.open(
            `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}`,
            '_blank'
          )
          return
        } catch (e: any) {
          // ユーザーがキャンセルした場合はそのまま終了
          if (e?.name === 'AbortError') return
          // それ以外はURLシェアにフォールバック（コンソールには記録）
          console.warn('screenshot share failed, falling back to URL share:', e?.message)
        }
      }

      // --- フォールバック: 通常 URL シェア（OGP は Reach ロゴ） ---
      try {
        if (navigator.share) {
          await navigator.share({ title: `${senderName} | Reach`, url: talkUrl })
        } else {
          window.open(
            `https://twitter.com/intent/tweet?url=${encodeURIComponent(talkUrl)}`,
            '_blank'
          )
        }
      } catch (e: any) {
        if (e?.name !== 'AbortError') console.error('share error:', e)
      }
      return
    }

    // --- ネイティブ (iOS/Android): テキスト+URLでシェア ---
    try {
      await Share.share({ message: `${senderName} さんのReachをチェック 👀\n${talkUrl}` })
    } catch {}
  }

  const handleFollowToggle = async () => {
    if (!myId) return
    if (isFollowing) {
      await supabase.from('follows').delete().eq('follower_id', myId).eq('following_id', senderId)
      setIsFollowing(false)
    } else {
      await supabase.from('follows').insert({ follower_id: myId, following_id: senderId })
      setIsFollowing(true)
    }
  }

  // メンバーシップ加入 / 退会
  const handleMembershipToggle = async () => {
    if (!myId) { router.push('/(auth)/login' as any); return }
    if (isSelf) return
    if (isSubscriber) {
      // 退会確認
      const doLeave = async () => {
        await supabase.from('subscriptions')
          .delete()
          .eq('subscriber_id', myId)
          .eq('creator_id', senderId)
        setIsSubscriber(false)
        setGroups(prev => prev.filter(g => !g.is_subscriber_only))
      }
      if (isWeb) {
        if (window.confirm('退会すると、メンバーシップ限定コンテンツはこの画面から即座に消えます。\n退会しますか？')) {
          doLeave()
        }
      } else {
        Alert.alert(
          'メンバーシップを退会',
          '退会すると、メンバーシップ限定コンテンツはこの画面から即座に消えます。\n\nよろしいですか？',
          [
            { text: 'キャンセル', style: 'cancel' },
            { text: '退会する', style: 'destructive', onPress: doLeave },
          ]
        )
      }
    } else {
      // 加入
      const { error } = await supabase.from('subscriptions').insert({
        subscriber_id: myId,
        creator_id: senderId,
        status: 'active',
      })
      if (error) {
        if (isWeb) window.alert('エラー: ' + error.message)
        else Alert.alert('エラー', error.message)
      } else {
        setIsSubscriber(true)
        load()
      }
    }
  }

  const handleSend = async () => {
    if (!imText.trim() || !myId) return
    const text = imText.trim()
    setImText('')
    await supabase.from('messages').insert({
      sender_id: myId,
      receiver_id: senderId,
      content: text,
    })
    const { data: myProfile } = await supabase
      .from('profiles').select('display_name').eq('id', myId).single()
    sendPushToUsers([senderId], myProfile?.display_name ?? 'メッセージ', text.slice(0, 80), { type: 'talk_dm' }, 'messages')

    // 自動応答
    const capturedMyId = myId
    setTimeout(async () => {
      await supabase.rpc('check_and_send_auto_response', {
        p_creator_id: senderId,
        p_receiver_id: capturedMyId,
        p_message: text,
      })
    }, 1200)

    // DM画面へ遷移
    router.push(`/im/${senderId}` as any)
  }

  // 検索結果タップ → 検索を閉じてそのメッセージへスクロール
  const navigateToGroup = (anchorId: string) => {
    const idx = groups.findIndex(g => g.anchorId === anchorId)
    setSearchActive(false)
    setSearchQuery('')
    if (idx < 0) return
    setTimeout(() => {
      flatListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.2 })
    }, 80)
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    )
  }

  // 鍵アカウントで未フォロー → 非公開ゲート画面
  if (isPrivateGated) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/' as any)} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={Colors.accent} />
          </TouchableOpacity>
          <Text style={styles.headerName}>{senderName}</Text>
          <View style={{ width: 44 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32 }}>
          <Ionicons name="lock-closed" size={48} color={Colors.border} />
          <Text style={{ fontSize: 18, fontWeight: '700', color: Colors.text }}>非公開アカウントです</Text>
          <Text style={{ fontSize: 14, color: Colors.textLight, textAlign: 'center', lineHeight: 22 }}>
            このアカウントは鍵がかかっています。{'\n'}フォローリクエストを送って承認されると配信が見られます。
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: Colors.accent, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 }}
            onPress={() => router.push(`/creator/${senderId}` as any)}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>プロフィールを見る</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  const BroadcastList = (
    <FlatList
      ref={flatListRef}
      data={filteredGroups}
      keyExtractor={item => item.anchorId}
      style={{ flex: 1 }}
      contentContainerStyle={[styles.messageList, tileVisible && { paddingBottom: 20 }]}
      onContentSizeChange={() => {
        // 初回スクロールはuseEffectで処理するのでスキップ
        if (!initialScrollDoneRef.current) return
        // ユーザーが上にスクロール中でなければ最下部へ追従
        if (!userScrolledUpRef.current) {
          flatListRef.current?.scrollToEnd({ animated: false })
        }
      }}
      onScroll={(e) => {
        const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent
        const currentY = contentOffset.y
        const distFromBottom = contentSize.height - currentY - layoutMeasurement.height
        if (distFromBottom < 60) {
          userScrolledUpRef.current = false
          // 最下部に戻ったとき、スクロールで閉じたタイルを再表示（アニメーション付き）
          if (!tileOpenRef.current && tileClosedByScrollRef.current && tileVisible) {
            openTileAnimated()
          }
        } else {
          // 上方向スクロールを検出してタイルを閉じる（方向ベース・自然なアニメーション）
          if (tileOpenRef.current && currentY < prevScrollYRef.current) {
            closeTileAnimated(true)
          }
          userScrolledUpRef.current = true
        }
        prevScrollYRef.current = currentY
      }}
      scrollEventThrottle={50}
      onScrollBeginDrag={() => {
        userScrolledUpRef.current = true
        if (tileOpenRef.current) closeTileAnimated(true)
      }}
      onScrollToIndexFailed={(info) => {
        // アイテムが未描画の場合は推定位置へスクロール
        setTimeout(() => {
          flatListRef.current?.scrollToOffset({
            offset: info.averageItemLength * info.index,
            animated: false,
          })
        }, 100)
      }}
      ListEmptyComponent={() => (
        <View style={styles.emptyWrap}>
          <Ionicons name="radio-outline" size={48} color={Colors.border} />
          <Text style={styles.emptyText}>まだ配信がありません</Text>
        </View>
      )}
      renderItem={({ item: group, index }) => {
        if (!group.blocks.length) return null
        const prevGroup = index > 0 ? filteredGroups[index - 1] : null
        const showDate = !prevGroup || !prevGroup.blocks.length ||
          new Date(group.blocks[0].created_at).toDateString() !== new Date(prevGroup.blocks[0].created_at).toDateString()
        return (
          <>
            {showDate && (
              <View style={styles.dateDivider}>
                <Text style={styles.dateText}>
                  {new Date(group.blocks[0].created_at).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })}
                </Text>
              </View>
            )}
            <Pressable
              style={[styles.groupWrap, searchActive && { backgroundColor: 'transparent' }]}
              onPress={searchActive ? () => navigateToGroup(group.anchorId) : undefined}
              ref={(ref: any) => {
                // DOM要素をシェア用にキャッシュ（unmount時は削除）
                if (ref) groupRefs.current.set(group.anchorId, ref)
                else groupRefs.current.delete(group.anchorId)
              }}
            >
              <View style={styles.broadcastRow}>
                <View style={styles.broadcastAvatar}>
                  {senderAvatar
                    ? <Image source={{ uri: senderAvatar }} style={styles.broadcastAvatarImg} />
                    : <Text style={styles.broadcastAvatarText}>{senderName[0]}</Text>
                  }
                </View>
                <View style={styles.blocksWrap}>
                  {/* 送信者名 + メンバーシップバッジ（web対応でflexWrap） */}
                  <View style={styles.senderNameRow}>
                    <Text style={styles.senderNameLabel}>{senderName}</Text>
                    {group.is_subscriber_only && (
                      <View style={styles.subscriberBadge}>
                        <Ionicons name="lock-closed" size={10} color={Colors.white} />
                        <Text style={styles.subscriberBadgeText}>メンバーシップ</Text>
                      </View>
                    )}
                  </View>
                  {group.blocks.map((block, idx) => {
                    const urlMatch = block.content.match(/(https?:\/\/[^\s]+)/)
                    const linkUrl = urlMatch?.[1] ?? null
                    const hasText = block.content.trim() && block.content !== '　'
                    const isImageOnly = !!block.image_url && !hasText && !block.video_url
                    const isVideoOnly = !!block.video_url && !hasText && !block.image_url

                    const openImgLink = () => {
                      if (!block.image_link_url) return
                      if (isWeb && typeof window !== 'undefined') {
                        window.open(block.image_link_url, '_blank', 'noopener')
                      } else {
                        Linking.openURL(block.image_link_url).catch(() => {})
                      }
                    }

                    if (isVideoOnly) {
                      return (
                        <Video
                          key={block.id}
                          source={{ uri: block.video_url! }}
                          style={[styles.broadcastVideoOnly, idx > 0 && { marginTop: 4 }]}
                          useNativeControls
                          resizeMode={ResizeMode.CONTAIN}
                          isLooping={false}
                        />
                      )
                    }

                    if (isImageOnly) {
                      // 画像のみ → 吹き出しなし、画像だけ表示
                      const imgDims = getImgStyle(block.image_url!, Math.min(Math.floor(width * 0.72), 300))
                      const imgEl = (
                        <Image
                          source={{ uri: block.image_url! }}
                          style={[styles.broadcastImageOnly, imgDims, idx > 0 && { marginTop: 4 }]}
                          resizeMode="cover"
                        />
                      )
                      return block.image_link_url ? (
                        <TouchableOpacity key={block.id} onPress={openImgLink} activeOpacity={0.85}>
                          {imgEl}
                        </TouchableOpacity>
                      ) : (
                        <View key={block.id}>{imgEl}</View>
                      )
                    }

                    const imgDims = block.image_url ? getImgStyle(block.image_url, Math.min(Math.floor(width * 0.72), 300)) : null
                    return (
                      <View key={block.id} style={[styles.broadcastBubble, idx > 0 && { marginTop: 4 }]}>
                        {block.video_url && (
                          <Video
                            source={{ uri: block.video_url }}
                            style={styles.broadcastVideo}
                            useNativeControls
                            resizeMode={ResizeMode.CONTAIN}
                            isLooping={false}
                          />
                        )}
                        {block.image_url && (
                          block.image_link_url ? (
                            <TouchableOpacity onPress={openImgLink} activeOpacity={0.85}>
                              <Image source={{ uri: block.image_url }} style={[styles.broadcastImage, imgDims!]} resizeMode="cover" />
                            </TouchableOpacity>
                          ) : (
                            <Image source={{ uri: block.image_url }} style={[styles.broadcastImage, imgDims!]} resizeMode="cover" />
                          )
                        )}
                        {hasText && (
                          <LinkifiedText
                            text={block.content}
                            textStyle={styles.broadcastText}
                            linkStyle={styles.broadcastLink}
                          />
                        )}
                        {linkUrl && <LinkPreview url={linkUrl} />}
                      </View>
                    )
                  })}
                </View>
              </View>
            </Pressable>

              {/* 時刻 + シェア + ···ボタン（footerRefs でスクショから除外） */}
              <View
                style={[styles.bubbleFooter, { paddingLeft: 44 }]}
                ref={(ref: any) => {
                  if (ref) footerRefs.current.set(group.anchorId, ref)
                  else footerRefs.current.delete(group.anchorId)
                }}
              >
                <Text style={styles.bubbleTime}>
                  {formatTime(group.blocks[group.blocks.length - 1].created_at)}
                </Text>
                <TouchableOpacity
                  style={styles.shareBtn}
                  onPress={() => handleShare(group)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="share-outline" size={14} color={Colors.textLight} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.moreBtn}
                  onPress={() => setLongPressGroup(group)}
                >
                  <Text style={styles.moreBtnText}>···</Text>
                </TouchableOpacity>
              </View>
          </>
        )
      }}
    />
  )

  const ReactionPopup = (
    <Modal
      visible={!!longPressGroup}
      transparent
      animationType="slide"
      onRequestClose={() => setLongPressGroup(null)}
    >
      <Pressable style={styles.popupOverlay} onPress={() => setLongPressGroup(null)}>
        <Pressable style={styles.popupBox} onPress={e => e.stopPropagation()}>
          {/* ドラッグハンドル */}
          <View style={styles.sheetHandle} />

          {/* 公開/非公開インジケーター */}
          <View style={styles.popupPublicRow}>
            <Ionicons
              name={longPressGroup?.public_reactions ? 'globe-outline' : 'lock-closed-outline'}
              size={13}
              color={Colors.textLight}
            />
            <Text style={styles.popupPublicText}>
              {longPressGroup?.public_reactions ? '公開配信' : '非公開配信'}
            </Text>
          </View>

          {/* いいね（全員表示、視聴者のみタップ可） */}
          <TouchableOpacity
            style={styles.popupBtn}
            onPress={() => {
              if (!isSelf && longPressGroup) handleLike(longPressGroup)
              if (!isSelf) setLongPressGroup(null)
            }}
            activeOpacity={isSelf ? 1 : 0.7}
          >
            <View style={[styles.popupIconWrap, longPressGroup?.liked && { backgroundColor: '#FFF0F0' }]}>
              <Ionicons
                name={longPressGroup?.liked ? 'heart' : 'heart-outline'}
                size={22}
                color={longPressGroup?.liked ? '#E53E3E' : Colors.text}
              />
            </View>
            <Text style={styles.popupBtnText}>いいね（{longPressGroup?.like_count ?? 0}）</Text>
          </TouchableOpacity>

          {/* コメント（全員） */}
          <TouchableOpacity
            style={styles.popupBtn}
            onPress={() => {
              setLongPressGroup(null)
              if (!myId) { router.push('/(auth)/login' as any); return }
              if (longPressGroup) router.push(`/broadcast-thread/${longPressGroup.anchorId}` as any)
            }}
          >
            <View style={styles.popupIconWrap}>
              <Ionicons name="chatbubble-outline" size={22} color={Colors.text} />
            </View>
            <Text style={styles.popupBtnText}>コメント（{longPressGroup?.comment_count ?? 0}）</Text>
          </TouchableOpacity>

          {/* キャンセル */}
          <TouchableOpacity style={[styles.popupBtn, styles.popupCancelBtn]} onPress={() => setLongPressGroup(null)}>
            <Text style={styles.popupCancelText}>キャンセル</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  )

  // タイルグリッドのJSX（isSelf・非selfで共有）
  // 旧形式（x/y/w/h なし）のデフォルト配置
  const DEFAULT_TILE_POS = [
    { x: 0, y: 0, w: 9, h: 9 }, { x: 9, y: 0, w: 9, h: 9 }, { x: 18, y: 0, w: 9, h: 9 },
    { x: 0, y: 9, w: 9, h: 9 }, { x: 9, y: 9, w: 9, h: 9 }, { x: 18, y: 9, w: 9, h: 9 },
  ]
  const GRID_C = 27
  const GRID_R = 18
  // タイルをアニメーション付きで閉じる
  const closeTileAnimated = (byScroll = false) => {
    tileClosedByScrollRef.current = byScroll
    tileOpenRef.current = false
    setTileOpen(false)
    Animated.timing(tileGridAnim, { toValue: 0, duration: 220, useNativeDriver: false }).start()
  }
  // タイルをアニメーション付きで開く
  const openTileAnimated = () => {
    tileOpenRef.current = true
    setTileOpen(true)
    Animated.timing(tileGridAnim, { toValue: 1, duration: 250, useNativeDriver: false }).start()
  }

  const normalizedButtons = richMenu?.buttons.map((b: any, i: number) =>
    b.x != null ? b : { ...b, ...(DEFAULT_TILE_POS[i] ?? { x: 0, y: 0, w: 6, h: 9 }) }
  ) ?? []

  const TilePanel = tileVisible && richMenu && normalizedButtons.length > 0 ? (
    <View style={[
      styles.tileContainer,
      isWeb && richMenu.panel_bg_image
        ? { backgroundImage: `url(${richMenu.panel_bg_image})`, backgroundSize: 'cover', backgroundPosition: 'center' } as any
        : undefined,
    ]}>
          {/* ネイティブのみImage使用。webはCSSbackgroundImageで同一レンダリングサイクルに表示 */}
          {!isWeb && richMenu.panel_bg_image && (
            <Image source={{ uri: richMenu.panel_bg_image }} style={StyleSheet.absoluteFillObject} resizeMode="cover" pointerEvents="none" />
          )}
          {richMenu.panel_bg_image && <View style={styles.panelDimOverlay} pointerEvents="none" />}
          <TouchableOpacity
            style={[styles.tileHandle, !richMenu.panel_bg_image && { borderBottomColor: 'rgba(0,0,0,0.06)' }]}
            onPress={() => tileOpenRef.current ? closeTileAnimated(false) : openTileAnimated()}
            activeOpacity={0.7}
          >
            <View style={[styles.tileHandleBar, !richMenu.panel_bg_image && { backgroundColor: 'rgba(0,0,0,0.15)' }]} />
          </TouchableOpacity>
          <Animated.View style={{ overflow: 'hidden', maxHeight: tileGridAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 500] }) }}>
            <View style={styles.tileGridArea}>
              {normalizedButtons.map((btn: any) => (
                <TouchableOpacity
                  key={btn.id}
                  style={{
                    position: 'absolute',
                    left: `${(btn.x / GRID_C) * 100}%` as any,
                    top: `${(btn.y / GRID_R) * 100}%` as any,
                    width: `${(btn.w / GRID_C) * 100}%` as any,
                    height: `${(btn.h / GRID_R) * 100}%` as any,
                    alignItems: 'center', justifyContent: 'center',
                    borderRightWidth: 0.5, borderBottomWidth: 0.5,
                    borderColor: richMenu.panel_bg_image ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)',
                    overflow: 'hidden',
                  }}
                  onPress={async () => {
                    if (btn.action === 'code') {
                      const code = btn.code?.trim()
                      if (!code || !myId) return
                      await supabase.from('messages').insert({ sender_id: myId, receiver_id: senderId, content: code })
                      router.push(`/im/${senderId}` as any)
                    } else if (btn.action === 'page') {
                      router.push(btn.url as any)
                    } else if (btn.url) {
                      try {
                        const parsed = new URL(btn.url)
                        if (Platform.OS === 'web' && parsed.origin === window.location.origin) {
                          router.push(parsed.pathname as any)
                        } else if (btn.url.startsWith('/')) {
                          router.push(btn.url as any)
                        } else {
                          Linking.openURL(btn.url)
                        }
                      } catch {
                        if (btn.url.startsWith('/')) router.push(btn.url as any)
                        else Linking.openURL(btn.url)
                      }
                    }
                  }}
                  activeOpacity={0.75}
                >
                  {btn.bgImage && <Image source={{ uri: btn.bgImage }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />}
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        </View>
  ) : null

  if (isSelf) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/' as any)} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={Colors.accent} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>あなたの配信</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => { setSearchActive(v => !v); setSearchQuery('') }} activeOpacity={0.7}>
            <Ionicons name={searchActive ? 'close' : 'search'} size={20} color={Colors.accent} />
          </TouchableOpacity>
        </View>
        {/* 検索バー（isSelf） */}
        {searchActive && (
          <View style={styles.searchBar}>
            <View style={styles.searchInputWrap}>
              <Ionicons name="search" size={15} color={Colors.textLight} />
              <TextInput
                style={styles.searchInput}
                placeholder="キーワード・日付（例: 2025-05）"
                placeholderTextColor={Colors.textLight}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={15} color={Colors.textLight} />
                </TouchableOpacity>
              ) : null}
            </View>
            {searchQuery ? (
              <Text style={styles.searchResultCount}>{filteredGroups.length} / {groups.length} 件</Text>
            ) : null}
          </View>
        )}

        {/* flex:1 + overflow:hidden でFlatListが溢れないよう固定し、DM欄を常に最下部に表示 */}
        <View style={{ flex: 1, overflow: 'hidden' }}>
          {BroadcastList}
          {TilePanel}
        </View>
        {ReactionPopup}
        {/* フォロワー視点のプレビュー：クリエイター本人は送信不可 */}
        <View style={[styles.inputArea, { opacity: 0.5 }]}>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="フォロワーはここからDMを送れます"
              placeholderTextColor={Colors.textLight}
              editable={false}
            />
            <View style={[styles.sendButton, styles.sendDisabled]}>
              <Ionicons name="send" size={18} color={Colors.white} />
            </View>
          </View>
        </View>
      </View>
    )
  }

  // デスクトップ用プロフィールパネル（左側・flex:1）
  const RightPanel = isDesktop ? (
    <View style={styles.rightPanel}>
      <ScrollView contentContainerStyle={styles.rightPanelScroll}>
        {/* 大きなアバター・名前・bio を中央配置 */}
        <View style={styles.rpProfileSection}>
          <TouchableOpacity
            onPress={() => router.push(`/creator/${senderId}` as any)}
            activeOpacity={0.85}
          >
            {senderAvatar
              ? <Image source={{ uri: senderAvatar }} style={styles.rpAvatarLarge} />
              : <View style={styles.rpAvatarPlaceholder}>
                  <Text style={styles.rpAvatarPlaceholderText}>{senderName[0]}</Text>
                </View>
            }
          </TouchableOpacity>
          <View style={styles.rpNameRow}>
            <Text style={styles.rpNameLarge}>{senderName}</Text>
            {senderIsOfficial && <Ionicons name="checkmark-circle" size={18} color="#1D9BF0" />}
          </View>
          {senderUsername ? <Text style={styles.rpUsernameText}>@{senderUsername}</Text> : null}
          {senderBio ? <Text style={styles.rpBioText}>{senderBio}</Text> : null}
        </View>

        {/* フォロー + DM ボタン */}
        <View style={styles.rpActions}>
          <TouchableOpacity
            style={[styles.rpFollowBtn, isFollowing && styles.rpFollowingBtn]}
            onPress={handleFollowToggle}
            activeOpacity={0.8}
          >
            <Text style={[styles.rpFollowTxt, isFollowing && styles.rpFollowingTxt]}>
              {isFollowing ? 'フォロー中' : 'フォローする'}
            </Text>
          </TouchableOpacity>
          {isFollowing && (
            <TouchableOpacity
              style={styles.rpDmBtn}
              onPress={() => router.push(`/im/${senderId}` as any)}
              activeOpacity={0.8}
            >
              <Ionicons name="chatbubble-outline" size={16} color={Colors.accent} />
              <Text style={styles.rpDmTxt}>DM</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* メンバーシップセクション（自分以外に表示） */}
        {!isSelf && myId && (
          <View style={styles.rpMembershipSection}>
            <Text style={styles.rpMembershipTitle}>メンバーシップ</Text>
            {isSubscriber ? (
              <View style={styles.rpMembershipActiveRow}>
                <Ionicons name="star" size={14} color={Colors.accent} />
                <Text style={styles.rpMembershipActiveTxt}>登録中</Text>
                <TouchableOpacity onPress={handleMembershipToggle} style={styles.rpMembershipLeaveBtn}>
                  <Text style={styles.rpMembershipLeaveTxt}>退会</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.rpMembershipJoinBtn}
                onPress={handleMembershipToggle}
                activeOpacity={0.8}
              >
                <Ionicons name="star-outline" size={15} color={Colors.white} />
                <Text style={styles.rpMembershipJoinTxt}>メンバーシップに加入</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  ) : null

  return (
    <View style={styles.outerWrap}>
      {isWeb && (
        <Head>
          <title>{senderName ? `${senderName} | Reach` : 'Reach'}</title>
          <meta property="og:title" content={senderName ? `${senderName} | Reach` : 'Reach'} />
          <meta property="og:description" content={senderBio ?? 'Reach でクリエーターをフォローして配信を楽しもう'} />
          <meta property="og:image" content={senderAvatar ?? 'https://reachapp.jp/icon.png'} />
          <meta property="og:site_name" content="Reach" />
          <meta name="twitter:card" content="summary" />
          <meta name="twitter:image" content={senderAvatar ?? 'https://reachapp.jp/icon.png'} />
        </Head>
      )}
      {RightPanel}
      {/* 配信カラム：デスクトップは 480px 固定、モバイルは flex:1 */}
      <View style={isDesktop ? styles.broadcastsColumn : { flex: 1 }}>
      <KeyboardAvoidingView
        style={[{ flex: 1 }, isWeb && webKbHeight > 0 ? { paddingBottom: webKbHeight } : undefined]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          {/* 未ログイン閲覧時はホームへの戻るボタンを非表示（ホームはログイン必須のため） */}
          {myId
            ? <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/' as any)} style={styles.backButton}>
                <Ionicons name="chevron-back" size={24} color={Colors.accent} />
              </TouchableOpacity>
            : <View style={{ width: 32 }} />
          }
          <View style={styles.headerCenter}>
            <View style={styles.headerAvatar}>
              {senderAvatar
                ? <Image source={{ uri: senderAvatar }} style={styles.headerAvatarImage} />
                : <Text style={styles.headerAvatarText}>{senderName[0]}</Text>
              }
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={styles.headerName}>{senderName}</Text>
              {senderIsOfficial && <Ionicons name="checkmark-circle" size={14} color="#1D9BF0" />}
            </View>
          </View>
          <TouchableOpacity style={{ width: 32, padding: 4, alignItems: 'center' }} onPress={() => { setSearchActive(v => !v); setSearchQuery('') }} activeOpacity={0.7}>
            <Ionicons name={searchActive ? 'close' : 'search'} size={20} color={Colors.accent} />
          </TouchableOpacity>
        </View>

        {/* サブスク登録中バナー（受け手のみ表示） */}
        {!isSelf && isSubscriber && (
          <View style={styles.subscriberBanner}>
            <Ionicons name="star" size={12} color={Colors.accent} />
            <Text style={styles.subscriberBannerText}>メンバーシップ登録中</Text>
          </View>
        )}

        {/* 検索バー（トグル表示） */}
        {searchActive && (
          <View style={styles.searchBar}>
            <View style={styles.searchInputWrap}>
              <Ionicons name="search" size={15} color={Colors.textLight} />
              <TextInput
                style={styles.searchInput}
                placeholder="キーワード・日付（例: 2025-05）"
                placeholderTextColor={Colors.textLight}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={15} color={Colors.textLight} />
                </TouchableOpacity>
              ) : null}
            </View>
            {searchQuery ? (
              <Text style={styles.searchResultCount}>{filteredGroups.length} / {groups.length} 件</Text>
            ) : null}
          </View>
        )}

        {/* flex:1 + overflow:hidden でFlatListが画面外に溢れるのを防ぎ、DM入力欄を常に最下部に固定する */}
        <View style={{ flex: 1, overflow: 'hidden' }}>
          {BroadcastList}
          {TilePanel}
        </View>
        {ReactionPopup}

        {/* DM入力 or 未ログイン CTA */}
        {myId ? (
          <View style={styles.inputArea}>
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, { height: imInputH }]}
                placeholder="DMを送る。"
                placeholderTextColor={Colors.textLight}
                value={imText}
                onChangeText={setImText}
                multiline
                scrollEnabled={imInputH >= IM_MAX_H}
                onContentSizeChange={e => {
                  const h = e.nativeEvent.contentSize.height
                  setImInputH(Math.min(Math.max(h, IM_MIN_H), IM_MAX_H))
                }}
              />
              <TouchableOpacity
                style={[styles.sendButton, !imText.trim() && styles.sendDisabled]}
                onPress={handleSend}
                disabled={!imText.trim()}
              >
                <Ionicons name="send" size={18} color={Colors.white} />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.loginCtaArea}>
            <Text style={styles.loginCtaCaption}>
              フォローしてDMを送るにはアカウントが必要です
            </Text>
            <TouchableOpacity
              style={styles.loginCtaBtn}
              onPress={() => router.push('/(auth)/login' as any)}
              activeOpacity={0.85}
            >
              <Ionicons name="person-add-outline" size={16} color={Colors.white} />
              <Text style={styles.loginCtaBtnText}>登録 / ログイン</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  outerWrap: { flex: 1, flexDirection: 'row', backgroundColor: Colors.background },
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.header,
    paddingTop: isWeb ? 12 : 56, paddingHorizontal: 16, paddingBottom: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backButton: { padding: 4, width: 32 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, justifyContent: 'center' },
  headerAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.button, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  headerAvatarImage: { width: 36, height: 36, borderRadius: 18 },
  headerAvatarText: { fontSize: 16, fontWeight: '700', color: Colors.white },
  headerName: { fontSize: 15, fontWeight: '700', color: Colors.text },
  rightPanel: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRightWidth: 1, borderRightColor: Colors.border,
  },
  rightPanelScroll: { paddingBottom: 40 },
  broadcastsColumn: {
    width: 480,
    flexShrink: 0,
    backgroundColor: Colors.background,
    borderLeftWidth: 1, borderLeftColor: Colors.border,
    overflow: 'hidden',
  },
  rpProfileSection: {
    alignItems: 'center',
    paddingTop: 48, paddingHorizontal: 32, paddingBottom: 24,
  },
  rpAvatarLarge: { width: 88, height: 88, borderRadius: 44 },
  rpAvatarPlaceholder: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: Colors.button, alignItems: 'center', justifyContent: 'center',
  },
  rpAvatarPlaceholderText: { fontSize: 34, fontWeight: '700', color: Colors.white },
  rpNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, marginBottom: 4 },
  rpNameLarge: { fontSize: 20, fontWeight: '700', color: Colors.text },
  rpUsernameText: { fontSize: 13, color: Colors.textLight, marginBottom: 12 },
  rpBioText: { fontSize: 13, color: Colors.text, lineHeight: 20, textAlign: 'center', maxWidth: 340 },
  rpActions: {
    flexDirection: 'row', gap: 10, justifyContent: 'center',
    paddingHorizontal: 24, paddingBottom: 32,
  },
  rpFollowBtn: {
    backgroundColor: Colors.accent, borderRadius: 22,
    paddingVertical: 10, paddingHorizontal: 32, alignItems: 'center',
  },
  rpFollowingBtn: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.accent },
  rpFollowTxt: { fontSize: 14, fontWeight: '700', color: Colors.white },
  rpFollowingTxt: { color: Colors.accent },
  rpDmBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: Colors.border, borderRadius: 22,
    paddingVertical: 10, paddingHorizontal: 20, backgroundColor: Colors.white,
  },
  rpDmTxt: { fontSize: 14, fontWeight: '600', color: Colors.accent },
  rpMembershipSection: {
    paddingHorizontal: 24, paddingBottom: 24, gap: 10,
  },
  rpMembershipTitle: { fontSize: 12, fontWeight: '700', color: Colors.textLight, letterSpacing: 0.5 },
  rpMembershipActiveRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.main, borderRadius: 12, padding: 12,
  },
  rpMembershipActiveTxt: { fontSize: 14, fontWeight: '700', color: Colors.accent, flex: 1 },
  rpMembershipLeaveBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: Colors.border },
  rpMembershipLeaveTxt: { fontSize: 12, color: Colors.textLight },
  rpMembershipJoinBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.accent, borderRadius: 22,
    paddingVertical: 12, paddingHorizontal: 20,
  },
  rpMembershipJoinTxt: { fontSize: 14, fontWeight: '700', color: Colors.white },
  subscriberBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.main, borderBottomWidth: 1, borderBottomColor: Colors.border,
    paddingHorizontal: 16, paddingVertical: 6,
  },
  subscriberBannerText: { fontSize: 11, color: Colors.accent, fontWeight: '700' },
  messageList: { paddingLeft: 16, paddingRight: 4, paddingTop: 16, paddingBottom: 32, gap: 12 },

  dateDivider: { alignItems: 'center', marginVertical: 8 },
  dateText: {
    fontSize: 11, color: Colors.textLight,
    backgroundColor: 'rgba(0,0,0,0.08)',
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12,
  },
  groupWrap: { marginBottom: 4 },
  broadcastRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  broadcastAvatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.button,
    alignItems: 'center', justifyContent: 'center', marginTop: 2, overflow: 'hidden', flexShrink: 0,
  },
  broadcastAvatarImg: { width: 36, height: 36, borderRadius: 18 },
  broadcastAvatarText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  blocksWrap: { flex: 1, flexShrink: 1 },
  // 送信者名 + バッジ行（web で flexWrap して確実に表示）
  senderNameRow: {
    flexDirection: 'row', alignItems: 'center',
    flexWrap: 'wrap', gap: 5, marginBottom: 3,
  },
  senderNameLabel: { fontSize: 11, color: Colors.textLight, fontWeight: '600' },
  subscriberBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.accent, borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  subscriberBadgeText: { fontSize: 9, color: Colors.white, fontWeight: '700' },
  broadcastBubble: {
    backgroundColor: Colors.white, borderRadius: 16, borderTopLeftRadius: 4,
    padding: 12, shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1,
    alignSelf: 'flex-start', maxWidth: '60%',
  },
  // 吹き出し内の画像（サイズはgetImgStyleで動的計算）
  broadcastImage: { borderRadius: 8, marginBottom: 4 },
  // 画像のみメッセージ（吹き出しなし）
  broadcastImageOnly: {
    borderRadius: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1, shadowRadius: 4, elevation: 2,
  },
  // 動画（吹き出しなし）
  broadcastVideoOnly: {
    width: 280, height: 180, borderRadius: 14,
    backgroundColor: '#000',
  },
  // 吹き出し内の動画
  broadcastVideo: {
    width: '100%', height: 180, borderRadius: 8, marginBottom: 4,
    backgroundColor: '#000',
  },
  broadcastText: { fontSize: 14, color: Colors.text, lineHeight: 21 },
  broadcastLink: { color: '#1D9BF0', textDecorationLine: 'underline' },
  bubbleFooter: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap',
  },
  bubbleTime: { fontSize: 10, color: Colors.textLight },
  countBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  countBadgeText: { fontSize: 11, color: Colors.textLight },
  shareBtn: {
    paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  moreBtn: {
    paddingHorizontal: 8, paddingVertical: 2,
    backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
  },
  moreBtnText: { fontSize: 14, color: Colors.textLight, letterSpacing: 2 },
  popupOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end',
  },
  popupBox: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 32, paddingTop: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1, shadowRadius: 12, elevation: 12,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 12,
  },
  popupPublicRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 24, paddingBottom: 12,
  },
  popupPublicText: { fontSize: 12, color: Colors.textLight },
  popupBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    paddingVertical: 16, paddingHorizontal: 24,
  },
  popupIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  popupBtnText: { fontSize: 16, color: Colors.text, fontWeight: '500' },
  popupCancelBtn: { marginTop: 4, borderTopWidth: 1, borderTopColor: Colors.border },
  popupCancelText: { fontSize: 16, color: Colors.textLight, fontWeight: '500', flex: 1, textAlign: 'center' },
  inputArea: {
    backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', padding: 10, gap: 8 },
  input: {
    flex: 1, backgroundColor: Colors.white, borderRadius: 22,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 16, color: Colors.text,
  },
  sendButton: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  sendDisabled: { backgroundColor: '#B0B0B0' },
  loginCtaArea: {
    backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.border,
    paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', gap: 10,
  },
  loginCtaCaption: { fontSize: 12, color: Colors.textLight, textAlign: 'center' },
  loginCtaBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.accent, borderRadius: 22,
    paddingVertical: 10, paddingHorizontal: 24,
  },
  loginCtaBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },
  emptyWrap: { height: 400, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 14, color: Colors.textLight },
  // 検索バー
  searchBar: {
    backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    paddingHorizontal: 12, paddingVertical: 10, gap: 6,
  },
  searchInputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.background, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 10, paddingVertical: 7,
  },
  // fontSize: 16 以上にすることでiOS Safariの自動ズームを防止
  searchInput: { flex: 1, fontSize: 16, color: Colors.text, paddingVertical: 0 },
  searchResultCount: { fontSize: 11, color: Colors.textLight, textAlign: 'right' },
  tileContainer: { backgroundColor: '#FFFFFF' },
  panelDimOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
  tileHandle: {
    alignItems: 'center', paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  tileHandleBar: { width: 32, height: 3, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.15)' },
  // 18:27グリッド比率で絶対配置タイルを並べるエリア
  tileGridArea: { aspectRatio: 27 / 18, overflow: 'hidden' },
  tileBtnImgOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  tileSeparator: { width: 32, height: 2, backgroundColor: Colors.accent, marginVertical: 6 },
  tileBtnLabel: { fontSize: 10, fontWeight: '600', textAlign: 'center', color: Colors.text },
  ogpCard: {
    marginTop: 8, borderRadius: 10, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  ogpImage: { width: '100%', height: 140 },
  ogpBody: { padding: 10, gap: 3 },
  ogpSite: { fontSize: 10, color: Colors.textLight },
  ogpTitle: { fontSize: 13, fontWeight: '700', color: Colors.text },
  ogpDesc: { fontSize: 11, color: Colors.textLight, lineHeight: 16 },
})

// URL を含むテキストをリンク化して表示する
function LinkifiedText({
  text, textStyle, linkStyle,
}: {
  text: string
  textStyle: any
  linkStyle: any
}) {
  const URL_RE = /(https?:\/\/[^\s]+)/g
  const parts = text.split(URL_RE)
  const openUrl = (url: string) => {
    if (isWeb && typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener')
    } else {
      Linking.openURL(url).catch(() => {})
    }
  }
  return (
    <Text style={textStyle}>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <Text key={i} style={linkStyle} onPress={() => openUrl(part)}>
            {part}
          </Text>
        ) : (
          part
        )
      )}
    </Text>
  )
}

function LinkPreview({ url }: { url: string }) {
  const [ogp, setOgp] = useState<{ title: string; description: string; image: string; siteName: string } | null>(null)

  useEffect(() => {
    const apiUrl = isWeb
      ? `/api/ogp?url=${encodeURIComponent(url)}`
      : `https://reachapp.jp/api/ogp?url=${encodeURIComponent(url)}`
    fetch(apiUrl)
      .then(r => r.json())
      .then(d => { if (d.title || d.image) setOgp(d) })
      .catch(() => {})
  }, [url])

  const openUrl = () => {
    if (isWeb && typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener')
    } else {
      Linking.openURL(url).catch(() => {})
    }
  }

  if (!ogp) return null
  return (
    <TouchableOpacity style={styles.ogpCard} onPress={openUrl} activeOpacity={0.85}>
      {ogp.image ? <Image source={{ uri: ogp.image }} style={styles.ogpImage} resizeMode="cover" /> : null}
      <View style={styles.ogpBody}>
        {ogp.siteName ? <Text style={styles.ogpSite}>{ogp.siteName}</Text> : null}
        {ogp.title ? <Text style={styles.ogpTitle} numberOfLines={2}>{ogp.title}</Text> : null}
        {ogp.description ? <Text style={styles.ogpDesc} numberOfLines={2}>{ogp.description}</Text> : null}
      </View>
    </TouchableOpacity>
  )
}

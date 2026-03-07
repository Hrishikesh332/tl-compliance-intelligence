import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react'

import { API_BASE } from '../config'

const CACHE_KEY = 'vc_video_cache'
const CACHE_TS_KEY = 'vc_video_cache_ts'
const CACHE_STALE_MS = 60_000
const URL_TTL_MS = 50 * 60_000

export type CachedVideo = {
  id: string
  stream_url?: string
  thumbnail_url?: string
  thumbnail_data_url?: string
  duration_seconds?: number
  metadata: Record<string, any>
}

type VideoCacheState = {
  videos: CachedVideo[]
  loading: boolean
  error: string | null
  lastFetchedAt: number
  getVideo: (id: string) => CachedVideo | undefined
  refresh: (force?: boolean) => Promise<void>
}

const VideoCacheContext = createContext<VideoCacheState | null>(null)

function loadFromStorage(): CachedVideo[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return []
    const ts = Number(localStorage.getItem(CACHE_TS_KEY) || '0')
    const videos = JSON.parse(raw) as CachedVideo[]
    const urlsExpired = Date.now() - ts > URL_TTL_MS
    if (urlsExpired) {
      return videos.map((v) => ({ ...v, stream_url: undefined, thumbnail_url: undefined }))
    }
    return videos
  } catch { /* ignore */ }
  return []
}

function saveToStorage(videos: CachedVideo[]) {
  try {
    const lite = videos.map((v) => ({
      id: v.id,
      stream_url: v.stream_url,
      thumbnail_url: v.thumbnail_url,
      thumbnail_data_url: v.thumbnail_data_url,
      duration_seconds: v.duration_seconds,
      metadata: v.metadata,
    }))
    localStorage.setItem(CACHE_KEY, JSON.stringify(lite))
    localStorage.setItem(CACHE_TS_KEY, String(Date.now()))
  } catch { /* ignore */ }
}

export function VideoCacheProvider({ children }: { children: ReactNode }) {
  const [videos, setVideos] = useState<CachedVideo[]>(loadFromStorage)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastFetchedAt, setLastFetchedAt] = useState(0)
  const fetchingRef = useRef(false)
  const mountedRef = useRef(true)

  const refresh = useCallback(async (force = false, silent = false) => {
    if (fetchingRef.current) return
    if (!force && lastFetchedAt && Date.now() - lastFetchedAt < CACHE_STALE_MS) return

    fetchingRef.current = true
    if (!silent) setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/videos`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const list: CachedVideo[] = (data.videos || []).map((v: any) => ({
        id: v.id,
        stream_url: v.stream_url || undefined,
        thumbnail_url: v.thumbnail_url || undefined,
        thumbnail_data_url: v.thumbnail_data_url || undefined,
        duration_seconds: v.duration_seconds ?? undefined,
        metadata: v.metadata || {},
      }))
      if (mountedRef.current) {
        setVideos(list)
        saveToStorage(list)
        setLastFetchedAt(Date.now())
      }
    } catch (e: any) {
      if (mountedRef.current && !silent) setError(e.message || 'Failed to fetch videos')
    } finally {
      fetchingRef.current = false
      if (mountedRef.current) setLoading(false)
    }
  }, [lastFetchedAt])

  useEffect(() => {
    mountedRef.current = true
    const cached = loadFromStorage()
    const hasValidCache = cached.length > 0 && cached.some((v) => v.thumbnail_url || v.stream_url)
    refresh(true, hasValidCache)
    return () => {
      mountedRef.current = false
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const getVideo = useCallback(
    (id: string) => videos.find((v) => v.id === id),
    [videos],
  )

  return (
    <VideoCacheContext.Provider value={{ videos, loading, error, lastFetchedAt, getVideo, refresh }}>
      {children}
    </VideoCacheContext.Provider>
  )
}

export function useVideoCache() {
  const ctx = useContext(VideoCacheContext)
  if (!ctx) throw new Error('useVideoCache must be used within VideoCacheProvider')
  return ctx
}

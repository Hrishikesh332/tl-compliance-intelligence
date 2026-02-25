import { useState, useMemo, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useVideoCache } from '../contexts/VideoCache'

function IconSearch({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 11.707" fill="currentColor">
      <path fillRule="evenodd" clipRule="evenodd" d="M7.5 0C9.98528 0 12 2.01472 12 4.5C12 6.98528 9.98528 9 7.5 9C6.36252 8.99998 5.32451 8.57691 4.53223 7.88086L0.707031 11.707L0 11L3.85742 7.1416C3.31847 6.39969 3 5.48716 3 4.5C3 2.01474 5.01475 4.07169e-05 7.5 0ZM7.5 1C5.56704 1.00004 4 2.56703 4 4.5C4 6.43297 5.56704 7.99996 7.5 8C9.433 8 11 6.433 11 4.5C11 2.567 9.433 1 7.5 1Z" />
    </svg>
  )
}

function IconFilter({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 10" fill="none">
      <path fill="currentColor" d="M11.4 0C11.7314 0 12 0.26863 12 0.6V1.4C12 1.73137 11.7314 2 11.4 2H0.6C0.268629 2 0 1.73137 0 1.4V0.6C0 0.268629 0.268629 0 0.6 0H11.4Z" />
      <path fill="currentColor" d="M9.4 4C9.73137 4 10 4.26863 10 4.6V5.4C10 5.73137 9.73137 6 9.4 6H2.6C2.26863 6 2 5.73137 2 5.4V4.6C2 4.26863 2.26863 4 2.6 4H9.4Z" />
      <path fill="currentColor" d="M7.4 8C7.73137 8 8 8.26863 8 8.6V9.4C8 9.73137 7.73137 10 7.4 10H4.6C4.26863 10 4 9.73137 4 9.4V8.6C4 8.26863 4.26863 8 4.6 8H7.4Z" />
    </svg>
  )
}

function IconChevronDown({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  )
}

type VideoEntry = {
  id: string
  filename: string
  status: string
  uploaded_at: string
  s3_uri?: string
  clip_count?: number
  stream_url?: string
}

type StatusFilter = 'all' | 'indexing' | 'ready' | 'failed'

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'indexing', label: 'Indexing' },
  { value: 'ready', label: 'Ready' },
  { value: 'failed', label: 'Failed' },
]

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ready: 'bg-green-50 text-green-700 border border-green-200',
    indexing: 'bg-blue-50 text-blue-700 border border-blue-200',
    failed: 'bg-red-50 text-red-700 border border-red-200',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-700 border border-gray-200'}`}>
      {status === 'indexing' && <div className="w-2 h-2 border border-blue-500 border-t-transparent rounded-full animate-spin" />}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

function FilterDropdown({
  statusFilter,
  onStatusChange,
}: {
  statusFilter: StatusFilter
  onStatusChange: (v: StatusFilter) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const hasFilter = statusFilter !== 'all'
  const selectedLabel = STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ?? 'Filter'

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-colors h-10 ${
          open || hasFilter
            ? 'border-accent bg-accent/5 text-text-primary'
            : 'border-border bg-surface text-text-secondary hover:bg-card'
        }`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={hasFilter ? `Filter: ${selectedLabel}` : 'Filter by status'}
      >
        <IconFilter className="w-3.5 h-3.5 shrink-0" />
        <span className="min-w-[4rem] text-left">{hasFilter ? selectedLabel : 'Filter'}</span>
        <IconChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-border bg-surface py-2 shadow-xl z-[100]"
          role="listbox"
          aria-label="Status filter"
        >
          <p className="px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider">Status</p>
          <div className="px-2 space-y-0.5">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={statusFilter === opt.value}
                onClick={() => {
                  onStatusChange(opt.value)
                  setOpen(false)
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  statusFilter === opt.value ? 'bg-accent/10 text-text-primary' : 'text-text-secondary hover:bg-card'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function UploadsPage() {
  const { videos: cachedVideos, loading, error, refresh } = useVideoCache()
  const videos = useMemo<VideoEntry[]>(() =>
    cachedVideos.map((v) => ({
      id: v.id,
      filename: v.metadata?.filename || v.id,
      status: v.metadata?.status || 'unknown',
      uploaded_at: v.metadata?.uploaded_at || '',
      s3_uri: v.metadata?.s3_uri,
      clip_count: v.metadata?.clip_count,
      stream_url: v.stream_url,
    })),
    [cachedVideos],
  )
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const filtered = useMemo(() => {
    let list = videos
    if (statusFilter !== 'all') {
      const want = statusFilter.toLowerCase()
      list = list.filter((v) => (v.status || '').toLowerCase() === want)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((v) => v.filename.toLowerCase().includes(q))
    }
    return list
  }, [videos, search, statusFilter])

  function formatDate(iso: string) {
    if (!iso) return '—'
    try {
      return new Date(iso).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
    } catch { return iso }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold text-text-primary mb-6">
        {loading ? 'Videos' : `${filtered.length} ${filtered.length === 1 ? 'Video' : 'Videos'}`}
      </h1>

      <div className="flex flex-wrap items-center gap-2 mb-6">
        <div className="flex-1 min-w-[200px] relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <IconSearch className="w-5 h-5" />
          </span>
          <input
            type="search"
            placeholder="Search videos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-10 pr-4 rounded-xl border border-border bg-surface text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
          />
        </div>
        <FilterDropdown statusFilter={statusFilter} onStatusChange={setStatusFilter} />
      </div>

      {loading && (
        <div className="flex flex-col items-center py-16 gap-3">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin" />
          <p className="text-sm text-text-tertiary">Loading videos...</p>
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-700 mb-3">Failed to load: {error}</p>
          <button type="button" onClick={() => refresh(true)} className="text-sm font-medium text-red-600 hover:text-red-800 underline underline-offset-2">Retry</button>
        </div>
      )}

      {!loading && !error && videos.length === 0 && (
        <div className="flex flex-col items-center py-16 gap-4 text-text-tertiary">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="23 7 16 12 23 17 23 7" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
          </div>
          <p className="text-sm">No videos uploaded yet. Use "Upload Assets" to get started.</p>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-card">
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Filename</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Upload date</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Clips</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((v) => (
                <tr key={v.id} className="hover:bg-card/80 transition-colors">
                  <td className="px-4 py-3">
                    <Link to={`/video/${v.id}`} className="text-sm font-medium text-text-primary underline underline-offset-2 hover:text-accent">
                      {v.filename}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 tabular-nums">{formatDate(v.uploaded_at)}</td>
                  <td className="px-4 py-3"><StatusBadge status={v.status} /></td>
                  <td className="px-4 py-3 text-sm text-gray-600">{v.clip_count ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

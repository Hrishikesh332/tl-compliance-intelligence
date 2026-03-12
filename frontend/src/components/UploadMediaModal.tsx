import { useRef, useState } from 'react'

import { API_BASE } from '../config'
import { useVideoCache } from '../contexts/VideoCache'

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.avi', '.webm', '.mkv'])
const DOC_EXTENSIONS = new Set([
  '.pdf', '.docx', '.pptx', '.html', '.htm', '.txt', '.md',
  '.png', '.jpg', '.jpeg', '.bmp', '.tiff',
])
const VIDEO_MAX_MB = 300
const DOC_MAX_MB = 50

export type MediaType = 'video' | 'document'

export function getMediaType(file: File): MediaType | null {
  const ext = '.' + (file.name.split('.').pop()?.toLowerCase() || '')
  if (file.type.startsWith('video/') || VIDEO_EXTENSIONS.has(ext)) return 'video'
  if (
    file.type.startsWith('application/pdf') ||
    file.type.startsWith('application/vnd.openxmlformats') ||
    file.type.startsWith('application/vnd.ms-powerpoint') ||
    file.type.startsWith('text/') ||
    file.type.startsWith('image/') ||
    DOC_EXTENSIONS.has(ext)
  ) {
    return 'document'
  }
  return null
}

export function isAcceptedFile(file: File): boolean {
  return getMediaType(file) != null
}

export function getMaxMb(file: File): number {
  return getMediaType(file) === 'video' ? VIDEO_MAX_MB : DOC_MAX_MB
}

function IconClose({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 12" fill="currentColor">
      <path d="M6.02051 5.31348L8.9668 2.36719L9.67383 3.07422L6.72754 6.02051L9.65332 8.94629L8.94629 9.65332L6.02051 6.72754L3.07422 9.67383L2.36719 8.9668L5.31348 6.02051L2.34668 3.05371L3.05371 2.34668L6.02051 5.31348Z" />
      <path fillRule="evenodd" clipRule="evenodd" d="M8.40039 0C10.3883 0.000211285 11.9998 1.61169 12 3.59961V8.40039C11.9998 10.3883 10.3883 11.9998 8.40039 12H3.59961C1.61169 11.9998 0.000211285 10.3883 0 8.40039V3.59961C0.000211156 1.61169 1.61169 0.000211157 3.59961 0H8.40039ZM3.59961 1C2.16398 1.00021 1.00021 2.16398 1 3.59961V8.40039C1.00021 9.83602 2.16398 10.9998 3.59961 11H8.40039C9.83602 10.9998 10.9998 9.83602 11 8.40039V3.59961C10.9998 2.16398 9.83602 1.00021 8.40039 1H3.59961Z" />
    </svg>
  )
}

function IconUpload({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 12" fill="currentColor">
      <path fillRule="evenodd" clipRule="evenodd" d="M3.6 12C1.61178 12 0 10.3882 0 8.4V3.6C0 1.61178 1.61178 0 3.6 0H8.4C10.3882 0 12 1.61178 12 3.6V8.4C12 10.3882 10.3882 12 8.4 12H3.6ZM8.4 11H3.6C2.16406 11 1 9.83594 1 8.4V3.6C1 2.16406 2.16406 1 3.6 1H8.4C9.83594 1 11 2.16406 11 3.6V8.4C11 9.83594 9.83594 11 8.4 11Z" />
      <path d="M5.5 3.70718L3.52513 5.68206L2.81802 4.97495L4.93934 2.85363C5.52513 2.26784 6.47487 2.26784 7.06066 2.85363L9.18198 4.97495L8.47487 5.68206L6.5 3.70718V9.50001H5.5V3.70718Z" />
    </svg>
  )
}

type FileWithType = { file: File; type: MediaType }
type UploadStatus =
  | 'pending'
  | 'uploading'
  | 'queued'
  | 'processing'
  | 'indexing'
  | 'done'
  | 'error'

interface UploadMediaModalProps {
  open: boolean
  onClose: () => void
}

export default function UploadMediaModal({ open, onClose }: UploadMediaModalProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { refresh } = useVideoCache()
  const [files, setFiles] = useState<FileWithType[]>([])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<Record<string, UploadStatus>>({})
  const [error, setError] = useState<string | null>(null)
  const [backgroundPanelVisible, setBackgroundPanelVisible] = useState(false)

  const showBackgroundPanel = backgroundPanelVisible && Object.keys(progress).length > 0

  if (!open && !showBackgroundPanel) return null

  function handleFiles(selected: FileList | null) {
    if (!selected) return
    const accepted: FileWithType[] = []
    const skipped: string[] = []
    for (let i = 0; i < selected.length; i++) {
      const file = selected[i]
      const type = getMediaType(file)
      if (!type) {
        skipped.push(file.name)
        continue
      }
      const maxMb = type === 'video' ? VIDEO_MAX_MB : DOC_MAX_MB
      if (file.size > maxMb * 1024 * 1024) {
        skipped.push(`${file.name} (over ${maxMb} MB)`)
        continue
      }
      accepted.push({ file, type })
    }
    if (skipped.length) {
      setError(skipped.length <= 2 ? `Skipped: ${skipped.join(', ')}` : `${skipped.length} files skipped (wrong type or too large)`)
    }
    if (accepted.length) {
      setFiles((prev) => [...prev, ...accepted])
      if (accepted.length === selected.length) setError(null)
    }
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleUpload() {
    if (!files.length) return
    setUploading(true)
    setError(null)
    setBackgroundPanelVisible(true)
    const newProgress: Record<string, UploadStatus> = {}
    files.forEach(({ file }) => { newProgress[file.name] = 'pending' })
    setProgress({ ...newProgress })
    onClose()

    const INTER_VIDEO_DELAY_MS = 500
    const MAX_RETRIES = 3
    const BASE_RETRY_DELAY_MS = 3000
    const videoTasks: Array<{ fileName: string; taskId: string }> = []

    async function uploadWithRetry(file: File, type: MediaType): Promise<void> {
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const formData = new FormData()
        if (type === 'video') {
          formData.append('video', file)
          newProgress[file.name] = 'uploading'
          setProgress({ ...newProgress })
          const resp = await fetch(`${API_BASE}/api/videos/upload`, { method: 'POST', body: formData })
          if (!resp.ok) {
            const data = await resp.json().catch(() => ({}))
            const errMsg = data.error || `HTTP ${resp.status}`
            const isThrottle = resp.status === 429 || resp.status === 503 || /throttl|rate|too many/i.test(errMsg)
            if (isThrottle && attempt < MAX_RETRIES) {
              const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1)
              newProgress[file.name] = 'pending'
              setProgress({ ...newProgress })
              await new Promise(r => setTimeout(r, delay))
              continue
            }
            throw new Error(errMsg)
          }
          const data = await resp.json().catch(() => ({}))
          if (data.task_id) {
            videoTasks.push({ fileName: file.name, taskId: data.task_id })
          }
          newProgress[file.name] = 'queued'
          setProgress({ ...newProgress })
          return
        } else {
          formData.append('document', file)
          newProgress[file.name] = 'processing'
          setProgress({ ...newProgress })
          const resp = await fetch(`${API_BASE}/api/documents/upload`, { method: 'POST', body: formData })
          if (!resp.ok) {
            const data = await resp.json().catch(() => ({}))
            throw new Error(data.error || `HTTP ${resp.status}`)
          }
          newProgress[file.name] = 'done'
          setProgress({ ...newProgress })
          return
        }
      }
    }

    async function pollVideoTasksUntilComplete() {
      if (!videoTasks.length) return
      const pendingTasks = new Map(videoTasks.map((task) => [task.taskId, task.fileName]))
      while (pendingTasks.size > 0) {
        await new Promise((resolve) => setTimeout(resolve, 4000))
        const checks = await Promise.all(
          Array.from(pendingTasks.entries()).map(async ([taskId, fileName]) => {
            try {
              const resp = await fetch(`${API_BASE}/api/videos/tasks/${taskId}`)
              const data = await resp.json().catch(() => ({}))
              if (!resp.ok) {
                throw new Error(data.error || `HTTP ${resp.status}`)
              }
              return { taskId, fileName, status: String(data.status || '').toLowerCase() }
            } catch {
              return { taskId, fileName, status: 'error' }
            }
          }),
        )

        let hasStatusChange = false
        for (const check of checks) {
          const nextStatus: UploadStatus =
            check.status === 'ready'
              ? 'done'
              : check.status === 'failed'
                ? 'error'
                : check.status === 'indexing'
                  ? 'indexing'
                  : 'queued'
          if (newProgress[check.fileName] !== nextStatus) {
            newProgress[check.fileName] = nextStatus
            hasStatusChange = true
          }
          if (nextStatus === 'done' || nextStatus === 'error') {
            pendingTasks.delete(check.taskId)
          }
        }
        if (hasStatusChange) {
          setProgress({ ...newProgress })
        }
      }
    }

    let allOk = true
    for (let i = 0; i < files.length; i++) {
      const { file, type } = files[i]
      try {
        if (i > 0 && type === 'video') {
          await new Promise(r => setTimeout(r, INTER_VIDEO_DELAY_MS))
        }
        await uploadWithRetry(file, type)
      } catch (e: unknown) {
        newProgress[file.name] = 'error'
        allOk = false
        setError(e instanceof Error ? e.message : 'Upload failed')
      }
      setProgress({ ...newProgress })
    }

    if (videoTasks.length > 0) {
      void refresh(true)
      await pollVideoTasksUntilComplete()
    }

    const hasFailures = Object.values(newProgress).some((status) => status === 'error')
    setUploading(false)
    if (!hasFailures && allOk) {
      void refresh(true)
      window.setTimeout(() => {
        setBackgroundPanelVisible(false)
        setFiles([])
        setProgress({})
        setError(null)
      }, 2500)
    }
  }

  function handleClose() {
    if (uploading) {
      onClose()
      return
    }
    if (!uploading) {
      setFiles([])
      setProgress({})
      setError(null)
      onClose()
    }
  }

  const acceptList = [
    ...Array.from(VIDEO_EXTENSIONS),
    ...Array.from(DOC_EXTENSIONS),
  ].join(',')
  const progressEntries = files.map(({ file, type }) => ({
    file,
    type,
    status: progress[file.name],
  }))
  const completedCount = progressEntries.filter(({ status }) => status === 'done').length
  const failedCount = progressEntries.filter(({ status }) => status === 'error').length
  const activeCount = progressEntries.filter(({ status }) =>
    status === 'uploading' || status === 'processing' || status === 'queued' || status === 'indexing' || status === 'pending',
  ).length

  function statusLabel(status: UploadStatus | undefined, type: MediaType) {
    if (status === 'uploading') return 'Uploading...'
    if (status === 'processing') return 'Processing...'
    if (status === 'queued') return type === 'video' ? 'Queued' : 'Pending'
    if (status === 'indexing') return 'Indexing...'
    if (status === 'done') return type === 'video' ? 'Ready' : 'Done'
    if (status === 'error') return 'Failed'
    return ''
  }

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-brand-charcoal/40 backdrop-blur-sm" onClick={handleClose} aria-hidden />
          <div className="relative w-full max-w-md rounded-xl border border-border bg-surface shadow-xl" role="dialog" aria-modal="true" aria-labelledby="upload-media-title">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 id="upload-media-title" className="text-lg font-semibold text-text-primary">Upload videos or documents</h2>
              <button type="button" onClick={handleClose} className="p-2 rounded-lg text-text-tertiary hover:bg-card hover:text-text-primary transition-colors" aria-label="Close">
                <IconClose />
              </button>
            </div>

            <div className="p-5">
              <input
                ref={inputRef}
                type="file"
                accept={acceptList}
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />

              {files.length === 0 ? (
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
                  onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleFiles(e.dataTransfer.files) }}
                  className="w-full rounded-xl border-2 border-dashed border-border bg-card py-12 px-6 flex flex-col items-center gap-4 text-text-tertiary hover:border-accent hover:bg-accent/5 hover:text-text-secondary transition-colors"
                >
                  <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                    <IconUpload className="w-6 h-6 text-gray-500" />
                  </div>
                  <span className="text-sm font-medium">Click to select or drag and drop</span>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium text-text-secondary border border-border">
                      Videos: MP4, MOV, AVI
                    </span>
                    <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium text-text-secondary border border-border">
                      Docs: PDF, DOCX, PPTX, TXT
                    </span>
                  </div>
                  <span className="text-xs">Videos max {VIDEO_MAX_MB} MB · Documents max {DOC_MAX_MB} MB</span>
                </button>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {files.map(({ file, type }, i) => {
                    const status = progress[file.name]
                    return (
                      <div key={`${file.name}-${i}`} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200">
                        <span
                          className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            type === 'video' ? 'bg-blue-100 text-blue-800 border border-blue-200' : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {type === 'video' ? 'Video' : 'Doc'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                          <p className="text-xs text-gray-500">{(file.size / (1024 * 1024)).toFixed(1)} MB</p>
                        </div>
                        {(status === 'uploading' || status === 'processing' || status === 'indexing') && (
                          <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin shrink-0" />
                        )}
                        {(status === 'queued' || status === 'done' || status === 'error') && (
                          <span
                            className={`text-xs shrink-0 ${
                              status === 'queued'
                                ? 'text-blue-600'
                                : status === 'done'
                                  ? 'text-green-600'
                                  : 'text-red-600'
                            }`}
                          >
                            {statusLabel(status, type)}
                          </span>
                        )}
                        {!status && !uploading && (
                          <button type="button" onClick={() => removeFile(i)} className="text-gray-400 hover:text-gray-700 shrink-0 text-sm">Remove</button>
                        )}
                      </div>
                    )
                  })}
                  {!uploading && (
                    <button type="button" onClick={() => inputRef.current?.click()} className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2">
                      + Add more files
                    </button>
                  )}
                </div>
              )}

              {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
              {uploading && (
                <p className="mt-3 text-xs text-text-secondary">
                  The popup will close once you start the upload. You can keep using the dashboard while it runs.
                </p>
              )}

              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={handleClose} className="h-8 px-3 rounded-[9.6px] text-sm font-medium text-gray-700 bg-gray-200 hover:bg-gray-300 transition-colors">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={!files.length || uploading}
                  className="h-8 px-3 rounded-[9.6px] text-sm font-medium bg-brand-charcoal text-brand-white hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                >
                  {uploading && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  {uploading ? 'Running...' : `Upload ${files.length || ''}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showBackgroundPanel && (
        <div className="fixed bottom-4 right-4 z-[180] w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface shadow-xl">
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-text-primary">
                {uploading ? 'Upload running in background' : failedCount > 0 ? 'Upload finished with errors' : 'Upload complete'}
              </p>
              <p className="text-xs text-text-secondary">
                {uploading
                  ? 'You can continue using the dashboard while files upload and videos finish indexing.'
                  : failedCount > 0
                    ? `${failedCount} file${failedCount === 1 ? '' : 's'} failed`
                    : `${completedCount} file${completedCount === 1 ? '' : 's'} completed`}
              </p>
            </div>
            {!uploading && (
              <button
                type="button"
                onClick={() => {
                  setBackgroundPanelVisible(false)
                  setFiles([])
                  setProgress({})
                  setError(null)
                }}
                className="p-1 rounded-md text-text-tertiary hover:bg-card hover:text-text-primary transition-colors"
                aria-label="Dismiss upload status"
              >
                <IconClose className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="max-h-64 overflow-y-auto px-4 py-3 space-y-2">
            {progressEntries.map(({ file, type, status }, i) => (
              <div key={`${file.name}-bg-${i}`} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <span
                  className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                    type === 'video' ? 'bg-blue-100 text-blue-800 border border-blue-200' : 'bg-amber-100 text-amber-800 border border-amber-200'
                  }`}
                >
                  {type === 'video' ? 'Video' : 'Doc'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{file.name}</p>
                  <p className="text-xs text-gray-500">{(file.size / (1024 * 1024)).toFixed(1)} MB</p>
                </div>
                {(status === 'uploading' || status === 'processing' || status === 'indexing') && (
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin shrink-0" />
                )}
                {status && !(status === 'uploading' || status === 'processing' || status === 'indexing') && (
                  <span
                    className={`text-xs font-medium shrink-0 ${
                      status === 'queued'
                        ? 'text-blue-600'
                        : status === 'done'
                          ? 'text-green-600'
                          : status === 'error'
                            ? 'text-red-600'
                            : 'text-gray-500'
                    }`}
                  >
                    {statusLabel(status, type)}
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-text-secondary">
            <span>{activeCount > 0 ? `${activeCount} still running` : 'All files finished'}</span>
            <span>{completedCount} complete{failedCount > 0 ? ` · ${failedCount} failed` : ''}</span>
          </div>
        </div>
      )}
    </>
  )
}

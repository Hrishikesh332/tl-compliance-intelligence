import { useRef, useState } from 'react'

import { API_BASE } from '../config'

const ACCEPTED_EXTENSIONS = '.pdf,.docx,.pptx,.html,.txt,.md,.png,.jpg,.jpeg,.bmp,.tiff'
const ACCEPTED_MIME_PREFIXES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument',
  'application/vnd.ms-powerpoint',
  'text/',
  'image/',
]
const MAX_SIZE_MB = 50

function IconClose({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 12" fill="currentColor">
      <path d="M6.02051 5.31348L8.9668 2.36719L9.67383 3.07422L6.72754 6.02051L9.65332 8.94629L8.94629 9.65332L6.02051 6.72754L3.07422 9.67383L2.36719 8.9668L5.31348 6.02051L2.34668 3.05371L3.05371 2.34668L6.02051 5.31348Z" />
      <path fillRule="evenodd" clipRule="evenodd" d="M8.40039 0C10.3883 0.000211285 11.9998 1.61169 12 3.59961V8.40039C11.9998 10.3883 10.3883 11.9998 8.40039 12H3.59961C1.61169 11.9998 0.000211285 10.3883 0 8.40039V3.59961C0.000211156 1.61169 1.61169 0.000211157 3.59961 0H8.40039ZM3.59961 1C2.16398 1.00021 1.00021 2.16398 1 3.59961V8.40039C1.00021 9.83602 2.16398 10.9998 3.59961 11H8.40039C9.83602 10.9998 10.9998 9.83602 11 8.40039V3.59961C10.9998 2.16398 9.83602 1.00021 8.40039 1H3.59961Z" />
    </svg>
  )
}

function IconDoc({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none">
      <path
        d="M6 2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7.828a2 2 0 0 0-.586-1.414l-3.828-3.828A2 2 0 0 0 10.172 2H6Z"
        stroke="currentColor" strokeWidth="1.2" fill="none"
      />
      <path d="M7 11h6M7 14h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function isAcceptedFile(file: File): boolean {
  if (ACCEPTED_MIME_PREFIXES.some((p) => file.type.startsWith(p))) return true
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  return ACCEPTED_EXTENSIONS.split(',').some((a) => a.replace('.', '') === ext)
}

interface UploadDocsModalProps {
  open: boolean
  onClose: () => void
}

export default function UploadDocsModal({ open, onClose }: UploadDocsModalProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<Record<string, 'pending' | 'uploading' | 'processing' | 'done' | 'error'>>({})
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  function handleFiles(selected: FileList | null) {
    if (!selected) return
    const valid = Array.from(selected).filter(isAcceptedFile)
    const withinSize = valid.filter((f) => f.size <= MAX_SIZE_MB * 1024 * 1024)
    if (withinSize.length < valid.length) {
      setError(`Some files exceed the ${MAX_SIZE_MB} MB limit and were skipped`)
    }
    if (withinSize.length) {
      setFiles((prev) => [...prev, ...withinSize])
      if (withinSize.length === valid.length) setError(null)
    }
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleUpload() {
    if (!files.length) return
    setUploading(true)
    setError(null)
    const newProgress: Record<string, 'pending' | 'uploading' | 'processing' | 'done' | 'error'> = {}
    files.forEach((f) => { newProgress[f.name] = 'pending' })
    setProgress({ ...newProgress })

    let allOk = true
    for (const file of files) {
      newProgress[file.name] = 'uploading'
      setProgress({ ...newProgress })
      try {
        const formData = new FormData()
        formData.append('document', file)
        newProgress[file.name] = 'processing'
        setProgress({ ...newProgress })

        const resp = await fetch(`${API_BASE}/api/documents/upload`, { method: 'POST', body: formData })
        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}))
          throw new Error(data.error || `HTTP ${resp.status}`)
        }
        newProgress[file.name] = 'done'
      } catch (e: any) {
        newProgress[file.name] = 'error'
        allOk = false
        setError(e.message || 'Upload failed')
      }
      setProgress({ ...newProgress })
    }

    setUploading(false)
    if (allOk) {
      setFiles([])
      setProgress({})
      onClose()
    }
  }

  function handleClose() {
    if (!uploading) {
      setFiles([])
      setProgress({})
      setError(null)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-brand-charcoal/40 backdrop-blur-sm" onClick={handleClose} aria-hidden />
      <div className="relative w-full max-w-md rounded-xl border border-border bg-surface shadow-xl" role="dialog" aria-modal="true" aria-labelledby="upload-docs-title">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="upload-docs-title" className="text-lg font-semibold text-text-primary">Upload documents</h2>
          <button type="button" onClick={handleClose} disabled={uploading} className="p-2 rounded-lg text-text-tertiary hover:bg-card hover:text-text-primary transition-colors disabled:opacity-50" aria-label="Close">
            <IconClose />
          </button>
        </div>

        <div className="p-5">
          <input ref={inputRef} type="file" accept={ACCEPTED_EXTENSIONS} multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />

          {files.length === 0 ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleFiles(e.dataTransfer.files) }}
              className="w-full rounded-xl border-2 border-dashed border-border bg-card py-12 px-6 flex flex-col items-center gap-4 text-text-tertiary hover:border-accent hover:bg-accent/5 hover:text-text-secondary transition-colors"
            >
              <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                <IconDoc className="w-6 h-6 text-gray-500" />
              </div>
              <span className="text-sm font-medium">Click to select or drag and drop</span>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium text-text-secondary border border-border">
                  PDF, DOCX, PPTX
                </span>
                <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium text-text-secondary border border-border">
                  HTML, TXT, MD
                </span>
                <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium text-text-secondary border border-border">
                  PNG, JPG
                </span>
              </div>
              <span className="text-xs">Max {MAX_SIZE_MB} MB per file</span>
            </button>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {files.map((f, i) => {
                const status = progress[f.name]
                return (
                  <div key={`${f.name}-${i}`} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200">
                    <IconDoc className="w-5 h-5 text-gray-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{f.name}</p>
                      <p className="text-xs text-gray-500">{(f.size / (1024 * 1024)).toFixed(1)} MB</p>
                    </div>
                    {status === 'uploading' && <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin shrink-0" />}
                    {status === 'processing' && <span className="text-amber-600 text-xs shrink-0">Processing...</span>}
                    {status === 'done' && <span className="text-green-600 text-sm shrink-0">Done</span>}
                    {status === 'error' && <span className="text-red-600 text-sm shrink-0">Failed</span>}
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

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={handleClose} disabled={uploading} className="h-8 px-3 rounded-[9.6px] text-sm font-medium text-gray-700 bg-gray-200 hover:bg-gray-300 transition-colors disabled:opacity-50">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleUpload}
              disabled={!files.length || uploading}
              className="h-8 px-3 rounded-[9.6px] text-sm font-medium bg-brand-charcoal text-brand-white hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              {uploading && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {uploading ? 'Processing...' : `Upload ${files.length || ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

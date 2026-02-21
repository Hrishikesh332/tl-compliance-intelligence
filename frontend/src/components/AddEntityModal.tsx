import { useState, useRef, useCallback, useEffect } from 'react'

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

const MIN_CROP_SIZE = 60
const MAX_CROP_SIZE = 280

interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export interface EntitySelection {
  file: File
  crop: CropRect
  previewUrl: string
  name?: string
}

interface AddEntityModalProps {
  open: boolean
  onClose: () => void
  onEntityAdded?: (selection: EntitySelection) => void
}

export default function AddEntityModal({ open, onClose, onEntityAdded }: AddEntityModalProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<'upload' | 'choose' | 'crop'>('upload')
  const [entityName, setEntityName] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [crop, setCrop] = useState<CropRect>({ x: 80, y: 60, width: 120, height: 120 })
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const dragStart = useRef({ x: 0, y: 0, cropX: 0, cropY: 0 })
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      setStep('upload')
      setEntityName('')
      setImageFile(null)
      if (imagePreview) URL.revokeObjectURL(imagePreview)
      setImagePreview(null)
    }
  }, [open])

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview)
    }
  }, [imagePreview])

  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setStep('choose')
    setCrop({ x: 80, y: 60, width: 120, height: 120 })
  }, [imagePreview])

  const clampCrop = useCallback((c: CropRect, maxW: number, maxH: number): CropRect => {
    const w = Math.max(MIN_CROP_SIZE, Math.min(MAX_CROP_SIZE, c.width))
    const h = Math.max(MIN_CROP_SIZE, Math.min(MAX_CROP_SIZE, c.height))
    let x = Math.max(0, Math.min(maxW - w, c.x))
    let y = Math.max(0, Math.min(maxH - h, c.y))
    return { x, y, width: w, height: h }
  }, [])

  const onMouseDownCrop = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    dragStart.current = { x: e.clientX, y: e.clientY, cropX: crop.x, cropY: crop.y }
  }, [crop.x, crop.y])

  const onMouseDownResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsResizing(true)
    resizeStart.current = { x: e.clientX, y: e.clientY, w: crop.width, h: crop.height }
  }, [crop.width, crop.height])

  useEffect(() => {
    if (!containerRef.current || (!isDragging && !isResizing)) return
    const rect = containerRef.current.getBoundingClientRect()
    const maxW = rect.width
    const maxH = rect.height

    const onMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const dx = e.clientX - dragStart.current.x
        const dy = e.clientY - dragStart.current.y
        setCrop((prev) => clampCrop({
          ...prev,
          x: dragStart.current.cropX + dx,
          y: dragStart.current.cropY + dy,
        }, maxW, maxH))
      }
      if (isResizing) {
        const dx = e.clientX - resizeStart.current.x
        const dy = e.clientY - resizeStart.current.y
        const size = Math.max(MIN_CROP_SIZE, Math.min(MAX_CROP_SIZE, resizeStart.current.w + dx, resizeStart.current.h + dy))
        setCrop((prev) => clampCrop({
          ...prev,
          width: size,
          height: size,
        }, maxW, maxH))
      }
    }
    const onMouseUp = () => {
      setIsDragging(false)
      setIsResizing(false)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [isDragging, isResizing, clampCrop])

  function triggerFileInput() {
    inputRef.current?.click()
  }

  function handleCropConfirm() {
    if (imageFile && imagePreview) {
      onEntityAdded?.({ file: imageFile, crop, previewUrl: imagePreview, name: entityName.trim() || undefined })
    }
    onClose()
  }

  function handleCropBack() {
    setStep('choose')
  }

  function handleChooseBack() {
    setStep('upload')
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImagePreview(null)
    setImageFile(null)
  }

  if (!open) return null

  if (step === 'choose' && imagePreview && imageFile) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
        <div
          className="absolute inset-0 bg-brand-charcoal/40 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden
        />
        <div
          className="relative w-full max-w-md rounded-xl border border-gray-200 bg-surface shadow-xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="choose-entity-modal-title"
        >
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
            <h2 id="choose-entity-modal-title" className="text-lg font-semibold text-gray-900">
              How would you like to select the face?
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              aria-label="Close"
            >
              <IconClose />
            </button>
          </div>

          <div className="p-5">
            <div className="flex items-center gap-4 mb-4 p-3 rounded-xl bg-gray-50 border border-gray-200">
              <img
                src={imagePreview}
                alt="Upload preview"
                className="w-16 h-16 rounded-lg object-cover shrink-0"
              />
              <p className="text-sm text-gray-600 truncate flex-1 min-w-0">{imageFile.name}</p>
            </div>

            <div className="mb-4">
              <label htmlFor="add-entity-name" className="block text-sm font-medium text-gray-700 mb-1.5">
                Person name
              </label>
              <input
                id="add-entity-name"
                type="text"
                value={entityName}
                onChange={(e) => setEntityName(e.target.value)}
                placeholder="e.g. John Smith"
                className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
              />
            </div>

            <p className="text-sm text-gray-600 mb-4">
              Use automated detection to find the face automatically, or manually select the face region.
            </p>

            <div className="space-y-2">
              <button
                type="button"
                disabled
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed text-left"
                aria-disabled="true"
              >
                <span className="text-sm font-medium">Automated face detection</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">Coming soon</span>
              </button>
              <button
                type="button"
                onClick={() => setStep('crop')}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 bg-white hover:border-accent hover:bg-accent/5 text-gray-900 transition-colors text-left"
              >
                <span className="text-sm font-medium">Manual selection</span>
                <span className="text-xs text-gray-500">Drag and resize a circle over the face</span>
              </button>
            </div>

            <div className="mt-5 flex justify-between">
              <button
                type="button"
                onClick={handleChooseBack}
                className="h-8 px-3 rounded-[9.6px] text-sm font-medium text-gray-700 bg-gray-200 hover:bg-gray-300 transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                onClick={onClose}
                className="h-8 px-3 rounded-[9.6px] text-sm font-medium text-gray-700 bg-gray-200 hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'crop' && imagePreview) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
        <div
          className="absolute inset-0 bg-brand-charcoal/40 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden
        />
        <div
          className="relative w-full max-w-lg rounded-xl border border-gray-200 bg-surface shadow-xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="crop-entity-modal-title"
        >
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
            <h2 id="crop-entity-modal-title" className="text-lg font-semibold text-gray-900">
              Select face region
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              aria-label="Close"
            >
              <IconClose />
            </button>
          </div>

          <div className="p-5">
            <div className="mb-4">
              <label htmlFor="add-entity-name-crop" className="block text-sm font-medium text-gray-700 mb-1.5">
                Person name
              </label>
              <input
                id="add-entity-name-crop"
                type="text"
                value={entityName}
                onChange={(e) => setEntityName(e.target.value)}
                placeholder="e.g. John Smith"
                className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
              />
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Drag the selection to move, or drag the corner to resize. Position the circle over the face you want to use for this entity.
            </p>
            <div
              ref={containerRef}
              className="relative mx-auto rounded-xl overflow-hidden bg-gray-100 border border-gray-200"
              style={{ width: 320, height: 240 }}
            >
              <img
                src={imagePreview}
                alt="Upload for entity"
                className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none"
                draggable={false}
                style={{ objectPosition: 'center' }}
              />
              <div className="absolute inset-0 pointer-events-none">
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 320 240" preserveAspectRatio="none">
                  <defs>
                    <mask id="add-entity-crop-mask">
                      <rect width="320" height="240" fill="white" />
                      <ellipse
                        cx={crop.x + crop.width / 2}
                        cy={crop.y + crop.height / 2}
                        rx={crop.width / 2}
                        ry={crop.height / 2}
                        fill="black"
                      />
                    </mask>
                  </defs>
                  <rect width="320" height="240" fill="rgba(0,0,0,0.5)" mask="url(#add-entity-crop-mask)" />
                </svg>
              </div>
              <div
                className="absolute border-[2.5px] border-white rounded-full shadow-lg cursor-move"
                style={{
                  left: crop.x,
                  top: crop.y,
                  width: crop.width,
                  height: crop.height,
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(255,255,255,0.2)',
                }}
                onMouseDown={onMouseDownCrop}
              >
                <div
                  className="absolute -bottom-2 -right-2 w-5 h-5 bg-white border-2 border-gray-400 rounded-full cursor-se-resize flex items-center justify-center shadow-md hover:border-brand-charcoal hover:scale-110 transition-all"
                  onMouseDown={onMouseDownResize}
                  aria-hidden
                >
                  <svg className="w-3 h-3 text-gray-600" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
                    <path d="M2 10L10 2" />
                    <path d="M6 10L10 6" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-between">
              <button
                type="button"
                onClick={handleCropBack}
                className="h-8 px-3 rounded-[9.6px] text-sm font-medium text-gray-700 bg-gray-200 hover:bg-gray-300 transition-colors"
              >
                Back
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-8 px-3 rounded-[9.6px] text-sm font-medium text-gray-700 bg-gray-200 hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCropConfirm}
                  className="h-8 px-3 rounded-[9.6px] text-sm font-medium bg-brand-charcoal text-brand-white hover:bg-gray-700 transition-colors"
                >
                  Confirm selection
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-brand-charcoal/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="relative w-full max-w-md rounded-xl border border-gray-200 bg-surface shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-entity-modal-title"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 id="add-entity-modal-title" className="text-lg font-semibold text-gray-900">
            Add Entity
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            aria-label="Close"
          >
            <IconClose />
          </button>
        </div>

        <div className="p-5">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFileSelect(file)
            }}
          />
          <button
            type="button"
            onClick={triggerFileInput}
            className="w-full rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 py-12 px-6 flex flex-col items-center gap-3 text-gray-500 hover:border-accent hover:bg-accent/5 hover:text-gray-700 transition-colors"
          >
            <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
              <IconUpload className="w-6 h-6 text-gray-500" />
            </div>
            <span className="text-sm font-medium">Click to select or drag and drop</span>
            <span className="text-xs">Image with a face (JPG, PNG, WebP). You’ll Choose automated or manual face selection next.</span>
          </button>

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 rounded-[9.6px] text-sm font-medium text-gray-700 bg-gray-200 hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

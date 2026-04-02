import { useState, useMemo, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import AddImageModal from '../components/AddImageModal'
import AddEntityModal, { type EntitySelection } from '../components/AddEntityModal'
import { useVideoCache, type CachedVideo } from '../contexts/VideoCache'
import searchIconUrl from '../../strand/icons/search.svg?url'
import spinnerIconUrl from '../../strand/icons/spinner.svg?url'
import arrowBoxUpIconUrl from '../../strand/icons/arrow-box-up.svg?url'

import { API_BASE } from '../config'

type DocResult = {
  id: string
  score: number
  doc_id: string
  filename: string
  chunk_index: number
  text: string
}

type GroupedDocResult = {
  key: string
  docId: string
  filename: string
  ext: string
  bestScore: number
  chunks: Array<{
    id: string
    chunkIndex: number
    text: string
    scorePercent: number
  }>
}

type SearchAttachment = {
  id: string
  type: 'image' | 'entity'
  name: string
  previewUrl: string
  file?: File
}

type EntityOption = {
  id: string
  name: string
  previewUrl: string
}

function IconFilter({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      preserveAspectRatio="xMidYMid meet"
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8 4.25H2v-1h6zm6 0h-2v-1h2zM6.667 12.25H2v-1h4.667zm7.333 0h-3.333v-1H14zM8 7.25h6v1H8zm-6 0h2v1H2zM9.668 3.417v.666h.667v-.666zm-.2-1a.8.8 0 0 0-.8.8v1.066a.8.8 0 0 0 .8.8h1.067a.8.8 0 0 0 .8-.8V3.217a.8.8 0 0 0-.8-.8zM5.668 7.417v.666h.667v-.666zm-.2-1a.8.8 0 0 0-.8.8v1.066a.8.8 0 0 0 .8.8h1.067a.8.8 0 0 0 .8-.8V7.217a.8.8 0 0 0-.8-.8zM8.334 11.417v.666h.667v-.666zm-.2-1a.8.8 0 0 0-.8.8v1.066a.8.8 0 0 0 .8.8h1.067a.8.8 0 0 0 .8-.8v-1.066a.8.8 0 0 0-.8-.8z"
      />
    </svg>
  )
}

function IconAddImage({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8.834 5.334a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0m1.5-.5a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1M9.94 7.623a.767.767 0 0 0-1.212.02l-1.447 1.93-.738-.738c-.299-.3-.784-.3-1.084 0l-1.356 1.356a.767.767 0 0 0 .542 1.31h6.802c.642 0 1-.744.598-1.246zm-2.02 2.764 1.427-1.904 1.614 2.017H7.816a1 1 0 0 0 .103-.113m-1.156.082.032.031H5.208l.793-.793z"
      />
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5.6 2A3.6 3.6 0 0 0 2 5.6v4.8A3.6 3.6 0 0 0 5.6 14h4.8a3.6 3.6 0 0 0 3.6-3.6V5.6A3.6 3.6 0 0 0 10.4 2zm4.8 1H5.6A2.6 2.6 0 0 0 3 5.6v4.8A2.6 2.6 0 0 0 5.6 13h4.8a2.6 2.6 0 0 0 2.6-2.6V5.6A2.6 2.6 0 0 0 10.4 3"
      />
    </svg>
  )
}

function IconEntity({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 12" fill="currentColor">
      <path fillRule="evenodd" clipRule="evenodd" d="M6 2C7.10457 2 8 2.89543 8 4C8 5.10457 7.10457 6 6 6C4.89543 6 4 5.10457 4 4C4 2.89543 4.89543 2 6 2ZM6 3C5.44772 3 5 3.44772 5 4C5 4.55228 5.44772 5 6 5C6.55228 5 7 4.55228 7 4C7 3.44772 6.55228 3 6 3Z" />
      <path fillRule="evenodd" clipRule="evenodd" d="M8.40039 0C10.3883 0.000211285 11.9998 1.61169 12 3.59961V8.40039C11.9998 10.3883 10.3883 11.9998 8.40039 12H3.59961C1.61169 11.9998 0.000211285 10.3883 0 8.40039V3.59961C0.000211156 1.61169 1.61169 0.000211157 3.59961 0H8.40039ZM4.50098 7.5C3.16242 7.5 1.96779 8.54749 1.60938 10.0713C2.08624 10.6387 2.80047 10.9999 3.59961 11H8.40039C9.19957 10.9999 9.91279 10.6377 10.3896 10.0703C10.0309 8.54742 8.83897 7.50019 7.50098 7.5H4.50098ZM3.59961 1C2.16396 1.00018 1.00018 2.16396 1 3.59961V8.40039C1.00002 8.5262 1.01201 8.64948 1.0293 8.77051C1.70868 7.43439 2.98545 6.5 4.50098 6.5H7.50098C9.01528 6.50015 10.291 7.43307 10.9707 8.76758C10.9877 8.64746 11 8.5252 11 8.40039V3.59961C10.9998 2.16398 9.83602 1.00021 8.40039 1H3.59961Z" />
    </svg>
  )
}

function IconVision({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12.9122 9.33301" fill="currentColor">
      <path d="M6.45506 3.66699C7.00735 3.66699 7.45506 4.11471 7.45506 4.66699C7.4548 5.21905 7.00718 5.66699 6.45506 5.66699C5.90302 5.6669 5.45533 5.21899 5.45506 4.66699C5.45506 4.11477 5.90286 3.66709 6.45506 3.66699Z" />
      <path fillRule="evenodd" clipRule="evenodd" d="M6.45604 2C7.92873 2.00008 9.12303 3.19428 9.12303 4.66699C9.12286 6.13955 7.92862 7.33293 6.45604 7.33301C4.98339 7.33301 3.78922 6.1396 3.78905 4.66699C3.78905 3.19423 4.98328 2 6.45604 2ZM6.45604 3C5.53556 3 4.78905 3.74652 4.78905 4.66699C4.78922 5.58732 5.53567 6.33301 6.45604 6.33301C7.37634 6.33293 8.12286 5.58727 8.12303 4.66699C8.12303 3.74657 7.37644 3.00008 6.45604 3Z" />
      <path fillRule="evenodd" clipRule="evenodd" d="M6.45604 0C9.52829 0 11.814 2.75324 12.709 4.03027C12.9799 4.41688 12.9799 4.91711 12.709 5.30371C11.8138 6.58091 9.52798 9.33301 6.45604 9.33301C3.38403 9.33284 1.09814 6.58075 0.203109 5.30371C-0.067777 4.9172 -0.0676288 4.41685 0.203109 4.03027C1.09808 2.75328 3.38393 0.000169362 6.45604 0ZM6.45604 1C5.22672 1.00008 4.10185 1.55189 3.13573 2.31934C2.17222 3.08473 1.44025 4.00742 1.02244 4.60352C1.00473 4.62879 0.999984 4.65085 0.999984 4.66699C1.00004 4.6831 1.00485 4.70439 1.02244 4.72949C1.44022 5.32558 2.1721 6.24916 3.13573 7.01465C4.10178 7.78197 5.22685 8.33292 6.45604 8.33301C7.68544 8.33301 8.81115 7.78213 9.77733 7.01465C10.741 6.2491 11.4728 5.32558 11.8906 4.72949C11.9082 4.70442 11.912 4.68308 11.9121 4.66699C11.9121 4.65085 11.9083 4.62879 11.8906 4.60352C11.4728 4.00746 10.7409 3.08479 9.77733 2.31934C8.81111 1.55179 7.68551 1 6.45604 1Z" />
    </svg>
  )
}

function IconTranscription({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 13.5 13" fill="currentColor">
      <path d="M10 0C11.933 0 13.5 1.567 13.5 3.5V9.5C13.5 11.433 11.933 13 10 13H7.04199V12H10C11.3807 12 12.5 10.8807 12.5 9.5V3.5C12.5 2.11929 11.3807 1 10 1H5C3.61929 1 2.5 2.11929 2.5 3.5V6.43848H1.5V3.5C1.5 1.567 3.067 1.28851e-07 5 0H10ZM4.09863 5.72461C4.86348 5.16443 5.99984 5.69804 6 6.7002V11.7344C6 12.8035 4.70713 13.339 3.95117 12.583L2.58594 11.2178H1.2002C0.53746 11.2178 1.06091e-05 10.6803 0 10.0176V8.41797C0 7.75523 0.537453 7.21777 1.2002 7.21777H2.58594L3.95117 5.85156L4.09863 5.72461ZM5 6.7002C4.99983 6.52215 4.78415 6.43266 4.6582 6.55859L3.05859 8.15918L3.02832 8.18359C3.00641 8.19827 2.98192 8.20874 2.95605 8.21387L2.91699 8.21777H1.2002L1.16016 8.22168C1.0688 8.24016 1 8.32117 1 8.41797V10.0176L1.00391 10.0576C1.01984 10.136 1.0817 10.198 1.16016 10.2139L1.2002 10.2178H2.91699C2.97004 10.2178 3.02109 10.2389 3.05859 10.2764L4.6582 11.876C4.7842 12.002 5 11.9126 5 11.7344V6.7002ZM6.50098 7.5C7.6051 7.50053 8.5 8.39576 8.5 9.5C8.5 10.6042 7.6051 11.4985 6.50098 11.499V10.499C7.05281 10.4985 7.5 10.052 7.5 9.5C7.5 8.94804 7.05281 8.50053 6.50098 8.5V7.5ZM11 9C11.2761 9 11.5 9.22386 11.5 9.5C11.5 9.77614 11.2761 10 11 10H9.5C9.22386 10 9 9.77614 9 9.5C9 9.22386 9.22386 9 9.5 9H11ZM11 6C11.2761 6 11.5 6.22386 11.5 6.5C11.5 6.77614 11.2761 7 11 7H8C7.72386 7 7.5 6.77614 7.5 6.5C7.5 6.22386 7.72386 6 8 6H11ZM11 3C11.2761 3 11.5 3.22386 11.5 3.5C11.5 3.77614 11.2761 4 11 4H5C4.72386 4 4.5 3.77614 4.5 3.5C4.5 3.22386 4.72386 3 5 3H11Z" />
    </svg>
  )
}

function IconSpeech({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 12.0376" fill="currentColor">
      <path fillRule="evenodd" clipRule="evenodd" d="M8.8 1H3.2C1.98497 1 1 1.98497 1 3.2V6.13333C1 7.34836 1.98497 8.33333 3.2 8.33333H3.92451C4.32261 8.33333 4.69151 8.54221 4.89633 8.88357L6 10.723L7.10367 8.88357C7.30849 8.5422 7.6774 8.33333 8.07549 8.33333H8.8C10.015 8.33333 11 7.34836 11 6.13333V3.2C11 1.98497 10.015 1 8.8 1ZM3.2 0C1.43269 0 0 1.43269 0 3.2V6.13333C0 7.90065 1.43269 9.33333 3.2 9.33333H3.92451C3.97134 9.33333 4.01474 9.35791 4.03884 9.39807L5.42834 11.7139C5.68727 12.1455 6.31273 12.1455 6.57166 11.7139L7.96116 9.39807C7.98526 9.35791 8.02866 9.33333 8.07549 9.33333H8.8C10.5673 9.33333 12 7.90064 12 6.13333V3.2C12 1.43269 10.5673 0 8.8 0H3.2Z" />
    </svg>
  )
}

function IconCheckbox({ checked, className = 'w-5 h-5' }: { checked: boolean; className?: string }) {
  if (checked) {
    return (
      <svg className={className} viewBox="0 0 12 12">
        {/* Black filled checkbox */}
        <path fill="#1D1C1B" fillRule="evenodd" clipRule="evenodd" d="M8.39941 0C10.3875 0 11.9998 1.61157 12 3.59961V8.39941C12 10.3876 10.3876 12 8.39941 12H3.59961C1.61157 11.9998 0 10.3875 0 8.39941V3.59961C0.000177149 1.61168 1.61168 0.000179596 3.59961 0H8.39941ZM3.59961 1C2.16396 1.00018 1.00018 2.16396 1 3.59961V8.39941C1 9.83521 2.16385 10.9998 3.59961 11H8.39941C9.83532 11 11 9.83532 11 8.39941V3.59961C10.9998 2.16385 9.83521 1 8.39941 1H3.59961Z" />
        {/* White tick */}
        <path fill="#fff" d="M9.09961 3.48535L6.32715 8.47656C5.89108 9.26149 4.76862 9.27973 4.30664 8.50977L2.90039 6.16699L3.75781 5.65234L5.16406 7.99609C5.23009 8.10563 5.38975 8.10282 5.45215 7.99121L8.22559 3L9.09961 3.48535Z" />
      </svg>
    )
  }
  return (
    <svg className={className} viewBox="0 0 12 12" fill="currentColor">
      <path fillRule="evenodd" clipRule="evenodd" d="M8.40039 0C10.3883 0.000211285 11.9998 1.61169 12 3.59961V8.40039C11.9998 10.3883 10.3883 11.9998 8.40039 12H3.59961C1.61169 11.9998 0.000211285 10.3883 0 8.40039V3.59961C0.000211156 1.61169 1.61169 0.000211157 3.59961 0H8.40039ZM3.59961 1C2.16398 1.00021 1.00021 2.16398 1 3.59961V8.40039C1.00021 9.83602 2.16398 10.9998 3.59961 11H8.40039C9.83602 10.9998 10.9998 9.83602 11 8.40039V3.59961C10.9998 2.16398 9.83602 1.00021 8.40039 1H3.59961Z" />
    </svg>
  )
}

function IconPlay({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 9 11" fill="currentColor">
      <path fillRule="evenodd" clipRule="evenodd" d="M1.03927 1.03269V9.96731L7.91655 5.5L1.03927 1.03269ZM0 0.928981C0 0.182271 0.886347 -0.25826 1.5376 0.164775L8.57453 4.73579C9.14182 5.10429 9.14182 5.89571 8.57453 6.2642L1.5376 10.8352C0.88635 11.2583 0 10.8177 0 10.071V0.928981Z" />
    </svg>
  )
}

function IconInfo({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 12" fill="currentColor">
      <path d="M6.66699 9.33301H5.33301V5.33301H6.66699V9.33301Z" />
      <path d="M6.66699 4H5.33301V2.66699H6.66699V4Z" />
      <path fillRule="evenodd" clipRule="evenodd" d="M8.40039 0C10.3883 0.000211285 11.9998 1.61169 12 3.59961V8.40039C11.9998 10.3883 10.3883 11.9998 8.40039 12H3.59961C1.61169 11.9998 0.000211285 10.3883 0 8.40039V3.59961C0.000211156 1.61169 1.61169 0.000211157 3.59961 0H8.40039ZM3.59961 1C2.16398 1.00021 1.00021 2.16398 1 3.59961V8.40039C1.00021 9.83602 2.16398 10.9998 3.59961 11H8.40039C9.83602 10.9998 10.9998 9.83602 11 8.40039V3.59961C10.9998 2.16398 9.83602 1.00021 8.40039 1H3.59961Z" />
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

function IconGrid({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 12" fill="currentColor">
      <path d="M4 4V5H1V4H4ZM4 1H1V5L0.897461 4.99512C0.393331 4.94379 0 4.51768 0 4V1C0 0.447715 0.447715 0 1 0H4C4.55228 0 5 0.447715 5 1V4C5 4.55228 4.55228 5 4 5V1Z" />
      <path d="M4 11V12H1V11H4ZM4 8H1V12L0.897461 11.9951C0.393331 11.9438 0 11.5177 0 11V8C0 7.44772 0.447715 7 1 7H4C4.55228 7 5 7.44772 5 8V11C5 11.5523 4.55228 12 4 12V8Z" />
      <path d="M11 4V5H8V4H11ZM11 1H8V5L7.89746 4.99512C7.39333 4.94379 7 4.51768 7 4V1C7 0.447715 7.44772 0 8 0H11C11.5523 0 12 0.447715 12 1V4C12 4.55228 11.5523 5 11 5V1Z" />
      <path d="M11 11V12H8V11H11ZM11 8H8V12L7.89746 11.9951C7.39333 11.9438 7 11.5177 7 11V8C7 7.44772 7.44772 7 8 7H11C11.5523 7 12 7.44772 12 8V11C12 11.5523 11.5523 12 11 12V8Z" />
    </svg>
  )
}

function IconList({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 12" fill="currentColor">
      <path d="M1 3h10v1H1V3z" />
      <path d="M1 6h10v1H1V6z" />
      <path d="M1 9h10v1H1V9z" />
    </svg>
  )
}

function IconVideo({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 9 11" fill="currentColor">
      <path fillRule="evenodd" clipRule="evenodd" d="M1.03927 1.03269V9.96731L7.91655 5.5L1.03927 1.03269ZM0 0.928981C0 0.182271 0.886347 -0.25826 1.5376 0.164775L8.57453 4.73579C9.14182 5.10429 9.14182 5.89571 8.57453 6.2642L1.5376 10.8352C0.88635 11.2583 0 10.8177 0 10.071V0.928981Z" />
    </svg>
  )
}

function PriorityTag({ priority }: { priority: 'low' | 'medium' | 'high' }) {
  const styles = {
    low: 'bg-success/10 text-success border border-success/20',
    medium: 'bg-warning/10 text-warning border border-warning/20',
    high: 'bg-error/10 text-error border border-error/20',
  }
  const label = priority.charAt(0).toUpperCase() + priority.slice(1)
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[priority]}`}>
      {label}
    </span>
  )
}

function EntityAvatarCircle({ entity, imageFailed, onImageError }: { entity: TableEntity; imageFailed: boolean; onImageError: () => void }) {
  const showFallback = !entity.imageUrl || imageFailed
  return (
    <div
      className="relative w-7 h-7 rounded-full border-2 border-surface overflow-hidden bg-card shrink-0 flex items-center justify-center ring-1 ring-white"
      title={entity.name}
    >
      {showFallback ? (
        <span className="text-[10px] font-medium text-gray-600">{entity.initials}</span>
      ) : (
        <img
          src={entity.imageUrl}
          alt=""
          className="w-full h-full object-cover"
          onError={onImageError}
          referrerPolicy="no-referrer"
        />
      )}
    </div>
  )
}

function EntityAvatars({ entities }: { entities: TableEntity[] }) {
  const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set())
  if (!entities?.length) return <span className="text-sm text-gray-400">—</span>
  const maxCircles = 4
  const show = entities.slice(0, maxCircles)
  const rest = entities.length - show.length
  return (
    <div className="flex items-center gap-0.5">
      <div className="flex items-center -space-x-2.5">
        {show.map((e) => (
          <EntityAvatarCircle
            key={e.id}
            entity={e}
            imageFailed={failedIds.has(e.id)}
            onImageError={() => setFailedIds((prev) => new Set(prev).add(e.id))}
          />
        ))}
      </div>
      {rest > 0 && (
        <span
          className="ml-1.5 min-w-[1.5rem] h-6 px-1.5 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-medium shrink-0"
          title={`${rest} more`}
        >
          +{rest}
        </span>
      )}
    </div>
  )
}

function TagPills({ tags }: { tags: string[] }) {
  if (!tags?.length) return <span className="text-sm text-gray-400">—</span>
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200/80"
        >
          {tag}
        </span>
      ))}
    </div>
  )
}

const CATEGORIES = ['All', 'BodyCam', 'DashCam', 'CCTV', 'Insurance Claim'] as const

type TableEntity = { id: string; name: string; imageUrl?: string; initials: string }

type ClipMatch = {
  start: number
  end: number
  score: number
  type: string
}

type VideoItem = {
  id: string
  title: string
  uploadDate: string
  duration: string
  totalMinutes: number
  category: string
  tags?: string[]
  entities?: TableEntity[]
  streamUrl?: string
  thumbnailUrl?: string
  thumbnailDataUrl?: string
  durationSeconds?: number
  clips?: ClipMatch[]
  searchScore?: number
  /** From metadata.video_analysis (video analysis) */
  categories?: string[]
  aboutTopics?: string[]
  people?: string[]
  riskLevel?: 'low' | 'medium' | 'high'
  /** From metadata.video_insights (detected objects in video) */
  detectedObjects?: string[]
}

function bestClipScore(clips: ClipMatch[] | undefined): number {
  if (!clips || clips.length === 0) return 0
  return Math.max(...clips.map((c) => c.score))
}

type RelevanceLevel = 'Highest' | 'High' | 'Medium' | 'Low'

function relevanceLabel(clips: ClipMatch[] | undefined): { label: RelevanceLevel | ''; color: string } {
  if (!clips || clips.length === 0) return { label: '', color: '' }
  const best = bestClipScore(clips)
  if (best >= 0.10) return { label: 'Highest', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' }
  if (best >= 0.08) return { label: 'High', color: 'bg-green-100 text-green-800 border-green-300' }
  if (best >= 0.06) return { label: 'Medium', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' }
  return { label: 'Low', color: 'bg-red-50 text-red-700 border-red-200' }
}

const RELEVANCE_LEVELS: { level: RelevanceLevel; color: string; activeColor: string }[] = [
  { level: 'Highest', color: 'border-emerald-300 text-emerald-800', activeColor: 'bg-emerald-100 border-emerald-400 text-emerald-900' },
  { level: 'High', color: 'border-green-300 text-green-800', activeColor: 'bg-green-100 border-green-400 text-green-900' },
  { level: 'Medium', color: 'border-yellow-300 text-yellow-800', activeColor: 'bg-yellow-100 border-yellow-400 text-yellow-900' },
  { level: 'Low', color: 'border-red-200 text-red-700', activeColor: 'bg-red-50 border-red-300 text-red-800' },
]

function clipScoreColor(score: number): string {
  if (score >= 0.10) return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (score >= 0.08) return 'bg-green-50 text-green-700 border-green-200'
  if (score >= 0.06) return 'bg-yellow-50 text-yellow-700 border-yellow-200'
  return 'bg-red-50 text-red-600 border-red-200'
}

const SAMPLE_VIDEOS: VideoItem[] = []

const TOTAL_CAPACITY = 100
const TOTAL_HOURS = 10

const PINNED_VIDEO_IDS = new Set<string>([
  'd8f1319a-c912-48a1-989b-ddbcf37c3cef',
])

function reorderWithPinned(videos: VideoItem[]): VideoItem[] {
  if (!videos.length) return videos
  const pinned: VideoItem[] = []
  const rest: VideoItem[] = []
  for (const v of videos) {
    if (PINNED_VIDEO_IDS.has(v.id) && !pinned.some((p) => p.id === v.id)) {
      pinned.push(v)
    } else {
      rest.push(v)
    }
  }
  return [...pinned, ...rest]
}

function formatTotalDuration(videos: VideoItem[], videoDurations?: Record<string, number>) {
  const totalSeconds = videos.reduce((sum, v) => {
    const sec = v.durationSeconds ?? videoDurations?.[v.id]
    if (sec != null && Number.isFinite(sec)) return sum + sec
    return sum + v.totalMinutes * 60
  }, 0)
  if (totalSeconds <= 0) return '0 min'
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  if (h > 0) return `${h} h ${m} min`
  return `${m} min`
}

function formatDurationHHMMSS(duration: string): string {
  const parts = duration.split(':').map(Number)
  if (parts.length >= 3) {
    const [h = 0, m = 0, s = 0] = parts
    const totalM = h * 60 + m
    return `${totalM.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return duration
}

/** Short form for caption under title (e.g. 2:19). */
function formatDurationShort(duration: string): string {
  const parts = duration.split(':').map(Number)
  if (parts.length >= 3) {
    const [h, m, s] = parts
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    return `${m}:${s.toString().padStart(2, '0')}`
  }
  return duration
}

/** Format seconds to badge (mm:ss) or (h:mm:ss). */
function formatSecondsToTimestamp(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

interface SearchOptions {
  visual: boolean
  audio: boolean
  transcription: boolean
  lexical: boolean
  semantic: boolean
}

function AdvancedParamsDropdown({
  options,
  onChange,
  onApply,
}: {
  options: SearchOptions
  onChange: (opts: SearchOptions) => void
  onApply: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function toggle(key: keyof SearchOptions) {
    const next = { ...options, [key]: !options[key] }
    if (key === 'transcription') {
      next.lexical = next.transcription
      next.semantic = next.transcription
    }
    if ((key === 'lexical' || key === 'semantic') && !next.lexical && !next.semantic) {
      next.transcription = false
    } else if ((key === 'lexical' || key === 'semantic') && (next.lexical || next.semantic)) {
      next.transcription = true
    }
    onChange(next)
  }

  const hasActiveOptions = options.visual || options.audio || options.transcription

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ${
          open || hasActiveOptions
            ? 'border-border bg-card text-text-primary'
            : 'border-border bg-surface text-text-secondary hover:bg-card'
        }`}
        aria-label="Advanced parameters"
        aria-expanded={open}
      >
        <IconFilter className="w-3.5 h-3.5 shrink-0" />
        <span className="hidden sm:inline">Filter</span>
        <IconChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-border bg-surface p-5 shadow-xl z-[100]">
          <p className="text-xs text-text-tertiary uppercase tracking-wider mb-1.5">Advanced Parameters</p>
          <div className="flex items-center gap-1.5 mb-4">
            <h4 className="text-sm font-medium text-text-primary">Select search options</h4>
            <IconInfo className="w-3.5 h-3.5 text-text-tertiary" />
          </div>

          <div className="space-y-3">
            <button type="button" onClick={() => toggle('visual')} className="flex items-center gap-2.5 w-full text-left group">
              <IconCheckbox checked={options.visual} className="w-5 h-5 text-brand-charcoal" />
              <span className="text-sm font-medium text-text-secondary group-hover:text-text-primary">Visual</span>
            </button>

            <button type="button" onClick={() => toggle('audio')} className="flex items-center gap-2.5 w-full text-left group">
              <IconCheckbox checked={options.audio} className="w-5 h-5 text-brand-charcoal" />
              <span className="text-sm font-medium text-text-secondary group-hover:text-text-primary">Audio</span>
            </button>

            <div>
              <button type="button" onClick={() => toggle('transcription')} className="flex items-center gap-2.5 w-full text-left group">
                <IconCheckbox checked={options.transcription} className="w-5 h-5 text-brand-charcoal" />
                <span className="text-sm font-medium text-text-secondary group-hover:text-text-primary">Transcription</span>
              </button>
              <div className="ml-8 mt-2 space-y-2">
                <button type="button" onClick={() => toggle('lexical')} className="flex items-center gap-2.5 w-full text-left group">
                  <IconCheckbox checked={options.lexical} className="w-5 h-5 text-brand-charcoal" />
                  <span className="text-sm text-gray-600 group-hover:text-gray-800">Lexical</span>
                </button>
                <button type="button" onClick={() => toggle('semantic')} className="flex items-center gap-2.5 w-full text-left group">
                  <IconCheckbox checked={options.semantic} className="w-5 h-5 text-brand-charcoal" />
                  <span className="text-sm text-gray-600 group-hover:text-gray-800">Semantic</span>
                </button>
              </div>
            </div>
          </div>

          {/* Apply button */}
          <button
            type="button"
            onClick={() => {
              onApply()
              setOpen(false)
            }}
            className="w-full mt-5 h-10 rounded-full bg-brand-charcoal text-brand-white text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  )
}

const VIDEO_ID_RE = /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i

function DocResultCard({ ext, filename, chunkIndex, text, scorePercent, docId }: {
  ext: string; filename: string; chunkIndex: number; text: string;
  scorePercent: number; docId: string;
}) {
  const [expanded, setExpanded] = useState(false)
  const snippet = text.length > 280 ? text.slice(0, 280) : text
  const hasMore = text.length > 280

  const videoId = useMemo(() => {
    const match = text.match(VIDEO_ID_RE)
    return match ? match[1] : null
  }, [text])

  const isPdf = ext === 'PDF'

  const scoreRing = scorePercent >= 70
    ? 'text-system-success'
    : scorePercent >= 45
      ? 'text-system-warning'
      : 'text-gray-400'

  const r = 16
  const circ = 2 * Math.PI * r
  const dash = (scorePercent / 100) * circ

  return (
    <div className="group rounded-xl border border-border bg-surface hover:border-gray-400 transition-all duration-200 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60 bg-card/40">
        <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center mb-3">
          <svg
            viewBox="0 0 12 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-4 h-4"
            aria-hidden="true"
          >
            <g fill="currentColor" fillRule="evenodd" clipRule="evenodd">
              <path d="M7.09961 9C7.59667 9 8 9.40333 8 9.90039V11.0996C8 11.5967 7.59667 12 7.09961 12H0.900391C0.403334 12 0 11.5967 0 11.0996V9.90039C0 9.40333 0.403334 9 0.900391 9H7.09961Z" />
              <path d="M11.0996 9C11.5967 9 12 9.40333 12 9.90039V11.0996C12 11.5967 11.5967 12 11.0996 12H9.90039C9.40333 12 9 11.5967 9 11.0996V9.90039C9 9.40333 9.40333 9 9.90039 9H11.0996ZM10 11H11V10H10V11Z" />
              <path d="M4.09961 4.5C4.59667 4.5 5 4.90333 5 5.40039V6.59961C5 7.09667 4.59667 7.5 4.09961 7.5H0.900391C0.403334 7.5 0 7.09667 0 6.59961V5.40039C0 4.90333 0.403334 4.5 0.900391 4.5H4.09961ZM1 6.5H4V5.5H1V6.5Z" />
              <path d="M11.0996 4.5C11.5967 4.5 12 4.90333 12 5.40039V6.59961C12 7.09667 11.5967 7.5 11.0996 7.5H6.90039C6.40333 7.5 6 7.09667 6 6.59961V5.40039C6 4.90333 6.40333 4.5 6.90039 4.5H11.0996Z" />
              <path d="M7.09961 0C7.59667 0 8 0.403334 8 0.900391V2.09961C8 2.59667 7.59667 3 7.09961 3H0.900391C0.403334 3 0 2.59667 0 2.09961V0.900391C0 0.403334 0.403334 0 0.900391 0H7.09961Z" />
              <path d="M11.0996 0C11.5967 0 12 0.403334 12 0.900391V2.09961C12 2.59667 11.5967 3 11.0996 3H9.90039C9.40333 3 9 2.59667 9 2.09961V0.900391C9 0.403334 9.40333 0 9.90039 0H11.0996ZM10 2H11V1H10V2Z" />
            </g>
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-primary truncate">{filename}</span>
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-brand-charcoal/10 text-text-tertiary">
              {ext}
            </span>
          </div>
          <span className="text-xs text-text-tertiary">Page {chunkIndex + 1}</span>
        </div>

        <div className="shrink-0 relative flex items-center justify-center w-11 h-11" title={`${scorePercent}% relevance`}>
          <svg width="44" height="44" viewBox="0 0 44 44" className="absolute inset-0">
            <circle cx="22" cy="22" r={r} fill="none" stroke="currentColor" strokeWidth="3" className="text-gray-200" />
            <circle
              cx="22" cy="22" r={r} fill="none" strokeWidth="3"
              stroke="currentColor" className={scoreRing}
              strokeDasharray={`${dash} ${circ}`}
              strokeLinecap="round"
              transform="rotate(-90 22 22)"
            />
          </svg>
          <span className="relative text-xs font-bold text-text-primary">{scorePercent}%</span>
        </div>
      </div>

      <div className="px-4 py-3">
        <p className="text-[13px] leading-relaxed text-text-secondary whitespace-pre-wrap break-words">
          {expanded ? text : snippet}{!expanded && hasMore ? '…' : ''}
        </p>
        {hasMore && (
          <button
            type="button"
            onClick={() => setExpanded((p) => !p)}
            className="mt-1.5 text-xs font-medium text-accent hover:text-accent-hover transition-colors"
          >
            {expanded ? '▲ Show less' : '▼ Show more'}
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 px-4 py-2.5 border-t border-border/60 bg-card/30">
        {videoId && (
          <Link
            to={`/video/${videoId}`}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold bg-brand-charcoal text-white hover:bg-gray-700 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M10 9l5 3-5 3V9z" fill="currentColor"/>
            </svg>
            Watch Video
          </Link>
        )}
        <a
          href={`${API_BASE}/api/documents/file/${docId}/${encodeURIComponent(filename)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-semibold bg-brand-charcoal text-white hover:bg-gray-600 transition-colors"
          title="Open source document"
          onClick={(e) => {
            if (isPdf) {
              e.preventDefault()
              window.open(`${API_BASE}/api/documents/file/${docId}/${encodeURIComponent(filename)}`, '_blank')
            }
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
            <path d="M15 3h6v6" />
            <path d="M10 14L21 3" />
          </svg>
          View Source
        </a>
      </div>
    </div>
  )
}

function GroupedDocResultCard({ group }: { group: GroupedDocResult }) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="group rounded-xl border border-border bg-surface hover:border-gray-400 transition-all duration-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center gap-3 px-4 py-3 border-b border-border/60 bg-card/40 text-left"
      >
        <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center mb-3">
          <svg
            viewBox="0 0 12 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-4 h-4"
            aria-hidden="true"
          >
            <g fill="currentColor" fillRule="evenodd" clipRule="evenodd">
              <path d="M7.09961 9C7.59667 9 8 9.40333 8 9.90039V11.0996C8 11.5967 7.59667 12 7.09961 12H0.900391C0.403334 12 0 11.5967 0 11.0996V9.90039C0 9.40333 0.403334 9 0.900391 9H7.09961Z" />
              <path d="M11.0996 9C11.5967 9 12 9.40333 12 9.90039V11.0996C12 11.5967 11.5967 12 11.0996 12H9.90039C9.40333 12 9 11.5967 9 11.0996V9.90039C9 9.40333 9.40333 9 9.90039 9H11.0996ZM10 11H11V10H10V11Z" />
              <path d="M4.09961 4.5C4.59667 4.5 5 4.90333 5 5.40039V6.59961C5 7.09667 4.59667 7.5 4.09961 7.5H0.900391C0.403334 7.5 0 7.09667 0 6.59961V5.40039C0 4.90333 0.403334 4.5 0.900391 4.5H4.09961ZM1 6.5H4V5.5H1V6.5Z" />
              <path d="M11.0996 4.5C11.5967 4.5 12 4.90333 12 5.40039V6.59961C12 7.09667 11.5967 7.5 11.0996 7.5H6.90039C6.40333 7.5 6 7.09667 6 6.59961V5.40039C6 4.90333 6.40333 4.5 6.90039 4.5H11.0996Z" />
              <path d="M7.09961 0C7.59667 0 8 0.403334 8 0.900391V2.09961C8 2.59667 7.59667 3 7.09961 3H0.900391C0.403334 3 0 2.59667 0 2.09961V0.900391C0 0.403334 0.403334 0 0.900391 0H7.09961Z" />
              <path d="M11.0996 0C11.5967 0 12 0.403334 12 0.900391V2.09961C12 2.59667 11.5967 3 11.0996 3H9.90039C9.40333 3 9 2.59667 9 2.09961V0.900391C9 0.403334 9.40333 0 9.90039 0H11.0996ZM10 2H11V1H10V2Z" />
            </g>
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-primary truncate">{group.filename}</span>
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-brand-charcoal/10 text-text-tertiary">
              {group.ext}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-text-tertiary mt-0.5">
            <span>
              {group.chunks.length} chunk{group.chunks.length !== 1 ? 's' : ''} · pages{' '}
              {group.chunks
                .map((c) => c.chunkIndex + 1)
                .sort((a, b) => a - b)
                .join(', ')}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-charcoal/5 px-2 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-charcoal" aria-hidden />
              <span className="font-medium">
                Top match: {Math.round(group.bestScore * 100)}%
              </span>
            </span>
          </div>
        </div>

        <svg
          className={`w-4 h-4 text-text-tertiary shrink-0 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden
        >
          <path d="M6 3.5L10.5 8 6 12.5V3.5Z" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 py-3 space-y-3 max-h-64 overflow-y-auto">
          {group.chunks.map((chunk) => (
            <div key={chunk.id} className="rounded-lg border border-border/60 bg-card/40 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-semibold text-text-primary">
                  Page {chunk.chunkIndex + 1}
                </span>
                <span className="text-[11px] font-semibold text-text-secondary">
                  {chunk.scorePercent}%
                </span>
              </div>
              <p className="text-[13px] leading-relaxed text-text-secondary whitespace-pre-wrap break-words line-clamp-4">
                {chunk.text}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 px-4 py-2.5 border-t border-border/60 bg-card/30">
        <a
          href={`${API_BASE}/api/documents/file/${group.docId}/${encodeURIComponent(group.filename)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-semibold bg-brand-charcoal text-white hover:bg-gray-600 transition-colors"
          title="Open source document"
          onClick={(e) => {
            if (group.ext === 'PDF') {
              e.preventDefault()
              window.open(`${API_BASE}/api/documents/file/${group.docId}/${encodeURIComponent(group.filename)}`, '_blank')
            }
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
            <path d="M15 3h6v6" />
            <path d="M10 14L21 3" />
          </svg>
          Open document
        </a>
      </div>
    </div>
  )
}

type DashboardProps = { onOpenUpload?: () => void }

export default function Dashboard({ onOpenUpload }: DashboardProps) {
  const [addImageModalOpen, setAddImageModalOpen] = useState(false)
  const [addEntityModalOpen, setAddEntityModalOpen] = useState(false)
  const [searchAttachments, setSearchAttachments] = useState<SearchAttachment[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [docResults, setDocResults] = useState<DocResult[] | null>(null)
  const [docsExpanded, setDocsExpanded] = useState(true)
  const [sortBy, setSortBy] = useState<'recent' | 'name'>('recent')
  const [activeCategory, setActiveCategory] = useState<string>('All')
  const [viewMode, setViewMode] = useState<'videos' | 'tabular'>('videos')
  const [videosPage, setVideosPage] = useState(1)
  const [tabularPage, setTabularPage] = useState(1)
  const [activeRelevanceFilter, setActiveRelevanceFilter] = useState<RelevanceLevel | null>(null)
  const groupedDocResults: GroupedDocResult[] = useMemo(() => {
    if (!docResults) return []
    const map = new Map<string, GroupedDocResult>()
    for (const doc of docResults) {
      const key = `${doc.doc_id}::${doc.filename}`
      const ext = doc.filename.split('.').pop()?.toUpperCase() || 'DOC'
      const scorePercent = Math.round(doc.score * 100)
      if (!map.has(key)) {
        map.set(key, {
          key,
          docId: doc.doc_id,
          filename: doc.filename,
          ext,
          bestScore: doc.score,
          chunks: [],
        })
      }
      const entry = map.get(key)!
      if (doc.score > entry.bestScore) {
        entry.bestScore = doc.score
      }
      entry.chunks.push({
        id: doc.id,
        chunkIndex: doc.chunk_index,
        text: doc.text,
        scorePercent,
      })
    }
    const groups = Array.from(map.values())
    groups.forEach((g) => {
      // Order chunks by relevance (top match first), not by page
      g.chunks.sort((a, b) => b.scorePercent - a.scorePercent)
    })
    groups.sort((a, b) => b.bestScore - a.bestScore)
    return groups
  }, [docResults])
  const VIDEOS_PAGE_SIZE = 7
  const TABULAR_PAGE_SIZE = 8
  const { videos: cachedVideos } = useVideoCache()
  const apiVideos = useMemo<VideoItem[]>(() => {
    return cachedVideos.map((v: CachedVideo) => {
      const meta = v.metadata || {}
      const analysis = meta.video_analysis as { categories?: string[]; topics?: string[]; people?: string[]; riskLevel?: string } | undefined
      const uploaded = meta.uploaded_at || ''
      let uploadDate = ''
      if (uploaded) {
        try {
          const d = new Date(uploaded)
          uploadDate = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${d.getFullYear()}`
        } catch { uploadDate = uploaded }
      }
      const dur = v.duration_seconds
      const riskLevel = analysis?.riskLevel
      const validRisk = riskLevel === 'high' || riskLevel === 'medium' || riskLevel === 'low' ? riskLevel : undefined
      const insights = meta.video_insights as { objects?: Array<{ object?: string }>; detected_faces?: Array<{ face_id?: number | string; face_path?: string }> } | undefined
      const rawObjects = Array.isArray(insights?.objects) ? insights.objects : []
      const detectedObjects = [...new Set(rawObjects.map((o) => (o && typeof o.object === 'string' ? o.object.trim() : '')).filter(Boolean))]
      const detectedFaces = Array.isArray(insights?.detected_faces) ? insights.detected_faces : []
      const entities: TableEntity[] = detectedFaces.map((f, i) => {
        let faceId: number
        if (typeof f.face_id === 'number' && Number.isInteger(f.face_id)) {
          faceId = f.face_id
        } else if (typeof f.face_id === 'string' && /^\d+$/.test(f.face_id)) {
          faceId = parseInt(f.face_id, 10)
        } else if (f.face_path && typeof f.face_path === 'string') {
          const m = f.face_path.match(/face_(\d+)\.png/)
          faceId = m ? parseInt(m[1], 10) : i
        } else {
          faceId = i
        }
        return {
          id: `face-${v.id}-${faceId}`,
          name: `Face ${faceId + 1}`,
          imageUrl: `${API_BASE}/api/videos/${v.id}/faces/${faceId}`,
          initials: `F${faceId + 1}`,
        }
      })
      return {
        id: v.id,
        title: meta.filename || v.id,
        uploadDate,
        duration: dur != null ? formatSecondsToTimestamp(dur) : '—',
        totalMinutes: dur != null ? Math.ceil(dur / 60) : 0,
        category: 'Uploaded',
        tags: [
          ...(Array.isArray(meta.tags) ? meta.tags : []),
          meta.status === 'ready' ? 'Indexed' : meta.status === 'indexing' ? 'Indexing' : meta.status === 'queued' ? 'Queued' : 'Uploaded',
        ],
        entities,
        streamUrl: v.stream_url || undefined,
        thumbnailUrl: v.thumbnail_url || undefined,
        thumbnailDataUrl: v.thumbnail_data_url || undefined,
        durationSeconds: dur ?? undefined,
        categories: Array.isArray(analysis?.categories) ? analysis.categories : undefined,
        aboutTopics: Array.isArray(analysis?.topics) ? analysis.topics : undefined,
        people: Array.isArray(analysis?.people) ? analysis.people : undefined,
        riskLevel: validRisk,
        detectedObjects: detectedObjects.length > 0 ? detectedObjects : undefined,
      }
    })
  }, [cachedVideos])

  // For videos without duration in metadata, get duration from the video element (onLoadedMetadata)
  const [videoDurations, setVideoDurations] = useState<Record<string, number>>({})

  const SEARCH_PLACEHOLDERS = [
    'Search actions, objects, sounds and logos',
    "Search with entities (@ + name)",
    'Search with image and text across videos',
  ]

  /** Predefined queries users can run — customized for current use cases */
  const SUGGESTED_SEARCHES = [
    'Suspect vehicle maroon car investigation details',
    'Police officer applying handcuffs to a suspect',
    'Criminal investigation at the scene',
    'suspicious vehicle investigation case',
    'Vehicle burning incident',
    'Car driving in a long road lane',
  ]
  const [placeholderIdx, setPlaceholderIdx] = useState(0)
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  useEffect(() => {
    if (searchQuery || searchAttachments.length) return
    const timer = setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % SEARCH_PLACEHOLDERS.length)
    }, 6000)
    return () => clearInterval(timer)
  }, [searchQuery, searchAttachments.length])

  // Close suggestions dropdown when user starts typing or attaches filters
  useEffect(() => {
    if (searchQuery || searchAttachments.length) {
      setSuggestionsOpen(false)
    }
  }, [searchQuery, searchAttachments.length])

  const [searchOptions, setSearchOptions] = useState<SearchOptions>({
    visual: true,
    audio: true,
    transcription: true,
    lexical: true,
    semantic: true,
  })
  const [searchResults, setSearchResults] = useState<{ query: string; results: VideoItem[] } | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [entitiesList, setEntitiesList] = useState<EntityOption[]>([])
  const entityDropdownRef = useRef<HTMLDivElement>(null)
  const docsSectionRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`${API_BASE}/api/entities`)
      .then((res) => res.json())
      .then((data: { entities?: Array<{ id: string; metadata?: { name?: string; face_snap_base64?: string } }> }) => {
        if (cancelled) return
        const list: EntityOption[] = (data.entities || []).map((e) => {
          const name = e.metadata?.name || e.id
          const b64 = e.metadata?.face_snap_base64
          const previewUrl = b64 ? `data:image/png;base64,${b64}` : ''
          return { id: e.id, name, previewUrl }
        })
        setEntitiesList(list)
      })
      .catch(() => { if (!cancelled) setEntitiesList([]) })
    return () => { cancelled = true }
  }, [])

  // Collapse documents section once user scrolls down toward the videos area
  useEffect(() => {
    function handleScroll() {
      if (!docsExpanded || !docsSectionRef.current) return
      const rect = docsSectionRef.current.getBoundingClientRect()
      // When top of docs section has scrolled well above the viewport, collapse it
      if (rect.bottom < 80) {
        setDocsExpanded(false)
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [docsExpanded])

  const { entityMentionQuery, entityDropdownVisible, filteredEntities, queryBeforeMention } = useMemo(() => {
    const lastAt = searchQuery.lastIndexOf('@')
    if (lastAt < 0) {
      return {
        entityMentionQuery: '',
        entityDropdownVisible: false,
        filteredEntities: [] as EntityOption[],
        queryBeforeMention: searchQuery,
      }
    }
    const afterAt = searchQuery.slice(lastAt + 1)
    const hasSpace = afterAt.includes(' ')
    const mentionQuery = hasSpace ? afterAt.split(/\s/)[0] || '' : afterAt
    const filter = mentionQuery.toLowerCase()
    const filtered = filter
      ? entitiesList.filter((e) => e.name.toLowerCase().includes(filter))
      : entitiesList
    return {
      entityMentionQuery: mentionQuery,
      entityDropdownVisible: true,
      filteredEntities: filtered.slice(0, 8),
      queryBeforeMention: searchQuery.slice(0, lastAt),
    }
  }, [searchQuery, entitiesList])

  useEffect(() => {
    if (!entityDropdownVisible) return
    function handleClickOutside(e: MouseEvent) {
      if (entityDropdownRef.current && !entityDropdownRef.current.contains(e.target as Node)) {
        setSearchQuery((q) => {
          const lastAt = q.lastIndexOf('@')
          if (lastAt < 0) return q
          return q.slice(0, lastAt)
        })
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [entityDropdownVisible])

  const allVideos = useMemo(() => reorderWithPinned([...SAMPLE_VIDEOS, ...apiVideos]), [apiVideos])

  const filteredVideos = useMemo(() => {
    if (searchResults) {
      let results = [...searchResults.results].sort((a, b) => bestClipScore(b.clips) - bestClipScore(a.clips))
      if (activeRelevanceFilter) {
        results = results.filter((v) => {
          const rel = relevanceLabel(v.clips)
          return rel.label === activeRelevanceFilter
        })
      }
      return reorderWithPinned(results)
    }
    let list = allVideos
    if (activeCategory !== 'All') {
      const tag = activeCategory.toLowerCase()
      list = list.filter((v) => {
        const tags = (v.tags ?? []).map((t) => t.toLowerCase())
        return tags.includes(tag)
      })
    }
    if (sortBy === 'name') {
      list = [...list].sort((a, b) => a.title.localeCompare(b.title))
    }
    return reorderWithPinned(list)
  }, [allVideos, sortBy, activeCategory, searchResults, activeRelevanceFilter])

  const relevanceCounts = useMemo(() => {
    if (!searchResults) return null
    const counts: Record<RelevanceLevel, number> = { Highest: 0, High: 0, Medium: 0, Low: 0 }
    for (const v of searchResults.results) {
      const rel = relevanceLabel(v.clips)
      if (rel.label && rel.label in counts) counts[rel.label as RelevanceLevel]++
    }
    return counts
  }, [searchResults])

  /** For tabular view: always merge analysis from cache so categories/topics/people/riskLevel are up to date (from video analysis, not entity-indexed). */
  const videosForTable = useMemo(() => {
    return filteredVideos.map((v) => {
      const cached = cachedVideos.find((c) => c.id === v.id)
      const analysis = cached?.metadata?.video_analysis as { categories?: string[]; topics?: string[]; people?: string[]; riskLevel?: string } | undefined
      if (!analysis) return v
      const riskLevel = analysis.riskLevel
      const validRisk = riskLevel === 'high' || riskLevel === 'medium' || riskLevel === 'low' ? riskLevel : undefined
      return {
        ...v,
        categories: Array.isArray(analysis.categories) ? analysis.categories : v.categories,
        aboutTopics: Array.isArray(analysis.topics) ? analysis.topics : v.aboutTopics,
        people: Array.isArray(analysis.people) ? analysis.people : v.people,
        riskLevel: validRisk ?? v.riskLevel,
      }
    })
  }, [filteredVideos, cachedVideos])

  const totalVideoPages = useMemo(() => {
    const total = filteredVideos.length
    return Math.max(1, Math.ceil(total / VIDEOS_PAGE_SIZE))
  }, [filteredVideos.length])
  const paginatedVideos = useMemo(() => {
    const total = filteredVideos.length
    if (total === 0) return []
    const start = (videosPage - 1) * VIDEOS_PAGE_SIZE
    return filteredVideos.slice(start, start + VIDEOS_PAGE_SIZE)
  }, [filteredVideos, videosPage])

  const totalTabularPages = Math.max(1, Math.ceil(videosForTable.length / TABULAR_PAGE_SIZE))
  const paginatedTabularVideos = useMemo(() => {
    const start = (tabularPage - 1) * TABULAR_PAGE_SIZE
    return videosForTable.slice(start, start + TABULAR_PAGE_SIZE)
  }, [videosForTable, tabularPage])

  useEffect(() => {
    if (viewMode === 'tabular' && tabularPage > totalTabularPages) setTabularPage(1)
  }, [viewMode, tabularPage, totalTabularPages])

  useEffect(() => {
    if (viewMode === 'videos') setVideosPage(1)
  }, [viewMode, activeCategory, sortBy, searchResults, filteredVideos.length])

  async function handleSearch(overrideQuery?: string) {
    const query = (overrideQuery ?? searchQuery).trim()
    const entityIds = searchAttachments.filter((a) => a.type === 'entity').map((a) => a.id)
    const imageAttachment = searchAttachments.find((a) => a.type === 'image')
    const hasQuery = query.length > 0
    const hasEntities = entityIds.length > 0
    const hasImage = !!imageAttachment
    if (!hasQuery && !hasEntities && !hasImage) return
    setSearchError(null)
    setSearchLoading(true)
    setActiveRelevanceFilter(null)

    let imageBase64: string | null = null
    if (imageAttachment) {
      if (imageAttachment.file) {
        const buf = await imageAttachment.file.arrayBuffer()
        imageBase64 = btoa(
          new Uint8Array(buf).reduce((data, byte) => data + String.fromCharCode(byte), ''),
        )
      } else if (imageAttachment.previewUrl.startsWith('data:')) {
        const commaIndex = imageAttachment.previewUrl.indexOf(',')
        if (commaIndex !== -1) {
          imageBase64 = imageAttachment.previewUrl.slice(commaIndex + 1)
        }
      }
    }

    const body: Record<string, unknown> = {
      top_k: (hasEntities || hasImage) ? 6 : 10,
      clips_per_video: (hasEntities || hasImage) ? 5 : 12,
      // When searching with image/entity, do not request document results
      doc_top_k: (hasEntities || hasImage) ? 0 : 10,
    }
    if (hasQuery) body.query = query
    if (hasEntities) body.entity_ids = entityIds
    if (imageBase64) body.image_base64 = imageBase64

    try {
      const res = await fetch(`${API_BASE}/api/search/hybrid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setSearchError(data.error || 'Search failed')
        setSearchResults(null)
        return
      }

      const videoItems: VideoItem[] = (data.videoResults || []).map((r: any) => {
        const meta = r.metadata || {}
        const analysis = meta.video_analysis as { categories?: string[]; topics?: string[]; people?: string[]; riskLevel?: string } | undefined
        let uploadDate = ''
        try {
          const u = meta.uploaded_at || ''
          if (u) {
            const d = new Date(u)
            uploadDate = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${d.getFullYear()}`
          }
        } catch { uploadDate = meta.uploaded_at || '' }
        const dur = r.duration_seconds ?? meta.duration_seconds
        const riskLevel = analysis?.riskLevel
        const validRisk = riskLevel === 'high' || riskLevel === 'medium' || riskLevel === 'low' ? riskLevel : undefined
        const insights = meta.video_insights as { objects?: Array<{ object?: string }>; detected_faces?: Array<{ face_id?: number | string; face_path?: string }> } | undefined
        const rawObjs = Array.isArray(insights?.objects) ? insights.objects : []
        const detectedObjects = [...new Set(rawObjs.map((o) => (o && typeof o.object === 'string' ? o.object.trim() : '')).filter(Boolean))]
        const detectedFaces = Array.isArray(insights?.detected_faces) ? insights.detected_faces : []
        const entities: TableEntity[] = detectedFaces.map((f, i) => {
          let faceId: number
          if (typeof f.face_id === 'number' && Number.isInteger(f.face_id)) {
            faceId = f.face_id
          } else if (typeof f.face_id === 'string' && /^\d+$/.test(f.face_id)) {
            faceId = parseInt(f.face_id, 10)
          } else if (f.face_path && typeof f.face_path === 'string') {
            const m = f.face_path.match(/face_(\d+)\.png/)
            faceId = m ? parseInt(m[1], 10) : i
          } else {
            faceId = i
          }
          return {
            id: `face-${r.id}-${faceId}`,
            name: `Face ${faceId + 1}`,
            imageUrl: `${API_BASE}/api/videos/${r.id}/faces/${faceId}`,
            initials: `F${faceId + 1}`,
          }
        })
        return {
          id: r.id,
          title: meta.filename || r.id,
          uploadDate,
          duration: dur != null ? formatSecondsToTimestamp(dur) : '—',
          totalMinutes: dur != null ? Math.ceil(dur / 60) : 0,
          category: 'Uploaded',
          tags: [
            ...(Array.isArray(meta.tags) ? meta.tags : []),
            meta.status === 'ready' ? 'Indexed' : meta.status === 'indexing' ? 'Indexing' : meta.status === 'queued' ? 'Queued' : 'Uploaded',
          ],
          entities,
          streamUrl: r.stream_url || undefined,
          thumbnailUrl: r.thumbnail_url || undefined,
          thumbnailDataUrl: r.thumbnail_data_url || undefined,
          durationSeconds: dur ?? undefined,
          clips: Array.isArray(r.clips) ? r.clips : [],
          searchScore: r.score,
          categories: Array.isArray(analysis?.categories) ? analysis.categories : undefined,
          aboutTopics: Array.isArray(analysis?.topics) ? analysis.topics : undefined,
          people: Array.isArray(analysis?.people) ? analysis.people : undefined,
          riskLevel: validRisk,
          detectedObjects: detectedObjects.length > 0 ? detectedObjects : undefined,
        }
      })

      const displayQuery = data.query ?? (hasQuery ? query : (hasEntities ? `Entity: ${searchAttachments.filter((a) => a.type === 'entity').map((a) => a.name).join(', ')}` : query))
      setSearchResults({ query: displayQuery, results: videoItems })

      // Only show / persist document results when not using image/entity search
      if (!hasEntities && !hasImage && Array.isArray(data.documents) && data.documents.length > 0) {
        setDocResults(data.documents)
      }

      try {
        const persistedAttachments = searchAttachments.map((att) => {
          if (att.type === 'image') {
            let previewUrl = att.previewUrl
            if (imageBase64) {
              const mime = att.file?.type || 'image/jpeg'
              previewUrl = `data:${mime};base64,${imageBase64}`
            }
            return { id: att.id, type: att.type, name: att.name, previewUrl }
          }
          return { id: att.id, type: att.type, name: att.name, previewUrl: att.previewUrl }
        })
        const persistedDocs = (!hasEntities && !hasImage && Array.isArray(data.documents) && data.documents.length > 0)
          ? data.documents
          : docResults
        sessionStorage.setItem('vc_last_search', JSON.stringify({ query: displayQuery, results: videoItems, attachments: persistedAttachments, documents: persistedDocs }))
      } catch { /* ignore */ }
    } catch (e) {
      setSearchError('Search request failed')
      setSearchResults(null)
    } finally {
      setSearchLoading(false)
    }
  }

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('vc_last_search')
      if (raw) {
        const parsed = JSON.parse(raw) as { query: string; results: VideoItem[]; attachments?: SearchAttachment[]; documents?: DocResult[] }
        if (parsed?.query != null && Array.isArray(parsed.results)) {
          setSearchQuery(parsed.query)
          setSearchResults({ query: parsed.query, results: parsed.results })
          if (Array.isArray(parsed.attachments)) {
            const nonEntity = parsed.attachments.filter((a) => a.type !== 'entity')
            const entities = parsed.attachments.filter((a) => a.type === 'entity')
            const lastEntity = entities[entities.length - 1]
            setSearchAttachments(lastEntity ? [...nonEntity, lastEntity] : nonEntity)
          }
          if (Array.isArray(parsed.documents) && parsed.documents.length > 0) {
            setDocResults(parsed.documents)
          }
        }
      }
    } catch {
      // ignore
    }
  }, [])

  function clearSearch() {
    setSearchResults(null)
    setDocResults(null)
    setSearchError(null)
    setActiveRelevanceFilter(null)
    setSearchAttachments([])
    setSearchQuery('')
    try {
      sessionStorage.removeItem('vc_last_search')
    } catch {
      // ignore
    }
  }

  function selectEntity(entity: EntityOption) {
    setSearchAttachments((prev) => {
      const nonEntity = prev.filter((a) => a.type !== 'entity')
      const nextEntity: SearchAttachment = {
        id: entity.id,
        type: 'entity',
        name: entity.name,
        previewUrl: entity.previewUrl || '',
      }
      return [...nonEntity, nextEntity]
    })
    setSearchQuery((q) => {
      const lastAt = q.lastIndexOf('@')
      if (lastAt < 0) return q
      const before = q.slice(0, lastAt).trimEnd()
      return before ? `${before} ` : ''
    })
  }

  return (
    <div className="w-full min-w-0">
      <div className="search-bar-gradient-outer mb-4 shadow-sm w-full min-w-0">
        <div className="search-bar-gradient-border-wrap">
          <div className="search-bar-gradient-border" aria-hidden />
        </div>
        <div className="search-bar-gradient-inner w-full">
          <div className="px-3 sm:px-4 pt-4 pb-2 min-w-0 w-full">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              {searchAttachments.map((att) => (
                <span
                  key={att.id}
                  className="inline-flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-full border border-border bg-card text-sm text-text-secondary"
                >
                  <img
                    src={att.previewUrl}
                    alt={att.name}
                    className={`w-6 h-6 object-cover ${att.type === 'entity' ? 'rounded-full' : 'rounded'}`}
                  />
                  <span className="max-w-[120px] truncate text-xs font-medium">{att.name}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setSearchAttachments((prev) => prev.filter((a) => a.id !== att.id))
                    }
                    className="ml-0.5 p-0.5 rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label={`Remove ${att.name}`}
                  >
                    <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
                      <path d="M6.02 5.31L8.97 2.37l.71.7L6.73 6.02l2.93 2.93-.71.71L6.02 6.73 3.07 9.67l-.7-.7L5.31 6.02 2.35 3.05l.7-.7L6.02 5.31Z" />
                    </svg>
                  </button>
                </span>
              ))}
              <div ref={entityDropdownRef} className="relative flex-1 min-w-[100px] sm:min-w-[120px] overflow-visible">
                {!searchQuery && !searchAttachments.length && (
                  <div className="pointer-events-none absolute inset-0 flex items-center overflow-hidden">
                    <div
                      key={placeholderIdx}
                      className="text-base sm:text-lg text-text-tertiary whitespace-nowrap animate-placeholder-slide"
                    >
                      {SEARCH_PLACEHOLDERS[placeholderIdx]}
                    </div>
                  </div>
                )}
                <input
                  type="text"
                  placeholder={searchAttachments.length ? 'Add search terms...' : ''}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (entityDropdownVisible) {
                      if (e.key === 'Escape') {
                        setSearchQuery((q) => (q.lastIndexOf('@') >= 0 ? q.slice(0, q.lastIndexOf('@')) : q))
                        e.preventDefault()
                        return
                      }
                      if (e.key === 'Enter' && filteredEntities.length > 0) {
                        selectEntity(filteredEntities[0])
                        e.preventDefault()
                        return
                      }
                    }
                    if (e.key === 'Enter') { e.preventDefault(); handleSearch(); }
                  }}
                  className="relative w-full text-base sm:text-lg text-text-primary placeholder:text-text-tertiary bg-transparent focus:outline-none z-[1]"
                  aria-label="Search videos"
                  aria-autocomplete="list"
                  aria-expanded={entityDropdownVisible}
                  aria-controls="entity-mention-list"
                />
                {entityDropdownVisible && (
                  <ul
                    id="entity-mention-list"
                    role="listbox"
                    className="absolute left-0 right-0 top-full mt-1 z-[100] max-h-56 overflow-auto rounded-lg border border-border bg-surface shadow-lg py-1 min-w-[200px]"
                  >
                    {filteredEntities.length === 0 ? (
                      <li className="px-3 py-2 text-sm text-text-tertiary">No matching entities</li>
                    ) : (
                      filteredEntities.map((entity) => (
                        <li key={entity.id} role="option">
                          <button
                            type="button"
                            onClick={() => selectEntity(entity)}
                            className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm text-text-primary hover:bg-card transition-colors"
                          >
                            {entity.previewUrl ? (
                              <img src={entity.previewUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                            ) : (
                              <span className="w-8 h-8 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-xs font-medium shrink-0">
                                {entity.name.slice(0, 2).toUpperCase()}
                              </span>
                            )}
                            <span className="font-medium truncate">{entity.name}</span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
            </div>
          </div>
          <div className="px-3 sm:px-4 pb-3 space-y-2 w-full">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => setAddImageModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-surface text-sm text-text-secondary hover:bg-card transition-colors"
                >
                  <IconAddImage className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline">Add Image</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAddEntityModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-surface text-sm text-text-secondary hover:bg-card transition-colors"
                >
                  <IconEntity className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">Add Entity</span>
                  <span className="hidden sm:inline text-[10px] font-medium bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">BETA</span>
                </button>
                {!searchQuery && !searchAttachments.length && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setSuggestionsOpen((open) => !open)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-card/70 text-[11px] text-text-secondary hover:bg-card transition-colors focus:outline-none focus:ring-1 focus:ring-[var(--strand-ui-accent)]/40 focus:ring-offset-1"
                    >
                      <span className="uppercase tracking-wider font-semibold">Suggestions</span>
                      <svg
                        className={`w-3 h-3 transition-transform ${suggestionsOpen ? 'rotate-180' : ''}`}
                        viewBox="0 0 12 12"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        aria-hidden
                      >
                        <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    {suggestionsOpen && !searchLoading && (
                      <div className="absolute left-0 mt-1 z-[60] w-72 max-w-[calc(100vw-3rem)] rounded-xl border border-border bg-surface shadow-lg py-2">
                        <p className="px-3 pb-1 text-[11px] font-medium text-text-tertiary uppercase tracking-wider">
                          Try searching for
                        </p>
                        <ul className="max-h-56 overflow-auto">
                          {SUGGESTED_SEARCHES.map((suggested) => (
                            <li key={suggested}>
                              <button
                                type="button"
                                onClick={() => {
                                  setSearchQuery(suggested)
                                  setSuggestionsOpen(false)
                                  handleSearch(suggested)
                                }}
                                className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-card transition-colors"
                              >
                                {suggested}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                disabled={(!searchQuery.trim() && !searchAttachments.some((a) => a.type === 'entity') && !searchAttachments.some((a) => a.type === 'image')) || searchLoading}
                onClick={() => handleSearch()}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors shrink-0 ${
                  (searchQuery.trim() || searchAttachments.some((a) => a.type === 'entity') || searchAttachments.some((a) => a.type === 'image')) && !searchLoading
                    ? 'bg-brand-charcoal text-brand-white hover:bg-gray-600 cursor-pointer'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
                aria-label="Search"
              >
                {searchLoading ? (
                  <img src={spinnerIconUrl} alt="" className="w-5 h-5 animate-spin opacity-90" aria-hidden />
                ) : (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="7" />
                    <line x1="16.65" y1="16.65" x2="21" y2="21" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {searchLoading && (
        <div className="mb-4 rounded-xl border border-border bg-surface px-4 py-3 flex items-center gap-3 shadow-sm" role="status" aria-live="polite">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--strand-product-search-light)] text-[var(--strand-product-search-dark)]">
            <img src={spinnerIconUrl} alt="" className="w-5 h-5 animate-spin" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-medium text-text-primary">Searching across videos and documents…</p>
            <p className="text-xs text-text-secondary">This may take a few seconds.</p>
          </div>
        </div>
      )}

      {searchError && (
        <p className="mb-3 text-sm text-red-600" role="alert">
          {searchError}
        </p>
      )}
      {searchResults && (
        <div className="mb-3 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-text-secondary">
            {(() => {
              const vCount = searchResults.results.length
              const dCount = docResults?.length ?? 0
              if (vCount === 0 && dCount === 0) return `No results found for “${searchResults.query}”.`
              const parts: string[] = []
              if (vCount > 0) parts.push(`${vCount} video${vCount !== 1 ? 's' : ''}`)
              if (dCount > 0) parts.push(`${dCount} document${dCount !== 1 ? 's' : ''}`)
              return `${parts.join(' and ')} for “${searchResults.query}”`
            })()}
          </span>
          <button
            type="button"
            onClick={clearSearch}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-xl border border-border text-text-primary font-semibold text-sm hover:bg-card transition-colors focus:outline-none focus:ring-2 focus:ring-brand-charcoal/30 focus:ring-offset-1"
          >
            Clear search
          </button>
          </div>
          {relevanceCounts && searchResults.results.length > 0 && (
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Relevance filter">
              <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider mr-1">Relevance</span>
              {RELEVANCE_LEVELS.map(({ level, color, activeColor }) => {
                const count = relevanceCounts[level]
                if (count === 0) return null
                const isActive = activeRelevanceFilter === level
                return (
                  <button
                    key={level}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => {
                      setActiveRelevanceFilter((prev) => prev === level ? null : level)
                      setVideosPage(1)
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                      isActive ? activeColor : `bg-surface ${color} hover:bg-gray-50`
                    }`}
                  >
                    {level}
                    <span className={`inline-flex items-center justify-center min-w-[1.125rem] h-[1.125rem] rounded-full text-[10px] font-bold ${
                      isActive ? 'bg-white/60' : 'bg-black/5'
                    } px-1`}>
                      {count}
                    </span>
                  </button>
                )
              })}
              {activeRelevanceFilter && (
                <button
                  type="button"
                  onClick={() => { setActiveRelevanceFilter(null); setVideosPage(1) }}
                  className="text-xs text-text-tertiary hover:text-text-primary transition-colors ml-1 underline underline-offset-2"
                >
                  Clear filter
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-5" role="group" aria-label="Category filter">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setActiveCategory(cat)}
            aria-pressed={activeCategory === cat}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              activeCategory === cat
                ? 'bg-brand-charcoal text-brand-white border-brand-charcoal'
                : 'bg-surface text-text-secondary border-border hover:border-gray-400'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 min-w-0">
          <div className="flex items-center rounded-lg border border-border bg-surface p-0.5">
            <button
              type="button"
              onClick={() => { setViewMode('videos'); setVideosPage(1) }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'videos'
                  ? 'bg-brand-charcoal text-brand-white'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <IconGrid className="w-3.5 h-3.5" />
              Videos
            </button>
            <button
              type="button"
              onClick={() => { setViewMode('tabular'); setTabularPage(1) }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'tabular'
                  ? 'bg-brand-charcoal text-brand-white'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <IconList className="w-3.5 h-3.5" />
              Tabular
            </button>
          </div>

          <div className="flex items-center gap-x-3 flex-wrap">
            <div className="flex items-center gap-x-1">
              <svg className="h-5 w-5 text-gray-500 shrink-0" fill="none" viewBox="0 0 20 20" aria-hidden>
                <path fill="currentColor" fillRule="evenodd" clipRule="evenodd" d="M9.44 8.488v3.024L11.582 10zm-1.315-.594c0-.823.918-1.305 1.587-.833l2.983 2.106a1.022 1.022 0 0 1 0 1.666L9.712 12.94c-.669.472-1.587-.01-1.587-.833z" />
                <path fill="currentColor" fillRule="evenodd" clipRule="evenodd" d="M13 3.75H7A3.25 3.25 0 0 0 3.75 7v6A3.25 3.25 0 0 0 7 16.25h6A3.25 3.25 0 0 0 16.25 13V7A3.25 3.25 0 0 0 13 3.75M7 2.5A4.5 4.5 0 0 0 2.5 7v6A4.5 4.5 0 0 0 7 17.5h6a4.5 4.5 0 0 0 4.5-4.5V7A4.5 4.5 0 0 0 13 2.5z" />
              </svg>
              <p className="text-sm text-gray-600">{filteredVideos.length} videos</p>
            </div>
            <div className="flex items-center gap-x-1">
              <svg className="h-5 w-5 text-gray-500 shrink-0" fill="none" viewBox="0 0 16 16" aria-hidden>
                <path fill="currentColor" d="M12 1.5a.5.5 0 0 1 0 1h-.5v.838l-.007.193a2.36 2.36 0 0 1-.444 1.238L8.66 7.953l2.637 2.636c.343.343.537.81.537 1.296V13.5H12a.5.5 0 0 1 0 1H4a.5.5 0 0 1 0-1h.167v-1.615l.009-.18c.042-.42.227-.815.528-1.116L7.34 7.953 4.95 4.77a2.36 2.36 0 0 1-.444-1.238L4.5 3.338V2.5H4a.5.5 0 0 1 0-1zm-6.589 9.796a.84.84 0 0 0-.244.59V13.5h5.667v-1.614a.84.84 0 0 0-.244-.59L8 8.706zM5.5 2.5v.838l.005.122c.021.282.114.532.247.709L8 7.166l2.248-2.997c.152-.202.252-.5.252-.831V2.5z" />
              </svg>
              <p className="text-sm text-gray-600">{formatTotalDuration(filteredVideos, videoDurations)}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-text-secondary shrink-0">
          <span>Sort by</span>
          <button
            type="button"
            onClick={() => setSortBy(sortBy === 'recent' ? 'name' : 'recent')}
            className="inline-flex items-center gap-1 font-medium text-text-secondary hover:text-text-primary transition-colors"
          >
            {sortBy === 'recent' ? 'Recent upload' : 'Name'}
            <IconChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {groupedDocResults && groupedDocResults.length > 0 && (
        <div
          className="mb-8"
          id="dashboard-documents-section"
          ref={docsSectionRef}
        >
          <button
            type="button"
            onClick={() => setDocsExpanded((prev) => !prev)}
            className="flex items-center gap-2.5 mb-4 group"
          >
            <svg
              className={`w-4 h-4 text-text-tertiary transition-transform duration-200 ${docsExpanded ? 'rotate-90' : ''}`}
              viewBox="0 0 16 16" fill="currentColor"
            >
              <path d="M6 3.5L10.5 8 6 12.5V3.5Z" />
            </svg>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 shrink-0 rounded-lg bg-red-50 flex items-center justify-center">
                <svg
                  viewBox="0 0 12 12"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-4 h-4"
                  aria-hidden="true"
                >
                  <g fill="currentColor" fillRule="evenodd" clipRule="evenodd">
                    <path d="M7.09961 9C7.59667 9 8 9.40333 8 9.90039V11.0996C8 11.5967 7.59667 12 7.09961 12H0.900391C0.403334 12 0 11.5967 0 11.0996V9.90039C0 9.40333 0.403334 9 0.900391 9H7.09961Z" />
                    <path d="M11.0996 9C11.5967 9 12 9.40333 12 9.90039V11.0996C12 11.5967 11.5967 12 11.0996 12H9.90039C9.40333 12 9 11.5967 9 11.0996V9.90039C9 9.40333 9.40333 9 9.90039 9H11.0996ZM10 11H11V10H10V11Z" />
                    <path d="M4.09961 4.5C4.59667 4.5 5 4.90333 5 5.40039V6.59961C5 7.09667 4.59667 7.5 4.09961 7.5H0.900391C0.403334 7.5 0 7.09667 0 6.59961V5.40039C0 4.90333 0.403334 4.5 0.900391 4.5H4.09961ZM1 6.5H4V5.5H1V6.5Z" />
                    <path d="M11.0996 4.5C11.5967 4.5 12 4.90333 12 5.40039V6.59961C12 7.09667 11.5967 7.5 11.0996 7.5H6.90039C6.40333 7.5 6 7.09667 6 6.59961V5.40039C6 4.90333 6.40333 4.5 6.90039 4.5H11.0996Z" />
                    <path d="M7.09961 0C7.59667 0 8 0.403334 8 0.900391V2.09961C8 2.59667 7.59667 3 7.09961 3H0.900391C0.403334 3 0 2.59667 0 2.09961V0.900391C0 0.403334 0.403334 0 0.900391 0H7.09961Z" />
                    <path d="M11.0996 0C11.5967 0 12 0.403334 12 0.900391V2.09961C12 2.59667 11.5967 3 11.0996 3H9.90039C9.40333 3 9 2.59667 9 2.09961V0.900391C9 0.403334 9.40333 0 9.90039 0H11.0996ZM10 2H11V1H10V2Z" />
                  </g>
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors">
                Documents
              </h3>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-charcoal text-white">
                {groupedDocResults.length}
              </span>
            </div>
          </button>
          {docsExpanded && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {groupedDocResults.map((group) => (
                <GroupedDocResultCard key={group.key} group={group} />
              ))}
            </div>
          )}
        </div>
      )}

      {viewMode === 'videos' && (
        <>
          <div className="dashboard-video-grid">
            {onOpenUpload && (
              <button
                type="button"
                onClick={onOpenUpload}
                className="group flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card hover:border-gray-400 hover:bg-gray-200/80 transition-all duration-200 text-left focus:outline-none focus:ring-2 focus:ring-accent/30 focus:ring-offset-2 aspect-video min-w-0 py-4 px-3"
              >
                <span className="flex items-center justify-center w-11 h-11 text-text-tertiary group-hover:text-text-secondary transition-colors mb-3">
                  <img src={arrowBoxUpIconUrl} alt="" className="w-5 h-5" aria-hidden />
                </span>
                <p className="text-sm font-semibold text-text-primary">Drop videos or documents</p>
                <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                  <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium text-text-secondary border border-border">
                    Videos: MP4, MOV, AVI
                  </span>
                  <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium text-text-secondary border border-border">
                    Docs: PDF, DOCX, PPTX
                  </span>
                </div>
                <ul className="mt-2.5 text-[11px] sm:text-xs text-text-tertiary text-center leading-snug space-y-0.5 max-w-[220px] mx-auto list-none px-1">
                  <li className="flex items-center justify-center gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" aria-hidden />
                    Videos: indexing &amp; analysis
                  </li>
                  <li className="flex items-center justify-center gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" aria-hidden />
                    Documents: NeMo Retriever
                  </li>
                  <li className="flex items-center justify-center gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" aria-hidden />
                    Max file size: 100&nbsp;MB per video
                  </li>
                </ul>
              </button>
            )}
            {paginatedVideos.map((v) => (
                <Link
                  key={v.id}
                  to={`/video/${v.id}`}
                  state={v.clips && v.clips.length > 0 ? { searchClips: v.clips, searchScore: v.searchScore, searchQuery: searchResults?.query } : undefined}
                  onClick={() => {
                    if (v.clips && v.clips.length > 0 && searchResults?.query) {
                      try { sessionStorage.setItem(`vc_clips_${v.id}`, JSON.stringify({ clips: v.clips, score: v.searchScore, query: searchResults.query })) } catch {}
                    }
                  }}
                  className="group block focus:outline-none focus:ring-2 focus:ring-accent/30 rounded-xl min-w-0"
                >
                  <div className="relative aspect-video rounded-xl overflow-hidden bg-brand-charcoal">
                    {(v.thumbnailDataUrl || v.thumbnailUrl) ? (
                      <>
                        {v.thumbnailDataUrl && (
                          <img
                            src={v.thumbnailDataUrl}
                            alt=""
                            className="absolute inset-0 w-full h-full object-cover brightness-105"
                            aria-hidden
                          />
                        )}
                        {v.thumbnailUrl && (
                          <img
                            src={v.thumbnailUrl}
                            alt={v.title}
                            loading="lazy"
                            decoding="async"
                            className="absolute inset-0 w-full h-full object-cover brightness-105"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                          />
                        )}
                      </>
                    ) : v.streamUrl ? (
                      <video
                        src={v.streamUrl}
                        className="absolute inset-0 w-full h-full object-cover brightness-105"
                        muted
                        playsInline
                        preload="metadata"
                        aria-label={v.title}
                        data-video-id={v.id}
                        onLoadedMetadata={v.durationSeconds != null ? undefined : (e) => {
                          const el = e.currentTarget
                          const id = el.dataset.videoId
                          if (id && Number.isFinite(el.duration)) {
                            setVideoDurations((prev) => (prev[id] === el.duration ? prev : { ...prev, [id]: el.duration }))
                          }
                        }}
                      />
                    ) : null}
                    {(v.thumbnailDataUrl || v.thumbnailUrl) && v.durationSeconds == null && v.streamUrl ? (
                      <video
                        src={v.streamUrl}
                        className="absolute w-0 h-0 opacity-0 pointer-events-none"
                        preload="metadata"
                        data-video-id={v.id}
                        onLoadedMetadata={(e) => {
                          const el = e.currentTarget
                          const id = el.dataset.videoId
                          if (id && Number.isFinite(el.duration)) {
                            setVideoDurations((prev) => (prev[id] === el.duration ? prev : { ...prev, [id]: el.duration }))
                          }
                        }}
                      />
                    ) : null}
                    <div className="absolute inset-0 flex items-center justify-center bg-transparent group-hover:bg-brand-charcoal/40 z-[2] pointer-events-none transition-colors duration-200">
                      <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <IconPlay className="w-5 h-5 text-white ml-0.5" />
                      </div>
                    </div>
                    {(() => {
                      const rel = relevanceLabel(v.clips)
                      return rel.label ? (
                        <span className={`absolute top-2 left-2 z-[3] inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${rel.color}`}>
                          {rel.label}
                        </span>
                      ) : null
                    })()}
                    <span className="absolute left-1/2 -translate-x-1/2 bottom-1.5 px-3 py-1 text-sm font-mono font-medium text-white rounded border border-white/90 tabular-nums bg-black/50 [text-shadow:0_0_2px_rgba(0,0,0,0.9)]">
                      {videoDurations[v.id] != null ? formatSecondsToTimestamp(videoDurations[v.id]) : v.duration}
                    </span>
                  </div>
                  <p className="mt-2.5 text-sm text-text-secondary truncate group-hover:text-text-primary transition-colors">
                    {v.title}
                  </p>
                </Link>
              ))}
            </div>
          {filteredVideos.length > 0 && (
            <div className="flex items-center justify-between gap-4 mt-4">
              <p className="text-sm text-gray-500 tabular-nums">
                {(() => {
                  const total = filteredVideos.length
                  if (total === 0) return 'Showing 0 of 0'
                  const start = (videosPage - 1) * VIDEOS_PAGE_SIZE + 1
                  const end = Math.min(videosPage * VIDEOS_PAGE_SIZE, total)
                  return `Showing ${start}–${end} of ${total}`
                })()}
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setVideosPage((p) => Math.max(1, p - 1))}
                  disabled={videosPage <= 1}
                  className="inline-flex h-8 min-w-[2rem] items-center justify-center rounded-lg border border-border bg-surface px-2.5 text-sm font-medium text-text-primary shadow-sm transition-colors hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-50"
                  aria-label="Previous page"
                >
                  Previous
                </button>
                <span className="flex h-8 items-center px-2 text-sm text-gray-500">
                  Page {videosPage} of {totalVideoPages}
                </span>
                <button
                  type="button"
                  onClick={() => setVideosPage((p) => Math.min(totalVideoPages, p + 1))}
                  disabled={videosPage >= totalVideoPages}
                  className="inline-flex h-8 min-w-[2rem] items-center justify-center rounded-lg border border-border bg-surface px-2.5 text-sm font-medium text-text-primary shadow-sm transition-colors hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-50"
                  aria-label="Next page"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {viewMode === 'tabular' && (
        <>
          {videosForTable.length === 0 ? (
            <p className="text-center text-gray-500 py-16">No videos match your search.</p>
          ) : (
            <div className="rounded-xl border border-border bg-surface overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border bg-card">
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Task title
                    </th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Upload date
                    </th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Categories
                    </th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      About topic
                    </th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Risk level
                    </th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tag
                    </th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Entities
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedTabularVideos.map((v) => (
                    <tr key={v.id} className="hover:bg-card/80 transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          to={`/video/${v.id}`}
                          className="text-sm font-medium text-text-primary underline underline-offset-2 hover:text-accent"
                        >
                          {v.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 tabular-nums">
                        {v.uploadDate}
                      </td>
                      <td className="px-4 py-3">
                        <TagPills tags={v.categories ?? []} />
                      </td>
                      <td className="px-4 py-3">
                        <TagPills tags={v.aboutTopics ?? []} />
                      </td>
                      <td className="px-4 py-3">
                        <PriorityTag priority={(v.riskLevel ?? 'medium') as 'low' | 'medium' | 'high'} />
                      </td>
                      <td className="px-4 py-3">
                        <TagPills tags={(v.tags ?? [v.category]).filter((t) => t !== 'Indexed')} />
                      </td>
                      <td className="px-4 py-3">
                        <EntityAvatars entities={v.entities ?? []} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center justify-between gap-4 px-4 py-3 border-t border-border bg-card">
                <p className="text-sm text-gray-500 tabular-nums">
                  Showing {(tabularPage - 1) * TABULAR_PAGE_SIZE + 1}–{Math.min(tabularPage * TABULAR_PAGE_SIZE, videosForTable.length)} of {videosForTable.length}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setTabularPage((p) => Math.max(1, p - 1))}
                    disabled={tabularPage <= 1}
                    className="inline-flex h-8 min-w-[2rem] items-center justify-center rounded-lg border border-border bg-surface px-2.5 text-sm font-medium text-text-primary shadow-sm transition-colors hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-50"
                    aria-label="Previous page"
                  >
                    Previous
                  </button>
                  <span className="flex h-8 items-center px-2 text-sm text-gray-500">
                    Page {tabularPage} of {totalTabularPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setTabularPage((p) => Math.min(totalTabularPages, p + 1))}
                    disabled={tabularPage >= totalTabularPages}
                    className="inline-flex h-8 min-w-[2rem] items-center justify-center rounded-lg border border-border bg-surface px-2.5 text-sm font-medium text-text-primary shadow-sm transition-colors hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-50"
                    aria-label="Next page"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <AddImageModal
        open={addImageModalOpen}
        onClose={() => setAddImageModalOpen(false)}
        onImageAdded={(file) => {
          const url = URL.createObjectURL(file)
          setSearchAttachments((prev) => [
            ...prev.filter((a) => a.type !== 'image'),
            { id: `img-${Date.now()}`, type: 'image', name: file.name, previewUrl: url, file },
          ])
          setAddImageModalOpen(false)
        }}
      />
      <AddEntityModal
        open={addEntityModalOpen}
        onClose={() => setAddEntityModalOpen(false)}
        onEntityAdded={(selection) => {
          setSearchAttachments((prev) => {
            const nonEntity = prev.filter((a) => a.type !== 'entity')
            const id = selection.id ?? `ent-${Date.now()}`
            const name = selection.name?.trim() || selection.file?.name || 'Entity'
            const previewUrl = selection.previewUrl
            return [
              ...nonEntity,
              { id, type: 'entity', name, previewUrl },
            ]
          })
          setAddEntityModalOpen(false)
        }}
      />
    </div>
  )
}

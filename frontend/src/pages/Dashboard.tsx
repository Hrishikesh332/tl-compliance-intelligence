import { useState, useMemo, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import AddImageModal from '../components/AddImageModal'
import AddEntityModal, { type EntitySelection } from '../components/AddEntityModal'
import searchIconUrl from '../../strand/icons/search.svg?url'

type SearchAttachment = {
  id: string
  type: 'image' | 'entity'
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

function IconFolder({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 10" fill="currentColor">
      <path fillRule="evenodd" clipRule="evenodd" d="M11 8.66667V2.58333C11 2.39924 10.8508 2.25 10.6667 2.25H6.41756C5.9418 2.25 5.47741 2.10457 5.08664 1.8332L3.97257 1.05954C3.91675 1.02078 3.85041 1 3.78244 1H1.33333C1.14924 1 1 1.14924 1 1.33333V8.66667C1 8.85076 1.14924 9 1.33333 9H10.6667C10.8508 9 11 8.85076 11 8.66667ZM12 8.66667V2.58333C12 1.84695 11.403 1.25 10.6667 1.25H6.41756C6.1457 1.25 5.88033 1.1669 5.65703 1.01183L4.54297 0.238173C4.31967 0.0831044 4.0543 0 3.78244 0H1.33333C0.596955 0 0 0.596954 0 1.33333V8.66667C0 9.40305 0.596954 10 1.33333 10H10.6667C11.403 10 12 9.40305 12 8.66667Z" />
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

function EntityAvatars({ entities }: { entities: TableEntity[] }) {
  if (!entities?.length) return <span className="text-sm text-gray-400">—</span>
  const maxCircles = 4
  const show = entities.slice(0, maxCircles)
  const rest = entities.length - show.length
  return (
    <div className="flex items-center gap-0.5">
      <div className="flex items-center -space-x-2.5">
        {show.map((e) => (
          <div
            key={e.id}
            className="relative w-7 h-7 rounded-full border-2 border-surface overflow-hidden bg-card shrink-0 flex items-center justify-center ring-1 ring-white"
            title={e.name}
          >
            {e.imageUrl ? (
              <img src={e.imageUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-[10px] font-medium text-gray-600">{e.initials}</span>
            )}
          </div>
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

/* ------------------------------------------------------------------ */
/*  Dummy data                                                         */
/* ------------------------------------------------------------------ */

const CATEGORIES = ['All', 'BodyCam', 'DashCam', 'CCTV', 'Insurance Claim'] as const

type TableEntity = { id: string; name: string; imageUrl?: string; initials: string }

type VideoItem = {
  id: string
  title: string
  uploadDate: string
  duration: string
  totalMinutes: number
  category: string
  tags?: string[]
  entities?: TableEntity[]
}

const SAMPLE_VIDEOS: VideoItem[] = [
  { id: 'abc123', title: 'Officer_patrol_downtown.mp4', uploadDate: '03-15-2024', duration: '00:02:19', totalMinutes: 2, category: 'BodyCam', tags: ['BodyCam', 'Patrol', 'Unit 7'], entities: [{ id: 'e1', name: 'Karen Nelson', imageUrl: 'https://picsum.photos/128/128?random=1', initials: 'KN' }, { id: 'e2', name: 'Esther Howard', imageUrl: 'https://picsum.photos/128/128?random=2', initials: 'EH' }, { id: 'e3', name: 'Robert Fox', initials: 'RF' }] },
  { id: 'def456', title: 'Highway_pursuit_I95.mp4', uploadDate: '03-12-2024', duration: '00:01:52', totalMinutes: 1, category: 'DashCam', tags: ['DashCam', 'Highway'], entities: [{ id: 'e2', name: 'Esther Howard', imageUrl: 'https://picsum.photos/128/128?random=2', initials: 'EH' }] },
  { id: 'ghi789', title: 'Warehouse_east_entrance.mp4', uploadDate: '03-08-2024', duration: '00:17:06', totalMinutes: 17, category: 'CCTV', tags: ['CCTV', 'Warehouse', 'East Wing'], entities: [{ id: 'e1', name: 'Karen Nelson', imageUrl: 'https://picsum.photos/128/128?random=1', initials: 'KN' }, { id: 'e4', name: 'Jane Cooper', imageUrl: 'https://picsum.photos/128/128?random=4', initials: 'JC' }] },
  { id: 'jkl012', title: 'Vehicle_collision_claim_4821.mp4', uploadDate: '03-05-2024', duration: '00:04:11', totalMinutes: 4, category: 'Insurance Claim', tags: ['Insurance Claim', 'Collision'], entities: [] },
  { id: 'mno345', title: 'Night_shift_lobby_cam.mp4', uploadDate: '03-01-2024', duration: '00:09:07', totalMinutes: 9, category: 'CCTV', tags: ['CCTV', 'Lobby', 'Night Shift'], entities: [{ id: 'e5', name: 'Jacob Jones', initials: 'JJ' }, { id: 'e6', name: 'Michelle Henderson', initials: 'MH' }, { id: 'e7', name: 'Daniel Smith', initials: 'DS' }] },
  { id: 'pqr678', title: 'Kitchen_incident_report.mp4', uploadDate: '02-28-2024', duration: '00:06:41', totalMinutes: 6, category: 'Insurance Claim', tags: ['Insurance Claim', 'Incident', 'Kitchen'], entities: [{ id: 'e1', name: 'Karen Nelson', imageUrl: 'https://picsum.photos/128/128?random=1', initials: 'KN' }] },
  { id: 'stu901', title: 'Traffic_stop_dash_032.mp4', uploadDate: '02-25-2024', duration: '00:03:55', totalMinutes: 3, category: 'DashCam', tags: ['DashCam', 'Traffic Stop'], entities: [{ id: 'e3', name: 'Robert Fox', imageUrl: 'https://picsum.photos/128/128?random=3', initials: 'RF' }, { id: 'e8', name: 'Sarah Williams', initials: 'SW' }] },
  { id: 'vwx234', title: 'Foot_chase_bodycam_unit7.mp4', uploadDate: '02-20-2024', duration: '00:08:22', totalMinutes: 8, category: 'BodyCam', tags: ['BodyCam', 'Foot Chase', 'Unit 7'], entities: [{ id: 'e6', name: 'Michelle Henderson', imageUrl: 'https://picsum.photos/128/128?random=6', initials: 'MH' }] },
]

type FolderItem = {
  name: string
  category: string
  videoIds: string[]
}

const SAMPLE_FOLDERS: FolderItem[] = [
  { name: 'BodyCam — Unit 7 Patrols', category: 'BodyCam', videoIds: ['abc123', 'vwx234'] },
  { name: 'DashCam — Highway Division', category: 'DashCam', videoIds: ['def456', 'stu901'] },
  { name: 'CCTV — Building East Wing', category: 'CCTV', videoIds: ['ghi789', 'mno345'] },
  { name: 'Insurance Claims — Q1 2026', category: 'Insurance Claim', videoIds: ['jkl012', 'pqr678'] },
]

const TOTAL_CAPACITY = 100
const TOTAL_HOURS = 10

function formatTotalDuration(videos: VideoItem[]) {
  const total = videos.reduce((sum, v) => sum + v.totalMinutes, 0)
  return `${total} min`
}

/** Format as mm:ss for thumbnail badge (hours omitted). */
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

/* ------------------------------------------------------------------ */
/*  Advanced Parameters Dropdown                                       */
/* ------------------------------------------------------------------ */

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
            {/* Visual */}
            <button type="button" onClick={() => toggle('visual')} className="flex items-center gap-2.5 w-full text-left group">
              <IconCheckbox checked={options.visual} className="w-5 h-5 text-brand-charcoal" />
              <span className="text-sm font-medium text-text-secondary group-hover:text-text-primary">Visual</span>
            </button>

            {/* Audio */}
            <button type="button" onClick={() => toggle('audio')} className="flex items-center gap-2.5 w-full text-left group">
              <IconCheckbox checked={options.audio} className="w-5 h-5 text-brand-charcoal" />
              <span className="text-sm font-medium text-text-secondary group-hover:text-text-primary">Audio</span>
            </button>

            {/* Transcription */}
            <div>
              <button type="button" onClick={() => toggle('transcription')} className="flex items-center gap-2.5 w-full text-left group">
                <IconCheckbox checked={options.transcription} className="w-5 h-5 text-brand-charcoal" />
                <span className="text-sm font-medium text-text-secondary group-hover:text-text-primary">Transcription</span>
              </button>
              {/* Sub-options */}
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

/* ------------------------------------------------------------------ */
/*  Dashboard                                                          */
/* ------------------------------------------------------------------ */

export default function Dashboard() {
  const [addImageModalOpen, setAddImageModalOpen] = useState(false)
  const [addEntityModalOpen, setAddEntityModalOpen] = useState(false)
  const [searchAttachments, setSearchAttachments] = useState<SearchAttachment[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'recent' | 'name'>('recent')
  const [activeCategory, setActiveCategory] = useState<string>('All')
  const [viewMode, setViewMode] = useState<'videos' | 'folders' | 'tabular'>('videos')
  const [openFolderIdx, setOpenFolderIdx] = useState<number | null>(null)
  const [searchOptions, setSearchOptions] = useState<SearchOptions>({
    visual: true,
    audio: true,
    transcription: true,
    lexical: true,
    semantic: true,
  })

  const filteredVideos = useMemo(() => {
    let list = SAMPLE_VIDEOS
    if (activeCategory !== 'All') {
      list = list.filter((v) => v.category === activeCategory)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (v) =>
          v.title.toLowerCase().includes(q) ||
          v.id.toLowerCase().includes(q)
      )
    }
    if (sortBy === 'name') {
      list = [...list].sort((a, b) => a.title.localeCompare(b.title))
    }
    return list
  }, [searchQuery, sortBy, activeCategory])

  const filteredFolders = useMemo(() => {
    let list = SAMPLE_FOLDERS
    if (activeCategory !== 'All') {
      list = list.filter((f) => f.category === activeCategory)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter((f) => f.name.toLowerCase().includes(q))
    }
    return list
  }, [searchQuery, activeCategory])

  function handleSearch() {
    const query = searchQuery.trim()
    if (!query) return
    // TODO: Replace with backend API call when ready, e.g.:
    // await searchVideos({ query, attachments: searchAttachments, options: searchOptions })
    // For now, results are filtered client-side via filteredVideos / filteredFolders above.
  }

  return (
    <div className="w-full min-w-0">
      {/* Search bar — vibrant gradient border, curved corners, rotating effect */}
      <div className="search-bar-gradient-outer mb-4 shadow-sm w-full min-w-0">
        <div className="search-bar-gradient-border-wrap">
          <div className="search-bar-gradient-border" aria-hidden />
        </div>
        <div className="search-bar-gradient-inner w-full">
          <div className="px-3 sm:px-4 pt-4 pb-2 min-w-0 w-full">
            {/* Attachment chips + input on one line */}
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
              <input
                type="text"
                placeholder={searchAttachments.length ? 'Add search terms...' : "Search entities with '@+name'"}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 min-w-[100px] sm:min-w-[120px] text-base sm:text-lg text-text-primary placeholder:text-text-tertiary bg-transparent focus:outline-none"
                aria-label="Search videos"
              />
            </div>
          </div>
          <div className="px-3 sm:px-4 pb-4 flex flex-wrap items-center justify-between gap-2 w-full">
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
              <AdvancedParamsDropdown
                options={searchOptions}
                onChange={setSearchOptions}
                onApply={() => {}}
              />
            </div>
            <button
              type="button"
              disabled={!searchQuery.trim()}
              onClick={handleSearch}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors shrink-0 ${
                searchQuery.trim()
                  ? 'bg-brand-charcoal text-brand-white hover:bg-gray-600 cursor-pointer'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
              aria-label="Search"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <line x1="16.65" y1="16.65" x2="21" y2="21" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Category pills */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => { setActiveCategory(cat); setOpenFolderIdx(null) }}
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

      {/* Tab switch + stats bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 min-w-0">
          {/* Tab buttons */}
          <div className="flex items-center rounded-lg border border-border bg-surface p-0.5">
            <button
              type="button"
              onClick={() => { setViewMode('videos'); setOpenFolderIdx(null) }}
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
              onClick={() => { setViewMode('folders'); setOpenFolderIdx(null) }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'folders'
                  ? 'bg-brand-charcoal text-brand-white'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <IconFolder className="w-3.5 h-3.5" />
              Folders
            </button>
            <button
              type="button"
              onClick={() => { setViewMode('tabular'); setOpenFolderIdx(null) }}
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

          {/* Stats */}
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
              <p className="text-sm text-gray-600">{formatTotalDuration(filteredVideos)}</p>
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

      {/* ─── Videos view ─── */}
      {viewMode === 'videos' && (
        <>
          {filteredVideos.length === 0 ? (
            <p className="text-center text-gray-500 py-16">No videos match your search.</p>
          ) : (
            <div className="dashboard-video-grid">
              {filteredVideos.map((v) => (
                <Link
                  key={v.id}
                  to={`/${v.id}`}
                  className="group block focus:outline-none focus:ring-2 focus:ring-accent/30 rounded-xl min-w-0"
                >
                  <div className="relative aspect-video rounded-xl overflow-hidden bg-brand-charcoal">
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <IconPlay className="w-5 h-5 text-white ml-0.5" />
                        </div>
                    </div>
                    {/* Timestamp badge — no bg, white text + border */}
                    <span className="absolute left-1/2 -translate-x-1/2 bottom-1.5 px-3 py-1 text-sm font-mono text-white rounded border border-white tabular-nums bg-transparent">
                      {formatDurationHHMMSS(v.duration)}
                    </span>
                  </div>
                  <p className="mt-2.5 text-sm text-text-secondary truncate group-hover:text-text-primary transition-colors">
                    {v.title}
                  </p>
                  <p className="mt-0.5 text-sm text-text-tertiary tabular-nums">
                    {formatDurationShort(v.duration)}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {/* ─── Tabular view (same table as Assets page) ─── */}
      {viewMode === 'tabular' && (
        <>
          {filteredVideos.length === 0 ? (
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
                  {filteredVideos.map((v) => (
                    <tr key={v.id} className="hover:bg-card/80 transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          to={`/${v.id}`}
                          className="text-sm font-medium text-text-primary underline underline-offset-2 hover:text-accent"
                        >
                          {v.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 tabular-nums">
                        {v.uploadDate}
                      </td>
                      <td className="px-4 py-3">
                        <PriorityTag priority="low" />
                      </td>
                      <td className="px-4 py-3">
                        <TagPills tags={v.tags ?? [v.category]} />
                      </td>
                      <td className="px-4 py-3">
                        <EntityAvatars entities={v.entities ?? []} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ─── Folders view ─── */}
      {viewMode === 'folders' && (
        <>
          {openFolderIdx === null ? (
            /* Folder grid */
            filteredFolders.length === 0 ? (
              <p className="text-center text-gray-500 py-16">No folders match your search.</p>
            ) : (
              <div className="dashboard-video-grid">
                {filteredFolders.map((folder, idx) => {
                  const folderVideos = SAMPLE_VIDEOS.filter((v) => folder.videoIds.includes(v.id))
                  return (
                    <button
                      key={folder.name}
                      type="button"
                      onClick={() => setOpenFolderIdx(idx)}
                      className="group text-left rounded-xl border border-border bg-surface shadow-sm hover:border-border-light hover:shadow-md transition-all duration-200 overflow-hidden focus:outline-none focus:ring-2 focus:ring-accent/30 min-w-0"
                    >
                      {/* Folder thumbnail — mini grid preview */}
                      <div className="aspect-video bg-card p-3 flex items-center justify-center">
                        <div className="grid grid-cols-2 gap-1.5 w-full h-full">
                          {folderVideos.slice(0, 4).map((v) => (
                            <div key={v.id} className="rounded-md bg-brand-charcoal flex items-center justify-center">
                              <IconPlay className="w-3.5 h-3.5 text-white/40" />
                            </div>
                          ))}
                          {folderVideos.length < 4 &&
                            Array.from({ length: 4 - folderVideos.length }).map((_, i) => (
                              <div key={`empty-${i}`} className="rounded-md bg-gray-100" />
                            ))}
                        </div>
                      </div>
                      <div className="p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <IconFolder className="w-4 h-4 text-gray-400" />
                          <p className="text-sm font-medium text-text-primary truncate group-hover:text-accent transition-colors">
                            {folder.name}
                          </p>
                        </div>
                        <p className="text-xs text-gray-500">{folderVideos.length} video{folderVideos.length !== 1 ? 's' : ''}, {folder.category}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )
          ) : (
            /* Inside a folder — show videos */
            <div>
              <button
                type="button"
                onClick={() => setOpenFolderIdx(null)}
                className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors"
              >
                <svg className="w-4 h-4 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                Back to folders
              </button>
              <div className="flex items-center gap-2 mb-4">
                <IconFolder className="w-5 h-5 text-gray-500" />
                <h3 className="text-lg font-semibold text-text-primary">{filteredFolders[openFolderIdx].name}</h3>
                <span className="text-sm text-gray-400">
                  {filteredFolders[openFolderIdx].videoIds.length} video{filteredFolders[openFolderIdx].videoIds.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="dashboard-video-grid">
                {SAMPLE_VIDEOS.filter((v) =>
                  filteredFolders[openFolderIdx].videoIds.includes(v.id)
                ).map((v) => (
                  <Link
                    key={v.id}
                    to={`/${v.id}`}
                    className="group block focus:outline-none focus:ring-2 focus:ring-accent/30 rounded-xl min-w-0"
                  >
                    <div className="relative aspect-video rounded-xl overflow-hidden bg-brand-charcoal">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <IconPlay className="w-5 h-5 text-white ml-0.5" />
                        </div>
                      </div>
                      <span className="absolute left-1/2 -translate-x-1/2 bottom-1.5 px-3 py-1 text-sm font-mono text-white rounded border border-white tabular-nums bg-transparent">
                        {formatDurationHHMMSS(v.duration)}
                      </span>
                    </div>
                    <p className="mt-2.5 text-sm text-text-secondary truncate group-hover:text-text-primary transition-colors">
                      {v.title}
                    </p>
                    <p className="mt-0.5 text-sm text-text-tertiary tabular-nums">
                      {formatDurationShort(v.duration)}
                    </p>
                  </Link>
                ))}
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
            ...prev,
            { id: `img-${Date.now()}`, type: 'image', name: file.name, previewUrl: url },
          ])
          setAddImageModalOpen(false)
        }}
      />
      <AddEntityModal
        open={addEntityModalOpen}
        onClose={() => setAddEntityModalOpen(false)}
        onEntityAdded={(selection) => {
          setSearchAttachments((prev) => [
            ...prev,
            { id: `ent-${Date.now()}`, type: 'entity', name: selection.name?.trim() || selection.file.name, previewUrl: selection.previewUrl },
          ])
          setAddEntityModalOpen(false)
        }}
      />
    </div>
  )
}

import { useState, useRef, useEffect, useLayoutEffect, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'

import { API_BASE } from '../config'

function IconChevronDown({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  )
}

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

const SUGGESTIONS_ALL: string[] = [
  'Which videos have the highest risk?',
  'Summarize compliance issues across my library',
  'Find blocked or obstructed emergency exits',
  'List detected people across my videos',
]

const SUGGESTIONS_SINGLE_VIDEO: string[] = [
  'Does this video show any policy violations?',
  'Are there any safety or compliance risks visible?',
  'Identify suspicious or non-compliant behavior in this footage.',
  'Are proper safety protocols being followed?',
]

type AssetOption = { id: string; title: string; streamUrl?: string }

const SELECT_ASSETS_OPTION: AssetOption = { id: '', title: 'Select Assets' }

function displayName(title: string, id: string) {
  return id ? title.replace(/\.[^.]+$/, '') : title
}

function AssetThumbnail({ size = 'sm', streamUrl }: { size?: 'sm' | 'md'; streamUrl?: string }) {
  const dim = size === 'sm' ? 'w-5 h-5' : 'w-6 h-6'
  const baseClass = `${dim} shrink-0 rounded overflow-hidden bg-gray-200 object-cover`
  if (streamUrl) {
    return (
      <video
        src={streamUrl}
        muted
        playsInline
        preload="metadata"
        className={baseClass}
        aria-hidden
      />
    )
  }
  return <div className={`${dim} shrink-0 rounded bg-gray-200`} aria-hidden />
}

function AssetsDropdown({
  options,
  value,
  onChange,
}: {
  options: AssetOption[]
  value: string
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [dropdownStyle, setDropdownStyle] = useState<{ left: number; bottom: number } | null>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const selected = options.find((o) => o.id === value) ?? options[0]

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const gap = 4
    setDropdownStyle({
      left: rect.left,
      bottom: window.innerHeight - rect.top + gap,
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleScrollOrResize() {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect()
        const gap = 4
        setDropdownStyle({
          left: rect.left,
          bottom: window.innerHeight - rect.top + gap,
        })
      }
    }
    window.addEventListener('scroll', handleScrollOrResize, true)
    window.addEventListener('resize', handleScrollOrResize)
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true)
      window.removeEventListener('resize', handleScrollOrResize)
    }
  }, [open])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (
        open &&
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const dropdownList = open && dropdownStyle && (
    <div
      ref={dropdownRef}
      className="min-w-[200px] max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg z-[100]"
      style={{
        position: 'fixed',
        left: dropdownStyle.left,
        bottom: dropdownStyle.bottom,
      }}
    >
      <ul role="listbox">
        {options.map((opt) => (
          <li key={opt.id || 'all'} role="option" aria-selected={value === opt.id}>
          <button
            type="button"
            onClick={() => {
              onChange(opt.id)
              setOpen(false)
            }}
            className={`flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs transition-colors ${
              value === opt.id ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {opt.id ? (
              <>
                <AssetThumbnail size="sm" streamUrl={opt.streamUrl} />
                <span className="truncate">{displayName(opt.title, opt.id)}</span>
              </>
            ) : (
              <span className="truncate">{opt.title}</span>
            )}
          </button>
        </li>
        ))}
      </ul>
    </div>
  )

  return (
    <div ref={triggerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 min-w-0 h-8 rounded-md border border-gray-200 bg-gray-50 pl-2 pr-1.5 text-xs text-gray-600 hover:bg-gray-100 focus:border-gray-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-gray-300"
        aria-label="Select asset"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {selected.id ? (
          <>
            <AssetThumbnail size="sm" streamUrl={selected.streamUrl} />
            <span className="truncate text-left max-w-[80px]">{displayName(selected.title, selected.id)}</span>
          </>
        ) : (
          <span className="truncate text-left whitespace-nowrap">{selected.title}</span>
        )}
        <IconChevronDown className={`w-3 h-3 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {dropdownList && createPortal(dropdownList, document.body)}
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-1 py-0.5">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-chatbot-dot1" />
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-chatbot-dot2" />
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-chatbot-dot3" />
    </div>
  )
}

function IconSend({ className = 'size-[18px]' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 16 17" className={className}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M4.725 5.704c.366-.811 1.517-.811 1.883 0l.78 1.725q.005.01.016.017l1.726.779c.81.366.81 1.517 0 1.883l-1.726.78a.03.03 0 0 0-.016.016l-.78 1.726c-.366.81-1.517.81-1.883 0l-.78-1.726a.03.03 0 0 0-.016-.016l-1.725-.78c-.811-.366-.811-1.517 0-1.883l1.725-.78a.03.03 0 0 0 .017-.016zm.918.4-.007.011-.779 1.726c-.104.229-.287.413-.516.516l-1.726.78-.011.006-.004.004a.04.04 0 0 0-.004.02q0 .014.004.02l.004.003.011.007 1.726.78c.229.103.412.286.516.516l.78 1.725q.004.01.006.012l.004.003q.005.004.02.005.014-.001.02-.005l.003-.003.007-.012.78-1.725c.103-.23.286-.413.516-.517l1.725-.779.012-.007.003-.004a.04.04 0 0 0 .005-.02.04.04 0 0 0-.005-.019l-.003-.004-.012-.007-1.725-.779a1.03 1.03 0 0 1-.517-.516l-.779-1.726-.007-.011-.004-.004a.04.04 0 0 0-.02-.004.04.04 0 0 0-.019.004zM10.636 2.832a.767.767 0 0 1 1.397 0l.509 1.127 1.127.51a.767.767 0 0 1 0 1.397l-1.127.508-.509 1.127a.767.767 0 0 1-1.397 0l-.51-1.127L9 5.866a.767.767 0 0 1 0-1.398l1.127-.509zm.698.883-.332.736a.77.77 0 0 1-.383.383l-.737.333.737.332c.17.077.306.213.383.383l.332.737.333-.737a.77.77 0 0 1 .383-.383l.736-.332-.736-.333a.77.77 0 0 1-.383-.383zM10.635 10.832a.767.767 0 0 1 1.397 0l.302.668.667.301a.767.767 0 0 1 0 1.398l-.667.301-.302.668a.767.767 0 0 1-1.397 0l-.301-.668-.668-.301a.767.767 0 0 1 0-1.398l.668-.301zm.699.883-.125.277a.77.77 0 0 1-.384.383l-.277.125.277.125c.17.077.307.213.384.383l.125.277.125-.277a.77.77 0 0 1 .383-.383l.277-.125-.277-.125a.77.77 0 0 1-.383-.383z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function TwelveLabsLogoMark({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 50.27 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="10.83" y="12.36" width="15.89" height="2.14" rx="0.63" fill="currentColor" />
      <rect x="0.00" y="12.36" width="8.71" height="2.14" rx="0.63" fill="currentColor" />
      <rect x="30.67" y="12.36" width="9.94" height="2.14" rx="0.63" fill="currentColor" />
      <rect x="32.10" y="9.28" width="8.52" height="2.15" rx="0.63" fill="currentColor" />
      <rect x="41.74" y="9.28" width="6.76" height="2.15" rx="0.63" fill="currentColor" />
      <rect x="38.86" y="6.14" width="7.70" height="2.15" rx="0.63" fill="currentColor" />
      <rect x="41.30" y="3.07" width="2.26" height="2.15" rx="0.63" fill="currentColor" />
      <rect x="18.36" y="27.71" width="3.92" height="2.15" rx="0.63" fill="currentColor" />
      <rect x="25.16" y="27.71" width="2.56" height="2.15" rx="0.63" fill="currentColor" />
      <rect x="28.91" y="27.71" width="6.92" height="2.15" rx="0.63" fill="currentColor" />
      <rect x="32.38" y="24.64" width="2.87" height="2.14" rx="0.63" fill="currentColor" />
      <rect x="12.96" y="27.71" width="2.26" height="2.15" rx="0.63" fill="currentColor" />
      <rect x="23.41" y="30.78" width="2.26" height="2.15" rx="0.63" fill="currentColor" />
      <rect x="21.19" y="33.86" width="2.16" height="2.14" rx="0.63" fill="currentColor" />
      <rect x="29.75" y="0.00" width="2.81" height="2.15" rx="0.63" fill="currentColor" />
      <rect x="13.79" y="9.28" width="7.18" height="2.15" rx="0.63" fill="currentColor" />
      <rect x="27.10" y="3.07" width="4.36" height="2.15" rx="0.63" fill="currentColor" />
      <rect x="24.42" y="6.14" width="7.03" height="2.15" rx="0.63" fill="currentColor" />
      <rect x="46.30" y="12.36" width="4.11" height="2.14" rx="0.63" fill="currentColor" />
      <rect x="7.56" y="15.43" width="20.28" height="2.15" rx="0.63" fill="currentColor" />
      <rect x="25.97" y="21.57" width="7.92" height="2.15" rx="0.63" fill="currentColor" />
      <rect x="10.83" y="18.50" width="25.76" height="2.15" rx="0.63" fill="currentColor" />
      <rect x="6.89" y="21.57" width="9.58" height="2.15" rx="0.63" fill="currentColor" />
      <rect x="15.64" y="24.64" width="3.14" height="2.14" rx="0.63" fill="currentColor" />
      <rect x="26.72" y="24.64" width="3.38" height="2.14" rx="0.63" fill="currentColor" />
      <rect x="9.84" y="24.64" width="3.18" height="2.14" rx="0.63" fill="currentColor" />
      <rect x="30.67" y="15.43" width="8.19" height="2.15" rx="0.63" fill="currentColor" />
      <rect x="32.57" y="6.12" width="2.26" height="2.15" rx="0.63" fill="currentColor" />
    </svg>
  )
}

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const MOCK_RESPONSES: Record<string, string> = {
  'Summarize all flagged compliance issues':
    `Based on the analyzed videos, here are the key compliance issues:\n\n**High Severity**\n- Blocked emergency exit detected at 2:14 in *Office walkthrough — Building A, Floor 3*\n- Expired fire extinguisher in Bay C — requires immediate replacement\n\n**Medium Severity**\n- Missing signage near stairwell in Building A\n- Inadequate lighting in Warehouse east entrance footage\n\n**Low Severity**\n- Cable routing across walkway (trip hazard)\n- Minor obstruction near break room corridor\n\nTotal: **6 issues** across **3 videos**, with **2 high-priority items** requiring immediate attention.`,
  'Which videos have the highest risk?':
    `The following videos have been flagged as **high risk**:\n\n1. **Officer_patrol_downtown.mp4** — BodyCam footage showing a confrontation escalation. Multiple policy review points identified.\n2. **Vehicle_collision_claim_4821.mp4** — Insurance claim with inconsistencies between the video evidence and the filed report.\n3. **Warehouse_east_entrance.mp4** — CCTV recording showing unauthorized access at 03:42 AM.\n\nI recommend reviewing these in order of priority. Would you like me to provide a detailed breakdown of any specific video?`,
  'Show me blocked emergency exits':
    `I found **1 instance** of a blocked emergency exit across all indexed videos:\n\n**Video:** Office walkthrough — Building A, Floor 3\n**Timestamp:** 2:14\n**Description:** Boxes stacked against the south corridor emergency exit. The inspector noted this needs to be cleared immediately.\n\n**Risk Level:** High\n**Compliance Standard:** OSHA 29 CFR 1910.37(a)(3) — Exit routes must be free of obstructions.\n\nWould you like me to generate a compliance report for this finding?`,
  'List all detected people across videos':
    `Here are all detected individuals across the indexed video library:\n\n| Person | Appearances | Primary Video |\n|---|---|---|\n| Karen Nelson | 47.6% | Office walkthrough |\n| Esther Howard | 22.3% | Office walkthrough |\n| Robert Fox | 14.8% | Office walkthrough |\n| Jane Cooper | 8.1% | Office walkthrough |\n\n**4 unique individuals** identified across **8 indexed videos**. Face recognition confidence is above 92% for all matches.\n\nNote: 3 videos contain unidentified individuals that haven't been added to the entity database yet.`,
  'Summarize compliance issues across my library':
    `Based on the analyzed videos, here are the key compliance issues:\n\n**High Severity**\n- Blocked emergency exit detected at 2:14 in *Office walkthrough — Building A, Floor 3*\n- Expired fire extinguisher in Bay C — requires immediate replacement\n\n**Medium Severity**\n- Missing signage near stairwell in Building A\n- Inadequate lighting in Warehouse east entrance footage\n\n**Low Severity**\n- Cable routing across walkway (trip hazard)\n- Minor obstruction near break room corridor\n\nTotal: **6 issues** across **3 videos**, with **2 high-priority items** requiring immediate attention.`,
  'Summarize this video':
    `**Summary**\n\nThis video is a compliance review walkthrough covering entry points, emergency exits, fire extinguisher placements, and general workspace safety. Key findings include a blocked emergency exit at 2:14, an expired fire extinguisher in Bay C, and missing signage near the stairwell. Overall **medium risk** with 4 issues identified. The inspector recommends clearing the blocked exit and replacing the extinguisher as immediate actions.`,
  'What compliance issues are in this video?':
    `**Compliance issues in this video:**\n\n- **High:** Blocked emergency exit at 2:14 — boxes stacked against south corridor exit. Must be cleared immediately.\n- **High:** Expired fire extinguisher (Bay C) — inspection tag expired; flag for replacement.\n- **Medium:** Missing signage near stairwell — emergency exit sign above door needs replacement.\n- **Low:** Cable routing across walkway — trip hazard; recommend cable management.\n\nTotal: **4 issues**. Two high-priority items require immediate attention.`,
  'What is the risk level for this video?':
    `**Risk level: Medium**\n\nThis video has been assessed as **medium risk** due to a combination of high- and low-severity findings. The two high-severity items (blocked exit, expired extinguisher) drive the overall rating. Once those are addressed, re-assessment could lower the risk level.`,
  'Who appears in this video?':
    `**People in this video:**\n\n| Person | Screen time |\n|---|---|\n| Karen Nelson | 47.6% |\n| Esther Howard | 22.3% |\n| Robert Fox | 14.8% |\n| Jane Cooper | 8.1% |\n\n**4 people** detected. Karen Nelson is the primary speaker (facilities team, signing off at 4:25). Esther Howard and Robert Fox are mentioned by name in the transcript.`,
  'List detected objects in this video':
    `**Detected objects in this video:**\n\nDoor (14), Laptop (11), Book (9), Bottle (8), Dining table (7), Potted plant (5), Refrigerator (4), Chair (4), Clock (3), Vase (2), Lamp (1).\n\nMost frequent: doors and laptops, consistent with an office walkthrough setting.`,
  'Key moments or highlights in this video':
    `**Key moments:**\n\n- **0:00** — Walkthrough starts; quarterly compliance check for Building A, Floor 3.\n- **0:58** — First fire extinguisher (Bay A) checked; tag current, pressure green.\n- **2:14** — **Flag:** Emergency exit blocked by boxes; noted for immediate clearance.\n- **2:38** — **Flag:** Bay C fire extinguisher expired (two months); replacement needed.\n- **3:05** — Missing emergency exit sign at stairwell; facilities to install.\n- **4:10** — Action items summarized: clear exit, replace extinguisher, install signage.\n- **4:25** — Karen Nelson, facilities team, signs off.`,
}

function getResponse(input: string): string {
  const exact = MOCK_RESPONSES[input]
  if (exact) return exact

  const lower = input.toLowerCase()
  if (lower.includes('summarize') && (lower.includes('this video') || lower.includes('video')))
    return MOCK_RESPONSES['Summarize this video']
  if (lower.includes('compliance') && (lower.includes('this video') || lower.includes('in this')))
    return MOCK_RESPONSES['What compliance issues are in this video?']
  if (lower.includes('risk level') && lower.includes('this video'))
    return MOCK_RESPONSES['What is the risk level for this video?']
  if ((lower.includes('who appears') || lower.includes('people') || lower.includes('person')) && lower.includes('this video'))
    return MOCK_RESPONSES['Who appears in this video?']
  if (lower.includes('detected objects') && lower.includes('this video'))
    return MOCK_RESPONSES['List detected objects in this video']
  if (lower.includes('key moments') || lower.includes('highlights'))
    return MOCK_RESPONSES['Key moments or highlights in this video']
  if (lower.includes('risk') || lower.includes('danger'))
    return MOCK_RESPONSES['Which videos have the highest risk?']
  if (lower.includes('people') || lower.includes('person') || lower.includes('face'))
    return MOCK_RESPONSES['List all detected people across videos']
  if (lower.includes('exit') || lower.includes('block'))
    return MOCK_RESPONSES['Show me blocked emergency exits']
  if (lower.includes('compliance') || lower.includes('issue') || lower.includes('flag'))
    return MOCK_RESPONSES['Summarize all flagged compliance issues']

  return `I've analyzed your query: "${input}"\n\nBased on the indexed video library, I can help you with compliance analysis, risk assessment, people detection, and object identification. Select a video above for questions about that video, or ask about your library.`
}

/** Pad number to 2 digits for mm:ss */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/**
 * Parse timestamps in text and return segments for clickable seek.
 * Recognizes M:SS and MM:SS (zero-padded) in all forms, e.g. 2:14 and 02:14.
 * Patterns: [M:SS], [MM:SS], [H:MM:SS], (M:SS), (MM:SS), "212s (03:32)", "0s (00:00)~212s (03:32)",
 * "438 seconds (07:18)", "11:33 to 11:43", "at 2:14" / "at 02:14", plain "2:14" / "02:14" / "12:05", "90s".
 */
function parseTimestampSegments(text: string): Array<{ type: 'text'; value: string } | { type: 'ts'; seconds: number; label: string }> {
  const segments: Array<{ type: 'text'; value: string } | { type: 'ts'; seconds: number; label: string }> = []

  type MatchResult = { index: number; length: number; seconds: number; label: string }
  const patterns: Array<{ re: RegExp; getMatch: (m: RegExpExecArray) => MatchResult | null }> = [
    // 0: "212s (03:32)" or range "0s (00:00)~212s (03:32)"
    {
      re: /(\d+)s\s*\((\d{1,2}):(\d{2})\)(?:\s*~\s*(\d+)s\s*\((\d{1,2}):(\d{2})\))?/gi,
      getMatch: (m) => {
        const sec = parseInt(m[1], 10)
        const mm = parseInt(m[2], 10)
        const ss = parseInt(m[3], 10)
        let label = `${pad2(mm)}:${pad2(ss)}`
        if (m[4] !== undefined && m[4].length > 0) {
          const em = parseInt(m[5], 10)
          const es = parseInt(m[6], 10)
          label = `${label}–${pad2(em)}:${pad2(es)}`
        }
        return { index: m.index, length: m[0].length, seconds: sec, label }
      },
    },
    // 1: "438 seconds (07:18)"
    {
      re: /(\d+)\s+seconds?\s*\((\d{1,2}):(\d{2})\)/gi,
      getMatch: (m) => ({
        index: m.index,
        length: m[0].length,
        seconds: parseInt(m[1], 10),
        label: `${pad2(parseInt(m[2], 10))}:${pad2(parseInt(m[3], 10))}`,
      }),
    },
    // 2: "11:33 to 11:43"
    {
      re: /(\d{1,2}):(\d{2})\s+to\s+(\d{1,2}):(\d{2})/gi,
      getMatch: (m) => {
        const m1 = parseInt(m[1], 10)
        const s1 = parseInt(m[2], 10)
        const m2 = parseInt(m[3], 10)
        const s2 = parseInt(m[4], 10)
        return {
          index: m.index,
          length: m[0].length,
          seconds: m1 * 60 + s1,
          label: `${pad2(m1)}:${pad2(s1)}–${pad2(m2)}:${pad2(s2)}`,
        }
      },
    },
    // 3: Tagged [M:SS], [MM:SS], or [H:MM:SS]
    {
      re: /\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/g,
      getMatch: (m) => {
        const a = parseInt(m[1], 10)
        const b = parseInt(m[2], 10)
        const c = m[3] !== undefined ? parseInt(m[3], 10) : null
        const seconds = c !== null ? a * 3600 + b * 60 + c : a * 60 + b
        const label = c !== null ? `${a}:${pad2(b)}:${pad2(c)}` : `${pad2(a)}:${pad2(b)}`
        return { index: m.index, length: m[0].length, seconds, label }
      },
    },
    // 4: Standalone (M:SS) — not part of "212s (03:32)" (no "Ns " before "(")
    {
      re: /(?<!\ds )\s*\((\d{1,2}):(\d{2})\)/g,
      getMatch: (m) => {
        const mm = parseInt(m[1], 10)
        const ss = parseInt(m[2], 10)
        return { index: m.index, length: m[0].length, seconds: mm * 60 + ss, label: `${pad2(mm)}:${pad2(ss)}` }
      },
    },
    // 5: "at 2:14" or "@ 2:14"
    {
      re: /(?:at|@)\s*(\d{1,2}):(\d{2})\b/gi,
      getMatch: (m) => ({
        index: m.index,
        length: m[0].length,
        seconds: parseInt(m[1], 10) * 60 + parseInt(m[2], 10),
        label: `${pad2(parseInt(m[1], 10))}:${pad2(parseInt(m[2], 10))}`,
      }),
    },
    // 6: Plain M:SS or MM:SS (e.g. 2:14, 02:14, 12:05; word boundary to avoid "12:301")
    {
      re: /\b(\d{1,2}):(\d{2})\b/g,
      getMatch: (m) => ({
        index: m.index,
        length: m[0].length,
        seconds: parseInt(m[1], 10) * 60 + parseInt(m[2], 10),
        label: `${pad2(parseInt(m[1], 10))}:${pad2(parseInt(m[2], 10))}`,
      }),
    },
    // 7: "90s" or "90 s" (seconds only)
    {
      re: /\b(\d+)\s*s\b/gi,
      getMatch: (m) => {
        const sec = parseInt(m[1], 10)
        const mm = Math.floor(sec / 60)
        const ss = sec % 60
        return {
          index: m.index,
          length: m[0].length,
          seconds: sec,
          label: mm > 0 ? `${pad2(mm)}:${pad2(ss)}` : `0:${pad2(ss)}`,
        }
      },
    },
  ]

  let lastEnd = 0
  while (lastEnd < text.length) {
    let best: MatchResult | null = null
    for (let i = 0; i < patterns.length; i++) {
      const { re, getMatch } = patterns[i]
      re.lastIndex = lastEnd
      const m = re.exec(text)
      if (m && m.index >= lastEnd) {
        const result = getMatch(m)
        if (result && (best === null || result.index < best.index || (result.index === best.index && result.length > best.length))) {
          best = result
        }
      }
    }
    if (best === null) {
      segments.push({ type: 'text', value: text.slice(lastEnd) })
      break
    }
    if (best.index > lastEnd) {
      segments.push({ type: 'text', value: text.slice(lastEnd, best.index) })
    }
    segments.push({ type: 'ts', seconds: best.seconds, label: best.label })
    lastEnd = best.index + best.length
  }

  return segments.length ? segments : [{ type: 'text', value: text }]
}

export type ChatbotProps = {
  fixedVideoId?: string
  onClose?: () => void
  /** When set, timestamps in assistant messages become clickable and seek the video to this time (seconds). */
  onSeekToTime?: (seconds: number) => void
}

export default function Chatbot({ fixedVideoId, onClose, onSeekToTime }: ChatbotProps = {}) {
  const [searchParams] = useSearchParams()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [selectedVideoId, setSelectedVideoId] = useState(fixedVideoId ?? '')
  const [assetOptions, setAssetOptions] = useState<AssetOption[]>([SELECT_ASSETS_OPTION])
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (fixedVideoId) {
      setSelectedVideoId(fixedVideoId)
    }
  }, [fixedVideoId])

  useEffect(() => {
    if (fixedVideoId) return
    let cancelled = false
    fetch(`${API_BASE}/api/videos`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        const videos = data?.videos ?? []
        const options: AssetOption[] = [
          SELECT_ASSETS_OPTION,
          ...videos.map((v: { id: string; metadata?: { filename?: string }; stream_url?: string }) => ({
            id: v.id,
            title: v.metadata?.filename ?? v.id,
            streamUrl: v.stream_url,
          })),
        ]
        setAssetOptions(options)
      })
      .catch(() => {
        if (!cancelled) setAssetOptions([SELECT_ASSETS_OPTION])
      })
    return () => {
      cancelled = true
    }
  }, [fixedVideoId])

  useEffect(() => {
    if (fixedVideoId) return
    const videoFromUrl = searchParams.get('video')
    if (videoFromUrl && assetOptions.some((a) => a.id === videoFromUrl)) {
      setSelectedVideoId(videoFromUrl)
    } else {
      const firstVideo = assetOptions.find((a) => a.id)
      if (firstVideo) setSelectedVideoId(firstVideo.id)
    }
  }, [searchParams, fixedVideoId, assetOptions])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isTyping])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function handleSend(text?: string) {
    const msg = (text ?? input).trim()
    if (!msg || isTyping) return

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: msg,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsTyping(true)

    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }

    const videoIdForApi = fixedVideoId || (selectedVideoId || '').trim() || null
    if (videoIdForApi) {
      try {
        const res = await fetch(`${API_BASE}/api/ask-video`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ video_id: videoIdForApi, message: msg }),
        })
        const data = await res.json().catch(() => ({}))
        const content = res.ok ? (data.answer ?? 'No response.') : (data.error ?? `Error: ${res.status}`)
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content,
            timestamp: new Date(),
          },
        ])
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: `Failed to ask about this video: ${err instanceof Error ? err.message : 'Network error'}.`,
            timestamp: new Date(),
          },
        ])
      } finally {
        setIsTyping(false)
      }
      return
    }

    const delay = 600 + Math.random() * 1200
    setTimeout(() => {
      const assistantMsg: Message = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: getResponse(msg),
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, assistantMsg])
      setIsTyping(false)
    }, delay)
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    handleSend()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleTextAreaInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  const isEmpty = messages.length === 0
  const isSingleVideoSelected = Boolean(selectedVideoId)
  const suggestions = isSingleVideoSelected ? SUGGESTIONS_SINGLE_VIDEO : SUGGESTIONS_ALL
  const selectedAsset = assetOptions.find((a) => a.id === selectedVideoId)
  const showAssetDropdown = !fixedVideoId

  return (
    <div className="flex flex-col h-full">
      {onClose && (
        <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-200 bg-white">
          <span className="text-sm font-medium text-gray-700">Ask about this video</span>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            aria-label="Close chat"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full px-6 pb-8">
            <div className="mb-6">
              <TwelveLabsLogoMark className="h-14 w-auto text-brand-charcoal" />
            </div>
            <h2 className="hidden md:block text-2xl font-semibold text-gray-900 mb-2">Compliance Intelligence Assistant</h2>
            <p className="hidden md:block text-gray-500 text-center max-w-md mb-4">
              {isSingleVideoSelected && selectedAsset
                ? `Ask about "${displayName(selectedAsset.title, selectedAsset.id)}" — summary, compliance, risk, people, objects.`
                : 'Select a video above to get suggested questions for that video, or ask about your library.'}
            </p>
            <p className="text-sm font-medium text-gray-700 mb-3">
              {isSingleVideoSelected ? 'Suggested questions for this video' : 'Suggested questions'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl min-h-[120px]">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSend(s)}
                  className="text-left px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm text-gray-700 hover:border-gray-300 hover:bg-gray-50 hover:shadow-sm transition-all duration-200"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                {msg.role === 'assistant' && (
                  <div className="shrink-0 mt-0.5">
                    <TwelveLabsLogoMark className="h-6 w-auto text-brand-charcoal" />
                  </div>
                )}
                <div className={`max-w-[85%] ${msg.role === 'user' ? 'order-first' : ''}`}>
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-brand-charcoal text-white rounded-br-md'
                        : 'bg-white border border-gray-200 text-gray-700 rounded-bl-md shadow-sm'
                    }`}
                  >
                    {renderContent(msg.content, msg.role === 'assistant' ? onSeekToTime : undefined)}
                  </div>
                  <p className={`text-[11px] text-gray-400 mt-1 ${msg.role === 'user' ? 'text-right' : ''}`}>
                    {formatTime(msg.timestamp)}
                  </p>
                </div>
                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center shrink-0 mt-0.5 text-xs font-medium text-gray-600">
                    You
                  </div>
                )}
              </div>
            ))}
            {isTyping && (
              <div className="flex gap-3">
                <div className="shrink-0 mt-0.5">
                  <TwelveLabsLogoMark className="h-6 w-auto text-brand-charcoal" />
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                  <TypingIndicator />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 bg-gray-50">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <form onSubmit={handleSubmit} className="search-bar-gradient-outer shadow-sm w-full">
            <div className="search-bar-gradient-border-wrap">
              <div className="search-bar-gradient-border" aria-hidden />
            </div>
            <div className="search-bar-gradient-inner flex items-center gap-2 px-3 py-2 min-h-[52px]">
              {showAssetDropdown && (
                <AssetsDropdown
                  options={assetOptions}
                  value={selectedVideoId}
                  onChange={setSelectedVideoId}
                />
              )}
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleTextAreaInput}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your videos..."
                rows={1}
                className="flex-1 min-h-[24px] py-1.5 resize-none text-sm text-gray-900 placeholder:text-gray-400 bg-transparent focus:outline-none leading-relaxed max-h-40 border-0"
              />
              <button
                type="submit"
                disabled={!input.trim() || isTyping}
                className="relative flex justify-center items-center transition-all capitalize disabled:bg-gray-100 disabled:text-gray-500 disabled:shadow-[0px_0px_0px_1px_rgba(0,0,0,0.10)_inset] bg-gray-700 md:enabled:hover:bg-gray-700/75 text-gray-50 min-h-10 rounded-[12px] md:enabled:hover:rounded-[16px] text-base gap-x-1 size-10 p-[11px] !shadow-none shrink-0 disabled:cursor-not-allowed"
                aria-label="Send message"
              >
                <IconSend className="size-[18px]" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

function renderContent(text: string, onSeekToTime?: (seconds: number) => void) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('|') && line.endsWith('|')) {
      const tableLines = []
      let j = i
      while (j < lines.length && lines[j].startsWith('|') && lines[j].endsWith('|')) {
        tableLines.push(lines[j])
        j++
      }
      i = j - 1

      if (tableLines.length >= 3) {
        const headers = tableLines[0].split('|').filter(Boolean).map((s) => s.trim())
        const rows = tableLines.slice(2).map((r) => r.split('|').filter(Boolean).map((s) => s.trim()))

        elements.push(
          <div key={i} className="overflow-x-auto my-3">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  {headers.map((h, hi) => (
                    <th key={hi} className="text-left px-3 py-2 border-b border-gray-200 text-gray-500 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri} className="hover:bg-gray-50">
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-3 py-2 border-b border-gray-100 text-gray-700">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
        continue
      }
    }

    if (line === '') {
      elements.push(<br key={i} />)
      continue
    }

    const segments = parseTimestampSegments(line)
    const hasTimestamps = segments.some((s) => s.type === 'ts')
    elements.push(
      <span key={i}>
        {hasTimestamps && onSeekToTime
          ? segments.map((seg, idx) =>
              seg.type === 'text' ? (
                <span key={idx}>{formatInline(seg.value)}</span>
              ) : (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onSeekToTime(seg.seconds)}
                  className="inline-flex items-center px-2 py-0.5 rounded-full bg-accent text-white hover:opacity-90 text-xs font-medium tabular-nums mx-0.5 align-baseline"
                  title={`Seek to ${seg.label}`}
                >
                  {seg.label}
                </button>
              )
            )
          : formatInline(line)}
        {i < lines.length - 1 && <br />}
      </span>
    )
  }

  return <>{elements}</>
}

function formatInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    if (match[2]) {
      parts.push(<strong key={match.index} className="font-semibold text-gray-900">{match[2]}</strong>)
    } else if (match[3]) {
      parts.push(<em key={match.index} className="italic">{match[3]}</em>)
    }
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts
}

import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import LinkAnalysisModal, { type PersonLinkData } from '../components/LinkAnalysisModal'
import Chatbot from './Chatbot'

function toTitleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase())
}

const MOCK_VIDEO = {
  title: 'Office walkthrough — Building A, Floor 3',
  description:
    'A compliance review walkthrough of Building A, Floor 3 offices. The video covers entry points, emergency exits, fire extinguisher placements, and general workspace safety. Recorded during routine quarterly inspection by the facilities team.',
  categories: ['Workplace Safety', 'Facility Inspection', 'Compliance Audit'],
  topics: ['Fire safety equipment', 'Emergency exits', 'Workspace layout', 'Access control'],
  riskLevel: 'medium' as const,
  risks: [
    { label: 'Blocked emergency exit at 2:14', severity: 'high' as const },
    { label: 'Expired fire extinguisher (Bay C)', severity: 'high' as const },
    { label: 'Missing signage near stairwell', severity: 'medium' as const },
    { label: 'Cable routing across walkway', severity: 'low' as const },
  ],
}

const MOCK_PEOPLE = {
  shown: [
    { id: 1, name: 'Karen Nelson', avatar: 'KN', percent: 47.57 },
    { id: 2, name: 'Esther Howard', avatar: 'EH', percent: 22.3 },
    { id: 3, name: 'Robert Fox', avatar: 'RF', percent: 14.8 },
    { id: 4, name: 'Jane Cooper', avatar: 'JC', percent: 8.1 },
  ],
  mentioned: ['Esther Howard', 'Robert Fox'],
}

const MOCK_OBJECTS = [
  { label: 'Door', count: 14 },
  { label: 'Laptop', count: 11 },
  { label: 'Book', count: 9 },
  { label: 'Bottle', count: 8 },
  { label: 'Dining table', count: 7 },
  { label: 'Potted plant', count: 5 },
  { label: 'Refrigerator', count: 4 },
  { label: 'Chair', count: 4 },
  { label: 'Clock', count: 3 },
  { label: 'Vase', count: 2 },
  { label: 'Lamp', count: 1 },
]

const MOCK_THUMBNAILS = Array.from({ length: 18 }, (_, i) => i)

const PERSON_LINK_DATA: Record<number, PersonLinkData> = {
  1: {
    personName: 'Karen Nelson',
    personInitials: 'KN',
    mentionCount: 10,
    mentions: [
      { text: 'Karen Nelson began the quarterly compliance walkthrough, documenting conditions described by the officers.', timestamp: '2024-05-28, 16:45 PM', address: '1450 Wynkoop St, Denver, CO', nodeId: 'n1' },
      { text: "Karen Nelson's presence at the scene was documented by Officer Michelle Henderson.", timestamp: '2024-05-27, 12:30 PM', address: '3001 Brighton Blvd, Denver, CO', nodeId: 'n2' },
      { text: 'During the trial, Karen Nelson was asked about her relationship with the victim.', timestamp: '2024-05-31, 09:00 AM', address: '900 Bannock St, Denver, CO', nodeId: 'n3' },
      { text: "Karen Nelson's testimony corroborated key details about the suspect's behavior.", timestamp: '2024-05-28, 11:20 AM', address: '1999 Broadway, Denver, CO', nodeId: 'n4' },
    ],
    linkedNodes: [
      { id: 'n1', label: 'Brown Shoe Video', type: 'video' },
      { id: 'n2', label: 'Witness List', type: 'document' },
      { id: 'n3', label: 'Officer Henderson', sublabel: 'Follow-up Report', type: 'document' },
      { id: 'n4', label: 'Voicemail', type: 'audio' },
      { id: 'n5', label: 'Laptop Photo', type: 'photo', imageUrl: 'https://picsum.photos/96/96?random=1' },
      { id: 'n6', label: 'Jacob Jones', sublabel: 'Witness Statement', type: 'witness' },
    ],
  },
  2: {
    personName: 'Esther Howard',
    personInitials: 'EH',
    mentionCount: 5,
    mentions: [
      { text: 'Esther Howard was mentioned in the audio transcript during the walkthrough at 1:22.', timestamp: '2024-05-28, 14:10 PM', address: '1450 Wynkoop St, Denver, CO', nodeId: 'n1' },
      { text: "Esther Howard confirmed the fire extinguisher schedule via email.", timestamp: '2024-05-29, 09:15 AM', address: '3001 Brighton Blvd, Denver, CO', nodeId: 'n2' },
    ],
    linkedNodes: [
      { id: 'n1', label: 'Schedule Email', type: 'document' },
      { id: 'n2', label: 'Bay A Footage', type: 'video' },
      { id: 'n3', label: 'Karen Nelson', sublabel: 'Co-worker', type: 'witness' },
    ],
  },
  3: {
    personName: 'Robert Fox',
    personInitials: 'RF',
    mentionCount: 3,
    mentions: [
      { text: 'Robert Fox was identified near the east emergency exit during the walkthrough.', timestamp: '2024-05-28, 15:00 PM', address: '1450 Wynkoop St, Denver, CO', nodeId: 'n1' },
    ],
    linkedNodes: [
      { id: 'n1', label: 'East Exit Clip', type: 'video' },
      { id: 'n2', label: 'Badge Log', type: 'document' },
      { id: 'n3', label: 'ID Photo', type: 'photo', imageUrl: 'https://picsum.photos/96/96?random=2' },
      { id: 'n4', label: 'Esther Howard', sublabel: 'Manager', type: 'witness' },
    ],
  },
  4: {
    personName: 'Jane Cooper',
    personInitials: 'JC',
    mentionCount: 2,
    mentions: [
      { text: 'Jane Cooper was briefly visible near the break room during the walkthrough.', timestamp: '2024-05-28, 15:22 PM', address: '1450 Wynkoop St, Denver, CO', nodeId: 'n1' },
    ],
    linkedNodes: [
      { id: 'n1', label: 'Break Room Clip', type: 'video' },
      { id: 'n2', label: 'Robert Fox', sublabel: 'Team Lead', type: 'witness' },
    ],
  },
}

const MOCK_TRANSCRIPT = [
  { time: '0:00', text: 'Alright, starting the quarterly compliance walkthrough for Building A, Floor 3.' },
  { time: '0:12', text: 'We\'re at the main entrance now. Badge reader is operational, door closes properly behind us.' },
  { time: '0:34', text: 'Moving into the open workspace. General layout looks good, desks are spaced appropriately.' },
  { time: '0:58', text: 'Checking the first fire extinguisher station here by Bay A. Inspection tag is current, pressure gauge is in the green.' },
  { time: '1:22', text: 'Walking past the break room. No obstructions in the hallway. Emergency lighting is on and functional.' },
  { time: '1:45', text: 'Now approaching the east emergency exit. Signage is clearly visible from both directions.' },
  { time: '2:02', text: 'Moving to the south corridor toward Bay C. I\'m noticing some cables running across the walkway here.' },
  { time: '2:14', text: 'This is a concern — the emergency exit here has boxes stacked against it. That needs to be cleared immediately.' },
  { time: '2:38', text: 'Checking Bay C fire extinguisher. The inspection tag shows it expired two months ago. Flagging this for replacement.' },
  { time: '3:05', text: 'Heading toward the stairwell now. The emergency exit sign above the door is missing. We\'ll need facilities to install a replacement.' },
  { time: '3:28', text: 'Stairwell itself looks clear. Handrails secure, no debris on the steps.' },
  { time: '3:52', text: 'Back on the main floor. Wrapping up the walkthrough. Overall the floor is in reasonable shape with a few items to address.' },
  { time: '4:10', text: 'Key action items: clear the blocked exit, replace the expired extinguisher in Bay C, and install missing stairwell signage.' },
  { time: '4:25', text: 'End of walkthrough. Karen Nelson, facilities team, signing off.' },
]

function Button({
  children,
  variant = 'black',
  size = 'regular',
  onClick,
  className = '',
}: {
  children: React.ReactNode
  variant?: 'black' | 'white' | 'gray' | 'ghosted-black' | 'black-outline'
  size?: 'small' | 'regular' | 'medium'
  onClick?: () => void
  className?: string
}) {
  const sizeMap = {
    small: 'h-7 px-2 py-1.5 text-sm rounded-md gap-1',
    regular: 'h-8 px-3 py-1.5 text-base rounded-[9.6px] gap-1',
    medium: 'h-10 px-[18px] py-2 text-lg rounded-lg gap-1',
  }
  const variantMap = {
    black:
      'bg-brand-charcoal text-brand-white hover:bg-gray-300 hover:text-brand-charcoal',
    white:
      'bg-surface text-brand-charcoal hover:bg-gray-300 hover:text-brand-charcoal',
    gray:
      'bg-gray-200 text-brand-charcoal hover:bg-gray-400 hover:text-brand-charcoal',
    'ghosted-black':
      'bg-transparent text-brand-charcoal hover:bg-brand-charcoal/[0.08]',
    'black-outline':
      'bg-transparent text-brand-charcoal border border-brand-charcoal hover:bg-gray-300',
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center font-brand transition-all duration-200 ${sizeMap[size]} ${variantMap[variant]} ${className}`}
    >
      {children}
    </button>
  )
}

const SECTION_UNDERLINE_MAP: Record<string, string> = {
  'bg-accent': 'border-accent',
  'bg-product-generate': 'border-product-generate',
  'bg-product-embed': 'border-product-embed',
  'bg-product-search': 'border-product-search',
  'bg-error': 'border-error',
}

function Section({
  title,
  badge,
  color,
  children,
}: {
  title: string
  badge?: number
  color: string
  children: React.ReactNode
}) {
  const badgeBgMap: Record<string, string> = {
    'bg-accent': 'bg-accent/10 text-accent',
    'bg-product-generate': 'bg-product-generate/10 text-product-generate',
    'bg-product-embed': 'bg-product-embed/10 text-product-embed',
    'bg-product-search': 'bg-product-search/10 text-product-search',
    'bg-error': 'bg-error/10 text-error',
  }
  const badgeStyle = badgeBgMap[color] ?? 'bg-gray-100 text-gray-500'
  const underlineStyle = SECTION_UNDERLINE_MAP[color] ?? 'border-gray-300'

  return (
    <div className="py-3 sm:py-4">
      <div className={`w-fit border-b-2 pb-1.5 ${underlineStyle}`}>
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-text-primary">{title}</h3>
          {badge !== undefined && (
            <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${badgeStyle}`}>{badge}</span>
          )}
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  )
}

function Avatar({ initials, size = 'md' }: { initials: string; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'w-9 h-9 text-xs' : 'w-12 h-12 text-sm'
  return (
    <div className={`${dim} rounded-full bg-gray-300 text-gray-600 font-medium flex items-center justify-center shrink-0`}>
      {initials}
    </div>
  )
}

function Tag({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <span
      className={`inline-block px-3 py-1 rounded-full text-sm border cursor-pointer transition-colors duration-200 ${
        active
          ? 'bg-brand-charcoal text-brand-white border-brand-charcoal'
          : 'bg-surface text-gray-700 border-gray-300 hover:border-gray-400'
      }`}
    >
      {label}
    </span>
  )
}

function RiskBadge({ severity }: { severity: 'high' | 'medium' | 'low' }) {
  const styles = {
    high: 'bg-error/10 text-error border-error/20',
    medium: 'bg-warning/10 text-warning border-warning/20',
    low: 'bg-success/10 text-success border-success/20',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium border ${styles[severity]}`}>
      {severity.charAt(0).toUpperCase() + severity.slice(1)}
    </span>
  )
}

/* Overall risk indicator                                              */
function RiskLevel({ level }: { level: 'high' | 'medium' | 'low' }) {
  const config = {
    high: { label: 'High Risk', bg: 'bg-error/10', text: 'text-error', dot: 'bg-error' },
    medium: { label: 'Medium Risk', bg: 'bg-warning/10', text: 'text-warning', dot: 'bg-warning' },
    low: { label: 'Low Risk', bg: 'bg-success/10', text: 'text-success', dot: 'bg-success' },
  }
  const c = config[level]
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${c.bg} ${c.text}`}>
      <span className={`w-2 h-2 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  )
}

function formatTimelineTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = Math.floor(totalSeconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function TimelineBar({
  segments,
  durationSeconds,
}: {
  segments: number[]
  durationSeconds?: number
}) {
  const n = segments.length
  const duration = durationSeconds ?? (n * 13)
  const segmentDuration = duration / n
  const showMidTick = duration > 90
  const midTime = showMidTick ? Math.round((duration / 2) / 30) * 30 : 0

  return (
    <div className="mt-3 w-full">
      <p className="mb-1.5 text-xs font-medium text-gray-500">Presence in video</p>
      <div className="flex gap-0.5 w-full h-2.5 rounded-sm overflow-hidden bg-gray-100">
        {segments.map((filled, i) => (
          <div
            key={i}
            className={`flex-1 min-w-0 rounded-sm ${filled ? 'timeline-embed-gradient' : 'bg-gray-200'}`}
            style={
              filled
                ? {
                    backgroundSize: `${n * 100}% 100%`,
                    backgroundPosition: `${(-i * 100) / (n || 1)}% 0`,
                  }
                : undefined
            }
            title={`${formatTimelineTime(i * segmentDuration)} – ${formatTimelineTime((i + 1) * segmentDuration)}`}
          />
        ))}
      </div>
      <div
        className={`mt-1 w-full text-[11px] text-gray-500 tabular-nums ${showMidTick ? 'grid grid-cols-3 items-center' : 'flex justify-between'}`}
        aria-hidden
      >
        <span>0:00</span>
        {showMidTick ? <span className="text-center">{formatTimelineTime(midTime)}</span> : null}
        <span className={showMidTick ? 'text-right' : ''}>{formatTimelineTime(duration)}</span>
      </div>
    </div>
  )
}

function PdfReportModal({
  open,
  onClose,
  videoId,
  title,
  riskLevel,
  risks,
}: {
  open: boolean
  onClose: () => void
  videoId: string
  title: string
  riskLevel: string
  risks: Array<{ label: string; severity: string }>
}) {
  if (!open) return null

  function handleDownload() {
    const blob = new Blob(['Compliance report for ' + videoId], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `compliance-report-${videoId}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-brand-charcoal/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl border border-border bg-surface shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pdf-report-title"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4 shrink-0">
          <h2 id="pdf-report-title" className="text-lg font-semibold text-text-primary">
            PDF Report
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-text-tertiary hover:bg-card hover:text-text-primary transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" viewBox="0 0 12 12" fill="currentColor">
              <path d="M6.02051 5.31348L8.9668 2.36719L9.67383 3.07422L6.72754 6.02051L9.65332 8.94629L8.94629 9.65332L6.02051 6.72754L3.07422 9.67383L2.36719 8.9668L5.31348 6.02051L2.34668 3.05371L3.05371 2.34668L6.02051 5.31348Z" />
              <path fillRule="evenodd" clipRule="evenodd" d="M8.40039 0C10.3883 0.000211285 11.9998 1.61169 12 3.59961V8.40039C11.9998 10.3883 10.3883 11.9998 8.40039 12H3.59961C1.61169 11.9998 0.000211285 10.3883 0 8.40039V3.59961C0.000211156 1.61169 1.61169 0.000211157 3.59961 0H8.40039ZM3.59961 1C2.16398 1.00021 1.00021 2.16398 1 3.59961V8.40039C1.00021 9.83602 2.16398 10.9998 3.59961 11H8.40039C9.83602 10.9998 10.9998 9.83602 11 8.40039V3.59961C10.9998 2.16398 9.83602 1.00021 8.40039 1H3.59961Z" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 bg-card">
          <div className="bg-surface rounded-lg border border-border shadow-sm p-6 text-text-primary">
            <p className="text-xs text-text-tertiary uppercase tracking-wider mb-2">Compliance Intelligence Report</p>
            <h3 className="text-lg font-semibold text-text-primary mb-1">{title}</h3>
            <p className="text-sm text-text-secondary mb-4">Video ID: {videoId} · Generated: {new Date().toLocaleDateString()}</p>
            <div className="border-t border-border pt-4 mb-4">
              <p className="text-xs font-medium text-text-tertiary uppercase mb-2">Risk level</p>
              <p className="text-sm font-medium capitalize">{riskLevel}</p>
            </div>
            <div className="border-t border-border pt-4">
              <p className="text-xs font-medium text-gray-500 uppercase mb-2">Key findings</p>
              <ul className="space-y-1.5 text-sm">
                {risks.map((r, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span>{r.label}</span>
                    <span className={`shrink-0 text-xs font-medium capitalize ${r.severity === 'high' ? 'text-error' : r.severity === 'medium' ? 'text-warning' : 'text-success'}`}>{r.severity}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-text-tertiary mt-6">This is a preview. Download for full PDF.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-3 sm:px-5 py-4 shrink-0 bg-surface rounded-b-xl">
          <Button variant="ghosted-black" size="regular" onClick={onClose}>Close</Button>
          <Button variant="black" size="regular" onClick={handleDownload}>Download PDF</Button>
        </div>
      </div>
    </div>
  )
}

type PersonEntry = { id: number; name: string; avatar: string; percent: number }

export default function VideoAnalysis() {
  const { videoId } = useParams<{ videoId: string }>()
  const [people, setPeople] = useState<PersonEntry[]>(() => MOCK_PEOPLE.shown.map((p) => ({ ...p })))
  const [selectedPerson, setSelectedPerson] = useState(MOCK_PEOPLE.shown[0])
  const [activeObjectIdx, setActiveObjectIdx] = useState(0)
  const [reportModalOpen, setReportModalOpen] = useState(false)
  const [linkAnalysisPersonId, setLinkAnalysisPersonId] = useState<number | null>(null)
  const [editingPersonId, setEditingPersonId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [chatPanelOpen, setChatPanelOpen] = useState(false)
  const [showAllTranscript, setShowAllTranscript] = useState(false)
  const [isLgViewport, setIsLgViewport] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const handler = () => setIsLgViewport(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  function startEditing(p: PersonEntry) {
    setEditingPersonId(p.id)
    setEditName(p.name)
  }

  function commitEdit(personId: number) {
    const trimmed = editName.trim()
    if (trimmed) {
      setPeople((prev) => prev.map((p) =>
        p.id === personId
          ? { ...p, name: trimmed, avatar: trimmed.split(' ').map((w) => w[0]?.toUpperCase() ?? '').join('').slice(0, 2) }
          : p
      ))
      if (selectedPerson.id === personId) {
        setSelectedPerson((prev) => ({
          ...prev,
          name: trimmed,
          avatar: trimmed.split(' ').map((w) => w[0]?.toUpperCase() ?? '').join('').slice(0, 2),
        }))
      }
    }
    setEditingPersonId(null)
    setEditName('')
  }

  const timeline = [1, 0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0]

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 sm:px-6 pt-4 sm:pt-5 pb-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 text-sm text-gray-500 min-w-0 flex-1">
          <Link to="/" className="hover:text-gray-700 transition-colors duration-200 shrink-0">Dashboard</Link>
          <span className="text-gray-400 shrink-0">/</span>
          <span className="text-gray-700 font-medium truncate">Video {videoId}</span>
        </div>
        <button
          type="button"
          onClick={() => setChatPanelOpen(true)}
          className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full border border-border bg-surface text-sm font-medium text-text-secondary hover:border-accent hover:bg-accent/5 hover:text-text-primary transition-colors shrink-0"
        >
          <svg className="w-4 h-4 text-gray-500 shrink-0" viewBox="0 0 12 12.0376" fill="currentColor" aria-hidden>
            <path fillRule="evenodd" clipRule="evenodd" d="M8.8 1H3.2C1.98497 1 1 1.98497 1 3.2V6.13333C1 7.34836 1.98497 8.33333 3.2 8.33333H3.92451C4.32261 8.33333 4.69151 8.54221 4.89633 8.88357L6 10.723L7.10367 8.88357C7.30849 8.5422 7.6774 8.33333 8.07549 8.33333H8.8C10.015 8.33333 11 7.34836 11 6.13333V3.2C11 1.98497 10.015 1 8.8 1ZM3.2 0C1.43269 0 0 1.43269 0 3.2V6.13333C0 7.90065 1.43269 9.33333 3.2 9.33333H3.92451C3.97134 9.33333 4.01474 9.35791 4.03884 9.39807L5.42834 11.7139C5.68727 12.1455 6.31273 12.1455 6.57166 11.7139L7.96116 9.39807C7.98526 9.35791 8.02866 9.33333 8.07549 9.33333H8.8C10.5673 9.33333 12 7.90064 12 6.13333V3.2C12 1.43269 10.5673 0 8.8 0H3.2Z" />
          </svg>
          Ask about this video
        </button>
      </div>

      {chatPanelOpen && (
        <>
          <div
            className="fixed inset-0 bg-brand-charcoal/40 backdrop-blur-sm z-40"
            aria-hidden
            onClick={() => setChatPanelOpen(false)}
          />
          <div className="fixed inset-0 z-50 flex flex-col lg:flex-row pointer-events-none">
            <div
              className="flex-1 min-w-0 flex items-center justify-center p-3 sm:p-6 pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col items-center gap-3 w-full max-w-[560px]">
                <div className="rounded-xl overflow-hidden bg-brand-charcoal shadow-lg w-full shrink-0">
                  <div className="relative aspect-video bg-gray-700 flex items-center justify-center">
                    <video className="w-full h-full object-cover" controls>
                      <source src="" type="video/mp4" />
                    </video>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-14 h-14 rounded-full bg-surface/20 backdrop-blur-sm flex items-center justify-center">
                        <svg className="w-7 h-7 text-brand-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-gray-600 truncate w-full text-center">Video {videoId}</p>
              </div>
            </div>
            <div
              className="w-full lg:max-w-lg bg-background border-t lg:border-t-0 lg:border-l border-border shadow-lg flex flex-col shrink-0 pointer-events-auto max-h-[70vh] lg:max-h-none"
              onClick={(e) => e.stopPropagation()}
            >
              <Chatbot
                fixedVideoId={videoId ?? ''}
                onClose={() => setChatPanelOpen(false)}
              />
            </div>
          </div>
        </>
      )}

      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden px-3 sm:px-6 pb-4 sm:pb-6 gap-4 lg:gap-6">

        <div className="flex-1 overflow-y-auto min-w-0 pr-0 lg:pr-2 order-2 lg:order-1">

          <Section title="Video description" color="bg-accent">
            <h4 className="text-base font-semibold text-gray-700 mb-2 w-fit max-w-full pr-4">{toTitleCase(MOCK_VIDEO.title)}</h4>
            <p className="text-base text-gray-600 leading-relaxed">{MOCK_VIDEO.description}</p>
          </Section>

          <Section title="Categories" badge={MOCK_VIDEO.categories.length} color="bg-accent">
            <div className="flex flex-wrap gap-2">
              {MOCK_VIDEO.categories.map((cat) => (
                <span
                  key={cat}
                  className="inline-flex items-center px-3 py-1.5 rounded-md bg-gray-100 text-sm text-gray-700 font-medium"
                >
                  {cat}
                </span>
              ))}
            </div>
          </Section>

          <Section title="About topic" badge={MOCK_VIDEO.topics.length} color="bg-accent">
            <div className="flex flex-wrap gap-2">
              {MOCK_VIDEO.topics.map((topic) => (
                <Tag key={topic} label={topic} />
              ))}
            </div>
          </Section>

          <Section title="Risk involved" badge={MOCK_VIDEO.risks.length} color="bg-error">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4">
              <RiskLevel level={MOCK_VIDEO.riskLevel} />
              <span className="text-sm text-gray-500">{MOCK_VIDEO.risks.length} issues identified</span>
            </div>
            <ul className="space-y-2">
              {MOCK_VIDEO.risks.map((risk, i) => (
                <li
                  key={i}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface border border-border px-3 sm:px-4 py-3"
                >
                  <span className="text-sm text-gray-700">{risk.label}</span>
                  <RiskBadge severity={risk.severity} />
                </li>
              ))}
            </ul>
          </Section>

          <Section
            title="People"
            badge={people.length + MOCK_PEOPLE.mentioned.length}
            color="bg-accent"
          >
            <p className="text-xs text-gray-500 mb-2">
              Shown people ({people.length})
            </p>
            <div className="flex flex-wrap gap-3 mb-4 p-1 -m-1">
              {people.map((p) => {
                const isEditing = editingPersonId === p.id
                return (
                  <div key={p.id} className="relative group flex flex-col items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setSelectedPerson(p)}
                      className={`relative rounded-full ring-2 ring-offset-2 transition-all duration-200 ${
                        selectedPerson.id === p.id
                          ? 'ring-accent'
                          : 'ring-transparent hover:ring-gray-300'
                      }`}
                    >
                      <Avatar initials={p.avatar} size="sm" />
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); startEditing(p) }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); startEditing(p) } }}
                        className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-surface border border-border shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        aria-label={`Edit name for ${p.name}`}
                      >
                        <svg className="w-2.5 h-2.5 text-gray-500" viewBox="0 0 12 12" fill="currentColor">
                          <path d="M9.08 0.293a1 1 0 011.414 0l1.213 1.213a1 1 0 010 1.414L4.586 10.04 0 12l1.96-4.586L9.08.293zM2.72 7.866l-1.04 2.434 2.434-1.04 6.453-6.453-1.394-1.394L2.72 7.866z" />
                        </svg>
                      </span>
                    </button>
                    {isEditing ? (
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={() => commitEdit(p.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(p.id); if (e.key === 'Escape') setEditingPersonId(null) }}
                        className="w-20 text-[10px] text-center text-text-primary border border-accent rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-accent bg-surface"
                      />
                    ) : (
                      <span
                        className="text-[10px] text-gray-500 truncate max-w-[64px] cursor-pointer hover:text-gray-700"
                        onClick={() => startEditing(p)}
                        title={`Click to edit: ${p.name}`}
                      >
                        {p.name}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>

            <p className="text-xs text-gray-500 mb-2">
              Mentioned people ({MOCK_PEOPLE.mentioned.length})
            </p>
            <div className="flex gap-2 mb-5">
              {MOCK_PEOPLE.mentioned.map((name) => (
                <Tag key={name} label={name} />
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Avatar initials={selectedPerson.avatar} />
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-gray-700">{selectedPerson.name}</p>
                <p className="text-sm text-gray-500">
                  Appears in {selectedPerson.percent}% of video
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLinkAnalysisPersonId(selectedPerson.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface text-xs font-medium text-text-secondary hover:border-border-light hover:bg-card transition-colors shrink-0 w-full sm:w-auto"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="3" cy="6" r="2" />
                  <circle cx="9" cy="3" r="2" />
                  <circle cx="9" cy="9" r="2" />
                  <line x1="4.8" y1="5.2" x2="7.2" y2="3.8" />
                  <line x1="4.8" y1="6.8" x2="7.2" y2="8.2" />
                </svg>
                Link Analysis
              </button>
            </div>
            <TimelineBar segments={timeline} durationSeconds={4 * 60 + 25} />
          </Section>

          <Section
            title="Detected objects"
            badge={MOCK_OBJECTS.length}
            color="bg-accent"
          >
            <div className="flex flex-wrap gap-2 mb-4">
              {MOCK_OBJECTS.map((obj, i) => (
                <button key={obj.label} type="button" onClick={() => setActiveObjectIdx(i)}>
                  <Tag label={obj.label} active={i === activeObjectIdx} />
                </button>
              ))}
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
              {MOCK_THUMBNAILS.map((i) => (
                <div
                  key={i}
                  className="aspect-square rounded-md bg-card border border-border flex items-center justify-center text-xs text-text-tertiary"
                >
                  {i + 1}
                </div>
              ))}
            </div>
          </Section>
        </div>

        <div className="w-full lg:w-[420px] shrink-0 flex flex-col gap-3 overflow-hidden order-1 lg:order-2 min-h-0">
          <div className="rounded-xl overflow-hidden bg-brand-charcoal shadow-lg shrink-0">
            <div className="relative aspect-video bg-gray-700 flex items-center justify-center">
              <video className="w-full h-full object-cover" controls>
                <source src="" type="video/mp4" />
              </video>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-14 h-14 rounded-full bg-surface/20 backdrop-blur-sm flex items-center justify-center">
                  <svg className="w-7 h-7 text-brand-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <RiskLevel level={MOCK_VIDEO.riskLevel} />

              <div className="relative group ml-1">
                <button
                  type="button"
                  className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors duration-200"
                  aria-label="Video details"
                >
                  <svg className="w-4 h-4" viewBox="0 0 12 12" fill="currentColor">
                    <path d="M6.66699 9.33301H5.33301V5.33301H6.66699V9.33301Z" />
                    <path d="M6.66699 4H5.33301V2.66699H6.66699V4Z" />
                    <path fillRule="evenodd" clipRule="evenodd" d="M8.40039 0C10.3883 0.000211285 11.9998 1.61169 12 3.59961V8.40039C11.9998 10.3883 10.3883 11.9998 8.40039 12H3.59961C1.61169 11.9998 0.000211285 10.3883 0 8.40039V3.59961C0.000211156 1.61169 1.61169 0.000211157 3.59961 0H8.40039ZM3.59961 1C2.16398 1.00021 1.00021 2.16398 1 3.59961V8.40039C1.00021 9.83602 2.16398 10.9998 3.59961 11H8.40039C9.83602 10.9998 10.9998 9.83602 11 8.40039V3.59961C10.9998 2.16398 9.83602 1.00021 8.40039 1H3.59961Z" />
                  </svg>
                </button>

                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-64 rounded-lg border border-gray-300 bg-surface p-4 shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                  <h4 className="text-base font-semibold text-gray-700 mb-2">Video details</h4>
                  <dl className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Video ID</dt>
                      <dd className="text-gray-700 font-mono">{videoId}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Duration</dt>
                      <dd className="text-gray-700">4:32</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Resolution</dt>
                      <dd className="text-gray-700">1920 &times; 1080</dd>
                    </div>
                  </dl>
                  <div className="absolute left-1/2 -translate-x-1/2 -top-1.5 w-3 h-3 bg-surface border-l border-t border-gray-300 rotate-45" />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <Button variant="black" size="small" onClick={() => setReportModalOpen(true)} className="whitespace-nowrap">PDF Report</Button>
            </div>
          </div>
          <PdfReportModal
            open={reportModalOpen}
            onClose={() => setReportModalOpen(false)}
            videoId={videoId ?? ''}
            title={toTitleCase(MOCK_VIDEO.title)}
            riskLevel={MOCK_VIDEO.riskLevel}
            risks={MOCK_VIDEO.risks}
          />

          <div className="rounded-lg border border-gray-300 bg-surface shadow-sm overflow-hidden flex flex-col min-h-0">
            <div className="flex items-center justify-between px-3 sm:px-4 py-3 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-500" viewBox="0 0 12 11" fill="currentColor">
                  <path d="M1 1H11V2H1V1Z" />
                  <path d="M1 4H9V5H1V4Z" />
                  <path d="M1 7H11V8H1V7Z" />
                  <path d="M1 10H7V11H1V10Z" />
                </svg>
                <h4 className="text-base font-semibold text-gray-700">Transcript</h4>
              </div>
              <span className="text-xs text-gray-400">{MOCK_TRANSCRIPT.length} segments</span>
            </div>
            <ul className="overflow-y-auto divide-y divide-gray-100">
              {((isLgViewport || showAllTranscript) ? MOCK_TRANSCRIPT : MOCK_TRANSCRIPT.slice(0, 2)).map((line, i) => (
                <li
                  key={i}
                  className="flex gap-3 px-3 sm:px-4 py-3 hover:bg-card transition-colors duration-150 cursor-pointer"
                >
                  <span className="text-xs font-mono text-accent font-medium shrink-0 pt-0.5 w-9">
                    {line.time}
                  </span>
                  <p className="text-sm text-gray-600 leading-relaxed">{line.text}</p>
                </li>
              ))}
            </ul>
            {MOCK_TRANSCRIPT.length > 2 && !isLgViewport && (
              <div className="shrink-0 border-t border-gray-100 px-3 sm:px-4 py-3 flex justify-center">
                <button
                  type="button"
                  onClick={() => setShowAllTranscript((v) => !v)}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-accent hover:bg-accent/5 transition-colors"
                >
                  {showAllTranscript ? (
                    <>
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                      Show less
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                      Show more ({MOCK_TRANSCRIPT.length - 2} more)
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {linkAnalysisPersonId !== null && PERSON_LINK_DATA[linkAnalysisPersonId] && (
        <LinkAnalysisModal
          open
          onClose={() => setLinkAnalysisPersonId(null)}
          data={PERSON_LINK_DATA[linkAnalysisPersonId]}
        />
      )}
    </div>
  )
}

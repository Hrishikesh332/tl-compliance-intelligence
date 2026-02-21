import { useState, useRef, useEffect } from 'react'

type NodeType = 'video' | 'document' | 'audio' | 'photo' | 'witness'

type LinkNode = {
  id: string
  label: string
  sublabel?: string
  type: NodeType
  imageUrl?: string
}

type Mention = {
  text: string
  timestamp: string
  address: string
  nodeId?: string
}

export type PersonLinkData = {
  personName: string
  personInitials: string
  mentionCount: number
  mentions: Mention[]
  linkedNodes: LinkNode[]
}

function NodeIcon({ type, className = 'w-5 h-5' }: { type: NodeType; className?: string }) {
  switch (type) {
    case 'video':
      return (
        <svg className={className} viewBox="0 0 12 12" fill="currentColor">
          <path fillRule="evenodd" clipRule="evenodd" d="M3.6 12C1.61178 12 0 10.3882 0 8.4V3.6C0 1.61178 1.61178 0 3.6 0H8.4C10.3882 0 12 1.61178 12 3.6V8.4C12 10.3882 10.3882 12 8.4 12H3.6ZM8.4 11H3.6C2.16406 11 1 9.83594 1 8.4V3.6C1 2.16406 2.16406 1 3.6 1H8.4C9.83594 1 11 2.16406 11 3.6V8.4C11 9.83594 9.83594 11 8.4 11Z" />
          <path d="M4.5 4L8.5 6L4.5 8V4Z" />
        </svg>
      )
    case 'document':
      return (
        <svg className={className} viewBox="0 0 12 12" fill="currentColor">
          <path fillRule="evenodd" clipRule="evenodd" d="M3.6 12C1.61178 12 0 10.3882 0 8.4V3.6C0 1.61178 1.61178 0 3.6 0H8.4C10.3882 0 12 1.61178 12 3.6V8.4C12 10.3882 10.3882 12 8.4 12H3.6ZM8.4 11H3.6C2.16406 11 1 9.83594 1 8.4V3.6C1 2.16406 2.16406 1 3.6 1H8.4C9.83594 1 11 2.16406 11 3.6V8.4C11 9.83594 9.83594 11 8.4 11Z" />
          <path d="M3.5 3.5H8.5V4.5H3.5V3.5Z" />
          <path d="M3.5 5.5H7V6.5H3.5V5.5Z" />
          <path d="M3.5 7.5H8.5V8.5H3.5V7.5Z" />
        </svg>
      )
    case 'audio':
      return (
        <svg className={className} viewBox="0 0 12 12" fill="currentColor">
          <path fillRule="evenodd" clipRule="evenodd" d="M3.6 12C1.61178 12 0 10.3882 0 8.4V3.6C0 1.61178 1.61178 0 3.6 0H8.4C10.3882 0 12 1.61178 12 3.6V8.4C12 10.3882 10.3882 12 8.4 12H3.6ZM8.4 11H3.6C2.16406 11 1 9.83594 1 8.4V3.6C1 2.16406 2.16406 1 3.6 1H8.4C9.83594 1 11 2.16406 11 3.6V8.4C11 9.83594 9.83594 11 8.4 11Z" />
          <path d="M5 4L7.5 6L5 8V4Z" />
          <path d="M8 4.5C8.8 5.3 8.8 6.7 8 7.5" stroke="currentColor" strokeWidth="0.8" fill="none" />
        </svg>
      )
    case 'photo':
      return (
        <svg className={className} viewBox="0 0 12 12" fill="currentColor">
          <path fillRule="evenodd" clipRule="evenodd" d="M3.6 12C1.61178 12 0 10.3882 0 8.4V3.6C0 1.61178 1.61178 0 3.6 0H8.4C10.3882 0 12 1.61178 12 3.6V8.4C12 10.3882 10.3882 12 8.4 12H3.6ZM8.4 11H3.6C2.16406 11 1 9.83594 1 8.4V3.6C1 2.16406 2.16406 1 3.6 1H8.4C9.83594 1 11 2.16406 11 3.6V8.4C11 9.83594 9.83594 11 8.4 11Z" />
          <circle cx="4.5" cy="4.5" r="1.2" />
          <path d="M1.5 9L4 6.5L5.5 8L7.5 5.5L10.5 9H1.5Z" />
        </svg>
      )
    case 'witness':
      return (
        <svg className={className} viewBox="0 0 12 12" fill="currentColor">
          <circle cx="6" cy="4" r="2" />
          <path d="M2 10.5C2 8.29 3.79 6.5 6 6.5C8.21 6.5 10 8.29 10 10.5V11H2V10.5Z" />
        </svg>
      )
  }
}

function PersonIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 12" fill="currentColor">
      <path fillRule="evenodd" clipRule="evenodd" d="M6 2C7.10457 2 8 2.89543 8 4C8 5.10457 7.10457 6 6 6C4.89543 6 4 5.10457 4 4C4 2.89543 4.89543 2 6 2ZM6 3C5.44772 3 5 3.44772 5 4C5 4.55228 5.44772 5 6 5C6.55228 5 7 4.55228 7 4C7 3.44772 6.55228 3 6 3Z" />
      <path fillRule="evenodd" clipRule="evenodd" d="M8.40039 0C10.3883 0.000211285 11.9998 1.61169 12 3.59961V8.40039C11.9998 10.3883 10.3883 11.9998 8.40039 12H3.59961C1.61169 11.9998 0.000211285 10.3883 0 8.40039V3.59961C0.000211156 1.61169 1.61169 0.000211157 3.59961 0H8.40039ZM4.50098 7.5C3.16242 7.5 1.96779 8.54749 1.60938 10.0713C2.08624 10.6387 2.80047 10.9999 3.59961 11H8.40039C9.19957 10.9999 9.91279 10.6377 10.3896 10.0703C10.0309 8.54742 8.83897 7.50019 7.50098 7.5H4.50098ZM3.59961 1C2.16396 1.00018 1.00018 2.16396 1 3.59961V8.40039C1.00002 8.5262 1.01201 8.64948 1.0293 8.77051C1.70868 7.43439 2.98545 6.5 4.50098 6.5H7.50098C9.01528 6.50015 10.291 7.43307 10.9707 8.76758C10.9877 8.64746 11 8.5252 11 8.40039V3.59961C10.9998 2.16385 9.83521 1 8.39941 1H3.59961Z" />
    </svg>
  )
}

const CX = 300
const CY = 220
const RADIUS = 160

function getNodePositions(count: number) {
  const offset = -Math.PI / 2
  return Array.from({ length: count }, (_, i) => {
    const angle = offset + (2 * Math.PI * i) / count
    return {
      x: CX + RADIUS * Math.cos(angle),
      y: CY + RADIUS * Math.sin(angle),
    }
  })
}

function IconClose({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 12" fill="currentColor">
      <path d="M6.02051 5.31348L8.9668 2.36719L9.67383 3.07422L6.72754 6.02051L9.65332 8.94629L8.94629 9.65332L6.02051 6.72754L3.07422 9.67383L2.36719 8.9668L5.31348 6.02051L2.34668 3.05371L3.05371 2.34668L6.02051 5.31348Z" />
    </svg>
  )
}

function MentionList({ mentions, selectedNodeId }: { mentions: Mention[]; selectedNodeId: string | null }) {
  const highlightedRef = useRef<HTMLLIElement | null>(null)

  useEffect(() => {
    if (selectedNodeId && highlightedRef.current) {
      highlightedRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [selectedNodeId])

  return (
    <ul className="flex-1 overflow-y-auto divide-y divide-gray-200" role="list">
      {mentions.map((m, i) => {
        const isHighlighted = selectedNodeId != null && m.nodeId === selectedNodeId
        return (
          <li
            key={i}
            ref={isHighlighted ? (el) => { highlightedRef.current = el } : undefined}
            className={`px-4 py-3 transition-colors duration-200 ${
              isHighlighted
                ? 'bg-accent/10 border-l-4 border-accent -ml-px pl-[15px] rounded-r-lg'
                : ''
            }`}
            aria-current={isHighlighted ? 'true' : undefined}
          >
            <p className="text-sm text-gray-700 leading-relaxed mb-1.5">{m.text}</p>
            <p className="text-xs text-gray-500">
              <span className="font-medium">Timestamp:</span> {m.timestamp}
            </p>
            <p className="text-xs text-gray-500">
              <span className="font-medium">Address:</span> {m.address}
            </p>
          </li>
        )
      })}
    </ul>
  )
}

export default function LinkAnalysisModal({
  open,
  onClose,
  data,
}: {
  open: boolean
  onClose: () => void
  data: PersonLinkData
}) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  if (!open) return null

  const positions = getNodePositions(data.linkedNodes.length)

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-brand-charcoal/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        className="relative w-full max-w-5xl h-[80vh] flex flex-col rounded-xl border border-gray-200 bg-surface shadow-xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-analysis-title"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 shrink-0">
          <h2 id="link-analysis-title" className="text-lg font-semibold text-gray-900">
            Link Analysis
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

        <div className="flex-1 flex min-h-0">
          <aside className="w-72 shrink-0 border-r border-gray-200 flex flex-col bg-gray-50/80 overflow-hidden">
            <div className="px-4 pt-4 pb-3 border-b border-gray-200 shrink-0">
              <div className="flex items-center gap-2 mb-1">
                <PersonIcon className="w-5 h-5 text-accent" />
                <h3 className="text-sm font-semibold text-gray-900">{data.personName}</h3>
              </div>
              <p className="text-xs text-gray-500">Mentioned {data.mentionCount} times</p>
            </div>
            <MentionList
              mentions={data.mentions}
              selectedNodeId={selectedNodeId}
            />
          </aside>

          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="flex-1 relative overflow-hidden bg-gray-50/50">
            <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${CX * 2} ${CY * 2}`} preserveAspectRatio="xMidYMid meet">
              {positions.map((pos, i) => (
                <line
                  key={`line-${i}`}
                  x1={CX}
                  y1={CY}
                  x2={pos.x}
                  y2={pos.y}
                  stroke="#d1d5db"
                  strokeWidth="1.5"
                  strokeDasharray={selectedNodeId === data.linkedNodes[i].id ? '0' : '4 4'}
                  className={`transition-all duration-300 ${selectedNodeId === data.linkedNodes[i].id ? 'stroke-accent' : ''}`}
                />
              ))}

              <g className="cursor-default">
                <circle cx={CX} cy={CY} r="32" className="fill-accent/10 stroke-accent" strokeWidth="2" />
                <foreignObject x={CX - 12} y={CY - 18} width="24" height="24">
                  <PersonIcon className="w-6 h-6 text-accent" />
                </foreignObject>
                <text x={CX} y={CY + 26} textAnchor="middle" className="fill-gray-900 text-[11px] font-semibold">
                  {data.personName}
                </text>
              </g>

              <defs>
                {data.linkedNodes.map((node, i) => (
                  <clipPath key={`clip-${node.id}`} id={`node-clip-${node.id}`}>
                    <circle cx={positions[i]?.x ?? 0} cy={positions[i]?.y ?? 0} r="24" />
                  </clipPath>
                ))}
              </defs>
              {positions.map((pos, i) => {
                const node = data.linkedNodes[i]
                const isActive = selectedNodeId === node.id
                const hasPhoto = Boolean(node.imageUrl)
                return (
                  <g
                    key={node.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedNodeId(isActive ? null : node.id)}
                  >
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r="26"
                      className={`transition-all duration-200 ${
                        isActive
                          ? 'fill-accent/10 stroke-accent'
                          : 'fill-white stroke-gray-300 hover:stroke-accent/50'
                      }`}
                      strokeWidth={isActive ? '2' : '1.5'}
                    />
                    {hasPhoto ? (
                      <g clipPath={`url(#node-clip-${node.id})`}>
                        <image
                          href={node.imageUrl}
                          x={pos.x - 24}
                          y={pos.y - 24}
                          width="48"
                          height="48"
                          preserveAspectRatio="xMidYMid slice"
                        />
                      </g>
                    ) : (
                      <foreignObject x={pos.x - 10} y={pos.y - 10} width="20" height="20">
                        <NodeIcon
                          type={node.type}
                          className={`w-5 h-5 ${isActive ? 'text-accent' : 'text-gray-500'}`}
                        />
                      </foreignObject>
                    )}
                    <text
                      x={pos.x}
                      y={pos.y + 38}
                      textAnchor="middle"
                      className={`text-[10px] font-medium ${isActive ? 'fill-gray-900' : 'fill-gray-600'}`}
                    >
                      {node.label}
                    </text>
                    {node.sublabel && (
                      <text x={pos.x} y={pos.y + 50} textAnchor="middle" className="fill-gray-400 text-[9px]">
                        {node.sublabel}
                      </text>
                    )}
                  </g>
                )
              })}
            </svg>
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}

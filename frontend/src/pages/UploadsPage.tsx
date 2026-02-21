import { useState, useMemo, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'

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

function IconVideo({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 9 11" fill="currentColor">
      <path fillRule="evenodd" clipRule="evenodd" d="M1.03927 1.03269V9.96731L7.91655 5.5L1.03927 1.03269ZM0 0.928981C0 0.182271 0.886347 -0.25826 1.5376 0.164775L8.57453 4.73579C9.14182 5.10429 9.14182 5.89571 8.57453 6.2642L1.5376 10.8352C0.88635 11.2583 0 10.8177 0 10.071V0.928981Z" />
    </svg>
  )
}

type TaskStatus = 'pending' | 'in_progress' | 'completed'
type Priority = 'low' | 'medium' | 'high'
type TableEntity = { id: string; name: string; imageUrl?: string; initials: string }

const MOCK_TASKS: Array<{
  id: string
  title: string
  uploadDate: string
  status: TaskStatus
  priority: Priority
  sourceLabel: string
  category: string
  tags: string[]
  entities: TableEntity[]
}> = [
  { id: '1', title: 'Review bodycam — Unit 7 patrol', uploadDate: '03-15-2024', status: 'pending', priority: 'low', sourceLabel: 'Officer_Michelle_Henders_bodycam.mp4', category: 'Workplace Safety', tags: ['Workplace Safety', 'Bodycam', 'Unit 7'], entities: [{ id: 'e1', name: 'Karen Nelson', imageUrl: 'https://picsum.photos/128/128?random=1', initials: 'KN' }, { id: 'e2', name: 'Esther Howard', imageUrl: 'https://picsum.photos/128/128?random=2', initials: 'EH' }, { id: 'e6', name: 'Michelle Henderson', initials: 'MH' }] },
  { id: '2', title: 'Verify crime scene footage', uploadDate: '03-12-2024', status: 'pending', priority: 'low', sourceLabel: 'Officer_Crime_Scene_Footage.mp4', category: 'Compliance Audit', tags: ['Compliance Audit', 'Crime Scene'], entities: [{ id: 'e3', name: 'Robert Fox', imageUrl: 'https://picsum.photos/128/128?random=3', initials: 'RF' }] },
  { id: '3', title: 'Analyze dashcam — Highway I-95', uploadDate: '03-05-2024', status: 'in_progress', priority: 'medium', sourceLabel: 'DashCam_Highway_I95.mp4', category: 'Facility Inspection', tags: ['Facility Inspection', 'Dashcam', 'Highway'], entities: [{ id: 'e4', name: 'Jane Cooper', imageUrl: 'https://picsum.photos/128/128?random=4', initials: 'JC' }, { id: 'e5', name: 'Jacob Jones', initials: 'JJ' }] },
  { id: '4', title: 'Review 911 call recording clip', uploadDate: '03-01-2024', status: 'in_progress', priority: 'medium', sourceLabel: '911_Call_2024-08-01.mp4', category: 'Compliance Audit', tags: ['Compliance Audit', '911', 'Recording'], entities: [] },
  { id: '5', title: 'Verify officer bodycam — Daniel', uploadDate: '02-25-2024', status: 'completed', priority: 'high', sourceLabel: 'Officer_Daniel_Bodycam.mp4', category: 'Workplace Safety', tags: ['Workplace Safety', 'Bodycam', 'Verification'], entities: [{ id: 'e7', name: 'Daniel Smith', imageUrl: 'https://picsum.photos/128/128?random=7', initials: 'DS' }, { id: 'e1', name: 'Karen Nelson', imageUrl: 'https://picsum.photos/128/128?random=1', initials: 'KN' }, { id: 'e8', name: 'Sarah Williams', initials: 'SW' }] },
  { id: '6', title: 'Cross-check officer bodycam — Michelle', uploadDate: '02-20-2024', status: 'completed', priority: 'high', sourceLabel: 'Officer_Michelle_Bodycam.mp4', category: 'Facility Inspection', tags: ['Facility Inspection', 'Bodycam', 'Cross-check'], entities: [{ id: 'e6', name: 'Michelle Henderson', imageUrl: 'https://picsum.photos/128/128?random=6', initials: 'MH' }] },
]

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

function PriorityTag({ priority }: { priority: Priority }) {
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

const TASK_STATUS_OPTIONS: Array<{ value: TaskStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
]

const TASK_CATEGORIES = ['Workplace Safety', 'Compliance Audit', 'Facility Inspection'] as const

function TasksFilterDropdown({
  statusFilter,
  categoryFilter,
  onStatusChange,
  onCategoryChange,
}: {
  statusFilter: TaskStatus | 'all'
  categoryFilter: string
  onStatusChange: (v: TaskStatus | 'all') => void
  onCategoryChange: (v: string) => void
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

  const hasActiveFilter = statusFilter !== 'all' || categoryFilter !== 'All'

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-colors h-10 ${
          open || hasActiveFilter
            ? 'border-accent bg-accent/5 text-text-primary'
            : 'border-border bg-surface text-text-secondary hover:bg-card'
        }`}
        aria-label="Filter tasks"
        aria-expanded={open}
      >
        <IconFilter className="w-3.5 h-3.5" />
        Filter
        <IconChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-border bg-surface py-2 shadow-xl z-[100]">
          <p className="px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider">Status</p>
          <div className="px-2 space-y-0.5">
            {TASK_STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onStatusChange(opt.value)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  statusFilter === opt.value ? 'bg-accent/10 text-text-primary' : 'text-text-secondary hover:bg-card'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="px-4 py-2 mt-2 text-xs font-medium text-gray-400 uppercase tracking-wider border-t border-gray-100">Category</p>
          <div className="px-2 space-y-0.5">
            <button
              type="button"
              onClick={() => onCategoryChange('All')}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                categoryFilter === 'All' ? 'bg-accent/10 text-text-primary' : 'text-text-secondary hover:bg-card'
              }`}
            >
              All categories
            </button>
            {TASK_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => onCategoryChange(cat)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  categoryFilter === cat ? 'bg-accent/10 text-text-primary' : 'text-text-secondary hover:bg-card'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function UploadsPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all')
  const [categoryFilter, setCategoryFilter] = useState('All')

  const filtered = useMemo(() => {
    let list = MOCK_TASKS
    if (statusFilter !== 'all') {
      list = list.filter((t) => t.status === statusFilter)
    }
    if (categoryFilter !== 'All') {
      list = list.filter((t) => t.category === categoryFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.sourceLabel.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q)
      )
    }
    return list
  }, [search, statusFilter, categoryFilter])

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold text-text-primary mb-6">{filtered.length} Tasks</h1>

      {/* Search bar with filter aside — TwelveLabs UI */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <div className="flex-1 min-w-[200px] relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <IconSearch className="w-5 h-5" />
          </span>
          <input
            type="search"
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-10 pr-4 rounded-xl border border-border bg-surface text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
          />
        </div>
        <TasksFilterDropdown
          statusFilter={statusFilter}
          categoryFilter={categoryFilter}
          onStatusChange={setStatusFilter}
          onCategoryChange={setCategoryFilter}
        />
        <button
          type="button"
          className="h-10 px-5 rounded-xl bg-brand-charcoal text-brand-white text-sm font-medium hover:bg-gray-700 transition-colors shrink-0"
        >
          Search
        </button>
      </div>

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
            {filtered.map((task) => (
              <tr key={task.id} className="hover:bg-card/80 transition-colors">
                <td className="px-4 py-3">
                  <Link
                    to={`/${task.id}`}
                    className="text-sm font-medium text-text-primary underline underline-offset-2 hover:text-accent"
                  >
                    {task.title}
                  </Link>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 tabular-nums">
                  {task.uploadDate}
                </td>
                <td className="px-4 py-3">
                  <PriorityTag priority={task.priority} />
                </td>
                <td className="px-4 py-3">
                  <TagPills tags={task.tags} />
                </td>
                <td className="px-4 py-3">
                  <EntityAvatars entities={task.entities} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

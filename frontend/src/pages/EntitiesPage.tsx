import { useState, useEffect, useCallback } from 'react'
import AddEntityModal from '../components/AddEntityModal'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000'

type Entity = {
  id: string
  name: string
  imageUrl?: string
  initials: string
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

export default function EntitiesPage() {
  const [entities, setEntities] = useState<Entity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const fetchEntities = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch(`${API_BASE}/api/entities`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        const mapped: Entity[] = (data.entities || []).map((e: any) => ({
          id: e.id,
          name: e.metadata?.name || e.id,
          imageUrl: e.metadata?.face_snap_base64
            ? `data:image/png;base64,${e.metadata.face_snap_base64}`
            : undefined,
          initials: getInitials(e.metadata?.name || e.id),
        }))
        setEntities(mapped)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchEntities()
  }, [fetchEntities])

  return (
    <div className="w-full min-w-0 px-3 sm:px-4 py-4 sm:py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">
          {loading ? 'Entities' : `${entities.length} ${entities.length === 1 ? 'Entity' : 'Entities'}`}
        </h1>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="h-9 px-4 rounded-xl bg-brand-charcoal text-brand-white text-sm font-medium hover:bg-gray-700 transition-colors"
        >
          + Add Entity
        </button>
      </div>

      {loading && (
        <div className="flex flex-col items-center py-16 gap-3">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin" />
          <p className="text-sm text-text-tertiary">Loading entities...</p>
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-700 mb-3">Failed to load entities: {error}</p>
          <button
            type="button"
            onClick={fetchEntities}
            className="text-sm font-medium text-red-600 hover:text-red-800 underline underline-offset-2"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && entities.length === 0 && (
        <div className="flex flex-col items-center py-16 gap-4 text-text-tertiary">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <p className="text-sm">No entities yet. Add one to get started.</p>
        </div>
      )}

      {!loading && !error && entities.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-6 sm:gap-8">
          {entities.map((entity) => (
            <div
              key={entity.id}
              className="flex flex-col items-center gap-3 group cursor-pointer"
            >
              <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden border-2 border-border bg-card group-hover:border-accent group-hover:shadow-md transition-all duration-200">
                {entity.imageUrl ? (
                  <img
                    src={entity.imageUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-200 text-gray-600 text-lg font-medium">
                    {entity.initials}
                  </div>
                )}
              </div>
              <p className="text-sm font-medium text-text-primary text-center truncate w-full group-hover:text-accent transition-colors">
                {entity.name}
              </p>
            </div>
          ))}
        </div>
      )}

      <AddEntityModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onEntityAdded={() => {
          setModalOpen(false)
          fetchEntities()
        }}
      />
    </div>
  )
}

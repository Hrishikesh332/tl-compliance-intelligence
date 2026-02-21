import { useState } from 'react'

type Entity = {
  id: string
  name: string
  imageUrl?: string
  initials: string
}

const MOCK_ENTITIES: Entity[] = [
  { id: '1', name: 'Karen Nelson', initials: 'KN', imageUrl: 'https://picsum.photos/128/128?random=1' },
  { id: '2', name: 'Esther Howard', initials: 'EH', imageUrl: 'https://picsum.photos/128/128?random=2' },
  { id: '3', name: 'Robert Fox', initials: 'RF', imageUrl: 'https://picsum.photos/128/128?random=3' },
  { id: '4', name: 'Jane Cooper', initials: 'JC', imageUrl: 'https://picsum.photos/128/128?random=4' },
  { id: '5', name: 'Jacob Jones', initials: 'JJ', imageUrl: 'https://picsum.photos/128/128?random=5' },
  { id: '6', name: 'Michelle Henderson', initials: 'MH', imageUrl: 'https://picsum.photos/128/128?random=6' },
  { id: '7', name: 'Daniel Smith', initials: 'DS', imageUrl: 'https://picsum.photos/128/128?random=7' },
  { id: '8', name: 'Sarah Williams', initials: 'SW', imageUrl: 'https://picsum.photos/128/128?random=8' },
]

export default function EntitiesPage() {
  const [entities] = useState<Entity[]>(MOCK_ENTITIES)

  return (
    <div className="w-full min-w-0 px-3 sm:px-4 py-4 sm:py-6">
      <h1 className="text-2xl font-semibold text-text-primary mb-6">Entities</h1>

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
    </div>
  )
}

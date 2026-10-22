import { EmptyState } from '../components/ui'

export function Skeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-28 sm:px-6" aria-busy="true" aria-label="Loading dataset">
      <div className="skeleton h-12 w-2/3 max-w-xl" />
      <div className="skeleton mt-4 h-5 w-1/2 max-w-md" />
      <div className="mt-14 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="skeleton h-24 rounded-xl" />
        ))}
      </div>
    </div>
  )
}

export function LoadError({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-xl px-4 pt-32">
      <EmptyState title="The dataset could not be loaded" body={message} action={<button onClick={() => location.reload()} className="h-9 rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg">Try again</button>} />
    </div>
  )
}

import { ButtonLink, EmptyState } from '../components/ui'

export function NotFound() {
  return (
    <div className="mx-auto max-w-xl pt-24">
      <EmptyState title="Page not found" body="That company or question isn't in the dataset. It may have been merged or renamed in a newer build." action={<ButtonLink to="/">Back to companies</ButtonLink>} />
    </div>
  )
}

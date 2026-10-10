import { EmptyState } from '../components/ui'
import { PLATFORM_LABEL, useAtlas, type Platform } from '../lib/data'

export function AboutPage() {
  const atlas = useAtlas()
  const platforms = Object.entries(atlas.stats.platforms) as [Platform, number][]
  return (
    <div className="mx-auto max-w-3xl pt-10">
      <h1 className="text-3xl font-semibold tracking-[-0.015em] text-fg md:text-4xl">Where the data comes from</h1>
      <p className="mt-4 text-lg leading-relaxed text-muted">
        Every question here was reported by a candidate in a public post. We paraphrase the question, tag it, and link back to the original so you can read the full context.
      </p>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-[-0.015em] text-fg">Source posts by platform</h2>
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {platforms.map(([p, n]) => (
            <li key={p} className="rounded-xl border border-line bg-surface p-4">
              <p className="tabular-nums text-2xl font-medium text-fg">{n}</p>
              <p className="mt-1 text-sm text-muted">{PLATFORM_LABEL[p] ?? p}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12 space-y-4 text-[15px] leading-relaxed text-muted">
        <h2 className="text-lg font-semibold tracking-[-0.015em] text-fg">How it is collected</h2>
        <p>
          A Python pipeline in <code className="rounded bg-surface-2 px-1.5 py-0.5 tabular-nums text-sm text-fg">scraper/</code> searches for interview write-ups on GeeksforGeeks, LeetCode Discuss, Reddit,
          LinkedIn, X, Medium, Hacker News and blogs. Pages are fetched with a lightweight HTTP client first, a headless browser only when the page needs JavaScript, and a hosted
          scraper when a site blocks datacenter IPs.
        </p>
        <p>
          It checks robots.txt before fetching and does not solve CAPTCHAs or log in. For sites that disallow crawling, such as LinkedIn and X, it only uses the snippet a search engine shows.
        </p>
        <p>
          Claude reads each page and pulls out the questions the author says they were asked. The link on each question is the page that was read, attached by code, so the model cannot attach a link it made up.
          Duplicate reports are merged, and the number of independent reports is shown on each question.
        </p>
        <h2 className="pt-4 text-lg font-semibold tracking-[-0.015em] text-fg">What to keep in mind</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Reports are self-reported and can be incomplete or misremembered. Questions with several reports are more reliable.</li>
          <li>Processes change between years, locations and teams. Check the year on each question.</li>
          <li>Counts show what candidates chose to write about. They are not an official syllabus, and some companies simply have more public write-ups.</li>
          <li>Found an error? Open the source link, and if the question is wrong, remove it from the company file in <code className="rounded bg-surface-2 px-1.5 py-0.5 tabular-nums text-sm text-fg">data/raw/</code> and rebuild.</li>
        </ul>
        <p className="pt-2 text-sm text-subtle">
          {atlas.stats.dropped > 0 && `${atlas.stats.dropped} records without a source link were dropped in the last build. `}
          Dataset built {new Date(atlas.generatedAt).toLocaleString()}.
        </p>
      </section>
    </div>
  )
}

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

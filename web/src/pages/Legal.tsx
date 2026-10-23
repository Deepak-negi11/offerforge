import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LINKEDIN_URL } from '../lib/config'

// Public contact for privacy and account requests (shown on /privacy and /terms).
// Leave empty to point people to a private LinkedIn message instead.
export const CONTACT_EMAIL = ''
const UPDATED = '24 October 2026'

function Doc({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-2xl py-10 text-[15px] leading-relaxed text-muted">
      <h1 className="text-2xl font-semibold tracking-[-0.02em] text-fg">{title}</h1>
      <p className="mt-1 text-sm text-subtle">Last updated {UPDATED}</p>
      <div className="mt-8 space-y-6 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-fg [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">{children}</div>
    </article>
  )
}

const Mail = () =>
  CONTACT_EMAIL ? (
    <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent-ink underline-offset-2 hover:underline">
      {CONTACT_EMAIL}
    </a>
  ) : (
    <>
      us through a private{' '}
      <a href={LINKEDIN_URL} target="_blank" rel="noreferrer noopener" className="text-accent-ink underline-offset-2 hover:underline">
        LinkedIn message
      </a>
    </>
  )

export function PrivacyPage() {
  return (
    <Doc title="Privacy Policy">
      <p>
        OfferForge is a free interview-preparation site. This page explains what we collect, why, and who processes it. We
        don't sell your data or show ads.
      </p>
      <section>
        <h2>What we collect</h2>
        <ul>
          <li>Account details: your name and email address. If you sign in with a password, we store only a one-way hash of it, never the password itself.</li>
          <li>If you use "Continue with Google": your name, email address and Google account ID, as shared by Google. We don't get access to your Google account, contacts or files.</li>
          <li>Your progress: questions you bookmark or mark as solved, and code or notes you save in the editor.</li>
          <li>Usage analytics: pages you visit, approximate location from your IP address, browser and device type, and events such as signing up or logging in. Analytics never include your email or name; signed-in usage is linked only to an internal numeric account ID.</li>
          <li>A sign-in cookie that keeps you logged in, and analytics identifiers stored in your browser.</li>
        </ul>
      </section>
      <section>
        <h2>Why we use it</h2>
        <ul>
          <li>To create and secure your account, including emailing a one-time code to confirm your email address.</li>
          <li>To save and show your progress across devices.</li>
          <li>To understand how the site is used and improve it.</li>
        </ul>
      </section>
      <section>
        <h2>Who processes it</h2>
        <ul>
          <li>Render (hosting) and Turso (database), in the United States.</li>
          <li>Resend, which delivers verification emails.</li>
          <li>PostHog (US cloud), for usage analytics.</li>
          <li>Google, only if you choose "Continue with Google".</li>
        </ul>
      </section>
      <section>
        <h2>Retention and your choices</h2>
        <p>
          We keep your account data until you ask us to delete it. To see, correct or delete your data, contact <Mail />. We'll
          delete your account and progress within 30 days of a verified request. Sign-in sessions expire after 30 days.
        </p>
      </section>
      <section>
        <h2>Interview content</h2>
        <p>
          Questions on OfferForge are summaries of interview experiences that candidates shared publicly, with links to the
          original posts. If you wrote a post we link to and want it removed, contact <Mail />.
        </p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>
          For questions about this policy, contact <Mail />. See also our <Link to="/terms" className="text-accent-ink underline-offset-2 hover:underline">Terms of Service</Link>.
        </p>
      </section>
    </Doc>
  )
}

export function TermsPage() {
  return (
    <Doc title="Terms of Service">
      <p>By using OfferForge you agree to these terms. If you don't agree, please don't use the site.</p>
      <section>
        <h2>The service</h2>
        <p>
          OfferForge collects interview questions that candidates reported publicly and turns them into practice problems and
          write-ups. Content is provided as-is for practice. Companies change their processes, so we don't guarantee that any
          question will be asked or that any answer is the one an interviewer expects.
        </p>
      </section>
      <section>
        <h2>Your account</h2>
        <ul>
          <li>Use a real email address you own; we confirm it before the account works.</li>
          <li>Keep your password private. You're responsible for activity on your account.</li>
          <li>One person per account. Don't create accounts in bulk or with someone else's email.</li>
        </ul>
      </section>
      <section>
        <h2>Acceptable use</h2>
        <ul>
          <li>Don't scrape the site at scale, overload it, or try to break its security.</li>
          <li>Don't use the code runner to attack other systems or run anything unlawful.</li>
          <li>Don't misuse the content, for example by sharing confidential interview material you were asked to keep private.</li>
        </ul>
      </section>
      <section>
        <h2>Ending your account</h2>
        <p>
          You can stop using OfferForge at any time and ask us to delete your account: contact <Mail />. We may suspend
          accounts that break these terms.
        </p>
      </section>
      <section>
        <h2>Liability</h2>
        <p>
          OfferForge is a free student project offered without warranties. To the extent the law allows, we aren't liable for
          losses from using it, including interview outcomes.
        </p>
      </section>
      <section>
        <h2>Changes and contact</h2>
        <p>
          We may update these terms and will change the date above when we do. For questions, contact <Mail />. See also our{' '}
          <Link to="/privacy" className="text-accent-ink underline-offset-2 hover:underline">Privacy Policy</Link>.
        </p>
      </section>
    </Doc>
  )
}

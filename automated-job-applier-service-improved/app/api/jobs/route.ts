import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const revalidate = 900

const JOB_FEED_URL = 'https://www.arbeitnow.com/api/job-board-api'
const MAX_JOBS = 24
const REQUEST_TIMEOUT_MS = 10_000

const TARGET_COUNTRIES = [
  'zimbabwe',
  'south africa',
  'zambia',
  'botswana',
  'mozambique',
  'malawi',
  'namibia',
]

const ROLE_TERMS = [
  'software',
  'developer',
  'engineer',
  'frontend',
  'front-end',
  'backend',
  'back-end',
  'full stack',
  'full-stack',
  'devops',
  'data analyst',
  'data engineer',
  'data scientist',
  'javascript',
  'react',
  'typescript',
  'python',
  'systems analyst',
  'it support',
  'technical support',
  'database administrator',
  'cybersecurity',
  'information technology',
]

type FeedJob = {
  slug?: unknown
  title?: unknown
  company_name?: unknown
  location?: unknown
  remote?: unknown
  url?: unknown
  description?: unknown
  tags?: unknown
  created_at?: unknown
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function getRelevance(job: FeedJob): number {
  const title = asText(job.title).toLowerCase()
  const description = asText(job.description).toLowerCase()
  const location = asText(job.location).toLowerCase()
  const tags = Array.isArray(job.tags)
    ? job.tags.filter((tag): tag is string => typeof tag === 'string').join(' ').toLowerCase()
    : ''
  const searchable = `${title} ${tags} ${description}`
  const roleMatches = ROLE_TERMS.filter((term) => title.includes(term) || tags.includes(term))
  const locationMatches = TARGET_COUNTRIES.some((country) => location.includes(country))
  const explicitlyRemote = Boolean(job.remote) && /\b(worldwide|africa|anywhere|global|emea|remote)\b/i.test(`${location} ${description}`)

  // Do not treat every globally remote vacancy as a regional opportunity.
  if (roleMatches.length === 0 || (!locationMatches && !explicitlyRemote)) return 0

  let score = 68
  if (roleMatches.some((term) => title.includes(term))) score += 12
  if (locationMatches) score += 10
  if (explicitlyRemote) score += 5
  if (title.includes('senior') || title.includes('lead') || title.includes('principal')) score -= 5
  if (title.includes('intern') || title.includes('graduate') || title.includes('junior') || title.includes('entry level')) score += 5
  return Math.max(55, Math.min(98, score))
}

function normalizeJob(job: FeedJob, index: number) {
  const company = asText(job.company_name) || 'Company not listed'
  const role = asText(job.title) || 'Technology role'
  const location = asText(job.location) || (job.remote ? 'Remote' : 'Location not listed')
  const url = asText(job.url)
  if (!isSafeHttpUrl(url)) return null

  const score = getRelevance(job)
  if (!score) return null

  const colors = ['bg-orange-500', 'bg-sky-500', 'bg-red-500', 'bg-emerald-500']
  const slug = asText(job.slug)
  const id = slug || `${company}-${role}-${index}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-')

  return {
    id,
    company,
    role,
    location,
    type: Boolean(job.remote) ? 'Remote' : 'On-site / Hybrid',
    match: score,
    color: colors[index % colors.length],
    initials: company.slice(0, 1).toUpperCase(),
    url,
    source: 'Arbeitnow',
    postedAt: typeof job.created_at === 'number' ? new Date(job.created_at * 1000).toISOString() : null,
  }
}

export async function GET() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(JOB_FEED_URL, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'CareerPilot/1.0 job-discovery',
      },
      signal: controller.signal,
      next: { revalidate: 900 },
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: 'The job feed is temporarily unavailable. Please try again shortly.' },
        { status: 502 },
      )
    }

    const payload: unknown = await response.json()
    if (!payload || typeof payload !== 'object' || !('data' in payload) || !Array.isArray(payload.data)) {
      return NextResponse.json({ error: 'The job feed returned an unexpected response.' }, { status: 502 })
    }

    const jobs = (payload.data as FeedJob[])
      .map(normalizeJob)
      .filter((job): job is NonNullable<typeof job> => job !== null)
      .sort((a, b) => b.match - a.match)
      .slice(0, MAX_JOBS)

    return NextResponse.json(
      { jobs, source: 'Arbeitnow', fetchedAt: new Date().toISOString() },
      { headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' } },
    )
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError'
    return NextResponse.json(
      { error: timedOut ? 'The job feed took too long to respond. Please try again.' : 'Unable to reach the job feed right now.' },
      { status: 502 },
    )
  } finally {
    clearTimeout(timeout)
  }
}

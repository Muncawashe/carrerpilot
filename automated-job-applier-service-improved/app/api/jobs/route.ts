import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const revalidate = 900

const JOB_FEED_URL = 'https://www.arbeitnow.com/api/job-board-api'
const MAX_JOBS = 24
const REQUEST_TIMEOUT_MS = 10_000

const TARGET_COUNTRIES = [
  'zimbabwe',
  'harare',
  'bulawayo',
  'mutare',
  'gweru',
  'chitungwiza',
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
  'network',
  'cloud',
  'support specialist',
  'help desk',
]

const LOCAL_JOB_SITES = [
  {
    name: 'Careers Portal Zimbabwe',
    urls: [
      'https://www.careersportal.co.zw/search?search=software',
      'https://www.careersportal.co.zw/search?search=developer',
      'https://www.careersportal.co.zw/search?search=it',
    ],
  },
  {
    name: 'ZimJobs',
    urls: [
      'https://www.zimjobs.co.zw/?s=software',
      'https://www.zimjobs.co.zw/?s=developer',
      'https://www.zimjobs.co.zw/?s=it',
    ],
  },
  {
    name: 'Zimbabwe Jobs',
    urls: [
      'https://www.jobsinzimbabwe.co.zw/?s=software',
      'https://www.jobsinzimbabwe.co.zw/?s=developer',
      'https://www.jobsinzimbabwe.co.zw/?s=it',
    ],
  },
] as const

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

type NormalizedJob = {
  id: string
  company: string
  role: string
  location: string
  type: string
  match: number
  color: string
  initials: string
  url: string
  source: string
  postedAt: string | null
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

function normalizeCompanyName(value: string): string {
  return value.replace(/\s+/g, ' ').trim() || 'Local employer'
}

function buildId(company: string, role: string, index: number, source: string) {
  return `${source}-${company}-${role}-${index}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function getRelevance(title: string, description: string, location: string, tags: string): number {
  const normalizedTitle = title.toLowerCase()
  const normalizedDescription = description.toLowerCase()
  const normalizedLocation = location.toLowerCase()
  const searchable = `${normalizedTitle} ${tags} ${normalizedDescription}`
  const roleMatches = ROLE_TERMS.filter((term) => normalizedTitle.includes(term) || tags.includes(term))
  const locationMatches = TARGET_COUNTRIES.some((country) => normalizedLocation.includes(country))
  const explicitlyRemote = /\b(worldwide|africa|anywhere|global|emea|remote)\b/i.test(`${normalizedLocation} ${normalizedDescription}`)

  if (roleMatches.length === 0 || (!locationMatches && !explicitlyRemote)) return 0

  let score = 68
  if (roleMatches.some((term) => normalizedTitle.includes(term))) score += 12
  if (locationMatches) score += 10
  if (explicitlyRemote) score += 5
  if (normalizedTitle.includes('senior') || normalizedTitle.includes('lead') || normalizedTitle.includes('principal')) score -= 5
  if (normalizedTitle.includes('intern') || normalizedTitle.includes('graduate') || normalizedTitle.includes('junior') || normalizedTitle.includes('entry level')) score += 5
  if (searchable.includes('zimbabwe')) score += 4

  return Math.max(55, Math.min(98, score))
}

function normalizeArbeitnowJob(job: FeedJob, index: number): NormalizedJob | null {
  const company = asText(job.company_name) || 'Company not listed'
  const role = asText(job.title) || 'Technology role'
  const location = asText(job.location) || (job.remote ? 'Remote' : 'Location not listed')
  const url = asText(job.url)
  if (!isSafeHttpUrl(url)) return null

  const tags = Array.isArray(job.tags)
    ? job.tags.filter((tag): tag is string => typeof tag === 'string').join(' ').toLowerCase()
    : ''
  const score = getRelevance(role, asText(job.description), location, tags)
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

function cleanAnchorText(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function pickLocationFromText(text: string): string {
  const locationHints = ['Harare', 'Bulawayo', 'Mutare', 'Gweru', 'Chitungwiza', 'Remote', 'Zimbabwe', 'South Africa', 'Zambia', 'Botswana', 'Malawi', 'Namibia']
  const found = locationHints.find((hint) => text.toLowerCase().includes(hint.toLowerCase()))
  return found || 'Zimbabwe'
}

function extractLocalJobsFromHtml(html: string, sourceName: string, pageUrl: string): Array<{ role: string; company: string; location: string; url: string }> {
  const matches = Array.from(html.matchAll(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis))
  const jobs: Array<{ role: string; company: string; location: string; url: string }> = []

  for (const match of matches) {
    const href = asText(match[1]).trim()
    const inner = cleanAnchorText(asText(match[2]))
    if (!href || !inner) continue

    const fullUrl = href.startsWith('http') ? href : new URL(href, pageUrl).toString()
    if (!isSafeHttpUrl(fullUrl)) continue

    const lowerHref = fullUrl.toLowerCase()
    const lowerText = inner.toLowerCase()
    const isLikelyJobListing =
      lowerHref.includes('job') ||
      lowerHref.includes('career') ||
      lowerHref.includes('vacancy') ||
      lowerHref.includes('opportunity') ||
      lowerText.includes('apply') ||
      lowerText.includes('job') ||
      lowerText.includes('vacancy') ||
      lowerText.includes('career')

    if (!isLikelyJobListing) continue

    const roleCandidates = [
      'software developer',
      'software engineer',
      'frontend developer',
      'backend developer',
      'full stack developer',
      'data analyst',
      'it support',
      'technical support',
      'devops engineer',
      'systems analyst',
      'network engineer',
      'python developer',
      'javascript developer',
      'react developer',
      'information technology',
    ]

    const matchingRole = roleCandidates.find((candidate) => lowerText.includes(candidate))
    if (!matchingRole) continue

    const company = normalizeCompanyName(
      inner.split(/[-|–]|\s{2,}/).find((part) => !/software|developer|engineer|support|frontend|backend|full stack|it|data|analyst|react|python|javascript|vacancy|job|career|apply/i.test(part)) || sourceName,
    )

    jobs.push({
      role: matchingRole.charAt(0).toUpperCase() + matchingRole.slice(1),
      company,
      location: pickLocationFromText(inner),
      url: fullUrl,
    })
  }

  return jobs
}

async function fetchLocalZimbabweJobs(): Promise<NormalizedJob[]> {
  const seenUrls = new Set<string>()
  const jobs: NormalizedJob[] = []

  for (const site of LOCAL_JOB_SITES) {
    for (const url of site.urls) {
      try {
        const response = await fetch(url, {
          headers: {
            Accept: 'text/html,application/xhtml+xml',
            'User-Agent': 'CareerPilot/1.0 local-job-crawler',
          },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })

        if (!response.ok) continue

        const html = await response.text()
        const extracted = extractLocalJobsFromHtml(html, site.name, url)

        for (const listing of extracted) {
          if (seenUrls.has(listing.url)) continue
          seenUrls.add(listing.url)

          const roleText = listing.role
          const baseDescription = `${roleText} role in ${listing.location}`
          const score = getRelevance(roleText, baseDescription, listing.location, 'zimbabwe')
          if (!score) continue

          jobs.push({
            id: buildId(listing.company, roleText, jobs.length + 1, site.name),
            company: listing.company,
            role: roleText,
            location: listing.location,
            type: /remote/i.test(listing.location) ? 'Remote' : 'On-site / Hybrid',
            match: score,
            color: ['bg-orange-500', 'bg-sky-500', 'bg-red-500', 'bg-emerald-500'][jobs.length % 4],
            initials: listing.company.slice(0, 1).toUpperCase(),
            url: listing.url,
            source: site.name,
            postedAt: null,
          })
        }
      } catch {
        continue
      }
    }
  }

  return jobs
}

async function fetchArbeitnowJobs(): Promise<NormalizedJob[]> {
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

    if (!response.ok) return []

    const payload: unknown = await response.json()
    if (!payload || typeof payload !== 'object' || !('data' in payload) || !Array.isArray(payload.data)) {
      return []
    }

    return (payload.data as FeedJob[])
      .map((job, index) => normalizeArbeitnowJob(job, index))
      .filter((job): job is NonNullable<typeof job> => job !== null)
  } finally {
    clearTimeout(timeout)
  }
}

export async function GET() {
  try {
    const [arbeitnowJobs, localJobs] = await Promise.all([
      fetchArbeitnowJobs(),
      fetchLocalZimbabweJobs(),
    ])

    const merged = [...arbeitnowJobs, ...localJobs]
      .sort((a, b) => b.match - a.match)
      .slice(0, MAX_JOBS)

    return NextResponse.json(
      {
        jobs: merged,
        source: 'mixed',
        fetchedAt: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' } },
    )
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError'
    return NextResponse.json(
      { error: timedOut ? 'The job feed took too long to respond. Please try again.' : 'Unable to reach the job feed right now.' },
      { status: 502 },
    )
  }
}


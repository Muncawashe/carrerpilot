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

const DEFAULT_LOCAL_SOURCES = [
  'CareersPortal|https://www.careersportal.co.zw/search?search=software',
  'CareersPortal|https://www.careersportal.co.zw/search?search=developer',
  'CareersPortal|https://www.careersportal.co.zw/search?search=it',
  'ZimJobs|https://www.zimjobs.co.zw/?s=software',
  'ZimJobs|https://www.zimjobs.co.zw/?s=developer',
  'ZimJobs|https://www.zimjobs.co.zw/?s=it',
  'JobsInZimbabwe|https://www.jobsinzimbabwe.co.zw/?s=software',
  'JobsInZimbabwe|https://www.jobsinzimbabwe.co.zw/?s=developer',
  'JobsInZimbabwe|https://www.jobsinzimbabwe.co.zw/?s=it',
  'VacancyMail|https://www.vacancymail.co.zw/?s=software',
  'VacancyMail|https://www.vacancymail.co.zw/?s=developer',
  'VacancyMail|https://www.vacancymail.co.zw/?s=it',
  'VacancyBox|https://www.vacancybox.co.zw/?s=software',
  'VacancyBox|https://www.vacancybox.co.zw/?s=developer',
  'VacancyBox|https://www.vacancybox.co.zw/?s=it',
].join(',')

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

type LocalDebugStatus = {
  source: string
  url: string
  ok: boolean
  items: number
  error?: string
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

function buildLocalId(company: string, role: string, source: string, index: number) {
  return `${source}-${company}-${role}-${index}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function parseSources(raw = ''): Array<{ name: string; url: string }> {
  const values = raw || DEFAULT_LOCAL_SOURCES
  return values
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const [name, ...rest] = part.includes('|') ? part.split('|') : []
      const url = rest.length ? rest.join('|').trim() : part.trim()
      if (!/^https?:\/\//.test(url)) return []
      const resolvedName = (name || new URL(url).hostname.replace(/^www\./, '')).trim()
      if (!resolvedName) return []
      return [{ name: resolvedName, url }]
    })
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractJobLinksFromHtml(html: string, baseUrl: string): Array<{ url: string; text: string }> {
  const matches = Array.from(html.matchAll(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi))
  const seen = new Set<string>()
  const links: Array<{ url: string; text: string }> = []

  for (const match of matches) {
    const href = asText(match[1]).trim()
    const text = stripHtml(asText(match[2]).trim())
    if (!href || !text) continue

    const url = href.startsWith('http') ? href : new URL(href, baseUrl).toString()
    if (!isSafeHttpUrl(url)) continue

    const combo = `${url} ${text}`.toLowerCase()
    const isJobish = /job|career|vacancy|opportunity|apply|recruit|employment/.test(combo)
    if (!isJobish) continue

    if (seen.has(url)) continue
    seen.add(url)
    links.push({ url, text })
  }

  return links
}

function inferRole(text: string): string {
  const normalized = text.toLowerCase()
  const options = [
    'software developer',
    'software engineer',
    'frontend developer',
    'backend developer',
    'full stack developer',
    'data analyst',
    'systems administrator',
    'system administrator',
    'network engineer',
    'it officer',
    'it support',
    'technical support',
    'web developer',
    'developer',
    'programmer',
    'ict',
    'helpdesk',
    'help desk',
  ]

  const match = options.find((candidate) => normalized.includes(candidate))
  if (!match) return 'IT Opportunity'
  return match.charAt(0).toUpperCase() + match.slice(1)
}

function inferCompany(text: string, fallback: string): string {
  const clean = stripHtml(text).replace(/\s+/g, ' ').trim()
  if (!clean) return fallback
  const trimmed = clean.replace(/\s*[-|–:]\s*.*$/, '').trim()
  return trimmed || fallback
}

function getRelevanceForLocal(title: string, description: string, location: string, tags: string): number {
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

async function fetchLocalSourcePage(source: { name: string; url: string }, signal: AbortSignal): Promise<Array<{ role: string; company: string; location: string; url: string }>> {
  const response = await fetch(source.url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml,text/xml',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: 'https://www.google.com/',
    },
    signal,
    next: { revalidate: 900 },
  })

  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  const html = await response.text()
  const links = extractJobLinksFromHtml(html, source.url)
  const results: Array<{ role: string; company: string; location: string; url: string }> = []

  for (const link of links.slice(0, 30)) {
    const roleText = inferRole(link.text)
    const companyText = inferCompany(link.text, source.name)
    const searchableText = `${link.text} ${roleText} ${companyText}`.toLowerCase()
    const isTech = ROLE_TERMS.some((term) => searchableText.includes(term)) || /(software|developer|it|support|network|systems|data|web|programmer)/.test(searchableText)
    if (!isTech) continue

    results.push({
      role: roleText,
      company: companyText,
      location: 'Zimbabwe',
      url: link.url,
    })
  }

  return results
}

async function crawlLocalJobs(signal?: AbortSignal) {
  const sources = parseSources(process.env.LOCAL_JOB_FEEDS || DEFAULT_LOCAL_SOURCES)
  const results = await Promise.allSettled(
    sources.map((source) => fetchLocalSourcePage(source, signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS))),
  )

  const status: LocalDebugStatus[] = results.map((result, index) => ({
    source: sources[index].name,
    url: sources[index].url,
    ok: result.status === 'fulfilled',
    items: result.status === 'fulfilled' ? result.value.length : 0,
    error: result.status === 'rejected' ? String(result.reason instanceof Error ? result.reason.message : result.reason) : undefined,
  }))

  const jobs: NormalizedJob[] = []
  const seenUrls = new Set<string>()

  results.forEach((result, sourceIndex) => {
    if (result.status !== 'fulfilled') return

    result.value.forEach((listing, itemIndex) => {
      if (seenUrls.has(listing.url)) return
      seenUrls.add(listing.url)

      const title = listing.role
      const description = `${title} opportunity in Zimbabwe.`
      const score = getRelevanceForLocal(title, description, listing.location, 'zimbabwe')
      if (!score) return

      jobs.push({
        id: buildLocalId(listing.company, title, sources[sourceIndex].name, itemIndex),
        company: listing.company,
        role: title,
        location: listing.location,
        type: 'On-site / Hybrid',
        match: score,
        color: ['bg-orange-500', 'bg-sky-500', 'bg-red-500', 'bg-emerald-500'][jobs.length % 4],
        initials: listing.company.slice(0, 1).toUpperCase(),
        url: listing.url,
        source: sources[sourceIndex].name,
        postedAt: null,
      })
    })
  })

  return { jobs, status }
}

function getRelevance(job: FeedJob): number {
  const title = asText(job.title).toLowerCase()
  const description = asText(job.description).toLowerCase()
  const location = asText(job.location).toLowerCase()
  const tags = Array.isArray(job.tags)
    ? job.tags.filter((tag): tag is string => typeof tag === 'string').join(' ').toLowerCase()
    : ''
  const roleMatches = ROLE_TERMS.filter((term) => title.includes(term) || tags.includes(term))
  const locationMatches = TARGET_COUNTRIES.some((country) => location.includes(country))
  const explicitlyRemote = Boolean(job.remote) && /\b(worldwide|africa|anywhere|global|emea|remote)\b/i.test(`${location} ${description}`)

  if (roleMatches.length === 0 || (!locationMatches && !explicitlyRemote)) return 0

  let score = 68
  if (roleMatches.some((term) => title.includes(term))) score += 12
  if (locationMatches) score += 10
  if (explicitlyRemote) score += 5
  if (title.includes('senior') || title.includes('lead') || title.includes('principal')) score -= 5
  if (title.includes('intern') || title.includes('graduate') || title.includes('junior') || title.includes('entry level')) score += 5
  return Math.max(55, Math.min(98, score))
}

function normalizeInternationalJob(job: FeedJob, index: number): NormalizedJob | null {
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
    if (!payload || typeof payload !== 'object' || !('data' in payload) || !Array.isArray((payload as { data: unknown }).data)) {
      return []
    }

    return ((payload as { data: FeedJob[] }).data)
      .map((job, index) => normalizeInternationalJob(job, index))
      .filter((job): job is NonNullable<typeof job> => job !== null)
  } finally {
    clearTimeout(timeout)
  }
}

export async function GET(request: Request) {
  const debug = new URL(request.url).searchParams.get('debug') === '1'

  try {
    const [internationalJobs, localInfo] = await Promise.all([
      fetchArbeitnowJobs(),
      crawlLocalJobs(),
    ])

    const jobs = [...localInfo.jobs, ...internationalJobs]
      .sort((a, b) => b.match - a.match)
      .slice(0, MAX_JOBS)

    const payload = {
      jobs,
      source: 'Zimbabwe + Arbeitnow',
      localMatches: localInfo.jobs.length,
      localSources: localInfo.status,
      fetchedAt: new Date().toISOString(),
    }

    if (debug) {
      return NextResponse.json(payload)
    }

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' },
    })
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError'
    return NextResponse.json(
      { error: timedOut ? 'The job feed took too long to respond. Please try again.' : 'Unable to reach the job feed right now.' },
      { status: 502 },
    )
  }
}

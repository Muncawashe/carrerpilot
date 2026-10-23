export type LocalSource = { name: string; url: string }
export type LocalJob = {
  id: string
  company: string
  role: string
  location: string
  url: string
  description: string
  postedAt: string | null
  source: string
  applyEmail: string | null
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i

export function parseSources(raw = ''): LocalSource[] {
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const [name, ...rest] = part.includes('|') ? part.split('|') : []
      const url = rest.length ? rest.join('|').trim() : part.trim()
      if (!/^https?:\/\//.test(url)) return []

      const parsedName = (name ?? new URL(url).hostname.replace(/^www\./, '')).trim()
      if (!parsedName) return []
      return [{ name: parsedName, url }]
    })
}

function decode(text: string) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#8211;|&#8212;/g, '-')
    .replace(/&#8217;|&#039;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

const strip = (html: string) => decode(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

function extractLinks(html: string) {
  const links = [...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
  return links
    .map((match) => ({ href: match[1], text: strip(match[2] || '') }))
    .filter(({ href }) => /^https?:\/\//i.test(href))
}

function inferRole(text: string) {
  const normalized = text.toLowerCase()
  const candidates = [
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

  const found = candidates.find((candidate) => normalized.includes(candidate))
  return found ? found.charAt(0).toUpperCase() + found.slice(1) : 'IT Opportunity'
}

function inferCompany(text: string, fallback: string) {
  const value = strip(text)
  if (!value) return fallback
  return value.replace(/\s*[-|–:]\s*.*$/, '').trim() || fallback
}

export async function fetchSource(source: LocalSource, signal: AbortSignal): Promise<LocalJob[]> {
  const res = await fetch(source.url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml,text/xml',
      'User-Agent': 'CareerPilot/1.0 job-discovery',
    },
    signal,
    next: { revalidate: 900 },
  })

  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const html = await res.text()
  const links = extractLinks(html)
  if (!links.length) throw new Error('No job links found in HTML')

  const seen = new Set<string>()
  const items: LocalJob[] = []

  for (const link of links.slice(0, 40)) {
    const href = link.href
    const text = link.text || source.name
    if (!href || seen.has(href)) continue
    seen.add(href)

    const lower = `${href} ${text}`.toLowerCase()
    const isJobish = /job|career|vacancy|opportunity|apply|recruit|employment/.test(lower)
    if (!isJobish) continue

    const role = inferRole(text)
    const company = inferCompany(text, source.name)
    const description = `${role} opportunity in Zimbabwe.`

    items.push({
      id: `${source.name}-${href}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 120),
      company,
      role,
      location: 'Zimbabwe',
      url: href,
      description,
      postedAt: null,
      source: source.name,
      applyEmail: description.match(EMAIL_RE)?.[0] ?? null,
    })
  }

  return items
}

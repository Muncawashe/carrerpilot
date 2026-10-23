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

function tag(block: string, name: string) {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'))
  return match ? match[1] : ''
}

function splitTitle(title: string, fallback: string) {
  const match = title.match(/^(.*?)\s+(?:at|@|-|–|\|)\s+(.+)$/i)
  return match ? { role: match[1].trim(), company: match[2].trim() } : { role: title, company: fallback }
}

export async function fetchSource(source: LocalSource, signal: AbortSignal): Promise<LocalJob[]> {
  const res = await fetch(source.url, {
    headers: {
      Accept: 'application/rss+xml, application/xml, text/xml',
      'User-Agent': 'CareerPilot/1.0 job-discovery',
    },
    signal,
    next: { revalidate: 900 },
  })

  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const xml = await res.text()
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || []
  if (!blocks.length) throw new Error('No items found (not an RSS/Atom feed?)')

  return blocks.slice(0, 40).flatMap((block, index) => {
    const title = strip(tag(block, 'title'))
    const link = strip(tag(block, 'link')) || (block.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? '')
    if (!title || !/^https?:\/\//.test(link)) return []

    const description = strip(
      tag(block, 'content:encoded') || tag(block, 'description') || tag(block, 'summary') || tag(block, 'content'),
    ).slice(0, 4000)

    const { role, company } = splitTitle(title, source.name)
    const date = new Date(strip(tag(block, 'pubDate') || tag(block, 'updated') || tag(block, 'published')))

    return [{
      id: `${source.name}-${index}-${link}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 120),
      company,
      role,
      location: 'Zimbabwe',
      url: link,
      description,
      postedAt: Number.isNaN(date.getTime()) ? null : date.toISOString(),
      source: source.name,
      applyEmail: description.match(EMAIL_RE)?.[0] ?? null,
    }]
  })
}

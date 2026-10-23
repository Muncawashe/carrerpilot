'use client'

import { useEffect, useState } from 'react'
import {
  BriefcaseBusiness,
  ChevronDown,
  FileText,
  Filter,
  Mail,
  LayoutDashboard,
  MapPin,
  Search,
  Send,
  Settings2,
  X,
  Save,
  Sparkles,
  UserRound,
} from 'lucide-react'

type CandidateProfile = {
  name: string
  email: string
  phone: string
  location: string
  headline: string
  education: string
  skills: string
  experience: string
  cvName: string
}

type SentRecord = { id: string; role: string; company: string; to: string; sentAt: string }
type SavedDraft = { id: string; role: string; company: string; url: string; subject: string; body: string; savedAt: string }

const defaultProfile: CandidateProfile = {
  name: 'Tinotenda Chivhera', email: '', phone: '', location: 'Harare, Zimbabwe',
  headline: 'Computer Science graduate | Software Developer | IT & Application Support',
  education: 'Computer Science degree',
  skills: 'Software development, Python, JavaScript, TypeScript, React, Next.js, Django, REST APIs, SQL Server, databases, technical support, systems analysis, AWS, Docker, troubleshooting, AI/ML',
  experience: 'Imaging Solutions Pvt Ltd — client-facing technical support for enterprise Sybrin systems; remote and on-site troubleshooting; ticketing and SLA tracking with Sybrin Resolve Radar; hardware/software support, user provisioning, configuration, server and AWS EC2 checks, email DNS troubleshooting, monitoring and VoIP. Freelance web application development and graphic design for local clients.',
  cvName: '',
}

type Job = {
  id: string
  company: string
  role: string
  location: string
  type: string
  match: number
  color: string
  initials: string
  url: string
}

const nav: { label: string; icon: typeof Search; count?: string }[] = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Job matches', icon: Search },
  { label: 'Applications', icon: Send },
  { label: 'Drafts', icon: FileText },
]

export default function Page() {
  const [active, setActive] = useState('Overview')
  const [scanning, setScanning] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [remoteOnly, setRemoteOnly] = useState(false)
  const [message, setMessage] = useState('')
  const [remember, setRemember] = useState(true)
  const [jobs, setJobs] = useState<Job[]>([])
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [feedError, setFeedError] = useState('')
  const [lastFetched, setLastFetched] = useState('')
  const [today, setToday] = useState('')
  const [profile, setProfile] = useState<CandidateProfile>(defaultProfile)
  const [profileEditorOpen, setProfileEditorOpen] = useState(false)
  const [drafts, setDrafts] = useState<SavedDraft[]>([])
  const [notice, setNotice] = useState('')
  const [config, setConfig] = useState({ smtpConfigured: false, accessKeyConfigured: false, defaultCv: false })
  const [sent, setSent] = useState<SentRecord[]>([])
  const [recipient, setRecipient] = useState('')
  const [accessKey, setAccessKey] = useState('')
  const [cvFile, setCvFile] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')

  async function scanJobs() {
    setScanning(true)
    setFeedError('')
    try {
      const response = await fetch('/api/jobs', { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error)
      setJobs(payload.jobs)
      setLastFetched(payload.fetchedAt)
    } catch (error) {
      setFeedError(error instanceof Error ? error.message : 'Unable to load jobs.')
    } finally {
      setScanning(false)
    }
  }

  useEffect(() => {
    setToday(new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(new Date()))
    try {
      const savedProfile = localStorage.getItem('careerpilot-profile')
      if (savedProfile) setProfile({ ...defaultProfile, ...JSON.parse(savedProfile) })
      const savedDrafts = localStorage.getItem('careerpilot-drafts')
      if (savedDrafts) setDrafts(JSON.parse(savedDrafts))
      const savedSent = localStorage.getItem('careerpilot-sent')
      if (savedSent) setSent(JSON.parse(savedSent))
      setAccessKey(localStorage.getItem('careerpilot-key') || '')
    } catch { /* Ignore invalid local browser data and use defaults. */ }
    void scanJobs()
    fetch('/api/apply').then((r) => r.json()).then(setConfig).catch(() => {})
  }, [])

  function saveProfile() {
    localStorage.setItem('careerpilot-profile', JSON.stringify(profile))
    setProfileEditorOpen(false)
    setNotice('Your profile was saved in this browser.')
    window.setTimeout(() => setNotice(''), 3500)
  }

  useEffect(() => {
    if (selectedJob) { setMessage(buildBody(selectedJob)); setSendError('') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJob])

  const filtered = jobs.filter((j) => (!remoteOnly || j.type === 'Remote') && `${j.role} ${j.company} ${j.location}`.toLowerCase().includes(query.trim().toLowerCase()))
  const visibleJobs = active === 'Overview' ? filtered.slice(0, 6) : filtered
  const checklist = [
    { label: 'Email address added', done: Boolean(profile.email.trim()) },
    { label: 'Phone number added', done: Boolean(profile.phone.trim()) },
    { label: 'CV ready to attach', done: config.defaultCv },
    { label: 'Email sending connected', done: config.smtpConfigured },
  ]
  const percent = Math.round((checklist.filter((c) => c.done).length / checklist.length) * 100)

  function buildBody(job: Job) {
    return `Dear ${job.company} Hiring Team,\n\nI am writing to apply for the ${job.role} position. I am a Computer Science graduate based in ${profile.location}, with experience in software development and enterprise technical support.\n\nAt Imaging Solutions Pvt Ltd, I supported enterprise users and Sybrin systems, investigated technical issues, tracked incidents against service-level expectations, and assisted with application, infrastructure, and configuration tasks. I also build web applications for local clients. My skills include ${profile.skills.split(',').slice(0, 7).join(', ')}.\n\nI would welcome the opportunity to discuss how my background could contribute to your team. My CV is attached.\n\nKind regards,\n${profile.name}${profile.email ? `\n${profile.email}` : ''}${profile.phone ? `\n${profile.phone}` : ''}`
  }

  async function sendApplication(job: Job) {
    setSending(true)
    setSendError('')
    try {
      let cv: { name: string; base64: string } | undefined
      if (cvFile) {
        const bytes = new Uint8Array(await cvFile.arrayBuffer())
        let binary = ''
        bytes.forEach((b) => { binary += String.fromCharCode(b) })
        cv = { name: cvFile.name, base64: btoa(binary) }
      }
      const response = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-access-key': accessKey },
        body: JSON.stringify({ to: recipient, subject: `Application for ${job.role} — ${job.company}`, body: message, cv }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Send failed.')
      if (remember) localStorage.setItem('careerpilot-key', accessKey)
      else localStorage.removeItem('careerpilot-key')
      const record: SentRecord = { id: job.id, role: job.role, company: job.company, to: recipient, sentAt: new Date().toISOString() }
      const updated = [record, ...sent]
      setSent(updated)
      localStorage.setItem('careerpilot-sent', JSON.stringify(updated))
      setSelectedJob(null)
      setRecipient('')
      setNotice(`Application emailed to ${record.to}.`)
      window.setTimeout(() => setNotice(''), 4000)
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Send failed.')
    } finally {
      setSending(false)
    }
  }

  function saveDraft(job: Job) {
    const draft: SavedDraft = {
      id: job.id, role: job.role, company: job.company, url: job.url,
      subject: `Application for ${job.role} — ${job.company}`,
      body: message,
      savedAt: new Date().toISOString(),
    }
    const updated = [draft, ...drafts.filter((item) => item.id !== draft.id)]
    setDrafts(updated)
    localStorage.setItem('careerpilot-drafts', JSON.stringify(updated))
    setSelectedJob(null)
    setNotice('Application draft saved. Review and personalise it before sending.')
    window.setTimeout(() => setNotice(''), 4000)
  }

  return (
    <main className="min-h-screen bg-[#f7f8fa] text-[#17202b]">
      <div className="flex min-h-screen">
        <aside className="hidden w-[228px] shrink-0 border-r border-[#e6e9ed] bg-white px-4 py-6 lg:flex lg:flex-col">
          <div className="mb-10 flex items-center gap-3 px-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1f7a68] text-white shadow-sm"><BriefcaseBusiness size={19} /></div>
            <span className="text-[17px] font-semibold tracking-[-0.02em]">CareerPilot</span>
          </div>
          <nav className="space-y-1">
            {nav.map(({ label, icon: Icon, count }) => (
              <button key={label} onClick={() => setActive(label)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm transition ${active === label ? 'bg-[#eaf5f2] font-semibold text-[#166455]' : 'text-[#6b7580] hover:bg-[#f4f6f7]'}`}>
                <span className="flex items-center gap-3"><Icon size={17} strokeWidth={active === label ? 2.3 : 1.8} />{label}</span>
                {count && <span className={`rounded-full px-2 py-0.5 text-[11px] ${active === label ? 'bg-white text-[#166455]' : 'bg-[#f0f2f4] text-[#89919a]'}`}>{count}</span>}
              </button>
            ))}
          </nav>
          <div className="mt-8 border-t border-[#edf0f2] pt-5">
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9ba3ab]">Workspace</p>
            <button onClick={() => setProfileEditorOpen(true)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-[#6b7580] hover:bg-[#f4f6f7]"><UserRound size={17} /> My profile</button>
            <button onClick={() => setProfileEditorOpen(true)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-[#6b7580] hover:bg-[#f4f6f7]"><Settings2 size={17} /> Settings</button>
          </div>
          <div className="mt-auto rounded-xl bg-[#f4f8f7] p-4">
            <p className="text-sm font-semibold">Setup {percent}% complete</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#dcebe7]"><div className="h-full bg-[#1f7a68] transition-all" style={{ width: `${percent}%` }} /></div>
            <ul className="mt-3 space-y-1.5">{checklist.map((c) => <li key={c.label} className={`flex items-center gap-2 text-xs ${c.done ? 'text-[#1f7a68]' : 'text-[#78838c]'}`}><span aria-hidden="true">{c.done ? '✓' : '○'}</span>{c.label}</li>)}</ul>
            {percent < 100 && <button onClick={() => setProfileEditorOpen(true)} className="mt-3 text-xs font-semibold text-[#1f7a68]">Complete profile <span aria-hidden="true">→</span></button>}
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="flex h-[72px] items-center justify-between border-b border-[#e6e9ed] bg-white px-5 sm:px-8">
            <div className="lg:hidden flex items-center gap-2 font-semibold"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1f7a68] text-white"><BriefcaseBusiness size={16} /></div>CareerPilot</div>
            <div className="hidden text-sm text-[#7c8690] sm:block">{today || 'Your job search workspace'}</div>
            <div className="ml-auto flex items-center gap-3 sm:gap-4">
              <div className="relative">
                <button onClick={() => setProfileOpen(!profileOpen)} className="flex items-center gap-2 border-l border-[#e7eaed] pl-4"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#d7ebe7] text-xs font-semibold text-[#236b5d]">{profile.name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</div><ChevronDown size={14} className="text-[#9aa2a9]" /></button>
                {profileOpen && <div className="absolute right-0 top-11 z-10 w-40 rounded-xl border border-[#e5e9eb] bg-white p-2 shadow-xl"><button onClick={() => { setProfileEditorOpen(true); setProfileOpen(false) }} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#f3f6f5]">Edit my profile</button></div>}
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-[1250px] px-5 py-7 sm:px-8 lg:px-10">
            <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div><p className="mb-2 text-sm font-medium text-[#1f7a68]">{active === 'Overview' ? `Welcome back, ${profile.name.split(' ')[0]}` : active}</p><h1 className="text-[28px] font-semibold tracking-[-0.035em] text-[#17202b] sm:text-[32px]">{active === 'Applications' ? 'Applications you have sent.' : 'Review, then apply with one click.'}</h1><p className="mt-2 text-sm text-[#7b858e]">Nothing is emailed until you review the message and press Send.</p></div>
              <button onClick={scanJobs} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#1f7a68] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#176454]">{scanning ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />Scanning...</> : <><Search size={16} />Scan for new jobs</>}</button>
            </div>

            {active === 'Overview' && <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[[String(jobs.length),'New matches',lastFetched ? `Live feed · ${new Date(lastFetched).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Loading live feed', 'text-[#1f7a68]'],[String(sent.length),'Applications sent',config.smtpConfigured ? 'Sent from your mailbox' : 'Add SMTP settings to enable', 'text-[#3d6da8]'],[String(drafts.length),'Saved drafts','Stored in this browser', 'text-[#b26e3e]'],['—','Action needed','No pending actions tracked', 'text-[#bd5f5f]']].map(([value,label,detail,color]) => <div key={label} className="rounded-xl border border-[#e5e9ed] bg-white p-5"><p className={`text-[29px] font-semibold tracking-[-0.04em] ${color}`}>{value}</p><p className="mt-1 text-sm font-semibold text-[#27313b]">{label}</p><p className="mt-1 text-xs text-[#8b949d]">{detail}</p></div>)}
            </div>}

            <div className={`grid gap-6 ${active === 'Overview' ? 'xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]' : ''}`}>
              {active !== 'Applications' && <div className="rounded-xl border border-[#e5e9ed] bg-white">
                <div className="flex flex-col gap-3 border-b border-[#edf0f2] px-5 py-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">Top job matches</h2><p className="mt-1 text-xs text-[#8b949d]">Ranked by your skills, experience, and preferences</p></div><div className="flex flex-wrap items-center gap-2"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search role, company, place" aria-label="Search jobs" className="h-9 w-48 rounded-lg border border-[#e1e6e9] px-3 text-xs outline-none focus:border-[#1f7a68]" /><button onClick={() => setRemoteOnly(!remoteOnly)} aria-pressed={remoteOnly} className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold ${remoteOnly ? 'border-[#1f7a68] bg-[#eaf5f2] text-[#1f7a68]' : 'border-[#e1e6e9] text-[#5d6872] hover:bg-[#f7f9f9]'}`}><Filter size={14} /> Remote only</button></div></div>
                <div className="divide-y divide-[#edf0f2]">{feedError ? <div className="px-5 py-10 text-center"><p className="text-sm font-semibold text-[#bd5f5f]">Could not load live jobs</p><p className="mt-1 text-xs text-[#8b949d]">{feedError}</p><button onClick={scanJobs} className="mt-4 rounded-lg border border-[#dfe5e7] px-3 py-2 text-xs font-semibold text-[#1f7a68]">Try again</button></div> : filtered.length === 0 ? <div className="px-5 py-10 text-center"><p className="text-sm font-semibold text-[#27313b]">No matching jobs</p><p className="mt-1 text-xs text-[#8b949d]">Try clearing the search or the Remote filter, or scan again later.</p></div> : visibleJobs.map((job) => <button key={job.id} onClick={() => setSelectedJob(job)} className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-[#fbfcfc]"><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${job.color} text-sm font-bold text-white`}>{job.initials}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-semibold text-[#27313b]">{job.role}</h3><span className="rounded-full bg-[#eaf5f2] px-2 py-0.5 text-[10px] font-semibold text-[#1f7a68]">{job.match}% match</span></div><p className="mt-1 text-xs text-[#7f8992]">{job.company} <span className="mx-1 text-[#c4cbd0]">·</span> <MapPin size={12} className="-mt-0.5 inline" /> {job.location}</p></div><span className="hidden rounded-md bg-[#f5f6f7] px-2 py-1 text-[10px] font-medium text-[#7e8891] sm:block">{job.type}</span><span aria-hidden="true" className="shrink-0 text-[#a0a8ae]">›</span></button>)}</div>
                {active === 'Overview' && filtered.length > 6 && <div className="border-t border-[#edf0f2] px-5 py-3"><button onClick={() => setActive('Job matches')} className="text-xs font-semibold text-[#1f7a68]">View all {filtered.length} matches <span aria-hidden="true">→</span></button></div>}
              </div>}

              {active !== 'Job matches' && <div className="rounded-xl border border-[#e5e9ed] bg-white p-5"><div className="mb-5 flex items-start justify-between"><div><h2 className="font-semibold">Application activity</h2><p className="mt-1 text-xs text-[#8b949d]">Applications you have emailed</p></div></div><div className="min-h-[118px] divide-y divide-[#edf0f2] rounded-lg border border-[#e5e9ed]">{sent.length ? (active === 'Applications' ? sent : sent.slice(0, 5)).map((item) => <div key={item.id + item.sentAt} className="px-3 py-2.5"><p className="truncate text-sm font-semibold text-[#27313b]">{item.role}</p><p className="truncate text-xs text-[#8b949d]">{item.company} · {item.to} · {new Date(item.sentAt).toLocaleDateString()}</p></div>) : <p className="px-4 py-10 text-center text-xs text-[#89939b]">No applications sent yet.</p>}</div><div className="mt-5 flex items-center justify-between"><div><p className="text-2xl font-semibold">{drafts.length}</p><p className="mt-1 text-xs text-[#89939b]">Saved drafts</p></div><button onClick={() => setActive('Drafts')} className="text-xs font-semibold text-[#1f7a68]">View drafts →</button></div></div>}
            </div>

            {active === 'Overview' && <div className="mt-6 flex flex-col gap-4 rounded-xl border border-[#e5e9ed] bg-white p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#eaf5f2] text-[#1f7a68]"><Mail size={16} /></div><div><p className="text-sm font-semibold text-[#27313b]">{config.smtpConfigured ? 'Email applications are connected' : 'Email applications are not connected'}</p><p className="mt-1 text-xs text-[#7b858e]">{config.smtpConfigured ? 'Open a match, enter the employer\'s application email and send with your CV.' : 'Set SMTP_USER and SMTP_PASS in your environment variables (see .env.example).'}</p></div></div></div>}
          </div>
          <div className="flex items-center justify-between border-t border-[#e6e9ed] px-5 py-5 text-[11px] text-[#9aa2a9] sm:px-10"><span>CareerPilot · Built for your next opportunity</span><span className="hidden sm:block">{config.smtpConfigured ? 'Email sending connected' : 'Email sending not connected'}</span></div>

          {selectedJob && <div className="fixed inset-0 z-20 flex items-end justify-center bg-[#17202b]/30 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={`${selectedJob.role} application draft`} onClick={() => setSelectedJob(null)}>
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-[#e5e9ed] bg-white p-5 shadow-2xl sm:rounded-2xl sm:p-7" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1f7a68]">Ready for your review</p><h2 className="mt-2 text-xl font-semibold text-[#17202b]">{selectedJob.role}</h2><p className="mt-1 text-sm text-[#7f8992]">{selectedJob.company} · {selectedJob.location}</p></div><button onClick={() => setSelectedJob(null)} aria-label="Close application preview" className="rounded-lg px-2 py-1 text-xl text-[#8a959d] hover:bg-[#f4f6f7]">×</button></div>
              <div className="mt-6 space-y-4"><div><label className="text-xs font-semibold text-[#63707a]">Subject</label><div className="mt-1 rounded-lg border border-[#e4e8ea] bg-[#fafbfb] px-3 py-2.5 text-sm text-[#27313b]">Application for {selectedJob.role} — {selectedJob.company}</div></div><div><label className="text-xs font-semibold text-[#63707a]">Message (edit freely)</label><textarea rows={11} value={message} onChange={(e) => setMessage(e.target.value)} className="mt-1 block w-full rounded-lg border border-[#e4e8ea] bg-[#fafbfb] p-3 text-sm leading-6 text-[#4f5b64] outline-none focus:border-[#1f7a68]" /></div><div className="flex items-center gap-3 rounded-lg border border-[#e4e8ea] bg-[#f7faf9] p-3 text-xs text-[#617078]"><FileText size={16} className="text-[#1f7a68]" /><span>{cvFile ? `Attaching ${cvFile.name}` : config.defaultCv ? 'Your default CV will be attached.' : 'No default CV on the server. Choose a file below.'}</span></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-[#63707a] sm:col-span-2">Employer application email (check the listing)<input type="email" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="jobs@company.com" className="mt-1 block w-full rounded-lg border border-[#dfe5e7] px-3 py-2.5 text-sm font-normal outline-none focus:border-[#1f7a68]" /></label>
                <label className="text-xs font-semibold text-[#63707a]">Access key<input type="password" value={accessKey} onChange={(e) => setAccessKey(e.target.value)} className="mt-1 block w-full rounded-lg border border-[#dfe5e7] px-3 py-2.5 text-sm font-normal outline-none focus:border-[#1f7a68]" /><span className="mt-1.5 flex items-center gap-1.5 font-normal"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember on this device</span></label>
                <label className="text-xs font-semibold text-[#63707a]">Replace CV (optional)<input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setCvFile(e.target.files?.[0] || null)} className="mt-1 block w-full text-xs font-normal" /></label>
              </div>
              {(() => { const missing = [!config.smtpConfigured && 'SMTP settings on the server', !recipient && 'the employer email', !accessKey && 'your access key', !cvFile && !config.defaultCv && 'a CV', !message.trim() && 'a message'].filter(Boolean); return missing.length > 0 ? <p className="text-xs text-[#8b949d]">To send, add: {missing.join(', ')}.</p> : null })()}
              {sendError && <p role="alert" className="text-xs font-semibold text-[#bd5f5f]">{sendError}</p>}</div>
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button onClick={() => saveDraft(selectedJob)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#dfe5e7] px-4 py-2.5 text-sm font-semibold text-[#65717a] hover:bg-[#f7f9f9]"><Save size={15} /> Save draft</button><button disabled={sending || [!config.smtpConfigured && 'SMTP settings on the server', !recipient && 'the employer email', !accessKey && 'your access key', !cvFile && !config.defaultCv && 'a CV', !message.trim() && 'a message'].filter(Boolean).length > 0} onClick={() => sendApplication(selectedJob)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#b26e3e] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#9a5d33] disabled:opacity-50"><Send size={15} /> {sending ? 'Sending...' : 'Send application'}</button><a href={selectedJob.url} target="_blank" rel="noopener noreferrer" onClick={() => setSelectedJob(null)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#1f7a68] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#176454]"><BriefcaseBusiness size={15} /> Open job listing</a></div>
            </div>
          </div>}
          {profileEditorOpen && <div className="fixed inset-0 z-30 flex items-end justify-center bg-[#17202b]/40 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Edit candidate profile">
            <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl sm:p-7">
              <div className="mb-5 flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-[#1f7a68]">Candidate profile</p><h2 className="mt-1 text-xl font-semibold">Your details for tailored applications</h2><p className="mt-1 text-sm text-[#7b858e]">Saved locally in this browser. Your email and phone are left blank because you have not provided them in this project.</p></div><button onClick={() => setProfileEditorOpen(false)} aria-label="Close profile editor"><X size={20} /></button></div>
              <div className="grid gap-4 sm:grid-cols-2">
                {([{key:'name',label:'Full name'},{key:'email',label:'Email address'},{key:'phone',label:'Phone number'},{key:'location',label:'Location'},{key:'headline',label:'Professional headline'},{key:'education',label:'Education'}] as const).map(({key,label}) => <label key={key} className="text-xs font-semibold text-[#63707a]">{label}<input value={profile[key]} onChange={(e) => setProfile({...profile,[key]:e.target.value})} className="mt-1 block w-full rounded-lg border border-[#dfe5e7] px-3 py-2.5 text-sm font-normal text-[#27313b] outline-none focus:border-[#1f7a68]" /></label>)}
                <label className="text-xs font-semibold text-[#63707a] sm:col-span-2">Technical skills<input value={profile.skills} onChange={(e) => setProfile({...profile,skills:e.target.value})} className="mt-1 block w-full rounded-lg border border-[#dfe5e7] px-3 py-2.5 text-sm font-normal text-[#27313b] outline-none focus:border-[#1f7a68]" /></label>
                <label className="text-xs font-semibold text-[#63707a] sm:col-span-2">Experience summary<textarea rows={4} value={profile.experience} onChange={(e) => setProfile({...profile,experience:e.target.value})} className="mt-1 block w-full rounded-lg border border-[#dfe5e7] px-3 py-2.5 text-sm font-normal text-[#27313b] outline-none focus:border-[#1f7a68]" /></label>
                <label className="text-xs font-semibold text-[#63707a] sm:col-span-2">CV file name (tracking only — upload is not enabled yet)<input value={profile.cvName} onChange={(e) => setProfile({...profile,cvName:e.target.value})} placeholder="e.g. Tinotenda_Chivhera_CV.pdf" className="mt-1 block w-full rounded-lg border border-[#dfe5e7] px-3 py-2.5 text-sm font-normal text-[#27313b] outline-none focus:border-[#1f7a68]" /></label>
              </div>
              <div className="mt-6 flex justify-end gap-2"><button onClick={() => setProfileEditorOpen(false)} className="rounded-lg border border-[#dfe5e7] px-4 py-2.5 text-sm font-semibold">Cancel</button><button onClick={saveProfile} className="rounded-lg bg-[#1f7a68] px-4 py-2.5 text-sm font-semibold text-white">Save profile</button></div>
            </div>
          </div>}
          {active === 'Drafts' && <div className="fixed inset-0 z-20 flex items-center justify-center bg-[#17202b]/30 p-4" role="dialog" aria-modal="true" aria-label="Saved application drafts"><div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-semibold">Saved application drafts ({drafts.length})</h2><button onClick={() => setActive('Overview')} aria-label="Close drafts"><X size={20}/></button></div>{drafts.length ? drafts.map((draft) => <div key={draft.id} className="border-t border-[#edf0f2] py-4"><p className="font-semibold">{draft.role}</p><p className="text-sm text-[#7b858e]">{draft.company} · saved {new Date(draft.savedAt).toLocaleString()}</p><div className="mt-3 flex gap-2"><button onClick={() => { navigator.clipboard.writeText(`${draft.subject}\n\n${draft.body}`); setNotice('Draft copied to clipboard.') }} className="rounded-lg border px-3 py-2 text-xs font-semibold">Copy application text</button><a href={draft.url} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-[#1f7a68] px-3 py-2 text-xs font-semibold text-white">Open vacancy</a><button onClick={() => { const updated=drafts.filter((item)=>item.id!==draft.id); setDrafts(updated); localStorage.setItem('careerpilot-drafts',JSON.stringify(updated)) }} className="rounded-lg border px-3 py-2 text-xs font-semibold text-red-600">Delete</button></div></div>) : <p className="py-8 text-sm text-[#7b858e]">No saved drafts yet. Open a job match and choose Save draft.</p>}</div></div>}
          {notice && <div role="status" className="fixed bottom-5 right-5 z-40 max-w-sm rounded-xl bg-[#17202b] px-4 py-3 text-sm text-white shadow-xl">{notice}</div>}
        </section>
      </div>
    </main>
  )
}

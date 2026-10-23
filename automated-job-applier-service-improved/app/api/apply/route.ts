import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { readFile } from 'node:fs/promises'
import { timingSafeEqual } from 'node:crypto'
import path from 'node:path'

export const runtime = 'nodejs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const MAX_CV_BYTES = 5 * 1024 * 1024
const HOURLY_LIMIT = Number(process.env.MAX_APPLICATIONS_PER_HOUR || 15)
const sentAt: number[] = []

function authorised(request: Request): boolean {
  const expected = process.env.APP_ACCESS_KEY || ''
  const given = request.headers.get('x-access-key') || ''
  if (!expected || expected.length !== given.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(given))
}

async function defaultCv() {
  const rel = process.env.CV_PATH
  if (!rel) return null
  try {
    const content = await readFile(path.join(/*turbopackIgnore: true*/ process.cwd(), rel))
    return { filename: process.env.CV_FILENAME || path.basename(rel), content }
  } catch {
    return null
  }
}

// Public, secret-free status so the UI knows what is configured.
export async function GET() {
  return NextResponse.json({
    smtpConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
    accessKeyConfigured: Boolean(process.env.APP_ACCESS_KEY),
    defaultCv: Boolean(await defaultCv()),
  })
}

export async function POST(request: Request) {
  if (!process.env.APP_ACCESS_KEY) {
    return NextResponse.json({ error: 'APP_ACCESS_KEY is not set on the server.' }, { status: 500 })
  }
  if (!authorised(request)) return NextResponse.json({ error: 'Invalid access key.' }, { status: 401 })
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return NextResponse.json({ error: 'SMTP credentials are not configured on the server.' }, { status: 500 })
  }

  const now = Date.now()
  while (sentAt.length && now - sentAt[0] > 3_600_000) sentAt.shift()
  if (sentAt.length >= HOURLY_LIMIT) {
    return NextResponse.json({ error: 'Hourly send limit reached. Try again later.' }, { status: 429 })
  }

  let data: { to?: unknown; subject?: unknown; body?: unknown; cv?: { name?: unknown; base64?: unknown } }
  try {
    data = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const to = typeof data.to === 'string' ? data.to.trim() : ''
  const subject = typeof data.subject === 'string' ? data.subject.trim() : ''
  const body = typeof data.body === 'string' ? data.body.trim() : ''
  if (!EMAIL_RE.test(to)) return NextResponse.json({ error: 'Enter a valid recipient email.' }, { status: 400 })
  if (!subject || subject.length > 200 || !body || body.length > 10_000) {
    return NextResponse.json({ error: 'Subject or message is missing or too long.' }, { status: 400 })
  }

  let attachment = await defaultCv()
  if (data.cv && typeof data.cv.base64 === 'string' && typeof data.cv.name === 'string') {
    const content = Buffer.from(data.cv.base64, 'base64')
    if (content.length > MAX_CV_BYTES) return NextResponse.json({ error: 'CV is larger than 5 MB.' }, { status: 400 })
    if (!/\.(pdf|docx?)$/i.test(data.cv.name)) return NextResponse.json({ error: 'CV must be PDF or Word.' }, { status: 400 })
    attachment = { filename: data.cv.name.replace(/[^\w.\- ]/g, '_'), content }
  }

  const port = Number(process.env.SMTP_PORT || 465)
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: (process.env.SMTP_SECURE ?? String(port === 465)) === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })

  try {
    const info = await transporter.sendMail({
      from: `"${process.env.MAIL_FROM_NAME || 'Tinotenda Chivhera'}" <${process.env.SMTP_USER}>`,
      replyTo: process.env.MAIL_REPLY_TO || process.env.SMTP_USER,
      bcc: process.env.MAIL_BCC_SELF === 'true' ? process.env.SMTP_USER : undefined,
      to,
      subject,
      text: body,
      attachments: attachment ? [attachment] : [],
    })
    sentAt.push(now)
    return NextResponse.json({ ok: true, messageId: info.messageId, attached: Boolean(attachment) })
  } catch {
    return NextResponse.json({ error: 'The mail server rejected the message. Check SMTP credentials.' }, { status: 502 })
  }
}

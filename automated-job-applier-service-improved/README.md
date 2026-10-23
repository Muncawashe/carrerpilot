# CareerPilot — Personal Job Search Assistant

CareerPilot is a Next.js dashboard configured with Tinotenda Chivhera's known job-search profile. It helps discover technology vacancies, preview tailored application notes, and save drafts for review.

## Requirements

- Node.js 20.9 or newer
- pnpm

## Run locally

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000.

## Current features

- Fetches listings from the Arbeitnow public job-board API and filters technology roles with a regional/remote focus.
- Candidate profile defaults: Tinotenda Chivhera; Harare, Zimbabwe; Computer Science graduate; software development and enterprise IT/application support experience.
- Editable profile fields for name, contact details, location, headline, education, skills, experience summary and CV filename.
- Builds a role-specific application note using the saved candidate profile.
- Saves, copies and deletes application drafts in browser local storage.
- Opens the original vacancy so the user can verify requirements and submit through the employer's stated process.
- Uses API request timeouts, response validation and safe HTTP(S) URL checks.

## Privacy and data storage

The profile and saved drafts are stored in this browser using `localStorage`. They are not synced to a server and will not automatically follow the user to another browser or device. Do not use a shared/public computer for private application details. Email and phone fields are blank until the user enters them. The CV field currently stores a filename only; it does not upload or attach the file.

## Email sending (SMTP)

1. Copy `.env.example` to `.env.local` (a placeholder copy is already included) and fill in:
   - `APP_ACCESS_KEY` - a long random password you type in the app before it will send.
   - `SMTP_USER` / `SMTP_PASS` - for Gmail, turn on 2-Step Verification and create an App Password at https://myaccount.google.com/apppasswords.
2. Put your CV at `private/cv.pdf` (or change `CV_PATH`). You can also choose a different CV per application in the send dialog.
3. Open a job match, enter the employer's application email from the listing, review the message and click **Send application**.

The job feed supplies listing URLs, not recruiter emails, so you enter the address yourself. Nothing is sent without your click, and sends are capped by `MAX_APPLICATIONS_PER_HOUR`.

## Deploy to Vercel

1. Push the folder to a **private** Git repo (it contains your CV) and import it in Vercel, or run `vercel --prod`.
2. In Vercel > Settings > Environment Variables, add every variable from `.env.example`.
3. Redeploy. The footer shows "Email sending connected" when SMTP is configured.

## Limitations

Sent-application history, drafts and your profile live in the browser's `localStorage`, not a database. The job feed is a third-party source and may omit Zimbabwean vacancies, so always verify the employer, role and deadline on the original listing.

## Production build

```bash
pnpm build
pnpm start
```

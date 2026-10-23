/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  // Make sure the default CV is bundled with the serverless function on Vercel.
  outputFileTracingIncludes: { '/api/apply': ['./private/**/*'] },
}
export default nextConfig

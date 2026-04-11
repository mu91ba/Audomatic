/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },
  experimental: {
    serverComponentsExternalPackages: [
      '@react-pdf/renderer',
      '@react-pdf/layout',
      '@react-pdf/pdfkit',
      '@react-pdf/primitives',
    ],
  },
}

module.exports = nextConfig









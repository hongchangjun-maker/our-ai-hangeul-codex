import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://our-ai-hangeul.hhongcjun.chatgpt.site'),
  title: '우리의 AI 한글',
  description: '사진은 글을 밀지 않고, AI는 선택한 순간에만 돕는 쉬운 한국형 웹 워드프로세서',
  manifest: '/manifest.webmanifest',
  icons: { icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }] },
  applicationName: '우리의 AI 한글',
  appleWebApp: { capable: true, title: '우리의 AI 한글', statusBarStyle: 'black-translucent' },
  openGraph: {
    title: '우리의 AI 한글',
    description: '문서는 어렵지 않아야 합니다.',
    type: 'website',
    url: 'https://our-ai-hangeul.hhongcjun.chatgpt.site',
    images: [{ url: 'https://our-ai-hangeul.hhongcjun.chatgpt.site/og.png', width: 1536, height: 1024, alt: '우리의 AI 한글 웹 워드프로세서' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '우리의 AI 한글',
    description: '문서는 어렵지 않아야 합니다.',
    images: ['https://our-ai-hangeul.hhongcjun.chatgpt.site/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}

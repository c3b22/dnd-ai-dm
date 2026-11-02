import './globals.css';
import { IBM_Plex_Sans_Thai, JetBrains_Mono, Noto_Serif_Thai } from 'next/font/google';
import { SiteHeader } from '@/components/SiteHeader';

const plex = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ui',
  display: 'swap',
});
const serif = Noto_Serif_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '600', '700'],
  variable: '--font-serif',
  display: 'swap',
});
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['500'], variable: '--font-mono', display: 'swap' });

export const metadata = { title: 'D&D AI DM' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${plex.variable} ${serif.variable} ${mono.variable}`}>
      <body>
        <div className="wrap">
          <SiteHeader />
          {children}
        </div>
      </body>
    </html>
  );
}

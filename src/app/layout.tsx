import './globals.css';
import { Cinzel, IBM_Plex_Sans_Thai, Noto_Serif_Thai } from 'next/font/google';
import { Embers } from '@/components/Embers';
import { SiteHeader } from '@/components/SiteHeader';

const cinzel = Cinzel({ subsets: ['latin'], weight: ['700'], variable: '--font-cinzel', display: 'swap' });
const plexThai = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-thai',
  display: 'swap',
});
const notoSerifThai = Noto_Serif_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '600'],
  variable: '--font-noto-serif-thai',
  display: 'swap',
});

export const metadata = { title: 'D&D AI DM' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${cinzel.variable} ${plexThai.variable} ${notoSerifThai.variable}`}>
      <body>
        <Embers />
        <div className="wrap">
          <SiteHeader />
          {children}
        </div>
      </body>
    </html>
  );
}

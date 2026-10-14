import './globals.css';
import { Bai_Jamjuree, JetBrains_Mono, Taviraj } from 'next/font/google';
import { SiteHeader } from '@/components/SiteHeader';

const taviraj = Taviraj({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600'],
  variable: '--font-taviraj',
  display: 'swap',
});
const baiJamjuree = Bai_Jamjuree({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600'],
  variable: '--font-bai-jamjuree',
  display: 'swap',
});
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['500'], variable: '--font-mono', display: 'swap' });

export const metadata = { title: 'D&D AI DM' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${taviraj.variable} ${baiJamjuree.variable} ${mono.variable}`}>
      <body>
        <div className="wrap">
          <SiteHeader />
          {children}
        </div>
      </body>
    </html>
  );
}

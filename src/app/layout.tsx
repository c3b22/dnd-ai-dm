import './globals.css';
import { Anuphan, JetBrains_Mono } from 'next/font/google';
import { SiteHeader } from '@/components/SiteHeader';

const anuphan = Anuphan({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-anuphan',
  display: 'swap',
});
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['500'], variable: '--font-mono', display: 'swap' });

export const metadata = { title: 'D&D AI DM' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${anuphan.variable} ${mono.variable}`}>
      <body>
        <div className="wrap">
          <SiteHeader />
          {children}
        </div>
      </body>
    </html>
  );
}

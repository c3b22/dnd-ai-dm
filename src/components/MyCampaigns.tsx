import Link from 'next/link';
import type { MyCampaignSummary } from '@/lib/campaign/myCampaigns';

export function MyCampaigns({ campaigns }: { campaigns: MyCampaignSummary[] }) {
  if (campaigns.length === 0) return null;

  return (
    <section className="panel my-campaigns">
      <h2 className="lede">แคมเปญของคุณ</h2>
      <ul className="my-campaigns-list">
        {campaigns.map((c) => (
          <li key={c.id}>
            <Link href={`/campaign/${c.id}?playerId=${c.playerId}`} className="my-campaign-row">
              <span className="name">{c.name}</span>
              <span className={`status-badge ${c.started ? 'playing' : 'waiting'}`}>
                {c.started ? 'กำลังเล่น' : 'ในห้องรอ'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

import Link from 'next/link';

export interface MyAdventureSummary {
  id: string;
  titleTh: string;
  taglineTh: string;
  thumbnailUrl: string | null;
}

export function MyAdventures({ adventures }: { adventures: MyAdventureSummary[] }): JSX.Element | null {
  if (adventures.length === 0) return null;

  return (
    <section className="panel my-adventures">
      <h2 className="lede">คลังของฉัน</h2>
      <ul className="my-adventures-list">
        {adventures.map((a) => (
          <li key={a.id}>
            <Link href={`/adventures/${a.id}/edit`} className="my-adventure-row">
              <span className="title">{a.titleTh}</span>
              <span className="tagline">{a.taglineTh}</span>
              <span className="edit-label">แก้ไข</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** One-line player summary shown above the story on narrow screens (hidden on wide screens via CSS). */
export function roundStatusText(s: {
  ended: boolean;
  processing: boolean;
  dead: boolean;
  acted: boolean;
  progress: { acted: number; total: number } | null;
}): string {
  if (s.ended) return 'จบแคมเปญ';
  if (s.processing) return 'DM กำลังเล่าเรื่อง';
  if (s.dead) return 'ล้มแล้ว';
  const count = s.progress ? ` ${s.progress.acted}/${s.progress.total}` : '';
  return `${s.acted ? 'ส่งแล้ว' : 'รอคุณ'}${count}`;
}

export function RailSummary({ name, hp, maxHp, gold, status }: { name: string; hp: number; maxHp: number; gold: number; status: string }) {
  return (
    <div className="rail-summary" role="group" aria-label="สรุปตัวละคร">
      <b className="rs-name">{name}</b>
      <span>HP {hp}/{maxHp}</span>
      <span>{gold} ทอง</span>
      <span className="rs-status">{status}</span>
    </div>
  );
}

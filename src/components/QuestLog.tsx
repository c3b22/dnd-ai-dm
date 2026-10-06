import type { CampaignFact } from '@/lib/memory/types';

export interface QuestLogProps {
  facts: CampaignFact[];
}

// All fact text is rendered as React text children, so it is escaped and never parsed as HTML.
export function QuestLog({ facts }: QuestLogProps) {
  const quests = facts.filter((f) => f.kind === 'quest');
  const openQuests = quests.filter((f) => f.value !== 'done');
  const doneQuests = quests.filter((f) => f.value === 'done');
  const npcs = facts.filter((f) => f.kind === 'npc');
  const clues = facts.filter((f) => f.kind === 'clue');
  const empty = openQuests.length + doneQuests.length + npcs.length + clues.length === 0;

  return (
    <section className="card questlog" aria-label="สมุดบันทึก">
      <h3>สมุดบันทึก</h3>
      {empty && <p className="status">ยังไม่มีบันทึก — เรื่องราวที่สำคัญจะถูกจดไว้ที่นี่</p>}
      {openQuests.length > 0 && (
        <div aria-label="ภารกิจที่ค้างอยู่" role="group">
          <h4>ภารกิจ</h4>
          <ul>
            {openQuests.map((f) => (
              <li key={f.id}>{f.key}</li>
            ))}
          </ul>
        </div>
      )}
      {doneQuests.length > 0 && (
        <div aria-label="ภารกิจที่เสร็จแล้ว" role="group">
          <h4>ภารกิจที่เสร็จแล้ว</h4>
          <ul className="done">
            {doneQuests.map((f) => (
              <li key={f.id}>{f.key}</li>
            ))}
          </ul>
        </div>
      )}
      {npcs.length > 0 && (
        <div aria-label="NPC ที่พบ" role="group">
          <h4>NPC</h4>
          <ul>
            {npcs.map((f) => (
              <li key={f.id}>
                <span>{f.key}</span>
                <small>{f.value}</small>
              </li>
            ))}
          </ul>
        </div>
      )}
      {clues.length > 0 && (
        <div aria-label="เบาะแส" role="group">
          <h4>เบาะแส</h4>
          <ul>
            {clues.map((f) => (
              <li key={f.id}>{f.value}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

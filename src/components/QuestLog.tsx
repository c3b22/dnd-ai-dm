'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { CampaignFact } from '@/lib/memory/types';

export interface QuestLogProps {
  facts: CampaignFact[];
}

const LIMIT = 5;

// Newest first; Array.prototype.sort is stable so equal timestamps keep their given order.
function newestFirst(list: CampaignFact[]): CampaignFact[] {
  return [...list].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}

interface SectionProps {
  title: string;
  label: string;
  items: CampaignFact[];
  render: (f: CampaignFact) => ReactNode;
  listClassName?: string;
  defaultOpen?: boolean;
}

// Display-only trimming: every fact stays in `items`; only the first LIMIT are rendered until expanded.
function Section({ title, label, items, render, listClassName, defaultOpen = true }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? items : items.slice(0, LIMIT);
  return (
    <div aria-label={label} role="group" className="questlog-section">
      <h4>
        <button type="button" className="questlog-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {title} ({items.length})
        </button>
      </h4>
      {open && (
        <>
          <ul className={`${listClassName ?? ''}${showAll ? ' expanded' : ''}`.trim() || undefined}>
            {shown.map((f) => (
              <li key={f.id}>{render(f)}</li>
            ))}
          </ul>
          {items.length > LIMIT && (
            <button type="button" className="questlog-more" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'ย่อ' : `ดูทั้งหมด (${items.length})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// All fact text is rendered as React text children, so it is escaped and never parsed as HTML.
export function QuestLog({ facts }: QuestLogProps) {
  const quests = newestFirst(facts.filter((f) => f.kind === 'quest'));
  const openQuests = quests.filter((f) => f.value !== 'done');
  const doneQuests = quests.filter((f) => f.value === 'done');
  const npcs = newestFirst(facts.filter((f) => f.kind === 'npc'));
  const clues = newestFirst(facts.filter((f) => f.kind === 'clue'));
  const total = openQuests.length + doneQuests.length + npcs.length + clues.length;

  return (
    <section className="card questlog" aria-label="สมุดบันทึก">
      <h3>{total > 0 ? `สมุดบันทึก (${total})` : 'สมุดบันทึก'}</h3>
      {total === 0 && <p className="status">ยังไม่มีบันทึก — เรื่องราวที่สำคัญจะถูกจดไว้ที่นี่</p>}
      {openQuests.length > 0 && (
        <Section title="ภารกิจ" label="ภารกิจที่ค้างอยู่" items={openQuests} render={(f) => f.key} />
      )}
      {doneQuests.length > 0 && (
        <Section
          title="ภารกิจที่เสร็จแล้ว"
          label="ภารกิจที่เสร็จแล้ว"
          items={doneQuests}
          listClassName="done"
          defaultOpen={false}
          render={(f) => f.key}
        />
      )}
      {npcs.length > 0 && (
        <Section
          title="NPC"
          label="NPC ที่พบ"
          items={npcs}
          render={(f) => (
            <>
              <span>{f.key}</span>
              <small>{f.value}</small>
            </>
          )}
        />
      )}
      {clues.length > 0 && <Section title="เบาะแส" label="เบาะแส" items={clues} render={(f) => f.value} />}
    </section>
  );
}

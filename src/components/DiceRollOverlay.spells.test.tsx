import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { DiceRollOverlay, spellAgainst, spellFormula, spellOutcome, spellWorked, type DiceSpellView } from './DiceRollOverlay';
import { MessageList } from './MessageList';

const { DiceBoxMock, initMock } = vi.hoisted(() => {
  const initMock = vi.fn();
  const DiceBoxMock = vi.fn().mockImplementation(() => ({ init: initMock }));
  return { DiceBoxMock, initMock };
});
vi.mock('@3d-dice/dice-box', () => ({ default: DiceBoxMock }));

// K4: spell dice are shown to the whole table, like attacks and checks.
const attack = (over: Partial<DiceSpellView> = {}): DiceSpellView => ({
  playerDisplayName: 'Mira', spell: 'หอกน้ำแข็ง', target: 'หมาป่า', kind: 'attack', die: 15, bonus: 4, total: 19, dc: 13, success: true, critical: null, pips: 2, ...over,
});
const save = (over: Partial<DiceSpellView> = {}): DiceSpellView => attack({ spell: 'ลูกไฟระเบิด', kind: 'save', die: 5, bonus: 2, total: 7, dc: 12, success: false, pips: 1, ...over });

describe('spell roll text helpers', () => {
  it('formula and what it is compared with', () => {
    expect(spellFormula(attack())).toBe('15 + 4 = 19');
    expect(spellFormula(attack({ bonus: -1, total: 14 }))).toBe('15 - 1 = 14');
    expect(spellAgainst(attack())).toBe('เทียบ AC 13');
    expect(spellAgainst(save())).toBe('เทียบเซฟ DC 12');
  });
  it('outcomes: attacks hit or miss, saves pass or fail', () => {
    expect(spellOutcome(attack())).toBe('โดน −2 pip');
    expect(spellOutcome(attack({ critical: 'success' }))).toBe('โดน (คริติคอล) −2 pip');
    expect(spellOutcome(attack({ success: false, pips: 0 }))).toBe('พลาด');
    expect(spellOutcome(save())).toBe('ไม่ผ่านเซฟ −1 pip');
    expect(spellOutcome(save({ pips: 0 }))).toBe('ไม่ผ่านเซฟ');
    expect(spellOutcome(save({ success: true, pips: 0 }))).toBe('ผ่านเซฟ ไม่เป็นอะไร');
  });
  it('the spell worked for the caster on a hit or a failed save', () => {
    expect(spellWorked(attack())).toBe(true);
    expect(spellWorked(attack({ success: false }))).toBe(false);
    expect(spellWorked(save())).toBe(true);
    expect(spellWorked(save({ success: true }))).toBe(false);
  });
});

describe('DiceRollOverlay spells (K4)', () => {
  it('shows caster, spell, target, the roll against AC or DC and the result once the dice land', async () => {
    initMock.mockResolvedValue(undefined);
    let box: { onRollComplete?: () => void } = {};
    DiceBoxMock.mockImplementation(() => (box = { init: initMock, roll: vi.fn() } as never));

    render(<DiceRollOverlay values={[15, 5]} spells={[attack(), save({ target: 'โจร' })]} onComplete={vi.fn()} />);
    await waitFor(() => expect(box.onRollComplete).toBeDefined());
    act(() => box.onRollComplete!());

    expect(await screen.findByText(/ร่ายหอกน้ำแข็ง/)).toBeTruthy();
    expect(screen.getByText(/15 \+ 4 = 19 เทียบ AC 13/)).toBeTruthy();
    expect(screen.getByText(/โดน −2 pip/)).toBeTruthy();
    expect(screen.getByText(/5 \+ 2 = 7 เทียบเซฟ DC 12/)).toBeTruthy();
    expect(screen.getByText(/ไม่ผ่านเซฟ −1 pip/)).toBeTruthy();
  });
});

describe('MessageList spell rolls (K4)', () => {
  it('shows a spell die as its own line in the roll log', async () => {
    let deliver: (m: unknown) => void = () => {};
    render(
      <MessageList
        campaignId="c1"
        fetchInitialMessages={vi.fn().mockResolvedValue([
          {
            id: 'm1', role: 'system',
            content: JSON.stringify({ type: 'rolls', rolls: [{ playerDisplayName: 'Mira', roll: 15, spell: { name: 'หอกน้ำแข็ง', target: 'หมาป่า', kind: 'attack', bonus: 4, total: 19, dc: 13, success: true, critical: null, pips: 2 } }] }),
          },
        ])}
        subscribeToNewMessages={(_id, onMessage) => {
          deliver = onMessage as never;
          return () => {};
        }}
        RollOverlay={() => null}
      />
    );
    void deliver;
    expect(await screen.findByText(/ร่ายหอกน้ำแข็ง → หมาป่า/)).toBeInTheDocument();
    expect(screen.getByText(/15 \+ 4 = 19 เทียบ AC 13 · โดน −2 pip/)).toBeInTheDocument();
  });
});

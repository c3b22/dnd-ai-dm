import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ActionInput, type ExtraAbility } from './ActionInput';

const extras: ExtraAbility[] = [
  { id: 'berserk_strike', nameTh: 'ฟันคลั่ง', cooldown: 0, target: null },
  { id: 'warrior_war_cry', nameTh: 'เสียงคำราม', cooldown: 3, target: null },
  { id: 'archer_snare', nameTh: 'กับดักเชือก', cooldown: 0, target: 'enemy' },
];

function setup(onUse = vi.fn().mockResolvedValue(undefined), enemies = ['หมาป่า', 'โจร']) {
  render(<ActionInput onSubmit={vi.fn()} extraAbilities={extras} enemies={enemies} onUseExtraAbility={onUse} />);
  return onUse;
}

describe('ActionInput extra abilities', () => {
  it('shows every ability with its own cooldown and disables only the cooling ones', () => {
    setup();
    expect((screen.getByRole('button', { name: 'ฟันคลั่ง' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: 'เสียงคำราม' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('เสียงคำราม: อีก 3 รอบเหตุการณ์')).toBeTruthy();
    expect(screen.queryByText(/ฟันคลั่ง: อีก/)).toBeNull();
  });

  it('uses a targetless ability straight away', async () => {
    const onUse = setup();
    fireEvent.click(screen.getByRole('button', { name: 'ฟันคลั่ง' }));
    await waitFor(() => expect(onUse).toHaveBeenCalledWith('berserk_strike', null));
  });

  it('asks for an enemy first when the ability needs one', async () => {
    const onUse = setup();
    fireEvent.click(screen.getByRole('button', { name: 'กับดักเชือก' }));
    expect(onUse).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'โจร' }));
    await waitFor(() => expect(onUse).toHaveBeenCalledWith('archer_snare', 'โจร'));
  });

  it('says so when there is no enemy to pick', () => {
    setup(vi.fn(), []);
    fireEvent.click(screen.getByRole('button', { name: 'กับดักเชือก' }));
    expect(screen.getByText('ไม่มีศัตรูให้เลือก')).toBeTruthy();
  });

  it('locks every ability once the player has acted', () => {
    render(<ActionInput onSubmit={vi.fn()} alreadyActed extraAbilities={extras} onUseExtraAbility={vi.fn()} />);
    expect((screen.getByRole('button', { name: 'ฟันคลั่ง' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

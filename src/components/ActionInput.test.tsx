import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActionInput } from './ActionInput';

describe('ActionInput', () => {
  it('submits a quick action and then disables further input', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ActionInput onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: 'โจมตี' }));

    expect(onSubmit).toHaveBeenCalledWith('โจมตี');
    await waitFor(() =>
      expect(screen.getByText(/รอเพื่อนร่วมโต๊ะ/)).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: 'เคลื่อนที่' })).toBeDisabled();
  });

  it('submits free text typed by the player', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ActionInput onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('free text action'), 'I search the chest');
    await userEvent.click(screen.getByRole('button', { name: 'ส่ง' }));

    expect(onSubmit).toHaveBeenCalledWith('I search the chest');
  });

  it('shows an error and keeps input enabled when the submit is rejected', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('RLS violation'));
    render(<ActionInput onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: 'โจมตี' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/ส่ง action ไม่สำเร็จ/);
    expect(screen.getByRole('button', { name: 'เคลื่อนที่' })).toBeEnabled();
  });

  it('ignores a submit of empty free text', async () => {
    const onSubmit = vi.fn();
    render(<ActionInput onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: 'ส่ง' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('locks everything and shows the reason when the player cannot act', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ActionInput onSubmit={onSubmit} disabledReason="คุณล้มลง ทำ action ไม่ได้ รอเพื่อนช่วยพยุง" />);

    expect(screen.getByText('คุณล้มลง ทำ action ไม่ได้ รอเพื่อนช่วยพยุง')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'โจมตี' })).toBeDisabled();
    expect(screen.getByLabelText('free text action')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'ส่ง' })).toBeDisabled();
  });

  it('locks everything and says so when the player has already acted this round (for example by drinking a potion)', () => {
    render(<ActionInput onSubmit={vi.fn()} alreadyActed />);
    expect(screen.getByText(/ส่ง action แล้ว/)).toBeInTheDocument();
    expect(screen.getByLabelText('free text action')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'โจมตี' })).toBeDisabled();
  });

  describe('class ability button', () => {
    const allies = [{ id: 'p2', name: 'Suki' }, { id: 'p3', name: 'Mila' }];
    const noTarget = { nameTh: 'ยิงแม่นยำ', target: null, cooldown: 0, allies: [] };
    const withTarget = { nameTh: 'ยืนบัง', target: 'ally' as const, cooldown: 0, allies };

    it('submits an ability that needs no target in one tap and then locks the dock', async () => {
      const onUseAbility = vi.fn().mockResolvedValue(undefined);
      render(<ActionInput onSubmit={vi.fn()} ability={noTarget} onUseAbility={onUseAbility} />);

      await userEvent.click(screen.getByRole('button', { name: 'ยิงแม่นยำ' }));

      expect(onUseAbility).toHaveBeenCalledWith(null);
      await waitFor(() => expect(screen.getByText(/รอเพื่อนร่วมโต๊ะ/)).toBeInTheDocument());
      expect(screen.getByRole('button', { name: 'โจมตี' })).toBeDisabled();
    });

    it('asks who to target and submits as soon as a name is tapped', async () => {
      const onUseAbility = vi.fn().mockResolvedValue(undefined);
      render(<ActionInput onSubmit={vi.fn()} ability={withTarget} onUseAbility={onUseAbility} />);

      await userEvent.click(screen.getByRole('button', { name: 'ยืนบัง' }));
      expect(onUseAbility).not.toHaveBeenCalled();
      await userEvent.click(screen.getByRole('button', { name: 'Mila' }));

      expect(onUseAbility).toHaveBeenCalledWith('p3');
    });

    it('is disabled with the eventful-rounds hint while cooling down', () => {
      render(<ActionInput onSubmit={vi.fn()} ability={{ ...noTarget, cooldown: 2 }} onUseAbility={vi.fn()} />);

      expect(screen.getByRole('button', { name: /ยิงแม่นยำ/ })).toBeDisabled();
      expect(screen.getByText('อีก 2 รอบเหตุการณ์')).toBeInTheDocument();
      expect(screen.getByText(/นับเฉพาะรอบที่มีเหตุการณ์/)).toBeInTheDocument();
    });

    it('is locked when the player is downed or already acted', () => {
      const { rerender } = render(<ActionInput onSubmit={vi.fn()} ability={noTarget} onUseAbility={vi.fn()} disabledReason="ล้มลง" />);
      expect(screen.getByRole('button', { name: 'ยิงแม่นยำ' })).toBeDisabled();
      rerender(<ActionInput onSubmit={vi.fn()} ability={noTarget} onUseAbility={vi.fn()} alreadyActed />);
      expect(screen.getByRole('button', { name: 'ยิงแม่นยำ' })).toBeDisabled();
    });

    it('shows no ability button without an ability', () => {
      render(<ActionInput onSubmit={vi.fn()} />);
      expect(screen.queryByRole('button', { name: 'ยิงแม่นยำ' })).toBeNull();
    });

    it('uses the custom empty-list message when one is given', async () => {
      render(<ActionInput onSubmit={vi.fn()} ability={{ ...withTarget, allies: [], noTargetText: 'ไม่มีใครบาดเจ็บ' }} onUseAbility={vi.fn()} />);
      await userEvent.click(screen.getByRole('button', { name: 'ยืนบัง' }));
      expect(screen.getByText('ไม่มีใครบาดเจ็บ')).toBeInTheDocument();
    });

    it('says so when there is nobody to target', async () => {
      render(<ActionInput onSubmit={vi.fn()} ability={{ ...withTarget, allies: [] }} onUseAbility={vi.fn()} />);
      await userEvent.click(screen.getByRole('button', { name: 'ยืนบัง' }));
      expect(screen.getByText('ไม่มีเพื่อนให้เลือก')).toBeInTheDocument();
    });
  });
});

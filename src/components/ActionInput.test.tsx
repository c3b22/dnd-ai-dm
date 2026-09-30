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
});

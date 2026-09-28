import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActionInput } from './ActionInput';

describe('ActionInput', () => {
  it('submits a quick action and then disables further input', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ActionInput onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: 'Attack' }));

    expect(onSubmit).toHaveBeenCalledWith('Attack');
    await waitFor(() =>
      expect(screen.getByText(/waiting for the rest of the table/i)).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled();
  });

  it('submits free text typed by the player', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ActionInput onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('free text action'), 'I search the chest');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(onSubmit).toHaveBeenCalledWith('I search the chest');
  });

  it('shows an error and keeps input enabled when the submit is rejected', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('RLS violation'));
    render(<ActionInput onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: 'Attack' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not submit/i);
    expect(screen.getByRole('button', { name: 'Move' })).toBeEnabled();
  });

  it('ignores a submit of empty free text', async () => {
    const onSubmit = vi.fn();
    render(<ActionInput onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });
});

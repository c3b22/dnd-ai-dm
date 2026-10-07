import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatPanel } from './ChatPanel';

function setup(over: Partial<React.ComponentProps<typeof ChatPanel>> = {}) {
  const props = {
    onSendChat: vi.fn().mockResolvedValue(undefined),
    onAsk: vi.fn().mockResolvedValue(undefined),
    asksUsed: 0,
    ...over,
  };
  render(<ChatPanel {...props} />);
  return props;
}

describe('ChatPanel', () => {
  it('sends team chat by default and clears the box', async () => {
    const props = setup();
    await userEvent.type(screen.getByLabelText('ข้อความแชททีม'), 'ไปทางซ้ายไหม');
    await userEvent.click(screen.getByRole('button', { name: 'ส่ง' }));
    expect(props.onSendChat).toHaveBeenCalledWith('ไปทางซ้ายไหม');
    expect(props.onAsk).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByLabelText('ข้อความแชททีม')).toHaveValue(''));
  });

  it('switches to ask mode, shows remaining quota and asks', async () => {
    const props = setup({ asksUsed: 1 });
    await userEvent.click(screen.getByRole('tab', { name: 'ถาม DM' }));
    expect(screen.getByText('เหลือ 2/3 คำถามในรอบนี้')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('คำถามถึง DM'), 'ประตูล็อกไหม');
    await userEvent.click(screen.getByRole('button', { name: 'ถาม' }));
    expect(props.onAsk).toHaveBeenCalledWith('ประตูล็อกไหม');
    expect(props.onSendChat).not.toHaveBeenCalled();
  });

  it('locks the ask box when the quota is 0 but keeps team chat usable', async () => {
    setup({ asksUsed: 3 });
    await userEvent.click(screen.getByRole('tab', { name: 'ถาม DM' }));
    expect(screen.getByText('เหลือ 0/3 คำถามในรอบนี้')).toBeInTheDocument();
    expect(screen.getByLabelText('คำถามถึง DM')).toBeDisabled();
    await userEvent.click(screen.getByRole('tab', { name: 'แชททีม' }));
    expect(screen.getByLabelText('ข้อความแชททีม')).toBeEnabled();
  });

  it('shows a Thai message for 429 and keeps the text', async () => {
    const onAsk = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { status: 429 }));
    setup({ onAsk });
    await userEvent.click(screen.getByRole('tab', { name: 'ถาม DM' }));
    await userEvent.type(screen.getByLabelText('คำถามถึง DM'), 'ทำไม');
    await userEvent.click(screen.getByRole('button', { name: 'ถาม' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('โควตา');
    expect(screen.getByLabelText('คำถามถึง DM')).toHaveValue('ทำไม');
  });

  it('shows a generic Thai error for other failures', async () => {
    const onSendChat = vi.fn().mockRejectedValue(new Error('boom'));
    setup({ onSendChat });
    await userEvent.type(screen.getByLabelText('ข้อความแชททีม'), 'hi');
    await userEvent.click(screen.getByRole('button', { name: 'ส่ง' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ส่งข้อความไม่สำเร็จ');
  });
});

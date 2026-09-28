'use client';

import { useState } from 'react';

const QUICK_ACTIONS = ['Attack', 'Move', 'Talk', 'Look around'];

export interface ActionInputProps {
  onSubmit: (actionText: string) => Promise<void>;
}

export function ActionInput({ onSubmit }: ActionInputProps) {
  const [freeText, setFreeText] = useState('');
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(actionText: string) {
    if (!actionText.trim() || submitted) return;
    await onSubmit(actionText.trim());
    setSubmitted(true);
  }

  return (
    <div>
      <div role="group" aria-label="quick actions">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action}
            type="button"
            disabled={submitted}
            onClick={() => handleSubmit(action)}
          >
            {action}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit(freeText);
        }}
      >
        <input
          aria-label="free text action"
          value={freeText}
          disabled={submitted}
          onChange={(e) => setFreeText(e.target.value)}
        />
        <button type="submit" disabled={submitted}>
          Send
        </button>
      </form>
      {submitted && <p>Action submitted — waiting for the rest of the table.</p>}
    </div>
  );
}

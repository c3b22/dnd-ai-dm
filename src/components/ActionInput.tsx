'use client';

import { useState } from 'react';

const QUICK_ACTIONS = ['Attack', 'Move', 'Talk', 'Look around'];

export interface ActionInputProps {
  onSubmit: (actionText: string) => Promise<void>;
}

export function ActionInput({ onSubmit }: ActionInputProps) {
  const [freeText, setFreeText] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(actionText: string) {
    if (!actionText.trim() || submitted) return;
    setError(null);
    try {
      await onSubmit(actionText.trim());
      setSubmitted(true);
    } catch {
      setError('Could not submit your action. Please try again.');
    }
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
      {error && <p role="alert">{error}</p>}
      {submitted && <p>Action submitted — waiting for the rest of the table.</p>}
    </div>
  );
}

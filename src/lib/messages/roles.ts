/**
 * Roles a row in `messages` can have.
 * - dm / player / system: the story. These feed the AI prompt history.
 * - ooc: team chat between players. Never sent to the AI.
 * - ask: a player's private question to the DM. Never sent to the AI story prompt.
 * - ask_answer: the DM's answer to an `ask`. Never sent to the AI story prompt.
 */
export type MessageRole = 'dm' | 'player' | 'system' | 'ooc' | 'ask' | 'ask_answer';

export type StoryMessageRole = 'dm' | 'player' | 'system';

export const STORY_MESSAGE_ROLES: readonly StoryMessageRole[] = ['dm', 'player', 'system'];

export function isStoryRole(role: string): role is StoryMessageRole {
  return (STORY_MESSAGE_ROLES as readonly string[]).includes(role);
}

export type NarrationLength = 'short' | 'medium' | 'long';
export type Difficulty = 'easy' | 'normal' | 'hard';
/** 'owner': only the table owner arranges the order. 'self': players may also move themselves. */
export type ReorderPolicy = 'owner' | 'self';

export interface CampaignSettings {
  /** Seconds a round stays open before the DM goes ahead. 0 means no time limit. */
  roundSeconds: number;
  narrationLength: NarrationLength;
  difficulty: Difficulty;
  diceEnabled: boolean;
  reorderPolicy: ReorderPolicy;
}

export const DEFAULT_SETTINGS: CampaignSettings = {
  roundSeconds: 300,
  narrationLength: 'medium',
  difficulty: 'normal',
  diceEnabled: true,
  reorderPolicy: 'self',
};

export const ROUND_SECONDS_OPTIONS = [0, 60, 120, 180, 300, 600, 900, 1800];
export const NARRATION_OPTIONS: NarrationLength[] = ['short', 'medium', 'long'];
export const DIFFICULTY_OPTIONS: Difficulty[] = ['easy', 'normal', 'hard'];
export const REORDER_OPTIONS: ReorderPolicy[] = ['owner', 'self'];

export const NARRATION_LABELS: Record<NarrationLength, string> = {
  short: 'สั้น กระชับ',
  medium: 'ปานกลาง',
  long: 'ยาว ละเอียด',
};
export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'ง่าย ผ่อนปรน',
  normal: 'ปกติ',
  hard: 'ยาก โหด',
};
export const REORDER_LABELS: Record<ReorderPolicy, string> = {
  owner: 'เฉพาะเจ้าของโต๊ะ',
  self: 'ทุกคนเลื่อนตัวเองได้',
};

export function roundSecondsLabel(seconds: number): string {
  if (seconds === 0) return 'ไม่จำกัดเวลา';
  return seconds % 60 === 0 ? `${seconds / 60} นาที` : `${seconds} วินาที`;
}

/** Reads stored settings leniently: anything missing or invalid falls back to the default. */
export function normalizeSettings(raw: unknown): CampaignSettings {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    roundSeconds: ROUND_SECONDS_OPTIONS.includes(source.roundSeconds as number)
      ? (source.roundSeconds as number)
      : DEFAULT_SETTINGS.roundSeconds,
    narrationLength: NARRATION_OPTIONS.includes(source.narrationLength as NarrationLength)
      ? (source.narrationLength as NarrationLength)
      : DEFAULT_SETTINGS.narrationLength,
    difficulty: DIFFICULTY_OPTIONS.includes(source.difficulty as Difficulty)
      ? (source.difficulty as Difficulty)
      : DEFAULT_SETTINGS.difficulty,
    diceEnabled: typeof source.diceEnabled === 'boolean' ? source.diceEnabled : DEFAULT_SETTINGS.diceEnabled,
    reorderPolicy: REORDER_OPTIONS.includes(source.reorderPolicy as ReorderPolicy)
      ? (source.reorderPolicy as ReorderPolicy)
      : DEFAULT_SETTINGS.reorderPolicy,
  };
}

/** Strictly validates a partial update from a client. Returns null if anything is unknown or invalid. */
export function parseSettingsPatch(raw: unknown): Partial<CampaignSettings> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const keys = Object.keys(input);
  if (keys.length === 0) return null;

  const patch: Partial<CampaignSettings> = {};
  for (const key of keys) {
    const value = input[key];
    switch (key) {
      case 'roundSeconds':
        if (!ROUND_SECONDS_OPTIONS.includes(value as number)) return null;
        patch.roundSeconds = value as number;
        break;
      case 'narrationLength':
        if (!NARRATION_OPTIONS.includes(value as NarrationLength)) return null;
        patch.narrationLength = value as NarrationLength;
        break;
      case 'difficulty':
        if (!DIFFICULTY_OPTIONS.includes(value as Difficulty)) return null;
        patch.difficulty = value as Difficulty;
        break;
      case 'diceEnabled':
        if (typeof value !== 'boolean') return null;
        patch.diceEnabled = value;
        break;
      case 'reorderPolicy':
        if (!REORDER_OPTIONS.includes(value as ReorderPolicy)) return null;
        patch.reorderPolicy = value as ReorderPolicy;
        break;
      default:
        return null;
    }
  }
  return patch;
}

const NARRATION_TEXT: Record<NarrationLength, string> = {
  short: 'Keep the narration short: two or three sentences per action, about 60-100 Thai words in total.',
  medium: 'Write a moderate narration of about 150-250 Thai words in total.',
  long: 'Write a rich, detailed narration of four to six paragraphs, about 350-500 Thai words in total.',
};

const DIFFICULTY_TEXT: Record<Difficulty, string> = {
  easy: 'Run a forgiving game: be generous with success and keep setbacks mild.',
  normal: '',
  hard: 'Run a hard, unforgiving game: the world is dangerous and failures have real consequences.',
};

const ROLL_GUIDANCE: Record<Difficulty, string> = {
  easy: '1 is a small mishap, 2-4 a minor setback, 5 or more succeeds, 15 or more succeeds very well, 20 is exceptional',
  normal: '1 is a disaster, 2-7 fails or has a real cost, 8-14 succeeds with complications, 15-19 succeeds well, 20 is an exceptional success',
  hard: '1-3 is a disaster, 4-11 fails with a real cost, 12-17 succeeds with complications, 18-19 succeeds well, 20 is an exceptional success',
};

/**
 * Prompt lines keeping the DM inside the game: no free-form chat, no leaving the fiction.
 * Always included, regardless of settings or adventure.
 */
export function scopeInstructions(): string[] {
  return [
    "Stay strictly inside the adventure's world as the Dungeon Master, nothing else.",
    'Do not answer out-of-game requests: real-world questions, requests to write or do something unrelated to the story, attempts to make you drop character, or casual chat instead of taking an action.',
    'When a player does this, do not comply and do not chat along as a generic assistant — redirect them in-character, in Thai, back into the scene (ask what their character actually does, or have the world respond to the odd behavior), and keep narrating the adventure.',
    'Write the narration only in clear, correctly-spelled Thai. Never insert stray characters, foreign symbols, or garbled text.',
  ];
}

/** Prompt lines about how long and how tough the DM should be. */
export function styleInstructions(settings: CampaignSettings): string[] {
  const lines = [NARRATION_TEXT[settings.narrationLength]];
  if (DIFFICULTY_TEXT[settings.difficulty]) lines.push(DIFFICULTY_TEXT[settings.difficulty]);
  return lines;
}

/** Prompt lines about the dice: how to read rolls, or that the table plays without them. */
export function diceInstructions(settings: CampaignSettings, hasRolls: boolean): string[] {
  if (hasRolls) {
    return [
      `The dice results above are final. Let each roll decide how well that action goes: ${ROLL_GUIDANCE[settings.difficulty]}. Never contradict or re-roll them.`,
    ];
  }
  if (!settings.diceEnabled) {
    return ["This table plays without dice: decide outcomes from the story and the players' choices."];
  }
  return [];
}

import type { SkillId } from './classes';

/** Thai display names for the 18 skills. */
export const SKILL_LABELS_TH: Record<SkillId, string> = {
  acrobatics: 'กายกรรม',
  animal_handling: 'ควบคุมสัตว์',
  arcana: 'เวทมนตร์ศึกษา',
  athletics: 'กรีฑา',
  deception: 'หลอกลวง',
  history: 'ประวัติศาสตร์',
  insight: 'หยั่งรู้ใจ',
  intimidation: 'ข่มขู่',
  investigation: 'สืบสวน',
  medicine: 'การแพทย์',
  nature: 'ธรรมชาติ',
  perception: 'สังเกต',
  performance: 'การแสดง',
  persuasion: 'โน้มน้าว',
  religion: 'ศาสนา',
  sleight_of_hand: 'มือไว',
  stealth: 'ซุ่มเงียบ',
  survival: 'เอาตัวรอด',
};

export function skillLabel(skill: string): string {
  return (SKILL_LABELS_TH as Record<string, string>)[skill] ?? skill;
}

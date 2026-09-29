// Original adventure premises for the AI Dungeon Master. Each one is an outline
// (hook, acts, NPCs, secrets), not a script: the DM improvises around it.
// Themes are loosely inspired by public-domain myth and folklore; no third-party
// module text is reproduced here.

export interface Adventure {
  id: string;
  /** Thai opening narration posted as the first DM message. */
  openingTh: string;
  title: string;
  tagline: string;
  titleTh: string;
  taglineTh: string;
  toneTh: string;
  tone: string;
  setting: string;
  hook: string;
  acts: string[];
  npcs: { name: string; role: string }[];
  secret: string;
}

export const ADVENTURES: Adventure[] = [
  {
    id: 'sunken-bell-of-marrowmere',
    titleTh: 'ระฆังจมแห่งมาร์โรว์เมียร์',
    taglineTh: 'ระฆังจากหมู่บ้านที่จมน้ำดังทุกคืน และคนตายกำลังตอบรับ',
    toneTh: 'ลึกลับ ขนลุกเบาๆ',
    openingTh: 'หมอกหนาลอยเหนือทะเลสาบมาร์โรว์เมียร์ หมู่บ้านชาวประมงที่โบสถ์เก่าจมลงใต้น้ำเมื่อหลายสิบปีก่อน ตั้งแต่สัปดาห์ก่อนระฆังใต้น้ำก็ดังขึ้นทุกคืน และชาวประมงตื่นมาพบรอยเท้าเปียกๆ ทอดจากชายฝั่งมาถึงหน้าประตูบ้านตัวเอง คืนนี้ระฆังกำลังจะดังอีกครั้ง...',
    title: 'The Sunken Bell of Marrowmere',
    tagline: 'A drowned village rings its bell at night, and the dead are answering.',
    tone: 'Gothic mystery, eerie but not gory',
    setting:
      'Marrowmere, a fishing village on a fog-bound lake. Decades ago the old chapel sank when the dam broke; its bell still tolls beneath the water.',
    hook: 'Every night for a week the bell has rung, and fishermen wake to find wet footprints leading from the shore to their doors.',
    acts: [
      'Investigate the village: interview locals, follow the footprints, learn who drowned in the flood.',
      'Dive or row out to the sunken chapel and confront the restless dead who guard the bell.',
      'Discover why the bell rings now and choose: silence it, free the drowned, or bargain with what commands it.',
    ],
    npcs: [
      { name: 'Old Hesper Vane', role: 'Ferrywoman who survived the flood and hides guilt' },
      { name: 'Brother Tolliver', role: 'Anxious priest of a chapel that now sits empty' },
      { name: 'The Bellwarden', role: 'A drowned bell-ringer who wants his duty finished' },
    ],
    secret:
      'The dam was opened on purpose by the village founders to hide a crime. The bell rings because the buried victim was never named.',
  },
  {
    id: 'the-wolf-king-of-ashenfell',
    titleTh: 'ราชาหมาป่าแห่งแอชเชนเฟลล์',
    taglineTh: 'อาณาจักรน้ำแข็งต้องการวีรบุรุษ หรือใครสักคนที่จะทำลายคำสาป',
    toneTh: 'มหากาพย์ หนาวเหน็บ',
    openingTh: 'ฤดูหนาวในแอชเชนเฟลล์ยืดยาวเกินไปหนึ่งปีแล้ว ในโถงยาวของยาร์ลแอสกริม ไฟในเตากำลังริบหรี่ ทุกคืนพระจันทร์เต็มดวง หมาป่าที่เดินสองขาเหมือนมนุษย์จะบุกปล้นหมู่บ้าน ยาร์ลสัญญาทั้งทอง ที่ดิน และที่นั่งข้างโต๊ะแก่ผู้ที่นำหัวมันมา และเขากำลังมองมาที่พวกคุณ...',
    title: 'The Wolf King of Ashenfell',
    tagline: 'A frozen kingdom needs a hero, or someone to end a curse.',
    tone: 'Heroic saga, grim and wintry',
    setting:
      'Ashenfell, a northern realm of longhouses and pine forest where the winter has lasted a year too long.',
    hook: "The jarl's hall has been raided each full moon by a wolf that walks like a man. The jarl offers gold, land and a seat at his table for its head.",
    acts: [
      "Prepare in the hall: gather rumors, meet the jarl's court, and track the raiders through snow.",
      "Cross the Howling Pass, survive the storm and the wolf-pack's ambushes.",
      'Reach the ruined keep and learn who the Wolf King really is, then decide to slay, cure or serve him.',
    ],
    npcs: [
      { name: 'Jarl Asgrim Frostbeard', role: "Proud ruler who lies about the raids' origin" },
      { name: 'Sigrun the Hunter', role: "Scout who offers to guide, secretly the Wolf King's sister" },
      { name: 'Fenrik, the Wolf King', role: 'Cursed former heir of Ashenfell' },
    ],
    secret:
      'The jarl usurped the throne and cursed the rightful heir. Killing the Wolf King ends the winter only if the curse is undone another way.',
  },
  {
    id: 'the-thousand-doors-market',
    titleTh: 'ตลาดพันประตู',
    taglineTh: 'ตลาดเร่ที่มาทุกร้อยปี ขายได้ทุกอย่างในราคาที่ต้องจ่าย',
    toneTh: 'แฟนตาซี เจ้าเล่ห์',
    openingTh: 'เมื่อพระอาทิตย์ตก ลานเมืองที่ว่างเปล่าก็คลี่ออกเป็นตลาดสุดวิเศษ ประตูของแต่ละแผงเปิดสู่ที่ที่เป็นไปไม่ได้ ทุกข้อตกลงมีผลผูกมัด เพื่อนร่วมทางคนหนึ่งของพวกคุณถูกขายไปในข้อตกลงเก่าโดยไม่รู้ตัว ตลาดยอมให้ซื้อสัญญาคืนได้ก่อนรุ่งสาง เท่านั้น...',
    title: 'The Market of a Thousand Doors',
    tagline: 'A traveling bazaar that appears once per century sells anything, at a price.',
    tone: 'Whimsical fantasy with a dark edge',
    setting:
      "A city square where, at dusk, a bazaar unfolds. Each stall's door leads somewhere impossible, and all deals are binding.",
    hook: 'One of the party\'s companions was sold, unknowingly, in an old bargain. The market will let them buy the contract back before dawn.',
    acts: [
      'Enter the market, learn its rules (no theft, no lies, every gift has a cost) and find the merchant who holds the contract.',
      "Complete three errands through strange doors to earn the contract's price.",
      'Face the Broker at dawn: win, trade or cheat a creature who cannot be cheated.',
    ],
    npcs: [
      { name: 'Madame Quill', role: 'Cheerful contract-clerk who explains rules a little too helpfully' },
      { name: 'Ozric the Lantern-Seller', role: 'Ally who trades favors for secrets' },
      { name: 'The Broker', role: 'Ancient dealmaker who honors the letter of every agreement' },
    ],
    secret:
      "The contract was signed by the companion's own future self to save the party from something worse.",
  },
  {
    id: 'crown-of-the-sunken-king',
    titleTh: 'มงกุฎกษัตริย์ผู้จมสู่ใต้ดิน',
    taglineTh: 'ลุยดันเจี้ยนใต้ปราสาทร้าง ตามหามงกุฎในตำนาน',
    toneTh: 'ผจญภัยคลาสสิก สนุก',
    openingTh: 'แผนที่ที่ซื้อมาจากโรงเตี๊ยมพาพวกคุณมายังซากปราสาทดันมัวร์ บันไดลับที่ซ่อนอยู่ใต้ซากปรักหักพังนำลงไปสู่ห้องนิรภัยของกษัตริย์ผู้หายสาบสูญพร้อมมงกุฎ แต่เสียงขุดดินดังมาจากไม่ไกล นักล่าสมบัติคู่แข่งมาถึงก่อนแล้ว...',
    title: 'The Crown of the Sunken King',
    tagline: 'A dungeon crawl beneath a fallen keep, in search of a legendary crown.',
    tone: 'Classic dungeon adventure, light-hearted',
    setting:
      'The ruins of Castle Dunmoor and the vaults beneath it, once home to a king who vanished with his treasure.',
    hook: 'A map bought in a tavern leads to a hidden stair beneath Dunmoor. Rival treasure hunters are already digging.',
    acts: [
      'Reach the entrance: dodge the rival crew, the collapsing gatehouse and the ghost of the porter.',
      'Explore the vaults: traps, a flooded crypt, a talking gargoyle who gives riddles.',
      'Find the crown, learn its price, and escape as the vaults collapse.',
    ],
    npcs: [
      { name: 'Captain Rue Marlowe', role: 'Rival treasure hunter, charming and dangerous' },
      { name: 'Grumbledown', role: 'Riddling gargoyle who guards the deepest door' },
      { name: 'King Aldric (shade)', role: 'The sunken king, bound to his crown' },
    ],
    secret:
      'The crown grants great power but slowly turns its wearer to stone. Aldric hid it to protect his people, not to hoard it.',
  },
];

export function getAdventure(id: string | null | undefined): Adventure | undefined {
  return ADVENTURES.find((a) => a.id === id);
}

export function formatAdventureForPrompt(adventure: Adventure): string {
  return [
    'Language: narrate and speak in Thai (ภาษาไทย) at all times, including dialogue. Keep proper names as written.',
    `Adventure: ${adventure.title}`,
    `Tone: ${adventure.tone}`,
    `Setting: ${adventure.setting}`,
    `Opening hook: ${adventure.hook}`,
    'Story outline (reveal gradually, adapt to player choices, never dump it all at once):',
    ...adventure.acts.map((act, i) => `  Act ${i + 1}: ${act}`),
    'Key characters:',
    ...adventure.npcs.map((n) => `  - ${n.name}: ${n.role}`),
    `Hidden truth (DM only, do not reveal until earned): ${adventure.secret}`,
  ].join('\n');
}

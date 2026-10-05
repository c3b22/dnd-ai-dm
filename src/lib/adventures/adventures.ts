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
  {
    id: 'the-clockwork-orphan',
    titleTh: 'เด็กกำพร้าจักรกล',
    taglineTh:
      'หุ่นจักรกลเด็กตื่นขึ้นในโรงงานร้าง และมีใครบางคนต้องการทำลายมันก่อนที่มันจะจำได้ว่าใครสร้างมันขึ้นมา',
    toneTh: 'ไขปริศนาสตีมพังก์ หวานปนเศร้า',
    openingTh:
      'ในย่านคอกสไปร์ที่เต็มไปด้วยโรงงานร้างของนักประดิษฐ์ผู้ล่วงลับ จักรกลรูปเด็กตัวหนึ่งเปิดทำงานขึ้นเป็นครั้งแรกในรอบหลายสิบปี มันเดินโซเซออกมาพบพวกคุณกลางตรอกมืด ขณะที่เสียงรองเท้าหนังของกลุ่มคนแปลกหน้ากำลังตามล่ามันมาติดๆ...',
    title: 'The Clockwork Orphan',
    tagline:
      "An automaton child wakes for the first time in decades, and someone wants it dismantled before it remembers who built it.",
    tone: 'Steampunk mystery, bittersweet',
    setting:
      'Cogspire, a district built around the ruined workshop of a dead inventor, now run by a guild that guards his old secrets.',
    hook: 'A clockwork child activates and stumbles into the party, pursued by hired men who want it destroyed before it says a word.',
    acts: [
      'Shelter the automaton, question it gently, and trace its maker through the guild district.',
      "Infiltrate the inventor's guild archive to learn why the automaton was built and who wants it gone.",
      "Confront the one who ordered its destruction and decide the orphan's fate.",
    ],
    npcs: [
      { name: 'Tilly Brasscog', role: 'Guild clerk, eager to help but knows more than she admits' },
      { name: 'Magistrate Orren Vale', role: 'Guildmaster who fears what the automaton remembers' },
      { name: '"Six", the Clockwork Orphan', role: 'The automaton itself, curious and childlike' },
    ],
    secret:
      "Six holds the dead inventor's final memories, proof that the magistrate stole his greatest inventions.",
  },
  {
    id: 'the-starving-god-of-red-dunes',
    titleTh: 'เทพผู้อดอยากแห่งเนินทรายสีแดง',
    taglineTh: 'เทพที่ถูกฝังอยู่ใต้เนินทรายตื่นขึ้นด้วยความหิวโหย เมืองทะเลทรายต้องเลี้ยงมันหรือหลบหนี',
    toneTh: 'ผจญภัยเอาชีวิตรอด เข้มข้นลึกลับ',
    openingTh:
      'กองคาราวานหายไปบนถนนแสวงบุญเก่าครั้งแล้วครั้งเล่า ขณะที่ผู้เฒ่าแห่งเมืองเกชอามาร์กำลังเงียบๆ เตรียม "เครื่องสักการะ" ที่ดูเหมือนการบูชายัญมากกว่าของกำนัล และพวกคุณเพิ่งรู้ว่าใครอาจเป็นเครื่องสักการะครั้งต่อไป...',
    title: 'The Starving God of the Red Dunes',
    tagline: 'A buried god wakes hungry beneath the dunes, and a desert town must feed it or flee it.',
    tone: 'Survival adventure, mythic and tense',
    setting:
      'Qesh-Amar, a desert waystation built atop the bones of a forgotten god, kept fed by a tribute the elders no longer question.',
    hook: 'Caravans keep vanishing on the old pilgrim road, and the town elders are quietly preparing a "tribute" that looks a lot like a sacrifice.',
    acts: [
      'Investigate the vanishing caravans, uncover the tribute ritual, and decide whether to intervene.',
      'Cross the dunes to the buried temple, surviving sandstorms and the things that guard it.',
      "Face the starving god: appease it, banish it, or break the chain that binds it.",
    ],
    npcs: [
      { name: 'Elder Dahab', role: 'Town leader who insists the tributes are mercy, not murder' },
      { name: 'Rashida the Wayfinder', role: 'Guide who lost a sibling to the ritual and wants it ended' },
      { name: 'The Starving God', role: 'Not truly a god, but a bound spirit of famine mistaken for one' },
    ],
    secret:
      "It is a bound famine-spirit, not a god: killing it unleashes real famine across the region, and only breaking its ancient binding, not feeding or slaying it, ends the hunger for good.",
  },
  {
    id: 'the-mask-collector-of-gallowsreach',
    titleTh: 'นักสะสมหน้ากากแห่งแกลโลวส์รีช',
    taglineTh: 'ในเมืองที่ขุนนางสวมหน้ากากแสดงตัวตนแท้จริง มีใครบางคนกำลังขโมยใบหน้าคนไปจริงๆ',
    toneTh: 'ทริลเลอร์ลึกลับในเมือง กอธิคเข้มข้น',
    openingTh:
      'ขุนนางผู้หนึ่งถูกพบในสภาพยังมีชีวิตแต่ไร้ใบหน้า ท่ามกลางงานเต้นรำสวมหน้ากากประจำปีของแกลโลวส์รีช พวกคุณถูกจ้างให้จับนักสะสมหน้ากากให้ได้ก่อนงานเต้นรำครั้งต่อไปจะมาถึง...',
    title: 'The Mask Collector of Gallowsreach',
    tagline: 'In a city where masked nobles claim to show their true nature, someone is stealing faces, literally.',
    tone: 'Urban intrigue, gothic, tense',
    setting:
      'Gallowsreach, a city of masked nobility, where each noble house wears a mask said to reveal its wearer\'s true self.',
    hook: 'A noble is found alive but faceless, and the party is hired to catch the collector before the next masquerade ball.',
    acts: [
      'Investigate the victim and the masquerade culture, questioning masked suspects at a noble ball.',
      'Track the collector through the under-city of mask-makers and black-market enchanters.',
      'Corner the collector and learn why they are hoarding faces.',
    ],
    npcs: [
      { name: 'Lady Iseult Corvain', role: 'Grieving noble who hires the party and hides her own guilt' },
      { name: 'Pock', role: 'Under-city mask-maker and informant with secrets of his own' },
      { name: 'The Collector', role: 'A disgraced maskmaker reclaiming an identity stolen long ago' },
    ],
    secret:
      "The Collector is stealing back fragments of their own true face, carved up and sold as masks years ago by the very nobility they now hunt.",
  },
  {
    id: 'the-toad-kings-hoard',
    titleTh: 'สมบัติของราชาคางคก',
    taglineTh:
      'ปราสาทจมลงใต้ทะเลสาบสาปแช่งมาหลายชั่วอายุคน สาปให้กษัตริย์และราชสำนักกลายเป็นสิ่งมีชีวิตคล้ายคางคกที่ยังคงเฝ้าทองคำของพระองค์',
    toneTh: 'ผจญภัยดันเจี้ยนคลาสสิก สนุกปนพิลึกกึกกือเล็กน้อย',
    openingTh:
      'นักดำน้ำรับเหมาพบทางเข้าที่แห้งซ่อนอยู่ใต้ทะเลสาบมิรโรว์ นำไปสู่ปราสาทจมของกษัตริย์บรานน็อคที่ถูกสาปจากการทรยศของเสนาบดีคนสนิท แต่ทีมนักดำน้ำคู่แข่งมาถึงก่อนแล้ว และกำลังมุ่งหน้าลงไปในความมืดใต้น้ำ...',
    title: "The Toad King's Hoard",
    tagline:
      'A castle sank beneath a haunted lake generations ago, cursing its king and court into toad-things that still guard his gold.',
    tone: 'Classic dungeon adventure, light-hearted with a grotesque edge',
    setting:
      "Lake Mirrow, where King Brannoc's castle sank after his seneschal's betrayal. The drowned halls sit inside an air-pocket of old magic, dry but far from empty.",
    hook: 'Treasure divers found a hidden dry entrance into the sunken castle through the lakebed. A rival diving crew is already heading down ahead of the party.',
    acts: [
      'Enter the drowned castle through the air-pocket entrance: outpace the rival crew, wade flooded halls, and meet the first toad-courtiers.',
      "Explore the throne hall and crypt: trade riddles with a drowned jester's ghost and dodge traps left by the vengeful seneschal's spirit.",
      "Reach King Brannoc's hoard and face the Toad King himself, a giant toad-thing who still remembers being human: break the curse, slay him, or grab the gold and run.",
    ],
    npcs: [
      { name: 'Captain Wick Halloway', role: 'Rival treasure-diving captain, ruthless but plays fair' },
      { name: 'Josper, the Drowned Jester', role: 'Riddling ghost who wants his own curse ended too' },
      { name: 'King Brannoc (toad-shaped)', role: 'The cursed king, part monster and part tragic nobleman' },
    ],
    secret:
      "The seneschal cast the curse through an enchanted crown, now sitting atop the hoard. Destroying the crown, not killing Brannoc, is the only way to free everyone it twisted, but it is also the richest prize in the vault.",
  },
  {
    id: 'the-three-vaults-of-the-starfall-crown',
    titleTh: 'สามกรุแห่งมงกุฎดาวร่วง',
    taglineTh:
      'มงกุฎอัญมณีสามชิ้นถูกแยกออกจากกันและซ่อนไว้ในกรุกับดักสามแห่ง ใครรวมมันกลับคืนได้อาจบังคับดาวตกได้',
    toneTh: 'ผจญภัยดันเจี้ยนคลาสสิกแนว "บ้านกับดัก" สามรัง สนุกตื่นเต้น',
    openingTh:
      'เศษแผนที่เก่าที่ซื้อมาเผยว่า มงกุฎดาวร่วงในตำนานถูกแบ่งออกเป็นสามชิ้นและซ่อนไว้โดยผู้สวมคนสุดท้าย เพื่อไม่ให้ใครรวมมันกลับคืนได้อีก แต่กลุ่มนักล่าชิ้นมงกุฎคู่แข่งก็อ่านแผนที่เดียวกันออก และกำลังมุ่งหน้าไปยังกรุแรกแล้ว...',
    title: 'The Three Vaults of the Starfall Crown',
    tagline:
      'A crown of three jewels was broken apart and hidden in three trap-filled vaults; whoever reunites it may command a fallen star.',
    tone: 'Classic "funhouse" dungeon crawl across three linked lairs, light-hearted and puzzle-heavy',
    setting:
      'Three separate ruins scattered across the region, each holding one shard of the Starfall Crown behind its own themed gauntlet of traps and guardians.',
    hook: "A map fragment reveals the Starfall Crown was broken into three shards by its last wearer, to keep it from ever being made whole again. A rival band of shard-hunters read the same map and already has a head start.",
    acts: [
      'Shard of Flame: brave a volcanic ruin of fire traps and swinging blades to claim the first shard from its guardian.',
      'Shard of Tide: navigate a flooded cistern-vault of water puzzles and a drowned guardian for the second shard.',
      'Shard of Gear: outwit a clockwork vault of mechanical traps and an automaton guardian, then choose whether to reunite the crown at all.',
    ],
    npcs: [
      { name: 'Rook Emberhand', role: 'Rival shard-hunter, charming rogue who may ally or betray' },
      { name: 'Mira Quill', role: "Scholar who deciphered the map, wants the crown studied, not worn" },
      { name: 'The Flame Warden', role: 'Guardian spirit bound to the first vault' },
    ],
    secret:
      "The crown was shattered because wearing it whole lets its bearer command a captured fragment of a dying star, one that is slowly going mad with fury. Reuniting the shards grants great power, but risks waking the star's wrath on the land.",
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

# Scene image prompts

สร้างจาก `src/lib/scenes/catalog.json` (รันใหม่: `node scripts/generate-scenes.mjs --prompts`)

## วิธีใช้

1. คัดลอก prompt ของแต่ละภาพไปใส่ในเครื่องมือสร้างภาพที่คุณใช้
2. เลือกอัตราส่วนกว้าง 21:9 ถ้าทำได้ (16:9 ก็ได้ ระบบครอบตัดเป็นแถบกว้างเอง)
3. บันทึกไฟล์เป็น JPG ตั้งชื่อตาม id ใส่ในโฟลเดอร์ `public/scenes/` เช่น `public/scenes/tavern-interior.jpg` (ความกว้างประมาณ 1600 px, ไม่เกิน ~400 KB)
4. ฉากทั่วไปทำครั้งเดียวใช้ได้ทุกเรื่อง ฉากไหนยังไม่มีไฟล์ จะใช้ภาพร่างที่วาดเองแทน (ตามที่ทำไว้ในต้นแบบ ยังไม่ได้ต่อเข้าแอปจริง)

**เคล็ดลับให้สไตล์ตรงกัน:** ใช้เครื่องมือและโมเดลเดียวกันทั้งชุด สร้างฉากทั่วไปก่อน แล้วค่อยทำฉากของแต่ละเรื่องทีละเรื่อง

## ฉากทั่วไป (ใช้ซ้ำได้ทุกเรื่อง)

### tavern-interior · โรงเตี๊ยม (ภายใน)

```text
The interior of a busy medieval fantasy tavern, warm firelight from a large stone hearth, heavy timber beams, long wooden tables with tankards and candles, a bar counter with barrels, cosy and lived-in, empty of people or with only distant silhouettes.
Natural, slightly desaturated colour grading with balanced contrast (a colour tint may be applied later per adventure, so avoid extreme colour casts).
Wide cinematic environment concept art, digital matte painting with visible painterly brush strokes, high fantasy tabletop RPG setting, atmospheric depth, one clear light source. Keep the main subject inside the middle horizontal third of the frame because the image is cropped to a wide banner. No text, no logos, no watermark, no modern objects, no close-up faces, no people in the foreground.
```

### tavern-exterior-night · หน้าโรงเตี๊ยมยามค่ำ

```text
A roadside fantasy inn at night seen from the road, warm glowing windows, a hanging wooden sign with no readable text, smoke from the chimney, a stable beside it, lantern light on wet cobblestones.
Natural, slightly desaturated colour grading with balanced contrast (a colour tint may be applied later per adventure, so avoid extreme colour casts).
Wide cinematic environment concept art, digital matte painting with visible painterly brush strokes, high fantasy tabletop RPG setting, atmospheric depth, one clear light source. Keep the main subject inside the middle horizontal third of the frame because the image is cropped to a wide banner. No text, no logos, no watermark, no modern objects, no close-up faces, no people in the foreground.
```

### city-market-day · ตลาดในเมือง

```text
A crowded medieval fantasy city market square in daylight, colourful cloth awnings, stalls of fruit cloth and metalwork, timber-framed buildings, banners, distant crowd as small silhouettes.
Natural, slightly desaturated colour grading with balanced contrast (a colour tint may be applied later per adventure, so avoid extreme colour casts).
Wide cinematic environment concept art, digital matte painting with visible painterly brush strokes, high fantasy tabletop RPG setting, atmospheric depth, one clear light source. Keep the main subject inside the middle horizontal third of the frame because the image is cropped to a wide banner. No text, no logos, no watermark, no modern objects, no close-up faces, no people in the foreground.
```

### town-street-night · ถนนในเมืองยามค่ำ

```text
A narrow cobbled medieval fantasy town street at night, leaning half-timbered houses, a few oil lamps, wet stones reflecting light, a dark alley branching off, drifting mist.
Natural, slightly desaturated colour grading with balanced contrast (a colour tint may be applied later per adventure, so avoid extreme colour casts).
Wide cinematic environment concept art, digital matte painting with visible painterly brush strokes, high fantasy tabletop RPG setting, atmospheric depth, one clear light source. Keep the main subject inside the middle horizontal third of the frame because the image is cropped to a wide banner. No text, no logos, no watermark, no modern objects, no close-up faces, no people in the foreground.
```

### forest-road · ถนนในป่า

```text
A dirt road winding through a sunlit old-growth forest, dappled light through tall trees, mossy roots, a wooden signpost with no readable text, sense of travel and quiet danger.
Natural, slightly desaturated colour grading with balanced contrast (a colour tint may be applied later per adventure, so avoid extreme colour casts).
Wide cinematic environment concept art, digital matte painting with visible painterly brush strokes, high fantasy tabletop RPG setting, atmospheric depth, one clear light source. Keep the main subject inside the middle horizontal third of the frame because the image is cropped to a wide banner. No text, no logos, no watermark, no modern objects, no close-up faces, no people in the foreground.
```

### deep-forest · ป่าลึก

```text
The deep heart of an ancient dark forest, enormous gnarled trees, hanging moss, shafts of pale light, a faint narrow game trail, mysterious and slightly ominous.
Natural, slightly desaturated colour grading with balanced contrast (a colour tint may be applied later per adventure, so avoid extreme colour casts).
Wide cinematic environment concept art, digital matte painting with visible painterly brush strokes, high fantasy tabletop RPG setting, atmospheric depth, one clear light source. Keep the main subject inside the middle horizontal third of the frame because the image is cropped to a wide banner. No text, no logos, no watermark, no modern objects, no close-up faces, no people in the foreground.
```

### mountain-pass · ช่องเขา

```text
A rugged mountain pass with a narrow trail between towering rock walls, distant snowy peaks, low clouds, a lone stone cairn marker, vast scale.
Natural, slightly desaturated colour grading with balanced contrast (a colour tint may be applied later per adventure, so avoid extreme colour casts).
Wide cinematic environment concept art, digital matte painting with visible painterly brush strokes, high fantasy tabletop RPG setting, atmospheric depth, one clear light source. Keep the main subject inside the middle horizontal third of the frame because the image is cropped to a wide banner. No text, no logos, no watermark, no modern objects, no close-up faces, no people in the foreground.
```

### cave-entrance · ปากถ้ำ

```text
A large natural cave entrance in a rocky hillside, overgrown with vines, darkness inside, scattered bones and old torch stubs near the mouth, cool light outside and deep shadow within.
Natural, slightly desaturated colour grading with balanced contrast (a colour tint may be applied later per adventure, so avoid extreme colour casts).
Wide cinematic environment concept art, digital matte painting with visible painterly brush strokes, high fantasy tabletop RPG setting, atmospheric depth, one clear light source. Keep the main subject inside the middle horizontal third of the frame because the image is cropped to a wide banner. No text, no logos, no watermark, no modern objects, no close-up faces, no people in the foreground.
```

### dungeon-corridor · ทางเดินดันเจี้ยน

```text
A long stone dungeon corridor with arched ceiling, wall torches casting flickering orange light, iron-bound wooden doors, damp floor, cobwebs, a distant vanishing point in darkness.
Natural, slightly desaturated colour grading with balanced contrast (a colour tint may be applied later per adventure, so avoid extreme colour casts).
Wide cinematic environment concept art, digital matte painting with visible painterly brush strokes, high fantasy tabletop RPG setting, atmospheric depth, one clear light source. Keep the main subject inside the middle horizontal third of the frame because the image is cropped to a wide banner. No text, no logos, no watermark, no modern objects, no close-up faces, no people in the foreground.
```

### crypt · สุสานใต้ดิน

```text
An ancient underground crypt, rows of stone sarcophagi with carved lids, cold blue-green light seeping through cracks, thick dust, low mist along the floor, solemn and still.
Natural, slightly desaturated colour grading with balanced contrast (a colour tint may be applied later per adventure, so avoid extreme colour casts).
Wide cinematic environment concept art, digital matte painting with visible painterly brush strokes, high fantasy tabletop RPG setting, atmospheric depth, one clear light source. Keep the main subject inside the middle horizontal third of the frame because the image is cropped to a wide banner. No text, no logos, no watermark, no modern objects, no close-up faces, no people in the foreground.
```

### throne-room · ท้องพระโรง

```text
A grand medieval fantasy throne room, tall stone columns, long banners, shafts of light from high windows, an empty carved throne on a dais at the end of a long red carpet.
Natural, slightly desaturated colour grading with balanced contrast (a colour tint may be applied later per adventure, so avoid extreme colour casts).
Wide cinematic environment concept art, digital matte painting with visible painterly brush strokes, high fantasy tabletop RPG setting, atmospheric depth, one clear light source. Keep the main subject inside the middle horizontal third of the frame because the image is cropped to a wide banner. No text, no logos, no watermark, no modern objects, no close-up faces, no people in the foreground.
```

### castle-ruins · ซากปราสาท

```text
The ruins of a large castle on a hillside at dusk, collapsed towers and broken walls overgrown with ivy, long dramatic shadows, scattered rubble in the foreground, a dark gap suggesting a hidden entrance.
Natural, slightly desaturated colour grading with balanced contrast (a colour tint may be applied later per adventure, so avoid extreme colour casts).
Wide cinematic environment concept art, digital matte painting with visible painterly brush strokes, high fantasy tabletop RPG setting, atmospheric depth, one clear light source. Keep the main subject inside the middle horizontal third of the frame because the image is cropped to a wide banner. No text, no logos, no watermark, no modern objects, no close-up faces, no people in the foreground.
```

### harbor-docks · ท่าเรือ

```text
A weathered wooden harbour dock with moored fishing boats, coiled rope, barrels and crates, lantern posts, calm water reflecting the sky, distant lighthouse, early evening.
Natural, slightly desaturated colour grading with balanced contrast (a colour tint may be applied later per adventure, so avoid extreme colour casts).
Wide cinematic environment concept art, digital matte painting with visible painterly brush strokes, high fantasy tabletop RPG setting, atmospheric depth, one clear light source. Keep the main subject inside the middle horizontal third of the frame because the image is cropped to a wide banner. No text, no logos, no watermark, no modern objects, no close-up faces, no people in the foreground.
```

### campfire-night · แคมป์ไฟกลางคืน

```text
A travellers' campfire in a forest clearing at night, empty bedrolls and packs around it, warm firelight against cold blue moonlit trees, sparks rising, stars visible through the canopy.
Natural, slightly desaturated colour grading with balanced contrast (a colour tint may be applied later per adventure, so avoid extreme colour casts).
Wide cinematic environment concept art, digital matte painting with visible painterly brush strokes, high fantasy tabletop RPG setting, atmospheric depth, one clear light source. Keep the main subject inside the middle horizontal third of the frame because the image is cropped to a wide banner. No text, no logos, no watermark, no modern objects, no close-up faces, no people in the foreground.
```

## ระฆังจมแห่งมาร์โรว์เมียร์

### bell-village · หมู่บ้านริมทะเลสาบ

```text
A fog-covered fishing village on the shore of a still lake at night, small dark cottages with a few lit windows, a pale moon behind clouds, the spire of a drowned chapel faintly visible under the black water.
Palette: cold teal, slate blue and fog grey with a single warm amber lantern glow. Mood: eerie, quiet, mournful, gothic mystery. Night, heavy mist.
Wide cinematic environment concept art, digital matte painting with visible painterly brush strokes, high fantasy tabletop RPG setting, atmospheric depth, one clear light source. Keep the main subject inside the middle horizontal third of the frame because the image is cropped to a wide banner. No text, no logos, no watermark, no modern objects, no close-up faces, no people in the foreground.
```

### bell-ferry · กลางทะเลสาบ

```text
A lone ferry boat with one small lantern drifting across an enormous foggy lake at night, the far shoreline barely visible, ripples spreading on dark water.
Palette: cold teal, slate blue and fog grey with a single warm amber lantern glow. Mood: eerie, quiet, mournful, gothic mystery. Night, heavy mist.
Wide cinematic environment concept art, digital matte painting with visible painterly brush strokes, high fantasy tabletop RPG setting, atmospheric depth, one clear light source. Keep the main subject inside the middle horizontal third of the frame because the image is cropped to a wide banner. No text, no logos, no watermark, no modern objects, no close-up faces, no people in the foreground.
```

### bell-hand · ใต้ท่าเรือ

```text
The end of a wooden pier over dark water at night, a faint ghostly teal glow beneath the surface, mist curling over the water, a sense of something rising from below.
Palette: cold teal, slate blue and fog grey with a single warm amber lantern glow. Mood: eerie, quiet, mournful, gothic mystery. Night, heavy mist.
Wide cinematic environment concept art, digital matte painting with visible painterly brush strokes, high fantasy tabletop RPG setting, atmospheric depth, one clear light source. Keep the main subject inside the middle horizontal third of the frame because the image is cropped to a wide banner. No text, no logos, no watermark, no modern objects, no close-up faces, no people in the foreground.
```

## ราชาหมาป่าแห่งแอชเชนเฟลล์

### wolf-hall · โถงยาวของยาร์ล

```text
The interior of a vast Norse longhall, carved wooden pillars, a great central fire pit casting warm light, long feast tables, shadows in the rafters, a snow-dusted doorway in the distance.
Palette: icy blue, pale white snow, deep charcoal, with small warm orange firelight accents. Mood: harsh, heroic, wintry saga. Nordic-inspired architecture.
Wide cinematic environment concept art, digital matte painting with visible painterly brush strokes, high fantasy tabletop RPG setting, atmospheric depth, one clear light source. Keep the main subject inside the middle horizontal third of the frame because the image is cropped to a wide banner. No text, no logos, no watermark, no modern objects, no close-up faces, no people in the foreground.
```

### wolf-snow · รอยเท้าบนหิมะ

```text
A snowy pine forest at blue dawn, a trail of large paw prints in fresh snow leading toward distant mountains, cold pale light, breath-like mist.
Palette: icy blue, pale white snow, deep charcoal, with small warm orange firelight accents. Mood: harsh, heroic, wintry saga. Nordic-inspired architecture.
Wide cinematic environment concept art, digital matte painting with visible painterly brush strokes, high fantasy tabletop RPG setting, atmospheric depth, one clear light source. Keep the main subject inside the middle horizontal third of the frame because the image is cropped to a wide banner. No text, no logos, no watermark, no modern objects, no close-up faces, no people in the foreground.
```

### wolf-pass · ช่องเขาโหยหวน

```text
A narrow mountain pass in a howling blizzard, jagged black cliffs on both sides, swirling snow, several pairs of glowing yellow wolf eyes among the rocks.
Palette: icy blue, pale white snow, deep charcoal, with small warm orange firelight accents. Mood: harsh, heroic, wintry saga. Nordic-inspired architecture.
Wide cinematic environment concept art, digital matte painting with visible painterly brush strokes, high fantasy tabletop RPG setting, atmospheric depth, one clear light source. Keep the main subject inside the middle horizontal third of the frame because the image is cropped to a wide banner. No text, no logos, no watermark, no modern objects, no close-up faces, no people in the foreground.
```

## ตลาดพันประตู

### market-square · ลานตลาดยามสนธยา

```text
A twilight city square filled with a magical bazaar, dozens of freestanding doorways and stalls glowing with different colours, strings of floating lanterns overhead, ornate awnings.
Palette: deep indigo and violet dusk with jewel-toned glowing lanterns in gold, teal and magenta. Mood: enchanting, mischievous, slightly dangerous.
Wide cinematic environment concept art, digital matte painting with visible painterly brush strokes, high fantasy tabletop RPG setting, atmospheric depth, one clear light source. Keep the main subject inside the middle horizontal third of the frame because the image is cropped to a wide banner. No text, no logos, no watermark, no modern objects, no close-up faces, no people in the foreground.
```

### market-redroom · ห้องพื้นกระจก

```text
A surreal room with a mirror-like glass floor and an ocean for a ceiling, glowing fish swimming above, one towering red door in the centre emitting crimson light and reflecting below.
Palette: deep indigo and violet dusk with jewel-toned glowing lanterns in gold, teal and magenta. Mood: enchanting, mischievous, slightly dangerous.
Wide cinematic environment concept art, digital matte painting with visible painterly brush strokes, high fantasy tabletop RPG setting, atmospheric depth, one clear light source. Keep the main subject inside the middle horizontal third of the frame because the image is cropped to a wide banner. No text, no logos, no watermark, no modern objects, no close-up faces, no people in the foreground.
```

### market-lanterns · ร้านโคมไฟ

```text
A narrow alley in a magical night market packed with hundreds of hanging lanterns in every colour, a cosy lantern seller's cart, layered depth, soft glowing bokeh.
Palette: deep indigo and violet dusk with jewel-toned glowing lanterns in gold, teal and magenta. Mood: enchanting, mischievous, slightly dangerous.
Wide cinematic environment concept art, digital matte painting with visible painterly brush strokes, high fantasy tabletop RPG setting, atmospheric depth, one clear light source. Keep the main subject inside the middle horizontal third of the frame because the image is cropped to a wide banner. No text, no logos, no watermark, no modern objects, no close-up faces, no people in the foreground.
```

## มงกุฎกษัตริย์ผู้จมสู่ใต้ดิน

### crown-stairs · บันไดลับ

```text
A steep ancient stone staircase descending into darkness beneath a ruined keep, carved crescent moon and star symbols on the walls, torchlight glowing far below, dust in the air.
Palette: dusty ochre, warm torchlight orange against cool stone grey and shadow. Mood: adventurous, classic dungeon crawl, ancient and crumbling.
Wide cinematic environment concept art, digital matte painting with visible painterly brush strokes, high fantasy tabletop RPG setting, atmospheric depth, one clear light source. Keep the main subject inside the middle horizontal third of the frame because the image is cropped to a wide banner. No text, no logos, no watermark, no modern objects, no close-up faces, no people in the foreground.
```

### crown-vault · ห้องของการ์กอยล์

```text
A vaulted underground treasure chamber with a great stone arch, a stone gargoyle statue with glowing green eyes guarding a deep doorway, torches on the walls, scattered coins and rubble.
Palette: dusty ochre, warm torchlight orange against cool stone grey and shadow. Mood: adventurous, classic dungeon crawl, ancient and crumbling.
Wide cinematic environment concept art, digital matte painting with visible painterly brush strokes, high fantasy tabletop RPG setting, atmospheric depth, one clear light source. Keep the main subject inside the middle horizontal third of the frame because the image is cropped to a wide banner. No text, no logos, no watermark, no modern objects, no close-up faces, no people in the foreground.
```

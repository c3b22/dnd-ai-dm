'use client';

import { useEffect, useState } from 'react';
import { getScene, moodTint } from '@/lib/scenes/scenes';

export interface SceneBannerProps {
  sceneId: string | null;
  adventureId: string | null;
}

export function SceneBanner({ sceneId, adventureId }: SceneBannerProps) {
  const scene = getScene(sceneId);
  const [failedId, setFailedId] = useState<string | null>(null);

  // A different scene gets a fresh chance to load its image.
  useEffect(() => setFailedId(null), [sceneId]);

  if (!scene) return null;
  const tint = moodTint(adventureId);
  const imageMissing = failedId === scene.id;

  return (
    <figure className="scene" aria-label={`ฉาก: ${scene.nameTh}`}>
      {!imageMissing && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={scene.id}
          src={`/scenes/${scene.id}.jpg`}
          alt=""
          onError={() => setFailedId(scene.id)}
        />
      )}
      {tint && <div aria-hidden="true" className="tint" data-testid="scene-tint" style={{ background: tint }} />}
      <div aria-hidden="true" className="shade" />
      <figcaption>{scene.nameTh}</figcaption>
    </figure>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { getScene, moodTint } from '@/lib/scenes/scenes';

export interface SceneBannerProps {
  sceneId: string | null;
  adventureId: string | null;
}

export function SceneBanner({ sceneId, adventureId }: SceneBannerProps) {
  const scene = getScene(sceneId);
  const [failedId, setFailedId] = useState<string | null>(null);
  const [flashKey, setFlashKey] = useState(0);
  const previousScene = useRef<string | null>(null);

  // A different scene gets a fresh chance to load its image.
  useEffect(() => setFailedId(null), [sceneId]);

  // Announce the new place, but not the very first scene the page opens on.
  useEffect(() => {
    if (previousScene.current && sceneId && previousScene.current !== sceneId) {
      setFlashKey((k) => k + 1);
    }
    if (sceneId) previousScene.current = sceneId;
  }, [sceneId]);

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
      {flashKey > 0 && (
        <div key={flashKey} className="scene-title" aria-hidden="true" data-testid="scene-title">
          — {scene.nameTh} —
        </div>
      )}
      <figcaption>{scene.nameTh}</figcaption>
    </figure>
  );
}

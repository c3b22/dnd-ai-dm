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
    <figure
      aria-label={`ฉาก: ${scene.nameTh}`}
      style={{
        position: 'relative',
        margin: '0 0 12px',
        height: 170,
        overflow: 'hidden',
        borderRadius: 8,
        background: 'linear-gradient(135deg, #1b2530, #0d1216)',
      }}
    >
      <style>{'@keyframes scene-fade{from{opacity:0}to{opacity:1}}'}</style>
      {!imageMissing && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={scene.id}
          src={`/scenes/${scene.id}.jpg`}
          alt=""
          onError={() => setFailedId(scene.id)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            animation: 'scene-fade 0.9s ease',
          }}
        />
      )}
      {tint && (
        <div
          aria-hidden="true"
          data-testid="scene-tint"
          style={{ position: 'absolute', inset: 0, background: tint, mixBlendMode: 'soft-light' }}
        />
      )}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 'auto 0 0 0',
          height: 70,
          background: 'linear-gradient(to top, rgba(8,12,15,.75), transparent)',
        }}
      />
      <figcaption style={{ position: 'absolute', left: 14, bottom: 10, color: '#f0ece2', fontSize: 14 }}>
        {scene.nameTh}
      </figcaption>
    </figure>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { getScene, getSceneAsync, moodTint, type Scene } from '@/lib/scenes/scenes';
import { getAdventure } from '@/lib/adventures/adventures';
import { supabaseBrowserClient } from '@/lib/supabase/client';

export interface SceneBannerProps {
  sceneId: string | null;
  adventureId: string | null;
}

export function SceneBanner({ sceneId, adventureId }: SceneBannerProps) {
  const builtin = getScene(sceneId);
  const [customScene, setCustomScene] = useState<(Scene & { imageUrl: string | null }) | undefined>(undefined);
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

  // A custom adventure's own scene isn't in the static catalog; resolve it from Storage.
  // Built-ins and generics already resolved synchronously above via `builtin`.
  useEffect(() => {
    if (builtin || !sceneId || !adventureId || getAdventure(adventureId)) {
      setCustomScene(undefined);
      return;
    }
    let cancelled = false;
    getSceneAsync(supabaseBrowserClient, adventureId, sceneId).then((s) => {
      if (!cancelled) setCustomScene(s);
    });
    return () => {
      cancelled = true;
    };
  }, [builtin, sceneId, adventureId]);

  const scene = builtin ?? customScene;
  if (!scene) return null;
  const tint = moodTint(adventureId);
  const imageMissing = failedId === scene.id;
  const imgSrc = customScene?.imageUrl ?? `/scenes/${scene.id}.jpg`;

  return (
    <figure className="scene" aria-label={`ฉาก: ${scene.nameTh}`}>
      {!imageMissing && (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={scene.id} src={imgSrc} alt="" onError={() => setFailedId(scene.id)} />
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

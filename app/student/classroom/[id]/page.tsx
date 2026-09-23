'use client';

import { useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

import { ClassroomSurface } from '@/components/classroom/ClassroomSurface';
import { useStageStore } from '@/lib/store';

export default function StudentClassroomPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const sceneId = searchParams.get('scene');
  const loadedStageId = useStageStore((state) => state.stage?.id ?? null);
  const scenes = useStageStore((state) => state.scenes);
  const currentSceneId = useStageStore((state) => state.currentSceneId);

  useEffect(() => {
    if (!sceneId || loadedStageId !== params.id || currentSceneId === sceneId) return;
    if (!scenes.some((scene) => scene.id === sceneId)) return;
    useStageStore.getState().setCurrentSceneId(sceneId);
  }, [currentSceneId, loadedStageId, params.id, sceneId, scenes]);

  return <ClassroomSurface classroomId={params.id} variant="page" audience="student" />;
}

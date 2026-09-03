import { Suspense } from 'react';
import { DoneScreen } from './DoneScreen';

/**
 * The short code arrives in the query string, and reading it makes the screen client-only.
 * The Suspense boundary keeps that bail-out local instead of pushing the whole route into
 * dynamic rendering.
 */
export default function DoneStepPage() {
  return (
    <Suspense fallback={null}>
      <DoneScreen />
    </Suspense>
  );
}

'use client';

import { BrowserAssetStore, BrowserDocumentStore, type DocumentStore } from '@openmaic/storage';

import type { AppDocument, AppStage } from '@/lib/document-store';
import { getDocumentStore } from '@/lib/document-store';
import { validateAppScene, validateAppStage } from '@/lib/document-store/validators';
import { getAssetPool, type AssetPoolStore } from '@/lib/media/asset-pool';
import { isConcreteMediaAddress } from '@/lib/media/resolve-media-ref';
import { slideMediaReferenceSlots } from '@/lib/media/slide-media-slots';
import type { AppScene } from '@/lib/types/stage';
import { createLogger } from '@/lib/logger';

const log = createLogger('BrowserCourseMigration');
const DOCUMENT_DATABASE_NAME = 'maic-documents';
const ASSET_DATABASE_NAME = 'maic-asset-pool';

export interface BrowserCourseMigrationResult {
  discovered: number;
  migrated: number;
  skipped: number;
  failed: number;
  copiedAssets: number;
  missingAssets: number;
}

let migrationPromise: Promise<BrowserCourseMigrationResult> | undefined;

function emptyResult(): BrowserCourseMigrationResult {
  return {
    discovered: 0,
    migrated: 0,
    skipped: 0,
    failed: 0,
    copiedAssets: 0,
    missingAssets: 0,
  };
}

function documentSlides(document: AppDocument) {
  const slides = [...(document.stage.whiteboard ?? [])];
  for (const scene of document.scenes) {
    if (scene.content.type === 'slide') slides.push(scene.content.canvas);
    slides.push(...(scene.whiteboards ?? []));
  }
  return slides;
}

function rewriteDocumentAssetRefs(
  document: AppDocument,
  replacements: ReadonlyMap<string, string>,
) {
  for (const slide of documentSlides(document)) {
    for (const slot of slideMediaReferenceSlots(slide)) {
      const current = slot.read();
      if (current && replacements.has(current)) slot.write(replacements.get(current));
    }
  }

  for (const scene of document.scenes) {
    for (const action of scene.actions ?? []) {
      if (action.type === 'speech' && action.audioId && replacements.has(action.audioId)) {
        action.audioId = replacements.get(action.audioId);
      }
    }
  }

  if (document.stage.videoManifest) {
    document.stage.videoManifest = Object.fromEntries(
      Object.entries(document.stage.videoManifest).map(([ref, value]) => [
        replacements.get(ref) ?? ref,
        value,
      ]),
    );
  }
}

function collectDocumentAssetRefs(document: AppDocument): string[] {
  const refs = new Set<string>();
  for (const slide of documentSlides(document)) {
    for (const slot of slideMediaReferenceSlots(slide)) {
      const ref = slot.read();
      if (ref && !isConcreteMediaAddress(ref)) refs.add(ref);
    }
  }
  for (const scene of document.scenes) {
    for (const action of scene.actions ?? []) {
      if (action.type === 'speech' && action.audioId && !isConcreteMediaAddress(action.audioId)) {
        refs.add(action.audioId);
      }
    }
  }
  for (const ref of Object.keys(document.stage.videoManifest ?? {})) {
    if (!isConcreteMediaAddress(ref)) refs.add(ref);
  }
  return [...refs];
}

async function copyAsset(
  ref: string,
  source: BrowserAssetStore,
  destination: AssetPoolStore,
): Promise<string | null> {
  const url = await source.resolve(ref);
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not read local asset ${ref}: ${response.status}`);
    const blob = await response.blob();
    return await destination.put(blob, blob.type ? { contentType: blob.type } : undefined);
  } finally {
    await source.release(ref).catch(() => undefined);
  }
}

async function migrateDocumentAssets(
  document: AppDocument,
  source: BrowserAssetStore,
  destination: AssetPoolStore,
): Promise<{ document: AppDocument; allocated: string[]; missing: number }> {
  const migrated = structuredClone(document);
  const replacements = new Map<string, string>();
  const allocated: string[] = [];
  let missing = 0;

  for (const ref of collectDocumentAssetRefs(migrated)) {
    const replacement = await copyAsset(ref, source, destination);
    if (!replacement) {
      missing += 1;
      continue;
    }
    replacements.set(ref, replacement);
    allocated.push(replacement);
  }
  rewriteDocumentAssetRefs(migrated, replacements);
  return { document: migrated, allocated, missing };
}

async function runMigration(): Promise<BrowserCourseMigrationResult> {
  if (typeof indexedDB === 'undefined') return emptyResult();

  const result = emptyResult();
  const sourceDocuments = new BrowserDocumentStore<AppScene, AppStage>({
    dbName: DOCUMENT_DATABASE_NAME,
    validateScene: validateAppScene,
    validateStage: validateAppStage,
  });
  const sourceAssets = new BrowserAssetStore({ dbName: ASSET_DATABASE_NAME });
  const destinationDocuments: DocumentStore<AppScene, AppStage> = getDocumentStore();
  const destinationAssets = getAssetPool();

  try {
    const summaries = await sourceDocuments.listDocuments();
    result.discovered = summaries.length;

    for (const summary of summaries) {
      const allocated: string[] = [];
      try {
        if (await destinationDocuments.loadDocument(summary.id)) {
          result.skipped += 1;
          continue;
        }
        const local = await sourceDocuments.loadDocument(summary.id);
        if (!local) {
          result.failed += 1;
          continue;
        }

        const migrated = await migrateDocumentAssets(local, sourceAssets, destinationAssets);
        allocated.push(...migrated.allocated);
        result.copiedAssets += migrated.allocated.length;
        result.missingAssets += migrated.missing;
        await destinationDocuments.saveDocument(migrated.document);

        const verified = await destinationDocuments.loadDocument(summary.id);
        if (!verified) throw new Error(`Server did not return migrated course ${summary.id}`);
        result.migrated += 1;
      } catch (error) {
        result.failed += 1;
        log.error(`Failed to migrate local course ${summary.id}:`, error);
        await Promise.allSettled(allocated.map((ref) => destinationAssets.remove(ref)));
      }
    }
  } finally {
    await sourceAssets.close().catch(() => undefined);
  }

  return result;
}

/**
 * Copy pre-cutover browser courses into the configured server store once per page load.
 * The source databases remain untouched; existing server ids are never overwritten.
 */
export function migrateBrowserCoursesToServer(): Promise<BrowserCourseMigrationResult> {
  return (migrationPromise ??= runMigration().catch((error) => {
    migrationPromise = undefined;
    throw error;
  }));
}

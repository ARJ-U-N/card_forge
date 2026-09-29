import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  updateDoc,
  type DocumentData,
  type DocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { getDb } from './client'
import { COLLECTIONS } from '@/lib/models/types'
import type { PrintConfig } from '@/lib/print-layout'

// ---------------------------------------------------------------------------
// PrintPreset type (kept here rather than models/types to avoid coupling
// the domain model layer to the print-layout engine types)
// ---------------------------------------------------------------------------

export interface PrintPreset {
  id: string
  workspaceId: string
  name: string
  config: PrintConfig
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function presetsCol(workspaceId: string) {
  return collection(
    getDb(),
    COLLECTIONS.workspaces,
    workspaceId,
    COLLECTIONS.printPresets,
  )
}

function presetDoc(workspaceId: string, presetId: string) {
  return doc(
    getDb(),
    COLLECTIONS.workspaces,
    workspaceId,
    COLLECTIONS.printPresets,
    presetId,
  )
}

function toIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString()
  return new Date().toISOString()
}

function mapPreset(snap: DocumentSnapshot<DocumentData>): PrintPreset | null {
  const d = snap.data()
  if (!d) return null
  return {
    id: snap.id,
    workspaceId: d.workspaceId ?? '',
    name: d.name ?? 'Untitled Preset',
    config: d.config ?? {},
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
  }
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createPrintPreset(
  workspaceId: string,
  name: string,
  config: PrintConfig,
): Promise<string> {
  const ref = await addDoc(presetsCol(workspaceId), {
    workspaceId,
    name,
    config,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updatePrintPreset(
  workspaceId: string,
  presetId: string,
  data: Partial<Pick<PrintPreset, 'name' | 'config'>>,
): Promise<void> {
  await updateDoc(presetDoc(workspaceId, presetId), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

export async function deletePrintPreset(
  workspaceId: string,
  presetId: string,
): Promise<void> {
  await deleteDoc(presetDoc(workspaceId, presetId))
}

export function subscribePrintPresets(
  workspaceId: string,
  onChange: (presets: PrintPreset[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    presetsCol(workspaceId),
    (snap) => {
      const presets = snap.docs
        .map(mapPreset)
        .filter((p): p is PrintPreset => p !== null)
        .sort((a, b) => a.name.localeCompare(b.name))
      onChange(presets)
    },
    onError,
  )
}

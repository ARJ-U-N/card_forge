import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
  type DocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { getDb } from './client'
import {
  COLLECTIONS,
  DEFAULT_CARD_CONFIG,
  type Design,
  type CardConfiguration,
  type CardDocument,
} from '@/lib/models/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function designsCol(workspaceId: string) {
  return collection(getDb(), COLLECTIONS.workspaces, workspaceId, COLLECTIONS.designs)
}

function designDoc(workspaceId: string, designId: string) {
  return doc(getDb(), COLLECTIONS.workspaces, workspaceId, COLLECTIONS.designs, designId)
}

function toIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString()
  return new Date().toISOString()
}

const EMPTY_DOC: CardDocument = { elements: [], background: '#ffffff' }

function mapDesign(snap: DocumentSnapshot<DocumentData>): Design | null {
  const d = snap.data()
  if (!d) return null
  return {
    id: snap.id,
    workspaceId: d.workspaceId ?? '',
    name: d.name ?? 'Untitled',
    templateId: d.templateId ?? null,
    folderId: d.folderId ?? null,
    cardConfiguration: { ...DEFAULT_CARD_CONFIG, ...(d.cardConfiguration ?? {}) },
    frontDocument: d.frontDocument ?? EMPTY_DOC,
    backDocument: d.backDocument ?? EMPTY_DOC,
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
  }
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createDesign(
  workspaceId: string,
  name: string,
  templateId: string | null = null,
  config: CardConfiguration = DEFAULT_CARD_CONFIG,
  frontDoc: CardDocument = EMPTY_DOC,
  backDoc: CardDocument = EMPTY_DOC,
  folderId: string | null = null,
): Promise<string> {
  const ref = await addDoc(designsCol(workspaceId), {
    workspaceId,
    name,
    templateId,
    folderId,
    cardConfiguration: config,
    frontDocument: frontDoc,
    backDocument: backDoc,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function getDesign(
  workspaceId: string,
  designId: string,
): Promise<Design | null> {
  const snap = await getDoc(designDoc(workspaceId, designId))
  return mapDesign(snap)
}

export async function updateDesign(
  workspaceId: string,
  designId: string,
  data: Partial<Pick<Design, 'name' | 'cardConfiguration' | 'frontDocument' | 'backDocument'>>,
): Promise<void> {
  await updateDoc(designDoc(workspaceId, designId), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteDesign(
  workspaceId: string,
  designId: string,
): Promise<void> {
  await deleteDoc(designDoc(workspaceId, designId))
}

export function subscribeDesigns(
  workspaceId: string,
  onChange: (designs: Design[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    designsCol(workspaceId),
    (snap) => {
      const designs = snap.docs
        .map(mapDesign)
        .filter((d): d is Design => d !== null)
      onChange(designs)
    },
    onError,
  )
}

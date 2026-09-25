import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  where,
  type DocumentData,
  type DocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { getDb } from './client'
import {
  COLLECTIONS,
  DEFAULT_CARD_CONFIG,
  type Template,
  type CardDocument,
} from '@/lib/models/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function templatesCol() {
  return collection(getDb(), COLLECTIONS.templates)
}

function templateDoc(id: string) {
  return doc(getDb(), COLLECTIONS.templates, id)
}

function toIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString()
  return new Date().toISOString()
}

const EMPTY_DOC: CardDocument = { elements: [], background: '#ffffff' }

function mapTemplate(snap: DocumentSnapshot<DocumentData>): Template | null {
  const d = snap.data()
  if (!d) return null
  return {
    id: snap.id,
    name: d.name ?? '',
    previewImage: d.previewImage ?? '',
    status: d.status ?? 'user',
    workspaceId: d.workspaceId ?? null,
    cardConfiguration: { ...DEFAULT_CARD_CONFIG, ...(d.cardConfiguration ?? {}) },
    frontDocument: d.frontDocument ?? EMPTY_DOC,
    backDocument: d.backDocument ?? EMPTY_DOC,
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
  }
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function getTemplate(id: string): Promise<Template | null> {
  const snap = await getDoc(templateDoc(id))
  return mapTemplate(snap)
}

export async function getOfficialTemplates(): Promise<Template[]> {
  const q = query(templatesCol(), where('status', '==', 'official'))
  const snap = await getDocs(q)
  return snap.docs.map(mapTemplate).filter((t): t is Template => t !== null)
}

export async function getUserTemplates(workspaceId: string): Promise<Template[]> {
  const q = query(
    templatesCol(),
    where('status', '==', 'user'),
    where('workspaceId', '==', workspaceId),
  )
  const snap = await getDocs(q)
  return snap.docs.map(mapTemplate).filter((t): t is Template => t !== null)
}

export function subscribeTemplates(
  onChange: (templates: Template[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    templatesCol(),
    (snap) => {
      const templates = snap.docs
        .map(mapTemplate)
        .filter((t): t is Template => t !== null)
      onChange(templates)
    },
    onError,
  )
}

// ---------------------------------------------------------------------------
// Seed official templates (run once or idempotently)
// ---------------------------------------------------------------------------

const OFFICIAL_TEMPLATES: Omit<Template, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Green Gradient',
    previewImage: '',
    status: 'official',
    workspaceId: null,
    cardConfiguration: {
      ...DEFAULT_CARD_CONFIG,
      frontBackground: '#059669',
      backBackground: '#065f46',
    },
    frontDocument: {
      elements: [
        {
          id: 'logo-1',
          type: 'text',
          x: 30,
          y: 20,
          width: 200,
          height: 30,
          rotation: 0,
          props: { text: 'ORGANIZATION', fontSize: 16, fontWeight: 'bold', color: '#ffffff' },
          locked: false,
          visible: true,
          zIndex: 1,
        },
        {
          id: 'photo-1',
          type: 'image',
          x: 30,
          y: 70,
          width: 80,
          height: 100,
          rotation: 0,
          props: { src: '', placeholder: true, fieldName: 'profileImage' },
          locked: false,
          visible: true,
          zIndex: 2,
        },
        {
          id: 'name-1',
          type: 'field',
          x: 130,
          y: 80,
          width: 180,
          height: 24,
          rotation: 0,
          props: { fieldName: 'firstName', fontSize: 14, fontWeight: 'bold', color: '#ffffff' },
          locked: false,
          visible: true,
          zIndex: 3,
        },
        {
          id: 'title-1',
          type: 'field',
          x: 130,
          y: 110,
          width: 180,
          height: 20,
          rotation: 0,
          props: { fieldName: 'title', fontSize: 11, color: '#d1fae5' },
          locked: false,
          visible: true,
          zIndex: 4,
        },
        {
          id: 'id-1',
          type: 'field',
          x: 130,
          y: 140,
          width: 180,
          height: 20,
          rotation: 0,
          props: { fieldName: 'employeeId', fontSize: 11, color: '#a7f3d0', label: 'ID: ' },
          locked: false,
          visible: true,
          zIndex: 5,
        },
      ],
      background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
    },
    backDocument: {
      elements: [
        {
          id: 'back-text',
          type: 'text',
          x: 30,
          y: 80,
          width: 280,
          height: 60,
          rotation: 0,
          props: {
            text: 'This card is the property of the organization.\nIf found, please return to the HR department.',
            fontSize: 9,
            color: '#d1fae5',
            textAlign: 'center',
          },
          locked: false,
          visible: true,
          zIndex: 1,
        },
      ],
      background: 'linear-gradient(135deg, #065f46 0%, #064e3b 100%)',
    },
  },
  {
    name: 'Violet Blossom',
    previewImage: '',
    status: 'official',
    workspaceId: null,
    cardConfiguration: {
      ...DEFAULT_CARD_CONFIG,
      frontBackground: '#7c3aed',
      backBackground: '#6d28d9',
    },
    frontDocument: {
      elements: [
        {
          id: 'logo-v1',
          type: 'text',
          x: 30,
          y: 20,
          width: 200,
          height: 30,
          rotation: 0,
          props: { text: 'ORGANIZATION', fontSize: 16, fontWeight: 'bold', color: '#ffffff' },
          locked: false,
          visible: true,
          zIndex: 1,
        },
        {
          id: 'photo-v1',
          type: 'image',
          x: 30,
          y: 70,
          width: 80,
          height: 100,
          rotation: 0,
          props: { src: '', placeholder: true, fieldName: 'profileImage' },
          locked: false,
          visible: true,
          zIndex: 2,
        },
        {
          id: 'name-v1',
          type: 'field',
          x: 130,
          y: 80,
          width: 180,
          height: 24,
          rotation: 0,
          props: { fieldName: 'firstName', fontSize: 14, fontWeight: 'bold', color: '#ffffff' },
          locked: false,
          visible: true,
          zIndex: 3,
        },
        {
          id: 'dept-v1',
          type: 'field',
          x: 130,
          y: 110,
          width: 180,
          height: 20,
          rotation: 0,
          props: { fieldName: 'department', fontSize: 11, color: '#ede9fe' },
          locked: false,
          visible: true,
          zIndex: 4,
        },
      ],
      background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
    },
    backDocument: {
      elements: [
        {
          id: 'back-v-text',
          type: 'text',
          x: 30,
          y: 80,
          width: 280,
          height: 60,
          rotation: 0,
          props: {
            text: 'This card is the property of the organization.\nIf found, please return to the HR department.',
            fontSize: 9,
            color: '#ede9fe',
            textAlign: 'center',
          },
          locked: false,
          visible: true,
          zIndex: 1,
        },
      ],
      background: 'linear-gradient(135deg, #6d28d9 0%, #5b21b6 100%)',
    },
  },
  {
    name: 'Ocean Blue',
    previewImage: '',
    status: 'official',
    workspaceId: null,
    cardConfiguration: {
      ...DEFAULT_CARD_CONFIG,
      frontBackground: '#2563eb',
      backBackground: '#1d4ed8',
    },
    frontDocument: {
      elements: [
        {
          id: 'logo-b1',
          type: 'text',
          x: 30,
          y: 20,
          width: 200,
          height: 30,
          rotation: 0,
          props: { text: 'COMPANY NAME', fontSize: 16, fontWeight: 'bold', color: '#ffffff' },
          locked: false,
          visible: true,
          zIndex: 1,
        },
        {
          id: 'photo-b1',
          type: 'image',
          x: 240,
          y: 20,
          width: 80,
          height: 100,
          rotation: 0,
          props: { src: '', placeholder: true, fieldName: 'profileImage' },
          locked: false,
          visible: true,
          zIndex: 2,
        },
        {
          id: 'name-b1',
          type: 'field',
          x: 30,
          y: 70,
          width: 200,
          height: 24,
          rotation: 0,
          props: { fieldName: 'firstName', fontSize: 14, fontWeight: 'bold', color: '#ffffff' },
          locked: false,
          visible: true,
          zIndex: 3,
        },
        {
          id: 'title-b1',
          type: 'field',
          x: 30,
          y: 100,
          width: 200,
          height: 20,
          rotation: 0,
          props: { fieldName: 'title', fontSize: 11, color: '#bfdbfe' },
          locked: false,
          visible: true,
          zIndex: 4,
        },
      ],
      background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
    },
    backDocument: {
      elements: [],
      background: 'linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%)',
    },
  },
  {
    name: 'Sunset Corporate',
    previewImage: '',
    status: 'official',
    workspaceId: null,
    cardConfiguration: {
      ...DEFAULT_CARD_CONFIG,
      frontBackground: '#ea580c',
      backBackground: '#c2410c',
    },
    frontDocument: {
      elements: [
        {
          id: 'logo-s1',
          type: 'text',
          x: 30,
          y: 20,
          width: 280,
          height: 30,
          rotation: 0,
          props: { text: 'CORPORATE ID', fontSize: 16, fontWeight: 'bold', color: '#ffffff' },
          locked: false,
          visible: true,
          zIndex: 1,
        },
        {
          id: 'photo-s1',
          type: 'image',
          x: 30,
          y: 65,
          width: 85,
          height: 105,
          rotation: 0,
          props: { src: '', placeholder: true, fieldName: 'profileImage' },
          locked: false,
          visible: true,
          zIndex: 2,
        },
        {
          id: 'name-s1',
          type: 'field',
          x: 130,
          y: 75,
          width: 180,
          height: 24,
          rotation: 0,
          props: { fieldName: 'firstName', fontSize: 14, fontWeight: 'bold', color: '#ffffff' },
          locked: false,
          visible: true,
          zIndex: 3,
        },
      ],
      background: 'linear-gradient(135deg, #ea580c 0%, #dc2626 100%)',
    },
    backDocument: {
      elements: [],
      background: 'linear-gradient(135deg, #c2410c 0%, #b91c1c 100%)',
    },
  },
]

/**
 * Seeds official templates into Firestore if they don't already exist.
 * Safe to call multiple times — checks for existing official templates first.
 */
export async function seedOfficialTemplates(): Promise<void> {
  const existing = await getOfficialTemplates()
  if (existing.length > 0) return // Already seeded

  const col = templatesCol()
  for (const t of OFFICIAL_TEMPLATES) {
    await addDoc(col, {
      ...t,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }
}

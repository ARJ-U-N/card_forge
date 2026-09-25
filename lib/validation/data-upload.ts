import { z } from 'zod'

// ---------------------------------------------------------------------------
// Folder
// ---------------------------------------------------------------------------

export const folderSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Folder name is required.')
    .max(100, 'Folder name must be 100 characters or fewer.'),
  folderTotalNumber: z.number().default(0),
})

export type FolderValues = z.infer<typeof folderSchema>

// ---------------------------------------------------------------------------
// Member
// ---------------------------------------------------------------------------

export const memberSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required.'),
  lastName: z.string().trim().min(1, 'Last name is required.'),
  dateOfBirth: z.string().optional().default(''),
  title: z.string().optional().default(''),
  gender: z.enum(['male', 'female', 'other', '']).optional().default(''),
  employeeId: z.string().optional().default(''),
  idNumber: z.string().optional().default(''),
  department: z.string().optional().default(''),
  hireDate: z.string().optional().default(''),
  expireDate: z.string().optional().default(''),
  parentPhone: z.string().optional().default(''),
  branch: z.string().optional().default(''),
  roomId: z.string().optional().default(''),
  profileImage: z.string().optional().default(''),
  signature: z.string().optional().default(''),
  fingerprint: z.string().optional().default(''),
  divisionLogo: z.string().optional().default(''),
  customFields: z.record(z.string(), z.string()).optional().default({}),
})

export type MemberValues = z.infer<typeof memberSchema>

// ---------------------------------------------------------------------------
// Quick-add row — lighter validation for spreadsheet entry
// ---------------------------------------------------------------------------

export const quickAddRowSchema = z.object({
  firstName: z.string().trim().min(1, 'Required'),
  lastName: z.string().trim().min(1, 'Required'),
  dateOfBirth: z.string().optional().default(''),
  title: z.string().optional().default(''),
  gender: z.string().optional().default(''),
  employeeId: z.string().optional().default(''),
  department: z.string().optional().default(''),
  hireDate: z.string().optional().default(''),
  expireDate: z.string().optional().default(''),
  parentPhone: z.string().optional().default(''),
  roomId: z.string().optional().default(''),
  profileImage: z.string().optional().default(''),
})

export type QuickAddRowValues = z.infer<typeof quickAddRowSchema>

// ---------------------------------------------------------------------------
// Import row — removed
// ---------------------------------------------------------------------------
// The old importRowSchema required firstName/lastName headers.
// Excel/CSV import now accepts any column headings and stores them as-is.
// No header validation or mapping is performed.


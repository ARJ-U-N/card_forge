'use client'

import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  ImagePlusIcon,
  FingerprintIcon,
  PenLineIcon,
  ShieldIcon,
  XIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { createMember, updateMember, getNextRowNumber } from '@/lib/firebase/member-repository'
import { memberSchema, type MemberValues } from '@/lib/validation/data-upload'
import type { Folder, Member } from '@/lib/models/types'
import { storage } from '@/lib/storage'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  folderId: string
  subfolders: Folder[]
  member?: Member | null
  /** When defined, show a dynamic form from these column headings instead of the hardcoded CardForge fields */
  tableColumns?: string[]
  /** Per-column type metadata from the folder. Determines which columns are image columns. */
  tableColumnTypes?: Record<string, 'text' | 'image'>
}

async function uploadImage(
  workspaceId: string,
  file: File,
  path: string,
): Promise<string> {
  try {
    const result = await storage.upload(workspaceId, file, `members/${path}`)
    return result.url
  } catch {
    // If Drive is not configured, fall back to base64
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.readAsDataURL(file)
    })
  }
}

/** Known image fields that get an image upload control */
const IMAGE_FIELDS = new Set(['profileImage', 'signature', 'fingerprint', 'divisionLogo'])

/** Upload subfolder for each image field */
const IMAGE_UPLOAD_PATHS: Record<string, string> = {
  profileImage: 'profiles',
  signature: 'signatures',
  fingerprint: 'fingerprints',
  divisionLogo: 'logos',
}

// ---------------------------------------------------------------------------
// Dynamic table-based form (folders with tableColumns)
// ---------------------------------------------------------------------------

function DynamicAddMemberForm({
  open,
  onOpenChange,
  workspaceId,
  folderId,
  subfolders,
  member,
  tableColumns,
  tableColumnTypes,
}: Required<Pick<Props, 'tableColumns'>> & Omit<Props, 'tableColumns'>) {
  const isEdit = !!member
  const [saving, setSaving] = useState(false)
  const [subfolderId, setSubfolderId] = useState<string>('__none__')

  // Text field values keyed by column name
  const [values, setValues] = useState<Record<string, string>>({})

  // Image fields: preview URLs and pending files
  const [imagePreviews, setImagePreviews] = useState<Record<string, string>>({})
  const [imageFiles, setImageFiles] = useState<Record<string, File>>({})
  const imageRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // Separate image columns from text columns using the explicit tableColumnTypes toggle
  const imageColumns = tableColumns.filter((col) => tableColumnTypes?.[col] === 'image')
  const textColumns = tableColumns.filter((col) => tableColumnTypes?.[col] !== 'image')

  // Reset when dialog opens
  useEffect(() => {
    if (!open) return
    if (member) {
      // Populate from existing member's customFields
      const vals: Record<string, string> = {}
      const previews: Record<string, string> = {}
      for (const col of tableColumns) {
        if (IMAGE_FIELDS.has(col)) {
          // Image fields are stored on the member directly
          previews[col] = (member as Record<string, unknown>)[col] as string ?? ''
        } else {
          vals[col] = member.customFields?.[col] ?? ''
        }
      }
      setValues(vals)
      setImagePreviews(previews)
      setSubfolderId(member.subfolderId ?? '__none__')
    } else {
      const blank: Record<string, string> = {}
      for (const col of textColumns) blank[col] = ''
      setValues(blank)
      setImagePreviews({})
      setSubfolderId('__none__')
    }
    setImageFiles({})
  }, [open, member]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileChange = (col: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFiles((prev) => ({ ...prev, [col]: file }))
    const reader = new FileReader()
    reader.onloadend = () => {
      setImagePreviews((prev) => ({ ...prev, [col]: reader.result as string }))
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      // Upload any pending image files
      const imageUrls: Record<string, string> = {}
      for (const col of imageColumns) {
        if (imageFiles[col]) {
          const uploadPath = IMAGE_UPLOAD_PATHS[col] ?? 'images'
          imageUrls[col] = await uploadImage(workspaceId, imageFiles[col], uploadPath)
        } else if (isEdit && member) {
          imageUrls[col] = (member as Record<string, unknown>)[col] as string ?? ''
        }
      }

      const data = {
        folderId,
        subfolderId: subfolderId === '__none__' ? null : subfolderId,
        // Predefined CardForge fields — set from image uploads or default empty
        firstName: '',
        lastName: '',
        dateOfBirth: '',
        title: '',
        gender: '' as '' | 'male' | 'female' | 'other',
        employeeId: '',
        idNumber: '',
        department: '',
        hireDate: '',
        expireDate: '',
        parentPhone: '',
        branch: '',
        roomId: '',
        profileImage: imageUrls.profileImage ?? '',
        signature: imageUrls.signature ?? '',
        fingerprint: imageUrls.fingerprint ?? '',
        divisionLogo: imageUrls.divisionLogo ?? '',
        // All text data stored here under the original column names
        customFields: { ...values },
      }

      if (isEdit && member) {
        await updateMember(workspaceId, member.id, data)
        toast.success('Row updated')
      } else {
        // Assign a per-subfolder row number
        const effectiveSubfolderId = subfolderId === '__none__' ? null : subfolderId
        const rowNumber = await getNextRowNumber(workspaceId, folderId, effectiveSubfolderId)
        await createMember(workspaceId, { ...data, rowNumber })
        toast.success('Row added')
      }
      onOpenChange(false)
    } catch (error) {
      toast.error(isEdit ? 'Failed to update' : 'Failed to add', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Row' : 'Add Row'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* Text fields — generated from tableColumns */}
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              {textColumns.map((col) => (
                <Field key={col}>
                  <FieldLabel htmlFor={`field-${col}`}>{col}</FieldLabel>
                  <Input
                    id={`field-${col}`}
                    value={values[col] ?? ''}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [col]: e.target.value }))
                    }
                    disabled={saving}
                  />
                </Field>
              ))}
            </div>

            {/* Subfolder selection */}
            {subfolders.length > 0 && (
              <Field>
                <FieldLabel>Subfolder</FieldLabel>
                <Select value={subfolderId} onValueChange={setSubfolderId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None (root folder)</SelectItem>
                    {subfolders.map((sf) => (
                      <SelectItem key={sf.id} value={sf.id}>
                        {sf.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </FieldGroup>

          {/* Image fields — only the ones present in tableColumns */}
          {imageColumns.length > 0 && (
            <div className="flex flex-col gap-3">
              <span className="text-sm font-medium">Images</span>
              <div className="grid gap-3 sm:grid-cols-3">
                {imageColumns.map((col) => (
                  <div key={col}>
                    <button
                      type="button"
                      onClick={() => imageRefs.current[col]?.click()}
                      className="flex h-20 w-full items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/30 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary overflow-hidden"
                    >
                      {imagePreviews[col] ? (
                        <img
                          src={imagePreviews[col]}
                          alt={col}
                          className="h-full object-contain"
                        />
                      ) : (
                        <>
                          <ImagePlusIcon className="size-4" />
                          {col}
                        </>
                      )}
                    </button>
                    <input
                      ref={(el) => { imageRefs.current[col] = el }}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleFileChange(col, e)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Spinner data-icon="inline-start" />}
              {saving
                ? isEdit
                  ? 'Saving…'
                  : 'Adding…'
                : isEdit
                  ? 'Save'
                  : 'Add Row'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Legacy fixed-field form (folders without tableColumns)
// ---------------------------------------------------------------------------

function LegacyAddMemberForm({
  open,
  onOpenChange,
  workspaceId,
  folderId,
  subfolders,
  member,
}: Omit<Props, 'tableColumns'>) {
  const isEdit = !!member
  const [saving, setSaving] = useState(false)
  const [subfolderId, setSubfolderId] = useState<string>('__none__')
  const [profilePreview, setProfilePreview] = useState<string>('')
  const [signaturePreview, setSignaturePreview] = useState<string>('')
  const [fingerprintPreview, setFingerprintPreview] = useState<string>('')
  const [divisionLogoPreview, setDivisionLogoPreview] = useState<string>('')
  const [customFields, setCustomFields] = useState<Array<{ key: string; value: string }>>([])

  // File refs
  const profileRef = useRef<HTMLInputElement>(null)
  const signatureRef = useRef<HTMLInputElement>(null)
  const fingerprintRef = useRef<HTMLInputElement>(null)
  const divisionLogoRef = useRef<HTMLInputElement>(null)

  // Pending files
  const [profileFile, setProfileFile] = useState<File | null>(null)
  const [signatureFile, setSignatureFile] = useState<File | null>(null)
  const [fingerprintFile, setFingerprintFile] = useState<File | null>(null)
  const [divisionLogoFile, setDivisionLogoFile] = useState<File | null>(null)

  const form = useForm<MemberValues>({
    resolver: zodResolver(memberSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      title: '',
      gender: '',
      employeeId: '',
      idNumber: '',
      department: '',
      hireDate: '',
      expireDate: '',
      parentPhone: '',
      branch: '',
      roomId: '',
    },
  })

  useEffect(() => {
    if (!open) return
    if (member) {
      form.reset({
        firstName: member.firstName,
        lastName: member.lastName,
        dateOfBirth: member.dateOfBirth,
        title: member.title,
        gender: member.gender,
        employeeId: member.employeeId,
        idNumber: member.idNumber,
        department: member.department,
        hireDate: member.hireDate,
        expireDate: member.expireDate,
        parentPhone: member.parentPhone,
        branch: member.branch,
        roomId: member.roomId,
      })
      setSubfolderId(member.subfolderId ?? '__none__')
      setProfilePreview(member.profileImage)
      setSignaturePreview(member.signature)
      setFingerprintPreview(member.fingerprint)
      setDivisionLogoPreview(member.divisionLogo)
      const cf = Object.entries(member.customFields ?? {}).map(([key, value]) => ({
        key,
        value,
      }))
      setCustomFields(cf.length > 0 ? cf : [])
    } else {
      form.reset()
      setSubfolderId('__none__')
      setProfilePreview('')
      setSignaturePreview('')
      setFingerprintPreview('')
      setDivisionLogoPreview('')
      setCustomFields([])
      setProfileFile(null)
      setSignatureFile(null)
      setFingerprintFile(null)
      setDivisionLogoFile(null)
    }
  }, [open, member, form])

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    setPreview: (v: string) => void,
    setFile: (f: File | null) => void,
  ) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFile(file)
    const reader = new FileReader()
    reader.onloadend = () => setPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setSaving(true)
    try {
      let profileImage = member?.profileImage ?? ''
      let signature = member?.signature ?? ''
      let fingerprint = member?.fingerprint ?? ''
      let divisionLogo = member?.divisionLogo ?? ''

      if (profileFile) {
        profileImage = await uploadImage(workspaceId, profileFile, 'profiles')
      }
      if (signatureFile) {
        signature = await uploadImage(workspaceId, signatureFile, 'signatures')
      }
      if (fingerprintFile) {
        fingerprint = await uploadImage(workspaceId, fingerprintFile, 'fingerprints')
      }
      if (divisionLogoFile) {
        divisionLogo = await uploadImage(workspaceId, divisionLogoFile, 'logos')
      }

      const cf: Record<string, string> = {}
      customFields.forEach((f) => {
        if (f.key.trim()) cf[f.key.trim()] = f.value
      })

      const data = {
        ...values,
        folderId,
        subfolderId: subfolderId === '__none__' ? null : subfolderId,
        profileImage,
        signature,
        fingerprint,
        divisionLogo,
        customFields: cf,
      }

      if (isEdit && member) {
        await updateMember(workspaceId, member.id, data)
        toast.success('Member updated')
      } else {
        await createMember(workspaceId, data)
        toast.success('Member added')
      }
      onOpenChange(false)
    } catch (error) {
      toast.error(isEdit ? 'Failed to update member' : 'Failed to add member', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setSaving(false)
    }
  })

  const { errors } = form.formState

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Member' : 'Add Member'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-6">
          {/* Profile image */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => profileRef.current?.click()}
              className="flex size-20 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/25 bg-muted/50 text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary overflow-hidden"
            >
              {profilePreview ? (
                <img
                  src={profilePreview}
                  alt="Profile"
                  className="size-full object-cover"
                />
              ) : (
                <ImagePlusIcon className="size-6" />
              )}
            </button>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Profile Image</span>
              <span className="text-xs text-muted-foreground">
                Click to upload a photo
              </span>
            </div>
            <input
              ref={profileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFileChange(e, setProfilePreview, setProfileFile)}
            />
          </div>

          {/* Personal fields */}
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!errors.firstName || undefined}>
                <FieldLabel htmlFor="firstName">First Name *</FieldLabel>
                <Input id="firstName" disabled={saving} {...form.register('firstName')} />
                <FieldError errors={[errors.firstName]} />
              </Field>
              <Field data-invalid={!!errors.lastName || undefined}>
                <FieldLabel htmlFor="lastName">Last Name *</FieldLabel>
                <Input id="lastName" disabled={saving} {...form.register('lastName')} />
                <FieldError errors={[errors.lastName]} />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="dateOfBirth">Date of Birth</FieldLabel>
                <Input
                  id="dateOfBirth"
                  type="date"
                  disabled={saving}
                  {...form.register('dateOfBirth')}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="memberTitle">Title</FieldLabel>
                <Input id="memberTitle" disabled={saving} {...form.register('title')} />
              </Field>
              <Field>
                <FieldLabel>Gender</FieldLabel>
                <Select
                  value={form.watch('gender') || '__none__'}
                  onValueChange={(v) =>
                    form.setValue('gender', v === '__none__' ? '' : (v as MemberValues['gender']))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="idNumber">ID Number</FieldLabel>
                <Input id="idNumber" disabled={saving} {...form.register('idNumber')} />
              </Field>
              <Field>
                <FieldLabel htmlFor="employeeId">Employee ID</FieldLabel>
                <Input
                  id="employeeId"
                  disabled={saving}
                  {...form.register('employeeId')}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="department">Department</FieldLabel>
                <Input
                  id="department"
                  disabled={saving}
                  {...form.register('department')}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="branch">Branch</FieldLabel>
                <Input id="branch" disabled={saving} {...form.register('branch')} />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="hireDate">Hire Date</FieldLabel>
                <Input
                  id="hireDate"
                  type="date"
                  disabled={saving}
                  {...form.register('hireDate')}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="expireDate">Expire Date</FieldLabel>
                <Input
                  id="expireDate"
                  type="date"
                  disabled={saving}
                  {...form.register('expireDate')}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="parentPhone">Parent Phone</FieldLabel>
                <Input
                  id="parentPhone"
                  type="tel"
                  disabled={saving}
                  {...form.register('parentPhone')}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="roomId">Room ID</FieldLabel>
                <Input id="roomId" disabled={saving} {...form.register('roomId')} />
              </Field>
            </div>

            {/* Subfolder selection */}
            <Field>
              <FieldLabel>Subfolder</FieldLabel>
              <Select value={subfolderId} onValueChange={setSubfolderId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None (root folder)</SelectItem>
                  {subfolders.map((sf) => (
                    <SelectItem key={sf.id} value={sf.id}>
                      {sf.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>

          {/* Identity assets */}
          <div className="flex flex-col gap-3">
            <span className="text-sm font-medium">Identity Assets</span>
            <div className="grid gap-3 sm:grid-cols-3">
              {/* Signature */}
              <button
                type="button"
                onClick={() => signatureRef.current?.click()}
                className="flex h-20 items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/30 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary overflow-hidden"
              >
                {signaturePreview ? (
                  <img
                    src={signaturePreview}
                    alt="Signature"
                    className="h-full object-contain"
                  />
                ) : (
                  <>
                    <PenLineIcon className="size-4" />
                    Signature
                  </>
                )}
              </button>
              <input
                ref={signatureRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) =>
                  handleFileChange(e, setSignaturePreview, setSignatureFile)
                }
              />

              {/* Fingerprint */}
              <button
                type="button"
                onClick={() => fingerprintRef.current?.click()}
                className="flex h-20 items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/30 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary overflow-hidden"
              >
                {fingerprintPreview ? (
                  <img
                    src={fingerprintPreview}
                    alt="Fingerprint"
                    className="h-full object-contain"
                  />
                ) : (
                  <>
                    <FingerprintIcon className="size-4" />
                    Fingerprint
                  </>
                )}
              </button>
              <input
                ref={fingerprintRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) =>
                  handleFileChange(e, setFingerprintPreview, setFingerprintFile)
                }
              />

              {/* Division Logo */}
              <button
                type="button"
                onClick={() => divisionLogoRef.current?.click()}
                className="flex h-20 items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/30 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary overflow-hidden"
              >
                {divisionLogoPreview ? (
                  <img
                    src={divisionLogoPreview}
                    alt="Division Logo"
                    className="h-full object-contain"
                  />
                ) : (
                  <>
                    <ShieldIcon className="size-4" />
                    Division Logo
                  </>
                )}
              </button>
              <input
                ref={divisionLogoRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) =>
                  handleFileChange(e, setDivisionLogoPreview, setDivisionLogoFile)
                }
              />
            </div>
          </div>

          {/* Custom fields */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Custom Fields</span>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() =>
                  setCustomFields((prev) => [...prev, { key: '', value: '' }])
                }
              >
                Add Field
              </Button>
            </div>
            {customFields.map((cf, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  placeholder="Field name"
                  value={cf.key}
                  onChange={(e) => {
                    const next = [...customFields]
                    next[i] = { ...next[i], key: e.target.value }
                    setCustomFields(next)
                  }}
                  className="flex-1"
                />
                <Input
                  placeholder="Value"
                  value={cf.value}
                  onChange={(e) => {
                    const next = [...customFields]
                    next[i] = { ...next[i], value: e.target.value }
                    setCustomFields(next)
                  }}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() =>
                    setCustomFields((prev) => prev.filter((_, j) => j !== i))
                  }
                >
                  <XIcon />
                </Button>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Spinner data-icon="inline-start" />}
              {saving
                ? isEdit
                  ? 'Saving…'
                  : 'Adding…'
                : isEdit
                  ? 'Save Member'
                  : 'Add Member'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Exported component — routes to dynamic or legacy form
// ---------------------------------------------------------------------------

export function AddMemberDialog(props: Props) {
  const { tableColumns, tableColumnTypes, ...rest } = props

  if (tableColumns && tableColumns.length > 0) {
    return <DynamicAddMemberForm {...rest} tableColumns={tableColumns} tableColumnTypes={tableColumnTypes} />
  }

  return <LegacyAddMemberForm {...rest} />
}

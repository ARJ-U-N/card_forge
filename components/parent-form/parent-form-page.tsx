'use client'

import { useEffect, useRef, useState } from 'react'
import {
  AlertCircleIcon,
  CheckCircleIcon,
  EyeIcon,
  ImagePlusIcon,
  Loader2Icon,
  SendIcon,
  SchoolIcon,
  XIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import {
  Field,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { BrandMark } from '@/components/brand-mark'
import { toast } from 'sonner'
import { renderCardForMember } from '@/lib/card-renderer'
import type {
  CardConfiguration,
  CardDocument,
  Member,
} from '@/lib/models/types'

type PageState =
  | 'loading'
  | 'invalid'
  | 'disabled'
  | 'no-table'
  | 'form'
  | 'submitting'
  | 'success'

interface DesignData {
  id: string
  cardConfiguration: CardConfiguration
  frontDocument: CardDocument
  backDocument: CardDocument
}

interface FormData {
  folderName: string
  subfolderName: string
  folderId: string
  subfolderId: string
  workspaceId: string
  tableColumns: string[]
  tableColumnTypes: Record<string, string>
  design: DesignData | null
}

interface Props {
  token: string
}

export function ParentFormPage({ token }: Props) {
  const [state, setState] = useState<PageState>('loading')
  const [formData, setFormData] = useState<FormData | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  // Form values
  const [values, setValues] = useState<Record<string, string>>({})
  const [imagePreviews, setImagePreviews] = useState<Record<string, string>>({})
  const [imageFiles, setImageFiles] = useState<Record<string, File>>({})
  const imageRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // ID preview state
  const [previewFront, setPreviewFront] = useState<string | null>(null)
  const [previewBack, setPreviewBack] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)

  // Load form schema from API
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/parent-form/lookup?token=${encodeURIComponent(token)}`)
        const data = await res.json()

        if (!res.ok) {
          if (res.status === 403) {
            setState('disabled')
          } else if (data.error?.includes('No table')) {
            setState('no-table')
          } else {
            setErrorMsg(data.error || 'Invalid link.')
            setState('invalid')
          }
          return
        }

        setFormData(data)

        // Initialize blank values for text columns
        const blank: Record<string, string> = {}
        for (const col of data.tableColumns) {
          if (data.tableColumnTypes[col] !== 'image') {
            blank[col] = ''
          }
        }
        setValues(blank)
        setState('form')
      } catch {
        setErrorMsg('Network error. Please try again.')
        setState('invalid')
      }
    }
    load()
  }, [token])

  // Derive columns from tableColumnTypes (correction #2: use teacher-defined types only)
  const textColumns = formData?.tableColumns.filter(
    (col) => formData.tableColumnTypes[col] !== 'image',
  ) ?? []
  const imageColumns = formData?.tableColumns.filter(
    (col) => formData.tableColumnTypes[col] === 'image',
  ) ?? []

  const hasDesign = !!formData?.design

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
    if (!formData) return

    setState('submitting')
    try {
      // Convert image files to base64 for server submission
      const imageData: Record<string, string> = {}
      for (const col of imageColumns) {
        if (imageFiles[col]) {
          const dataUrl = await fileToDataUrl(imageFiles[col])
          imageData[col] = dataUrl
        }
      }

      const res = await fetch('/api/parent-form/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shareToken: token,
          values,
          imageData,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Submission failed.')
        setState('form')
        return
      }

      setState('success')
    } catch {
      toast.error('Network error. Please try again.')
      setState('form')
    }
  }

  /**
   * Build a fake Member from the parent's form values + image previews,
   * then render the saved Design to produce front/back card images.
   */
  const handleShowPreview = async () => {
    if (!formData?.design) {
      toast.info('No saved design available for preview.')
      return
    }

    setPreviewing(true)
    setPreviewFront(null)
    setPreviewBack(null)

    try {
      // Build a Member-shaped object from the form values
      const fakeMember: Member = {
        id: '__preview__',
        workspaceId: formData.workspaceId,
        folderId: formData.folderId,
        subfolderId: formData.subfolderId,
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
        profileImage: '',
        signature: '',
        fingerprint: '',
        divisionLogo: '',
        customFields: {},
        createdAt: '',
        updatedAt: '',
      }

      // Map text values into customFields (the renderer resolves them via customFields)
      for (const col of textColumns) {
        fakeMember.customFields[col] = values[col] ?? ''
      }

      // Map image previews (data URLs) into customFields so the
      // renderer's resolveDynamicImageSrc fallback can find them,
      // and also set the standard image fields if they match
      for (const col of imageColumns) {
        const dataUrl = imagePreviews[col] ?? ''
        fakeMember.customFields[col] = dataUrl
        // Also set the known Member image fields if the column name matches
        if (col === 'profileImage' || col === 'Profile Image' || col.toLowerCase().includes('photo')) {
          fakeMember.profileImage = dataUrl
        }
        if (col === 'signature' || col === 'Signature') {
          fakeMember.signature = dataUrl
        }
        if (col === 'fingerprint' || col === 'Fingerprint') {
          fakeMember.fingerprint = dataUrl
        }
        if (col === 'divisionLogo' || col === 'Division Logo') {
          fakeMember.divisionLogo = dataUrl
        }
      }

      const { cardConfiguration, frontDocument, backDocument } = formData.design
      const result = await renderCardForMember(
        fakeMember,
        cardConfiguration,
        frontDocument,
        backDocument,
      )

      if (result.error) {
        toast.error(`Preview failed: ${result.error}`)
      } else {
        setPreviewFront(result.frontDataUrl)
        // Only show back if the design is double-sided
        const isDoubleSide = cardConfiguration.isDoubleSide ?? true
        setPreviewBack(isDoubleSide ? result.backDataUrl : null)
      }
    } catch (err) {
      toast.error('Failed to generate preview.')
      console.error('[preview]', err)
    } finally {
      setPreviewing(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <BrandMark className="size-7" />
            <span className="font-semibold tracking-tight text-slate-800">
              CardForge
            </span>
          </div>
          <Badge variant="secondary" className="gap-1">
            <SchoolIcon className="size-3" />
            Parent Form
          </Badge>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        {state === 'loading' && (
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <Spinner className="size-8" />
            <p className="text-sm text-muted-foreground">Loading form…</p>
          </div>
        )}

        {state === 'invalid' && (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircleIcon className="size-8 text-destructive" />
            </div>
            <h1 className="text-xl font-semibold">Invalid Link</h1>
            <p className="max-w-sm text-sm text-muted-foreground">
              {errorMsg || 'This share link is invalid or has expired.'}
            </p>
          </div>
        )}

        {state === 'disabled' && (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-muted">
              <AlertCircleIcon className="size-8 text-muted-foreground" />
            </div>
            <h1 className="text-xl font-semibold">Form Disabled</h1>
            <p className="max-w-sm text-sm text-muted-foreground">
              This form has been disabled by the administrator. Please contact
              your school for assistance.
            </p>
          </div>
        )}

        {state === 'no-table' && (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-muted">
              <AlertCircleIcon className="size-8 text-muted-foreground" />
            </div>
            <h1 className="text-xl font-semibold">Form Not Ready</h1>
            <p className="max-w-sm text-sm text-muted-foreground">
              No table has been set up for this class yet. Please contact
              the school administrator.
            </p>
          </div>
        )}

        {(state === 'form' || state === 'submitting') && formData && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <SchoolIcon className="size-5" />
                  {formData.folderName}
                </CardTitle>
                <CardDescription>
                  Fill in the details for <strong>{formData.subfolderName}</strong>.
                  All information will be used for ID card generation.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                  {/* Text fields — from tableColumns */}
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
                            disabled={state === 'submitting'}
                          />
                        </Field>
                      ))}
                    </div>
                  </FieldGroup>

                  {/* Image fields — only columns explicitly marked as 'image' */}
                  {imageColumns.length > 0 && (
                    <div className="flex flex-col gap-3">
                      <span className="text-sm font-medium">Photos / Images</span>
                      <div className="grid gap-3 sm:grid-cols-3">
                        {imageColumns.map((col) => (
                          <div key={col}>
                            <button
                              type="button"
                              onClick={() => imageRefs.current[col]?.click()}
                              disabled={state === 'submitting'}
                              className="flex h-24 w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/30 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary overflow-hidden disabled:opacity-50"
                            >
                              {imagePreviews[col] ? (
                                <img
                                  src={imagePreviews[col]}
                                  alt={col}
                                  className="h-full object-contain"
                                />
                              ) : (
                                <>
                                  <ImagePlusIcon className="size-5" />
                                  <span>{col}</span>
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

                  {/* Buttons */}
                  <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleShowPreview}
                      disabled={state === 'submitting' || previewing || !hasDesign}
                      title={hasDesign ? 'Preview your ID card' : 'No saved design available'}
                    >
                      {previewing ? (
                        <Loader2Icon className="size-4 animate-spin mr-2" />
                      ) : (
                        <EyeIcon data-icon="inline-start" />
                      )}
                      {previewing ? 'Generating…' : 'Show ID Preview'}
                    </Button>
                    <Button type="submit" disabled={state === 'submitting'}>
                      {state === 'submitting' ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <SendIcon data-icon="inline-start" />
                      )}
                      {state === 'submitting' ? 'Submitting…' : 'Confirm Details'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* ID Card Preview */}
            {(previewFront || previewBack) && (
              <Card className="mt-6">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">ID Card Preview</CardTitle>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => { setPreviewFront(null); setPreviewBack(null) }}
                    >
                      <XIcon className="size-4" />
                    </Button>
                  </div>
                  <CardDescription>
                    This is how your ID card will look. Review and click
                    &ldquo;Confirm Details&rdquo; to submit.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                    {previewFront && (
                      <div className="flex flex-col items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">Front</span>
                        <img
                          src={previewFront}
                          alt="ID Card Front"
                          className="rounded-lg border shadow-md max-w-[324px] w-full"
                        />
                      </div>
                    )}
                    {previewBack && (
                      <div className="flex flex-col items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">Back</span>
                        <img
                          src={previewBack}
                          alt="ID Card Back"
                          className="rounded-lg border shadow-md max-w-[324px] w-full"
                        />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {state === 'success' && (
          <div className="flex flex-col items-center gap-6 py-20 text-center">
            <div className="flex size-20 items-center justify-center rounded-full bg-green-500/10">
              <CheckCircleIcon className="size-10 text-green-600" />
            </div>
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-semibold">Details Submitted!</h1>
              <p className="max-w-sm text-sm text-muted-foreground">
                Your information has been submitted successfully for{' '}
                <strong>{formData?.subfolderName}</strong>. The school will
                use this to generate your ID card.
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t bg-white/50 py-4 text-center text-xs text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} CardForge — Parent Details Form</p>
      </footer>
    </div>
  )
}

// Helper: convert File to data URL
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.readAsDataURL(file)
  })
}

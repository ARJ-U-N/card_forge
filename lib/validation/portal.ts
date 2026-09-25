import { z } from 'zod'

export const portalPinSchema = z.object({
  pin: z
    .string()
    .min(4, 'PIN must be at least 4 digits.')
    .max(8, 'PIN must be 8 digits or fewer.')
    .regex(/^\d+$/, 'PIN must contain only digits.'),
})

export const portalSettingsSchema = z.object({
  collaboratorEmail: z
    .string()
    .trim()
    .min(1, 'Collaborator email is required.')
    .email('Enter a valid email address.'),
  notificationEnabled: z.boolean(),
})

export type PortalPinValues = z.infer<typeof portalPinSchema>
export type PortalSettingsValues = z.infer<typeof portalSettingsSchema>

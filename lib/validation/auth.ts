import { z } from 'zod'

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required.')
  .email('Enter a valid email address.')

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required.'),
  remember: z.boolean(),
})

export const createAccountSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Enter your full name.'),
    workspaceName: z.string().trim().min(2, 'Enter a workspace name.'),
    email: emailSchema,
    password: z
      .string()
      .min(8, 'Use at least 8 characters.')
      .regex(/[0-9]/, 'Include at least one number.'),
    confirmPassword: z.string(),
    acceptTerms: z.boolean().refine((v) => v, {
      message: 'You must accept the privacy policy.',
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match.',
  })

export const forgotPasswordSchema = z.object({
  email: emailSchema,
})

export type SignInValues = z.infer<typeof signInSchema>
export type CreateAccountValues = z.infer<typeof createAccountSchema>
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>

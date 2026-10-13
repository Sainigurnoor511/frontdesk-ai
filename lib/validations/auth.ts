import { z } from 'zod'

export const signupSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export type SignupInput = z.infer<typeof signupSchema>

export const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

export type LoginInput = z.infer<typeof loginSchema>

export const requestPasswordResetSchema = z.object({
  email: z.string().email('Enter a valid email address'),
})

export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>

export const updatePasswordSchema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>

// One message for every shape of bad input — too short, too long, non-numeric, empty.
// Differentiating them tells an attacker nothing useful and reads worse for a user who mistyped.
export const totpCodeSchema = z.object({
  code: z
    .string({ required_error: 'Enter the 6-digit code from your authenticator app' })
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app'),
})

export type TotpCodeInput = z.infer<typeof totpCodeSchema>

const RECOVERY_CODE_MESSAGE = 'Enter a recovery code in the form XXXXX-XXXXX'

/**
 * A recovery code as typed: case-insensitive, with or without the dash or spaces. The output is
 * the canonical 10-character Crockford base32 form (`0-9`, `A-Z` without `I L O U`), which is what
 * gets hashed. Crockford's decoding rule maps the look-alikes a person might type for a digit
 * (`I`/`L` → `1`, `O` → `0`), so a code read off paper still matches. Kept free of `node:crypto`
 * because the `/verify` form imports it in the browser.
 */
export const recoveryCodeSchema = z.object({
  code: z
    .string({ required_error: RECOVERY_CODE_MESSAGE })
    .transform((value) =>
      value.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0')
    )
    .pipe(z.string().regex(/^[0-9A-HJKMNP-TV-Z]{10}$/, RECOVERY_CODE_MESSAGE)),
})
export type RecoveryCodeInput = z.input<typeof recoveryCodeSchema>

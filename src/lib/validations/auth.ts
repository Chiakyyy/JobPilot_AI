import { z } from 'zod';

// This schema defines validation rules for user authentication sign in.
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Veuillez renseigner votre adresse e-mail')
    .email('Adresse e-mail invalide')
    .trim()
    .toLowerCase(),
  password: z
    .string()
    .min(1, 'Le mot de passe est requis'),
});

export type LoginFormData = z.infer<typeof loginSchema>;

// This schema defines validation rules for creating a new user account.
export const registerSchema = z
  .object({
    email: z
      .string()
      .min(1, 'Veuillez renseigner votre adresse e-mail')
      .email('Adresse e-mail invalide')
      .trim()
      .toLowerCase(),
    password: z
      .string()
      .min(1, 'Veuillez renseigner votre mot de passe')
      .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
      .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une majuscule')
      .regex(/[a-z]/, 'Le mot de passe doit contenir au moins une minuscule')
      .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre'),
    confirmPassword: z
      .string()
      .min(1, 'Veuillez confirmer votre mot de passe'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  });

export type RegisterFormData = z.infer<typeof registerSchema>;

// This schema defines validation rules for requesting a password reset email.
export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, 'Veuillez renseigner votre adresse e-mail')
    .email('Adresse e-mail invalide')
    .trim()
    .toLowerCase(),
});

export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

// This schema defines validation rules for updating candidate profile information.
export const profileSchema = z.object({
  display_name: z
    .string()
    .min(2, 'Le nom affiché doit contenir au moins 2 caractères')
    .max(100, 'Le nom affiché ne peut pas dépasser 100 caractères'),
  target_role: z
    .string()
    .min(2, 'Le titre recherché doit contenir au moins 2 caractères'),
  location: z
    .string()
    .min(2, 'La localisation doit contenir au moins 2 caractères'),
  skills: z
    .string()
    .min(2, 'Veuillez renseigner au moins une compétence'),
  experience_level: z
    .string()
    .min(1, 'Veuillez sélectionner un niveau d’expérience'),
  education_summary: z
    .string()
    .max(500, 'Le résumé ne peut pas dépasser 500 caractères')
    .optional()
    .or(z.literal('')),
  experience_summary: z
    .string()
    .max(1000, 'Le résumé ne peut pas dépasser 1000 caractères')
    .optional()
    .or(z.literal('')),
});

export type ProfileFormData = z.infer<typeof profileSchema>;

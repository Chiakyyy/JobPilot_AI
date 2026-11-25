import { z } from 'zod';

// This schema defines validation rules for creating and editing job offers.
export const offerSchema = z.object({
  title: z
    .string()
    .min(2, 'Le titre de l’offre doit contenir au moins 2 caractères')
    .max(150, 'Le titre ne peut pas dépasser 150 caractères'),
  company: z
    .string()
    .min(2, 'Le nom de l’entreprise doit contenir au moins 2 caractères')
    .max(100, 'Le nom de l’entreprise ne peut pas dépasser 100 caractères'),
  location: z
    .string()
    .max(100, 'La localisation ne peut pas dépasser 100 caractères')
    .optional()
    .or(z.literal('')),
  url: z
    .string()
    .url('L’adresse url doit être valide (ex. https://...)')
    .optional()
    .or(z.literal('')),
  description: z
    .string()
    .optional()
    .or(z.literal('')),
  notes: z
    .string()
    .optional()
    .or(z.literal('')),
});

export type OfferFormData = z.infer<typeof offerSchema>;

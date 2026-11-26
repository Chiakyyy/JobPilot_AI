import { extractText, getDocumentProxy } from 'npm:unpdf';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

// This error class indicates that a document contains insufficient extractable text characters.
export class ScannedPdfError extends Error {
  constructor(message = 'Ce document ne peut pas être analysé dans cette version') {
    super(message);
    this.name = 'ScannedPdfError';
  }
}

// This function downloads a cv from storage and extracts its text layer with scanned document detection.
export async function extractCvText(
  supabaseClient: SupabaseClient,
  filePath: string
): Promise<string> {
  const { data, error } = await supabaseClient.storage.from('cvs').download(filePath);
  if (error || !data) {
    throw new Error(error?.message || 'Impossible de télécharger le document depuis le stockage.');
  }

  const arrayBuffer = await data.arrayBuffer();
  const pdf = await getDocumentProxy(new Uint8Array(arrayBuffer));
  const result = await extractText(pdf, { mergePages: true });

  const extracted = typeof result === 'string' ? result : (result as { text?: unknown })?.text;
  const rawText = Array.isArray(extracted)
    ? extracted.join('\n')
    : typeof extracted === 'string'
    ? extracted
    : '';

  const meaningfulChars = rawText.match(/[a-zA-Z0-9\u00C0-\u017F]/g) || [];
  if (meaningfulChars.length < 60) {
    throw new ScannedPdfError();
  }

  const normalized = rawText.replace(/\s+/g, ' ').trim();
  const maxChars = 7000;
  return normalized.length > maxChars ? normalized.substring(0, maxChars) : normalized;
}

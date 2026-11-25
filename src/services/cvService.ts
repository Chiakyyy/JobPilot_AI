import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';

import { supabase } from '@/lib/supabase';
import { UserCv } from '@/types/database';

export const MAX_CV_SIZE_BYTES = 5242880;

// This helper converts a base64 encoded string into a binary array buffer.
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// This function safely reads the file binary across platforms into an array buffer.
async function readFileAsArrayBuffer(uri: string): Promise<ArrayBuffer> {
  try {
    const file = new File(uri);
    return await file.arrayBuffer();
  } catch {
    try {
      const response = await fetch(uri);
      return await response.arrayBuffer();
    } catch {
      const base64 = await FileSystemLegacy.readAsStringAsync(uri, {
        encoding: FileSystemLegacy.EncodingType.Base64,
      });
      return base64ToArrayBuffer(base64);
    }
  }
}

// This function verifies the magic byte signature and guards against encrypted pdf files.
export function validatePdfBinary(arrayBuffer: ArrayBuffer): void {
  const bytes = new Uint8Array(arrayBuffer);

  if (bytes.length < 5) {
    throw new Error('Le fichier sélectionné n’est pas un document PDF valide.');
  }

  const isPdfMagic =
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d;

  if (!isPdfMagic) {
    throw new Error('Le fichier sélectionné n’est pas un document PDF valide.');
  }

  // Full flatedecode decompression and selectable text verification are enforced in the step 5 deno edge function using a server pdf parser. This avoids false negatives on modern compressed pdf streams and keeps the mobile interface responsive.
  const step = 8192;
  const tailSize = Math.min(bytes.length, 131072);
  const tailStart = bytes.length - tailSize;
  let trailerSample = '';
  for (let i = tailStart; i < bytes.length; i += step) {
    const end = Math.min(i + step, bytes.length);
    const slice = bytes.subarray(i, end);
    trailerSample += String.fromCharCode.apply(null, Array.from(slice));
  }

  const headSize = Math.min(bytes.length, 65536);
  let headSample = '';
  for (let i = 0; i < headSize; i += step) {
    const end = Math.min(i + step, headSize);
    headSample += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, end)));
  }

  if (/\/Encrypt\b/i.test(trailerSample) || /\/Encrypt\b/i.test(headSample)) {
    throw new Error('Les fichiers PDF protégés par mot de passe ne sont pas pris en charge.');
  }
}

// This function validates file metadata before reading binary contents.
export function validateCvMetadata(fileName: string, sizeBytes?: number, mimeType?: string): void {
  const isPdfExtension = /\.pdf$/i.test(fileName.trim());
  if (!isPdfExtension) {
    throw new Error('Seuls les fichiers au format PDF sont acceptés.');
  }

  if (mimeType && mimeType !== 'application/pdf' && mimeType !== 'application/octet-stream') {
    throw new Error('Seuls les fichiers au format PDF sont acceptés.');
  }

  if (sizeBytes !== undefined) {
    if (sizeBytes <= 0) {
      throw new Error('Le fichier sélectionné est vide.');
    }
    if (sizeBytes > MAX_CV_SIZE_BYTES) {
      throw new Error('Le fichier dépasse la limite maximale de 5 Mo.');
    }
  }
}

// This function sanitizes a file name for safe storage path generation.
function sanitizeFileName(fileName: string): string {
  const baseName = fileName.replace(/\.pdf$/i, '');
  const clean = baseName.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${clean.substring(0, 50)}.pdf`;
}

// This service provides document picking, validation, atomic storage and signed url generation.
export const cvService = {
  // This method prompts the document picker and executes the upload workflow.
  async pickAndUploadCv(userId: string, currentCvFilePath?: string | null): Promise<UserCv> {
    const pickerResult = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (pickerResult.canceled || !pickerResult.assets || pickerResult.assets.length === 0) {
      throw new Error('Sélection de document annulée.');
    }

    const asset = pickerResult.assets[0];
    validateCvMetadata(asset.name, asset.size, asset.mimeType);

    const arrayBuffer = await readFileAsArrayBuffer(asset.uri);
    validatePdfBinary(arrayBuffer);

    const finalSize = asset.size || arrayBuffer.byteLength;
    if (finalSize <= 0) {
      throw new Error('Le fichier sélectionné est vide.');
    }
    if (finalSize > MAX_CV_SIZE_BYTES) {
      throw new Error('Le fichier dépasse la limite maximale de 5 Mo.');
    }

    const cleanName = sanitizeFileName(asset.name);
    const targetFilePath = `${userId}/${Date.now()}_${cleanName}`;

    const { error: uploadError } = await supabase.storage
      .from('cvs')
      .upload(targetFilePath, arrayBuffer, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data: dbData, error: dbError } = await supabase
      .from('user_cvs')
      .upsert(
        {
          user_id: userId,
          file_path: targetFilePath,
          file_name: asset.name,
          file_size_bytes: finalSize,
          mime_type: 'application/pdf',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      .select('*')
      .single();

    if (dbError) {
      await supabase.storage.from('cvs').remove([targetFilePath]);
      throw dbError;
    }

    if (currentCvFilePath && currentCvFilePath !== targetFilePath) {
      await supabase.storage.from('cvs').remove([currentCvFilePath]);
    }

    return dbData as UserCv;
  },

  // This method generates a temporary signed url for private document consultation.
  async getSignedCvUrl(filePath: string): Promise<string> {
    const { data, error } = await supabase.storage.from('cvs').createSignedUrl(filePath, 300);

    if (error || !data?.signedUrl) {
      throw error || new Error('Impossible de générer le lien de consultation.');
    }
    return data.signedUrl;
  },

  // This method deletes the document from storage and removes its metadata row.
  async deleteCv(id: string, filePath: string): Promise<void> {
    await supabase.storage.from('cvs').remove([filePath]);

    const { error } = await supabase.from('user_cvs').delete().eq('id', id);

    if (error) {
      throw error;
    }
  },
};

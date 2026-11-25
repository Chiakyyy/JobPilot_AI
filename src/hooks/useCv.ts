import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { cvService } from '@/services/cvService';
import { UserCv } from '@/types/database';

// This hook retrieves the authenticated user's uploaded cv metadata.
export function useUserCv() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['user-cv', user?.id],
    queryFn: async () => {
      if (!user?.id) {
        return null;
      }
      const { data, error } = await supabase
        .from('user_cvs')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        throw error;
      }
      return data as UserCv | null;
    },
    enabled: Boolean(user?.id),
  });
}

// This hook retrieves a candidate's cv metadata for reviewing recruiters.
export function useCandidateCv(candidateUserId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['candidate-cv', candidateUserId],
    queryFn: async () => {
      if (!candidateUserId || !user?.id) {
        return null;
      }
      const { data, error } = await supabase
        .from('user_cvs')
        .select('*')
        .eq('user_id', candidateUserId)
        .maybeSingle();

      if (error) {
        throw error;
      }
      return data as UserCv | null;
    },
    enabled: Boolean(candidateUserId && user?.id),
  });
}

// This hook provides mutation handlers for document selection, upload, signed url access and deletion.
export function useCvMutations() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // This mutation picks, validates and uploads a cv document.
  const uploadMutation = useMutation({
    mutationFn: async (currentCvFilePath?: string | null) => {
      if (!user?.id) {
        throw new Error('Utilisateur non connecté');
      }
      return cvService.pickAndUploadCv(user.id, currentCvFilePath);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-cv'] });
      queryClient.invalidateQueries({ queryKey: ['candidate-cv'] });
    },
  });

  // This mutation deletes a stored cv document from storage and database.
  const deleteMutation = useMutation({
    mutationFn: async ({ id, filePath }: { id: string; filePath: string }) => {
      return cvService.deleteCv(id, filePath);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-cv'] });
      queryClient.invalidateQueries({ queryKey: ['candidate-cv'] });
    },
  });

  return {
    uploadCv: uploadMutation.mutateAsync,
    deleteCv: deleteMutation.mutateAsync,
    getSignedCvUrl: cvService.getSignedCvUrl,
    isUploading: uploadMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

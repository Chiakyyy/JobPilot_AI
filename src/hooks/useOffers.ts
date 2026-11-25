import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { JobOffer, JobOfferInput } from '@/types/database';

interface UseOffersParams {
  search?: string;
  page?: number;
  pageSize?: number;
}

// This hook retrieves a paginated list of job offers with optional search filtering.
export function useOffers({ search = '', page = 0, pageSize = 15 }: UseOffersParams = {}) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['offers', { search, page, pageSize, userId: user?.id }],
    queryFn: async () => {
      if (!user?.id) {
        return { data: [], count: 0 };
      }

      const from = page * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from('job_offers')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (search.trim()) {
        const term = `%${search.trim()}%`;
        query = query.or(`title.ilike.${term},company.ilike.${term}`);
      }

      const { data, error, count } = await query;
      if (error) {
        throw error;
      }
      return {
        data: (data || []) as JobOffer[],
        count: count || 0,
      };
    },
    enabled: Boolean(user?.id),
  });
}

// This hook fetches the details of a single job offer by identifier.
export function useOffer(id: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['offer', id],
    queryFn: async () => {
      if (!id || !user?.id) {
        return null;
      }
      const { data, error } = await supabase
        .from('job_offers')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        throw error;
      }
      return data as JobOffer | null;
    },
    enabled: Boolean(id && user?.id),
  });
}

// This hook exposes mutation methods for creating, updating and deleting job offers.
export function useOfferMutations() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // This mutation inserts a new job offer for the authenticated user.
  const createMutation = useMutation({
    mutationFn: async (input: JobOfferInput) => {
      if (!user?.id) {
        throw new Error('Utilisateur non connecté');
      }
      const { data, error } = await supabase
        .from('job_offers')
        .insert({
          ...input,
          user_id: user.id,
        })
        .select('*')
        .single();

      if (error) {
        throw error;
      }
      return data as JobOffer;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
    },
  });

  // This mutation updates an existing job offer record.
  const updateMutation = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<JobOfferInput> }) => {
      if (!user?.id) {
        throw new Error('Utilisateur non connecté');
      }
      const { data, error } = await supabase
        .from('job_offers')
        .update({
          ...input,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('user_id', user.id)
        .select('*')
        .single();

      if (error) {
        throw error;
      }
      return data as JobOffer;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['offers'] });
      queryClient.invalidateQueries({ queryKey: ['offer', updated.id] });
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
    },
  });

  // This mutation deletes a job offer and cascades deletions to linked applications.
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!user?.id) {
        throw new Error('Utilisateur non connecté');
      }
      const { error } = await supabase
        .from('job_offers')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) {
        throw error;
      }
      return id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['offers'] });
      queryClient.invalidateQueries({ queryKey: ['offer', id] });
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
    },
  });

  return {
    createOffer: createMutation.mutateAsync,
    updateOffer: updateMutation.mutateAsync,
    deleteOffer: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

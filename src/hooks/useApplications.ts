import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  Application,
  ApplicationInput,
  ApplicationStatus,
  StatusHistoryItem,
} from '@/types/database';

interface UseApplicationsParams {
  status?: string;
  page?: number;
  pageSize?: number;
}

// This hook retrieves a paginated list of candidate applications with status filtering.
export function useApplications({
  status = 'All',
  page = 0,
  pageSize = 15,
}: UseApplicationsParams = {}) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['applications', { status, page, pageSize, userId: user?.id }],
    queryFn: async () => {
      if (!user?.id) {
        return { data: [], count: 0 };
      }

      const from = page * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from('applications')
        .select('*, offer:job_offers(id, title, company, location, user_id)', { count: 'exact' })
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .range(from, to);

      if (status && status !== 'All') {
        query = query.eq('status', status);
      }

      const { data, error, count } = await query;
      if (error) {
        throw error;
      }
      return {
        data: (data || []) as Application[],
        count: count || 0,
      };
    },
    enabled: Boolean(user?.id),
  });
}

// This hook retrieves full details and history for a single application across candidates and posters.
export function useApplication(id: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['application', id],
    queryFn: async () => {
      if (!id || !user?.id) {
        return null;
      }
      const { data, error } = await supabase
        .from('applications')
        .select(
          '*, offer:job_offers(id, title, company, location, url, description, user_id), applicant:profiles(id, display_name, target_role, experience_level, skills)'
        )
        .eq('id', id)
        .maybeSingle();

      if (error) {
        throw error;
      }
      return data as Application | null;
    },
    enabled: Boolean(id && user?.id),
  });
}

// This hook checks whether the current user has already applied to a specific job offer.
export function useApplicationByOffer(offerId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['applicationByOffer', offerId, user?.id],
    queryFn: async () => {
      if (!offerId || !user?.id) {
        return null;
      }
      const { data, error } = await supabase
        .from('applications')
        .select('id, status')
        .eq('offer_id', offerId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        throw error;
      }
      return data as { id: string; status: ApplicationStatus } | null;
    },
    enabled: Boolean(offerId && user?.id),
  });
}

// This hook retrieves all candidate applications submitted for a specific job offer.
export function useOfferApplicants(offerId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['offerApplicants', offerId],
    queryFn: async () => {
      if (!offerId || !user?.id) {
        return [] as Application[];
      }
      const { data, error } = await supabase
        .from('applications')
        .select(
          '*, applicant:profiles(id, display_name, target_role, experience_level, skills)'
        )
        .eq('offer_id', offerId)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }
      return (data || []) as Application[];
    },
    enabled: Boolean(offerId && user?.id),
  });
}

// This hook provides mutations to create, transition and update job applications.
export function useApplicationMutations() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // This mutation creates a new application linking an existing job offer.
  const createMutation = useMutation({
    mutationFn: async (input: ApplicationInput) => {
      if (!user?.id) {
        throw new Error('Utilisateur non connecté');
      }
      const initialStatus = input.status || 'Applied';
      const historyItem: StatusHistoryItem = {
        status: initialStatus,
        changed_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('applications')
        .insert({
          user_id: user.id,
          offer_id: input.offer_id,
          status: initialStatus,
          notes: input.notes || null,
          applied_at: input.applied_at || new Date().toISOString(),
          status_history: [historyItem],
        })
        .select('*, offer:job_offers(id, title, company, location, user_id)')
        .single();

      if (error) {
        throw error;
      }
      return data as Application;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['applicationByOffer', created.offer_id] });
      queryClient.invalidateQueries({ queryKey: ['offerApplicants', created.offer_id] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
    },
  });

  // This mutation transitions the status and records an event in the timeline history.
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, newStatus }: { id: string; newStatus: ApplicationStatus }) => {
      if (!user?.id) {
        throw new Error('Utilisateur non connecté');
      }

      const { data: currentApp, error: fetchError } = await supabase
        .from('applications')
        .select('status_history, offer_id')
        .eq('id', id)
        .single();

      if (fetchError) {
        throw fetchError;
      }

      const currentHistory = (currentApp?.status_history || []) as StatusHistoryItem[];
      const nextHistory: StatusHistoryItem[] = [
        ...currentHistory,
        {
          status: newStatus,
          changed_at: new Date().toISOString(),
        },
      ];

      const { data, error } = await supabase
        .from('applications')
        .update({
          status: newStatus,
          status_history: nextHistory,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select(
          '*, offer:job_offers(id, title, company, location, user_id), applicant:profiles(id, display_name, target_role, experience_level, skills)'
        )
        .single();

      if (error) {
        throw error;
      }
      return data as Application;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['application', updated.id] });
      queryClient.invalidateQueries({ queryKey: ['applicationByOffer', updated.offer_id] });
      queryClient.invalidateQueries({ queryKey: ['offerApplicants', updated.offer_id] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
    },
  });

  // This mutation updates the candidate notes for an active application.
  const updateNotesMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      if (!user?.id) {
        throw new Error('Utilisateur non connecté');
      }
      const { data, error } = await supabase
        .from('applications')
        .update({
          notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        throw error;
      }
      return data as Application;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['application', updated.id] });
      queryClient.invalidateQueries({ queryKey: ['offerApplicants', updated.offer_id] });
    },
  });

  // This mutation deletes an application record.
  const deleteMutation = useMutation({
    mutationFn: async ({ id, offerId }: { id: string; offerId?: string }) => {
      if (!user?.id) {
        throw new Error('Utilisateur non connecté');
      }
      const { error } = await supabase
        .from('applications')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) {
        throw error;
      }
      return { id, offerId };
    },
    onSuccess: ({ id, offerId }) => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['application', id] });
      if (offerId) {
        queryClient.invalidateQueries({ queryKey: ['applicationByOffer', offerId] });
        queryClient.invalidateQueries({ queryKey: ['offerApplicants', offerId] });
      }
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
    },
  });

  return {
    createApplication: createMutation.mutateAsync,
    updateStatus: updateStatusMutation.mutateAsync,
    updateNotes: updateNotesMutation.mutateAsync,
    deleteApplication: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdatingStatus: updateStatusMutation.isPending,
    isUpdatingNotes: updateNotesMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

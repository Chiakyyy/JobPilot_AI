import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  AiQuotaInfo,
  CvAnalysisResult,
  InterviewPrepResult,
} from '@/types/database';

// This helper parses supabase function error responses into friendly french user messages.
function parseFunctionError(err: unknown, defaultMessage: string): string {
  if (!err) {
    return defaultMessage;
  }

  const rawMessage = err instanceof Error ? err.message : String(err);

  if (rawMessage.includes('Ce document ne peut pas être analysé')) {
    return 'Ce document ne peut pas être analysé dans cette version';
  }

  if (rawMessage.includes('Quota quotidien atteint')) {
    return rawMessage;
  }

  if (rawMessage.includes('429')) {
    return 'Quota quotidien atteint pour cette fonctionnalité aujourd’hui.';
  }

  if (rawMessage.includes('422')) {
    return 'Ce document ne peut pas être analysé dans cette version';
  }

  if (rawMessage.includes('abort') || rawMessage.includes('timeout') || rawMessage.includes('504')) {
    return 'Le service d’intelligence artificielle n’a pas répondu dans les temps. Veuillez réessayer.';
  }

  if (rawMessage.includes('Network') || rawMessage.includes('Failed to fetch')) {
    return 'Connexion réseau indisponible. Veuillez vérifier votre accès à internet.';
  }

  return rawMessage || defaultMessage;
}

// This hook retrieves the remaining daily quota counters for the authenticated user.
export function useAiQuota() {
  const { user } = useAuth();

  return useQuery<AiQuotaInfo>({
    queryKey: ['ai-quota', user?.id],
    queryFn: async (): Promise<AiQuotaInfo> => {
      if (!user?.id) {
        return {
          cvAnalysisUsed: 0,
          cvAnalysisMax: 3,
          cvAnalysisRemaining: 3,
          interviewPrepUsed: 0,
          interviewPrepMax: 5,
          interviewPrepRemaining: 5,
        };
      }

      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('ai_usage_logs')
        .select('feature, status')
        .eq('user_id', user.id)
        .eq('usage_date', today)
        .in('status', ['completed', 'pending']);

      if (error) {
        console.error('Failed to query ai usage logs', error);
        return {
          cvAnalysisUsed: 0,
          cvAnalysisMax: 3,
          cvAnalysisRemaining: 3,
          interviewPrepUsed: 0,
          interviewPrepMax: 5,
          interviewPrepRemaining: 5,
        };
      }

      const rows = data || [];
      const cvUsed = rows.filter((r) => r.feature === 'cv_analysis').length;
      const interviewUsed = rows.filter((r) => r.feature === 'interview_prep').length;

      return {
        cvAnalysisUsed: cvUsed,
        cvAnalysisMax: 3,
        cvAnalysisRemaining: Math.max(0, 3 - cvUsed),
        interviewPrepUsed: interviewUsed,
        interviewPrepMax: 5,
        interviewPrepRemaining: Math.max(0, 5 - interviewUsed),
      };
    },
    enabled: Boolean(user?.id),
    staleTime: 1000 * 30,
  });
}

// This hook executes cv to job offer alignment analysis through the authenticated edge function.
export function useAnalyzeCvOffer() {
  const queryClient = useQueryClient();

  return useMutation<CvAnalysisResult, Error, { offerId: string }>({
    mutationFn: async ({ offerId }): Promise<CvAnalysisResult> => {
      const idempotencyKey = `${offerId}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      const { data, error } = await supabase.functions.invoke('analyze-cv-offer', {
        body: {
          offer_id: offerId,
          consent_accepted: true,
          idempotency_key: idempotencyKey,
        },
      });

      if (error) {
        let errorBodyMessage = '';
        try {
          if (typeof error === 'object' && error !== null && 'context' in error) {
            const context = (error as { context?: Response }).context;
            if (context && typeof context.json === 'function') {
              const bodyJson = await context.json();
              errorBodyMessage = bodyJson.error || '';
            }
          }
        } catch {
          // Ignore json parsing failures on response context.
        }
        const message = parseFunctionError(errorBodyMessage || error, 'Échec de l’analyse du CV et de l’offre.');
        throw new Error(message);
      }

      if (data?.error) {
        throw new Error(parseFunctionError(data.error, 'Échec de l’analyse du CV et de l’offre.'));
      }

      return data as CvAnalysisResult;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ai-quota'] });
    },
  });
}

// This hook executes interview preparation generation through the authenticated edge function.
export function useGenerateInterviewPrep() {
  const queryClient = useQueryClient();

  return useMutation<InterviewPrepResult, Error, { offerId: string; includeCv?: boolean }>({
    mutationFn: async ({ offerId, includeCv }): Promise<InterviewPrepResult> => {
      const idempotencyKey = `${offerId}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      const { data, error } = await supabase.functions.invoke('generate-interview-prep', {
        body: {
          offer_id: offerId,
          include_cv: includeCv ?? false,
          consent_accepted: true,
          idempotency_key: idempotencyKey,
        },
      });

      if (error) {
        let errorBodyMessage = '';
        try {
          if (typeof error === 'object' && error !== null && 'context' in error) {
            const context = (error as { context?: Response }).context;
            if (context && typeof context.json === 'function') {
              const bodyJson = await context.json();
              errorBodyMessage = bodyJson.error || '';
            }
          }
        } catch {
          // Ignore json parsing failures on response context.
        }
        const message = parseFunctionError(
          errorBodyMessage || error,
          'Échec de la génération des questions d’entretien.'
        );
        throw new Error(message);
      }

      if (data?.error) {
        throw new Error(parseFunctionError(data.error, 'Échec de la génération des questions d’entretien.'));
      }

      return data as InterviewPrepResult;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ai-quota'] });
    },
  });
}

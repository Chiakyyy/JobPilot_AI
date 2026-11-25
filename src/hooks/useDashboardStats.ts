import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Application, ApplicationStatus } from '@/types/database';

export interface DashboardStats {
  total: number;
  byStatus: Record<ApplicationStatus, number>;
  recentApplications: Application[];
}

// This hook computes dashboard summary metrics and lists the latest applications.
export function useDashboardStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['dashboardStats', user?.id],
    queryFn: async (): Promise<DashboardStats> => {
      if (!user?.id) {
        return {
          total: 0,
          byStatus: { Saved: 0, Applied: 0, Interview: 0, Offer: 0, Rejected: 0 },
          recentApplications: [],
        };
      }

      const { data: allApps, error: allAppsError } = await supabase
        .from('applications')
        .select('status')
        .eq('user_id', user.id);

      if (allAppsError) {
        throw allAppsError;
      }

      const byStatus: Record<ApplicationStatus, number> = {
        Saved: 0,
        Applied: 0,
        Interview: 0,
        Offer: 0,
        Rejected: 0,
      };

      (allApps || []).forEach((row) => {
        const s = row.status as ApplicationStatus;
        if (byStatus[s] !== undefined) {
          byStatus[s] += 1;
        }
      });

      const { data: recent, error: recentError } = await supabase
        .from('applications')
        .select('*, offer:job_offers(id, title, company, location)')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(5);

      if (recentError) {
        throw recentError;
      }

      return {
        total: allApps?.length || 0,
        byStatus,
        recentApplications: (recent || []) as Application[],
      };
    },
    enabled: Boolean(user?.id),
  });
}

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// This edge function handles complete account and storage deletion for gdpr compliance.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'En-tête d’autorisation manquant.' }, 401);
  }

  // This user client forwards the incoming authorization header to verify the caller identity.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authError } = await userClient.auth.getUser();

  if (authError || !user) {
    return jsonResponse({ error: 'Session non authentifiée ou expirée.' }, 401);
  }

  // This administrative client uses the service role key to manage storage and user deletion.
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const requestId = crypto.randomUUID();

  try {
    // Purge private storage objects first to prevent foreign key errors on user deletion.
    const { data: userFiles } = await adminClient.storage.from('cvs').list(user.id);
    const pathsToRemove: string[] = [];

    if (userFiles && userFiles.length > 0) {
      for (const file of userFiles) {
        pathsToRemove.push(`${user.id}/${file.name}`);
      }
    }

    const { data: userCv } = await adminClient
      .from('user_cvs')
      .select('file_path')
      .eq('user_id', user.id)
      .maybeSingle();

    if (userCv?.file_path && !pathsToRemove.includes(userCv.file_path)) {
      pathsToRemove.push(userCv.file_path);
    }

    if (pathsToRemove.length > 0) {
      await adminClient.storage.from('cvs').remove(pathsToRemove);
    }

    // Delete user from authentication system and cascade across database records.
    const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(user.id);

    if (deleteUserError) {
      console.error('Failed to delete auth user', deleteUserError);
      return jsonResponse({ error: 'Erreur lors de la suppression du compte utilisateur.' }, 500);
    }

    // Log sanitized telemetry event with zero sensitive user information.
    console.log(JSON.stringify({
      request_id: requestId,
      user_id: user.id,
      status: 'deleted',
    }));

    return jsonResponse({ message: 'Compte et données personnelles supprimés avec succès.' }, 200);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue lors de la suppression.';
    console.error('Delete account error', message);
    return jsonResponse({ error: message }, 500);
  }
});

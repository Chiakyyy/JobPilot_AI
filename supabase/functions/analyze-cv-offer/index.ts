import { createClient } from 'npm:@supabase/supabase-js@2';
import { defaultAiProvider } from '../_shared/aiProvider.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { extractCvText, ScannedPdfError } from '../_shared/pdfExtractor.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// This regular expression validates standard uuid strings.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// This edge function handles cv to offer matching analysis with quota checks and prompt guards.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'En-tête d’autorisation manquant.' }, 401);
  }

  // This client forwards the incoming authorization header to propagate the caller identity.
  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authError } = await supabaseUser.auth.getUser();

  if (authError || !user) {
    return jsonResponse({ error: 'Session non authentifiée ou expirée.' }, 401);
  }

  let body: { offer_id?: string; consent_accepted?: boolean; idempotency_key?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Format de requête invalide.' }, 400);
  }

  const { offer_id, consent_accepted, idempotency_key } = body;

  if (!offer_id || !UUID_REGEX.test(offer_id)) {
    return jsonResponse({ error: 'Identifiant de l\'offre manquant ou invalide.' }, 400);
  }

  if (!idempotency_key) {
    return jsonResponse({ error: 'Paramètre idempotency_key manquant.' }, 400);
  }

  if (consent_accepted !== true) {
    return jsonResponse({ error: 'Le consentement utilisateur est obligatoire pour réaliser cette analyse.' }, 400);
  }

  const supabaseAdmin = createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: authHeader } } }
  );
  const today = new Date().toISOString().split('T')[0];

  // Check if an identical request was already completed to prevent duplicate charging.
  const { data: existingCompleted } = await supabaseAdmin
    .from('ai_usage_logs')
    .select('id')
    .eq('user_id', user.id)
    .eq('feature', 'cv_analysis')
    .eq('idempotency_key', idempotency_key)
    .eq('status', 'completed')
    .maybeSingle();

  if (existingCompleted) {
    return jsonResponse({ message: 'Cette analyse a déjà été traitée avec succès.' }, 200);
  }

  // Enforce daily quota of 3 analyses per user per day.
  const { count: dailyCount, error: countError } = await supabaseAdmin
    .from('ai_usage_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('feature', 'cv_analysis')
    .eq('usage_date', today)
    .in('status', ['completed', 'pending']);

  if (countError) {
    return jsonResponse({ error: 'Impossible de vérifier vos quotas journaliers.' }, 500);
  }

  if ((dailyCount ?? 0) >= 3) {
    return jsonResponse(
      { error: 'Quota quotidien atteint : vous avez utilisé vos 3 analyses IA aujourd\'hui.' },
      429
    );
  }

  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  const { data: pendingLog, error: insertError } = await supabaseAdmin
    .from('ai_usage_logs')
    .insert({
      user_id: user.id,
      feature: 'cv_analysis',
      offer_id,
      idempotency_key,
      usage_date: today,
      status: 'pending',
      request_id: requestId,
    })
    .select('id')
    .single();

  if (insertError || !pendingLog) {
    return jsonResponse({ error: 'Une analyse est déjà en cours ou la réservation du quota a échoué.' }, 409);
  }

  const logId = pendingLog.id;

  try {
    const { data: offer, error: offerError } = await supabaseUser
      .from('job_offers')
      .select('id, title, company, description')
      .eq('id', offer_id)
      .maybeSingle();

    if (offerError || !offer) {
      await supabaseAdmin.from('ai_usage_logs').update({ status: 'failed' }).eq('id', logId);
      return jsonResponse({ error: 'Offre d\'emploi introuvable en base de données.' }, 404);
    }

    const { data: userCv, error: cvError } = await supabaseUser
      .from('user_cvs')
      .select('file_path')
      .eq('user_id', user.id)
      .maybeSingle();

    if (cvError || !userCv?.file_path) {
      await supabaseAdmin.from('ai_usage_logs').update({ status: 'failed' }).eq('id', logId);
      return jsonResponse(
        { error: 'Aucun CV trouvé. Veuillez d\'abord importer votre CV PDF dans votre profil.' },
        404
      );
    }

    const cvText = await extractCvText(supabaseUser, userCv.file_path);
    const offerDescription = offer.description || offer.title;

    const analysisResult = await defaultAiProvider.analyzeCvOffer({
      cvText,
      offerTitle: offer.title,
      offerCompany: offer.company,
      offerDescription,
    });

    const durationMs = Date.now() - startTime;
    await supabaseAdmin
      .from('ai_usage_logs')
      .update({ status: 'completed', duration_ms: durationMs })
      .eq('id', logId);

    // Emit sanitized telemetry log with zero sensitive document text.
    console.log(JSON.stringify({
      request_id: requestId,
      user_id: user.id,
      feature: 'cv_analysis',
      duration_ms: durationMs,
      status: 'completed',
    }));

    return jsonResponse(analysisResult, 200);
  } catch (err: unknown) {
    await supabaseAdmin.from('ai_usage_logs').update({ status: 'failed' }).eq('id', logId);

    if (err instanceof ScannedPdfError) {
      return jsonResponse({ error: err.message }, 422);
    }

    const message = err instanceof Error ? err.message : 'Erreur inconnue lors de l’analyse.';
    return jsonResponse({ error: message }, 500);
  }
});

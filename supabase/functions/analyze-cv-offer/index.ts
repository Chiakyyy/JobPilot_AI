import { createClient } from 'npm:@supabase/supabase-js@2';
import { defaultAiProvider, CvAnalysisOutput } from '../_shared/aiProvider.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { extractCvText, ScannedPdfError } from '../_shared/pdfExtractor.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// This regular expression validates standard uuid strings.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// This helper escapes special regular expression characters in candidate skill strings.
function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// This helper verifies whether a skill token exists verbatim in extracted cv text using boundary matching.
function isSkillPresentInCv(skill: string, normalizedCv: string): boolean {
  const trimmed = skill.trim().toLowerCase();
  if (!trimmed) {
    return false;
  }

  // Clean conversational prefixes and trailing parenthetical details.
  const cleaned = trimmed
    .replace(/^(maîtrise de |connaissance de |notions de |expérience en |pratique de |mastery of |knowledge of |experience with )/i, '')
    .replace(/\(.*?\)/g, '')
    .trim();

  const candidates = [trimmed, cleaned].filter((c) => c.length > 0);

  for (const candidate of candidates) {
    // Avoid matching single letter tokens that are not recognized programming languages like c or r.
    if (candidate.length === 1 && !['c', 'r'].includes(candidate)) {
      continue;
    }

    const escaped = escapeRegex(candidate);

    // Boundary check using non alphanumeric markers while preserving tech characters.
    const pattern = new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9+#])`, 'i');
    if (pattern.test(normalizedCv)) {
      return true;
    }

    // Also check plural variant when candidate length is at least three and does not end with s.
    if (candidate.length >= 3 && !candidate.endsWith('s')) {
      const pluralEscaped = escapeRegex(`${candidate}s`);
      const pluralPattern = new RegExp(`(^|[^a-z0-9])${pluralEscaped}($|[^a-z0-9+#])`, 'i');
      if (pluralPattern.test(normalizedCv)) {
        return true;
      }
    }

    // Check composite slash tokens individually.
    if (candidate.includes('/')) {
      const subTokens = candidate.split('/').map((s) => s.trim()).filter((s) => s.length > 0);
      for (const sub of subTokens) {
        if (isSkillPresentInCv(sub, normalizedCv)) {
          return true;
        }
      }
    }
  }

  return false;
}

// This helper deduplicates string arrays case insensitively while preserving original casing.
function deduplicateCaseInsensitive(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed) {
      continue;
    }
    const lower = trimmed.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      result.push(trimmed);
    }
  }

  return result;
}

// This helper applies deterministic grounding filters to eliminate false positive missing skills and ui contradictions.
function applyGroundingFilter(
  result: CvAnalysisOutput,
  cvText: string
): CvAnalysisOutput {
  const normalizedCv = cvText.toLowerCase();

  // Deduplicate matched skills case insensitively.
  const dedupedMatched = deduplicateCaseInsensitive(result.matched_skills ?? []);

  // Build a lookup set of normalized matched skills for mutual exclusivity check.
  const matchedSet = new Set(
    dedupedMatched.map((s) => s.trim().toLowerCase().replace(/\(.*?\)/g, '').trim())
  );

  // Filter missing skills against cv text presence and matched skills mutual exclusivity.
  const filteredMissing: string[] = [];
  for (const skill of result.missing_skills ?? []) {
    const trimmed = skill.trim();
    if (!trimmed) {
      continue;
    }

    const lower = trimmed.toLowerCase();
    const cleanLower = lower.replace(/\(.*?\)/g, '').trim();

    // Enforce mutual exclusivity with matched skills.
    if (matchedSet.has(lower) || matchedSet.has(cleanLower)) {
      continue;
    }

    // Filter out false positive missing skills that are already present in the cv text.
    if (isSkillPresentInCv(trimmed, normalizedCv)) {
      continue;
    }

    filteredMissing.push(trimmed);
  }

  const dedupedMissing = deduplicateCaseInsensitive(filteredMissing);

  return {
    ...result,
    matched_skills: dedupedMatched,
    missing_skills: dedupedMissing,
  };
}

// This edge function handles cv to offer matching analysis with quota checks and prompt guards.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'En-tête d’autorisation manquant.' }, 401);
  }

  // This user client forwards the incoming authorization header to read rls protected data.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authError } = await userClient.auth.getUser();

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

  // This administrative client uses the service role key to manage telemetry and quotas.
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const today = new Date().toISOString().split('T')[0];
  const sixtySecondsAgo = new Date(Date.now() - 60000).toISOString();

  // Remove orphaned pending rows older than one minute to avoid blocking valid runs.
  await adminClient
    .from('ai_usage_logs')
    .delete()
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .lt('created_at', sixtySecondsAgo);

  // Check if an identical request was already completed to prevent duplicate charging.
  const { data: existingCompleted } = await adminClient
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

  const isQuotaEnabled = Deno.env.get('ENABLE_AI_QUOTA') === 'true';

  if (isQuotaEnabled) {
    // Enforce daily quota of 3 analyses per user per day when quotas are activated.
    const { count: dailyCount, error: countError } = await adminClient
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
  }

  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  const { data: pendingLog, error: insertError } = await adminClient
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
    if (insertError?.code === '23505') {
      return jsonResponse({ error: 'Une analyse est déjà en cours pour cette requête.' }, 409);
    }
    console.error('ai_usage_logs insert error', insertError?.code, insertError?.message);
    return jsonResponse({ error: 'Erreur serveur lors de l’initialisation de l’analyse.' }, 500);
  }

  const logId = pendingLog.id;

  try {
    const { data: offer, error: offerError } = await userClient
      .from('job_offers')
      .select('id, title, company, description')
      .eq('id', offer_id)
      .maybeSingle();

    if (offerError || !offer) {
      await adminClient.from('ai_usage_logs').update({ status: 'failed' }).eq('id', logId);
      return jsonResponse({ error: 'Offre d\'emploi introuvable en base de données.' }, 404);
    }

    const { data: userCv, error: cvError } = await userClient
      .from('user_cvs')
      .select('file_path')
      .eq('user_id', user.id)
      .maybeSingle();

    if (cvError || !userCv?.file_path) {
      await adminClient.from('ai_usage_logs').update({ status: 'failed' }).eq('id', logId);
      return jsonResponse(
        { error: 'Aucun CV trouvé. Veuillez d\'abord importer votre CV PDF dans votre profil.' },
        404
      );
    }

    const cvText = await extractCvText(adminClient, userCv.file_path);
    const offerDescription = offer.description || offer.title;

    const analysisResult = await defaultAiProvider.analyzeCvOffer({
      cvText,
      offerTitle: offer.title,
      offerCompany: offer.company,
      offerDescription,
    });

    // Apply deterministic grounding post processing to guarantee factual skill extraction.
    const groundedResult = applyGroundingFilter(analysisResult, cvText);

    const durationMs = Date.now() - startTime;
    await adminClient
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

    return jsonResponse(groundedResult, 200);
  } catch (err: unknown) {
    await adminClient.from('ai_usage_logs').update({ status: 'failed' }).eq('id', logId);

    if (err instanceof ScannedPdfError) {
      return jsonResponse({ error: err.message }, 422);
    }

    const message = err instanceof Error ? err.message : 'Erreur inconnue lors de l’analyse.';
    return jsonResponse({ error: message }, 500);
  }
});

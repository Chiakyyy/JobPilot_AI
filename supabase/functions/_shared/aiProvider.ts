import { z } from 'npm:zod@3';
import {
  buildCvAnalysisPrompt,
  buildHrInterviewPrepPrompt,
  buildTechInterviewPrepPrompt,
  PromptMessage,
} from './promptGuard.ts';

// This schema validates structured cv to offer alignment analysis outputs.
export const cvAnalysisSchema = z.object({
  detected_language: z.enum(['fr', 'en']),
  matched_skills: z.array(z.string()),
  missing_skills: z.array(z.string()),
  strengths: z.array(z.string()),
  gaps_and_risks: z.array(z.string()),
  actionable_recommendations: z.array(z.string()),
  disclaimer: z.string(),
});

export type CvAnalysisOutput = z.infer<typeof cvAnalysisSchema>;

// This schema validates individual interview preparation questions.
export const interviewQuestionSchema = z.object({
  question: z.string(),
  category: z.enum(['Technique', 'RH']),
  difficulty: z.enum(['Facile', 'Moyen', 'Difficile']),
  rationale: z.string(),
  answer_guidelines: z.array(z.string()),
});

// This schema validates individual hr interview questions.
export const hrQuestionSchema = z.object({
  question: z.string(),
  category: z.literal('RH'),
  difficulty: z.enum(['Facile', 'Moyen', 'Difficile']),
  rationale: z.string(),
  answer_guidelines: z.array(z.string()),
});

// This schema validates individual technical interview questions.
export const technicalQuestionSchema = z.object({
  question: z.string(),
  category: z.literal('Technique'),
  difficulty: z.enum(['Facile', 'Moyen', 'Difficile']),
  rationale: z.string(),
  answer_guidelines: z.array(z.string()),
});

// This schema validates hr question batch payloads.
export const hrPrepResponseSchema = z.object({
  hr_questions: z.array(hrQuestionSchema).min(5).max(8),
  disclaimer: z.string().optional(),
});

// This schema validates technical question batch payloads.
export const technicalPrepResponseSchema = z.object({
  technical_questions: z.array(technicalQuestionSchema).min(15).max(20),
  disclaimer: z.string().optional(),
});

// This schema validates complete interview preparation response payloads.
export const interviewPrepSchema = z.object({
  hr_questions: z.array(hrQuestionSchema).min(5).max(8),
  technical_questions: z.array(technicalQuestionSchema).min(15).max(20),
  questions: z.array(interviewQuestionSchema).min(20).max(28),
  disclaimer: z.string(),
});

export type InterviewQuestion = z.infer<typeof interviewQuestionSchema>;
export type InterviewPrepOutput = z.infer<typeof interviewPrepSchema>;

export interface AnalyzeCvOfferParams {
  cvText: string;
  offerTitle: string;
  offerCompany: string;
  offerDescription: string;
}

export interface GenerateInterviewPrepParams {
  offerTitle: string;
  offerCompany: string;
  offerDescription: string;
  cvText?: string | null;
}

// This interface defines the contract for swappable ai service providers.
export interface AIProvider {
  analyzeCvOffer(params: AnalyzeCvOfferParams): Promise<CvAnalysisOutput>;
  generateInterviewPrep(params: GenerateInterviewPrepParams): Promise<InterviewPrepOutput>;
}

// This helper extracts and parses json payload from raw response strings or pre parsed objects.
function parseAiJsonPayload(rawResponse: unknown): unknown {
  if (rawResponse !== null && typeof rawResponse === 'object') {
    return rawResponse;
  }

  if (typeof rawResponse === 'string') {
    let cleaned = rawResponse.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/i, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/, '');
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.replace(/\s*```$/, '');
    }
    cleaned = cleaned.trim();

    // If extra conversational text wraps the json object, extract the outermost curly braces.
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    try {
      return JSON.parse(cleaned);
    } catch {
      throw new Error('Impossible de parser la réponse JSON fournie par le modèle IA.');
    }
  }

  throw new Error('Réponse vide ou invalide du modèle IA.');
}

// This class implements the ai provider using cloudflare workers ai with timeout and schema validation.
export class CloudflareWorkersAIProvider implements AIProvider {
  private accountId: string | undefined;
  private apiToken: string | undefined;
  private model: string;

  constructor() {
    this.accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
    this.apiToken = Deno.env.get('CLOUDFLARE_API_TOKEN');
    this.model = Deno.env.get('CLOUDFLARE_AI_MODEL') ?? '@cf/meta/llama-3.1-8b-instruct';
  }

  // This private helper executes an http call to cloudflare with an abort controller timeout.
  private async runModel(
    messages: PromptMessage[],
    options?: { max_tokens?: number; temperature?: number; timeoutMs?: number }
  ): Promise<unknown> {
    if (!this.accountId || !this.apiToken) {
      throw new Error('Identifiants Cloudflare manquants (CLOUDFLARE_ACCOUNT_ID ou CLOUDFLARE_API_TOKEN non configurés).');
    }

    const timeoutDuration = options?.timeoutMs ?? 35000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutDuration);

    try {
      const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${this.model}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages,
          max_tokens: options?.max_tokens ?? 2048,
          temperature: options?.temperature ?? 0.1,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erreur Cloudflare Workers AI (${response.status}) : ${errorText}`);
      }

      const data = await response.json();
      const rawOutput = data.result?.response ?? data.result;

      if (!rawOutput) {
        throw new Error('Réponse vide reçue de Cloudflare Workers AI.');
      }

      return rawOutput;
    } finally {
      clearTimeout(timeout);
    }
  }

  // This method generates cv to offer matching analysis with fallback support for unconfigured environments.
  async analyzeCvOffer(params: AnalyzeCvOfferParams): Promise<CvAnalysisOutput> {
    const messages = buildCvAnalysisPrompt(
      params.cvText,
      params.offerTitle,
      params.offerCompany,
      params.offerDescription
    );

    // If cloudflare credentials are not configured, return a deterministic structured payload for local testing.
    if (!this.accountId || !this.apiToken) {
      return {
        detected_language: 'fr',
        matched_skills: ['Communication', 'Gestion de projet', 'Travail en équipe'],
        missing_skills: ['Compétence spécifique liée au poste'],
        strengths: [
          'Expérience solide en environnement collaboratif correspondant au descriptif.',
          'Alignement méthodologique général avec les objectifs de l’entreprise.',
        ],
        gaps_and_risks: [
          'Certains outils avancés mentionnés dans l’offre ne figurent pas explicitement sur le CV.',
        ],
        actionable_recommendations: [
          'Expliciter les réalisations quantifiables en lien direct avec le titre du poste.',
          'Mettre en avant les projets similaires menés récemment dans votre lettre de motivation.',
        ],
        disclaimer:
          'Cette analyse automatisée constitue une aide à la préparation et ne préjuge pas de l’issue du processus de recrutement.',
      };
    }

    const rawOutput = await this.runModel(messages);
    const parsed = parseAiJsonPayload(rawOutput);
    const validated = cvAnalysisSchema.safeParse(parsed);
    if (!validated.success) {
      throw new Error(`Structure de réponse IA invalide : ${validated.error.message}`);
    }
    return validated.data;
  }

  // This method generates interview preparation questions through parallel hr and technical fan out.
  async generateInterviewPrep(params: GenerateInterviewPrepParams): Promise<InterviewPrepOutput> {
    const hrMessages = buildHrInterviewPrepPrompt(
      params.offerTitle,
      params.offerCompany,
      params.offerDescription,
      params.cvText
    );

    const techMessages = buildTechInterviewPrepPrompt(
      params.offerTitle,
      params.offerCompany,
      params.offerDescription,
      params.cvText
    );

    // If cloudflare credentials are not configured, return a deterministic structured payload for local testing.
    if (!this.accountId || !this.apiToken) {
      const mockHrQuestions: InterviewQuestion[] = [
        {
          question: `Qu’est-ce qui vous attire particulièrement dans l’activité et la culture de ${params.offerCompany} ?`,
          category: 'RH',
          difficulty: 'Facile',
          rationale: 'Évalue la motivation sincère et l’alignement avec la culture d’entreprise.',
          answer_guidelines: [
            'Montrer une compréhension des projets récents de l’entreprise.',
            'Lier vos valeurs aux missions de l’équipe.',
          ],
        },
        {
          question: 'Comment gérez-vous une situation où les priorités changent rapidement avec des délais serrés ?',
          category: 'RH',
          difficulty: 'Moyen',
          rationale: 'Mesure l’adaptabilité, la résilience et la communication sous pression.',
          answer_guidelines: [
            'Partager un exemple concret de réorganisation de tâches.',
            'Souligner la communication proactive avec le management.',
          ],
        },
        {
          question: 'Décrivez un désaccord professionnel avec un collègue et la manière dont vous l’avez résolu.',
          category: 'RH',
          difficulty: 'Moyen',
          rationale: 'Teste l’écoute active, l’intelligence relationnelle et l’esprit d’équipe.',
          answer_guidelines: [
            'Rester factuel et centré sur l’intérêt du projet.',
            'Mettre en avant le compromis trouvé ensemble.',
          ],
        },
        {
          question: 'Quelle est votre plus grande réussite professionnelle à ce jour et pourquoi ?',
          category: 'RH',
          difficulty: 'Facile',
          rationale: 'Permet d’évaluer vos standards d’excellence et votre sens de l’impact.',
          answer_guidelines: [
            'Structurer selon la méthode STAR avec des indicateurs chiffrés.',
            'Valoriser la contribution collective et personnelle.',
          ],
        },
        {
          question: `Comment envisagez-vous votre progression et vos responsabilités sur le poste de ${params.offerTitle} d’ici deux ans ?`,
          category: 'RH',
          difficulty: 'Moyen',
          rationale: 'Mesure la vision à long terme et l’ambition professionnelle alignée sur le poste.',
          answer_guidelines: [
            'Indiquer les compétences clés à développer en priorité.',
            'Exprimer la volonté de transmettre aux profils juniors.',
          ],
        },
      ];

      const mockTechQuestions: InterviewQuestion[] = [
        {
          question: `Comment structurez-vous l’architecture logicielle pour répondre aux exigences du poste de ${params.offerTitle} ?`,
          category: 'Technique',
          difficulty: 'Moyen',
          rationale: 'Vérifie la maîtrise des principes de découpage modulaire et de maintenabilité.',
          answer_guidelines: [
            'Présenter une séparation claire entre logique métier, données et interface.',
            'Expliquer la gestion de la scalabilité du code.',
          ],
        },
        {
          question: 'Comment gérez-vous l’état global de l’application pour éviter les re-rendus superflus ?',
          category: 'Technique',
          difficulty: 'Moyen',
          rationale: 'Mesure la compréhension des cycles de vie et de l’optimisation mémoire.',
          answer_guidelines: [
            'Comparer les approches locales et globales selon la volatilité des données.',
            'Mentionner les sélecteurs mémorisés.',
          ],
        },
        {
          question: 'Quelle stratégie mettez-vous en place pour assurer le fonctionnement hors-ligne et la synchronisation des données ?',
          category: 'Technique',
          difficulty: 'Difficile',
          rationale: 'Évalue l’expérience sur les architectures mobiles déconnectées et la gestion de conflits.',
          answer_guidelines: [
            'Détailler le stockage local sécurisé et la mise en file des mutations.',
            'Expliquer la stratégie de résolution de conflits serveur.',
          ],
        },
        {
          question: 'Comment sécurisez-vous le stockage des tokens d’authentification et les échanges réseau ?',
          category: 'Technique',
          difficulty: 'Difficile',
          rationale: 'Vérifie les connaissances de base en sécurité applicative et gestion des secrets.',
          answer_guidelines: [
            'Citer le trousseau sécurisé natif du système.',
            'Évoquer le SSL pinning et l’invalidation des sessions.',
          ],
        },
        {
          question: 'Face à une fuite mémoire ou un blocage de thread, quelle est votre démarche de diagnostic ?',
          category: 'Technique',
          difficulty: 'Difficile',
          rationale: 'Mesure la méthode d’analyse et l’utilisation des outils de profilage.',
          answer_guidelines: [
            'Expliquer l’utilisation d’un profiler mémoire et le traçage des références.',
            'Isoler les sous-systèmes responsables avec des tests ciblés.',
          ],
        },
        {
          question: 'Comment optimisez-vous le temps de démarrage initial (TTI) de l’application ?',
          category: 'Technique',
          difficulty: 'Moyen',
          rationale: 'Teste la sensibilité aux métriques de performance perçue par l’utilisateur.',
          answer_guidelines: [
            'Évoquer le chargement différé des modules secondaires.',
            'Réduire les opérations synchrones sur le thread principal.',
          ],
        },
        {
          question: 'Quelle est votre méthodologie pour concevoir et versionner une API REST robuste ?',
          category: 'Technique',
          difficulty: 'Moyen',
          rationale: 'Vérifie l’alignement avec les standards de développement d’API modernes.',
          answer_guidelines: [
            'Respecter les codes de statut HTTP sémantiques.',
            'Garantir l’idempotence des opérations critiques.',
          ],
        },
        {
          question: 'Comment mettez-vous en place une stratégie de tests automatisés équilibrée ?',
          category: 'Technique',
          difficulty: 'Facile',
          rationale: 'Évalue la culture qualité et la pyramide des tests.',
          answer_guidelines: [
            'Distinguer tests unitaires, d’intégration et bout en bout.',
            'Prioriser les tests sur la logique critique.',
          ],
        },
        {
          question: 'Comment gérez-vous la compatibilité ascendante lors de modifications de schéma de base de données ?',
          category: 'Technique',
          difficulty: 'Moyen',
          rationale: 'Mesure l’anticipation des déploiements sans interruption de service.',
          answer_guidelines: [
            'Procéder par étapes additives sans rupture immédiate.',
            'Rétro-migrer les données en tâche de fond.',
          ],
        },
        {
          question: 'Quels critères utilisez-vous pour choisir entre une solution SaaS externe et un développement interne ?',
          category: 'Technique',
          difficulty: 'Facile',
          rationale: 'Teste le discernement pragmatique coût vs valeur ajoutée.',
          answer_guidelines: [
            'Évaluer le coût total de possession et la vélocité de mise sur le marché.',
            'Préserver le contrôle sur le cœur de métier différenciant.',
          ],
        },
        {
          question: 'Comment structurez-vous un pipeline CI/CD pour automatiser tests, linting et déploiement ?',
          category: 'Technique',
          difficulty: 'Moyen',
          rationale: 'Vérifie l’autonomie opérationnelle dans les cycles de livraison continue.',
          answer_guidelines: [
            'Définir des étapes ordonnées de validation statique et d’exécution de tests.',
            'Gérer les secrets d’environnement de manière isolée.',
          ],
        },
        {
          question: 'Comment abordez-vous la gestion des permissions sensibles auprès de l’utilisateur ?',
          category: 'Technique',
          difficulty: 'Facile',
          rationale: 'Évalue l’attention portée à l’expérience utilisateur et à la conformité système.',
          answer_guidelines: [
            'Demander les permissions au moment précis du besoin contextuel.',
            'Fournir une alternative gracieuse en cas de refus.',
          ],
        },
        {
          question: 'Quelle approche préconisez-vous pour monitorer les erreurs et la santé de l’application en production ?',
          category: 'Technique',
          difficulty: 'Moyen',
          rationale: 'Mesure la capacité à maintenir une observabilité proactive.',
          answer_guidelines: [
            'Centraliser le crash reporting avec filtres sur les données privées.',
            'Mettre en place des alertes sur les taux d’erreurs anormaux.',
          ],
        },
        {
          question: 'Comment résolvez-vous les conflits de concurrence lors d’écritures simultanées sur une ressource ?',
          category: 'Technique',
          difficulty: 'Difficile',
          rationale: 'Vérifie la maîtrise des transactions et du verrouillage optimiste/pessimiste.',
          answer_guidelines: [
            'Comparer le verrouillage optimiste avec numéro de version et les contraintes atomiques.',
            'Adapter le mécanisme au niveau de contention attendu.',
          ],
        },
        {
          question: 'Quels principes appliquez-vous pour garantir l’accessibilité numérique de vos interfaces ?',
          category: 'Technique',
          difficulty: 'Facile',
          rationale: 'Évalue la conformité aux normes d’inclusivité et de confort d’usage.',
          answer_guidelines: [
            'Respecter les ratios de contraste et la lisibilité typographique.',
            'Fournir des étiquettes sémantiques pour les lecteurs d’écran.',
          ],
        },
      ];

      return {
        hr_questions: mockHrQuestions,
        technical_questions: mockTechQuestions,
        questions: [...mockHrQuestions, ...mockTechQuestions],
        disclaimer:
          'Ces questions sont des suggestions générées par intelligence artificielle pour guider vos répétitions personnelles.',
      };
    }

    const [rawHrOutput, rawTechOutput] = await Promise.all([
      this.runModel(hrMessages, { max_tokens: 2800, temperature: 0.2, timeoutMs: 40000 }),
      this.runModel(techMessages, { max_tokens: 2800, temperature: 0.2, timeoutMs: 40000 }),
    ]);

    const parsedHrRaw = parseAiJsonPayload(rawHrOutput);
    const parsedTechRaw = parseAiJsonPayload(rawTechOutput);

    // Normalize hr questions payload.
    const rawHrList =
      parsedHrRaw && typeof parsedHrRaw === 'object' && 'hr_questions' in parsedHrRaw && Array.isArray((parsedHrRaw as Record<string, unknown>).hr_questions)
        ? (parsedHrRaw as Record<string, unknown>).hr_questions
        : parsedHrRaw && typeof parsedHrRaw === 'object' && 'questions' in parsedHrRaw && Array.isArray((parsedHrRaw as Record<string, unknown>).questions)
        ? (parsedHrRaw as Record<string, unknown>).questions.map((q) => (typeof q === 'object' && q ? { ...q, category: 'RH' } : q))
        : [];

    // Normalize technical questions payload.
    const rawTechList =
      parsedTechRaw && typeof parsedTechRaw === 'object' && 'technical_questions' in parsedTechRaw && Array.isArray((parsedTechRaw as Record<string, unknown>).technical_questions)
        ? (parsedTechRaw as Record<string, unknown>).technical_questions
        : parsedTechRaw && typeof parsedTechRaw === 'object' && 'questions' in parsedTechRaw && Array.isArray((parsedTechRaw as Record<string, unknown>).questions)
        ? (parsedTechRaw as Record<string, unknown>).questions.map((q) => (typeof q === 'object' && q ? { ...q, category: 'Technique' } : q))
        : [];

    const validatedHr = z.array(hrQuestionSchema).min(5).max(8).safeParse(rawHrList);
    if (!validatedHr.success) {
      throw new Error(`Structure des questions RH invalide : ${validatedHr.error.message}`);
    }

    const validatedTech = z.array(technicalQuestionSchema).min(15).max(20).safeParse(rawTechList);
    if (!validatedTech.success) {
      throw new Error(`Structure des questions techniques invalide : ${validatedTech.error.message}`);
    }

    const hrQuestions = validatedHr.data;
    const technicalQuestions = validatedTech.data;
    const combinedQuestions = [...hrQuestions, ...technicalQuestions];

    return {
      hr_questions: hrQuestions,
      technical_questions: technicalQuestions,
      questions: combinedQuestions,
      disclaimer:
        'Ces questions sont des suggestions générées par intelligence artificielle pour guider vos répétitions personnelles.',
    };
  }
}

// This instance provides the default ai provider implementation for edge functions.
export const defaultAiProvider: AIProvider = new CloudflareWorkersAIProvider();

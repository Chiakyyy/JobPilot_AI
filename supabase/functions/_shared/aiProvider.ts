import { z } from 'npm:zod@3';
import {
  buildCvAnalysisPrompt,
  buildInterviewPrepPrompt,
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

export type InterviewQuestion = z.infer<typeof interviewQuestionSchema>;

// This schema validates complete interview preparation response payloads.
export const interviewPrepSchema = z.object({
  questions: z.array(interviewQuestionSchema).min(5).max(8),
  disclaimer: z.string(),
});

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
  private async runModel(messages: PromptMessage[]): Promise<unknown> {
    if (!this.accountId || !this.apiToken) {
      throw new Error('Identifiants Cloudflare manquants (CLOUDFLARE_ACCOUNT_ID ou CLOUDFLARE_API_TOKEN non configurés).');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

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
          max_tokens: 2048,
          temperature: 0.1,
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

  // This method generates targeted interview preparation questions with fallback support for unconfigured environments.
  async generateInterviewPrep(params: GenerateInterviewPrepParams): Promise<InterviewPrepOutput> {
    const messages = buildInterviewPrepPrompt(
      params.offerTitle,
      params.offerCompany,
      params.offerDescription,
      params.cvText
    );

    // If cloudflare credentials are not configured, return a deterministic structured payload for local testing.
    if (!this.accountId || !this.apiToken) {
      return {
        questions: [
          {
            question: `Pouvez-vous présenter une réalisation marquante en lien avec le poste de ${params.offerTitle} chez ${params.offerCompany} ?`,
            category: 'Technique',
            difficulty: 'Moyen',
            rationale: 'Permet de mesurer l’impact direct de vos compétences passées sur les enjeux du rôle.',
            answer_guidelines: [
              'Structurer la réponse selon la méthode STAR (Situation, Tâche, Action, Résultat).',
              'Fournir des métriques concrètes si possible.',
            ],
          },
          {
            question: `Quels sont les outils ou méthodologies clés que vous utiliseriez pour mener à bien les missions décrites ?`,
            category: 'Technique',
            difficulty: 'Moyen',
            rationale: 'Vérifie l’adéquation de vos pratiques avec l’écosystème de l’entreprise.',
            answer_guidelines: [
              'Citer les technologies maîtrisées en les reliant aux besoins du poste.',
              'Expliquer comment vous adaptez vos méthodes aux contraintes du projet.',
            ],
          },
          {
            question: `Qu’est-ce qui vous attire particulièrement dans l’activité et la culture de ${params.offerCompany} ?`,
            category: 'RH',
            difficulty: 'Facile',
            rationale: 'Évalue la motivation sincère et l’adéquation avec les valeurs de l’organisation.',
            answer_guidelines: [
              'Montrer que vous vous êtes renseigné sur les actualités et projets récents de l’entreprise.',
              'Relier vos valeurs personnelles aux missions de l’équipe.',
            ],
          },
          {
            question: 'Comment gérez-vous une situation où les priorités changent rapidement avec des délais serrés ?',
            category: 'RH',
            difficulty: 'Moyen',
            rationale: 'Teste la résilience, l’adaptabilité et la communication sous pression.',
            answer_guidelines: [
              'Donner un exemple vécu illustrant votre capacité de recul.',
              'Insister sur la communication proactive avec les parties prenantes.',
            ],
          },
          {
            question: `Si vous rencontrez un blocage technique majeur non anticipé, quelle est votre démarche ?`,
            category: 'Technique',
            difficulty: 'Difficile',
            rationale: 'Mesure la capacité d’analyse, la recherche de solutions et le sens de l’escalade raisonnée.',
            answer_guidelines: [
              'Détailler le processus de diagnostic et de reproduction du problème.',
              'Souligner le travail collaboratif avant de solliciter l’équipe au bon moment.',
            ],
          },
        ],
        disclaimer:
          'Ces questions sont des suggestions générées par intelligence artificielle pour guider vos répétitions personnelles.',
      };
    }

    const rawOutput = await this.runModel(messages);
    const parsed = parseAiJsonPayload(rawOutput);
    const validated = interviewPrepSchema.safeParse(parsed);
    if (!validated.success) {
      throw new Error(`Structure de réponse IA invalide : ${validated.error.message}`);
    }
    return validated.data;
  }
}

// This instance provides the default ai provider implementation for edge functions.
export const defaultAiProvider: AIProvider = new CloudflareWorkersAIProvider();

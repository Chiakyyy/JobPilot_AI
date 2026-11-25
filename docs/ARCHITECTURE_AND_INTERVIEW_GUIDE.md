# Architecture & Interview Guide — JobPilot AI

This document provides a technical overview of the architecture, engineering decisions, and security model implemented in JobPilot AI across:
- **Step 1 (App Foundation)**: Expo Router, TypeScript configuration, and French-first navigation layout.
- **Step 2 (Phase P1 / S03–S05)**: Supabase Authentication, Secure Session Persistence (`expo-secure-store`), Profile Management & Row-Level Security (RLS).
- **Step 3 (Phase P2 / S06–S08)**: Core CRUD, State Management (TanStack Query), LinkedIn-style Shared Marketplace RLS, Dual-Party Applications Workflow, and Dashboard Analytics.

---

## 1. End-to-End Architecture & Data Flow

### Authentication & Session Lifecycle (Step 2)

```
[ User Action / Mobile UI ]
          │
          ▼
[ React Hook Form + Zod Schema Validation ]
          │ (Valid input)
          ▼
[ Supabase Auth Client (`src/lib/supabase.ts`) ]
          │
    ┌─────┴────────────────────────────────────────────────┐
    │                                                      │
    ▼                                                      ▼
[ Secure Session Persistence ]                   [ Network API Request ]
(expo-secure-store on iOS/Android,               HTTPS POST /auth/v1
 localStorage on Web)                             (Email + Password / Refresh)
    │                                                      │
    ▼                                                      ▼
[ Hardware Keychain / Keystore ]                 [ Supabase Auth Engine ]
(AES-256 encrypted refresh tokens)                         │
                                                           │ Generates JWT (RS256)
                                                           ▼
                                                 [ PostgreSQL Database ]
                                                 - `auth.users`
                                                 - Trigger `on_auth_user_created`
                                                 - `public.profiles`
                                                 - Evaluates RLS (`auth.uid() = id`)
```

### Shared Marketplace Model & Dual-Party Flow (Step 3)

```
[ User Action / Mobile Screen ] (Offres Marketplace, Candidatures, Accueil Dashboard)
          │
          ▼
[ TanStack Query Hook Layer ] (`useOffers`, `useApplications`, `useOfferApplicants`, `useDashboardStats`)
          │
     ┌────┴─────────────────────────────┐
     │ Cache hit (stale-while-revalidate)│ Query / Mutation Execution
     ▼                                  ▼
[ React Query Cache ]             [ Supabase Client (`src/lib/supabase.ts`) ]
     │ (Instant UI render)              │ HTTPS REST / PostgREST
     ▼                                  ▼
[ Mobile UI State ]               [ PostgreSQL Database Engine ]
                                        │
                  ┌─────────────────────┼──────────────────────┐
                  │                     │                      │
                  ▼                     ▼                      ▼
         [ public.profiles ]   [ public.job_offers ]  [ public.applications ]
         - SELECT: any auth    - SELECT: any auth     - SELECT: applicant OR poster
         - INSERT: auth.uid()  - INSERT: auth.uid()   - INSERT: applicant AND NOT poster
         - UPDATE: auth.uid()  - UPDATE: auth.uid()   - UPDATE: applicant OR poster
         - DELETE: auth.uid()  - DELETE: auth.uid()   - DELETE: applicant only
```

### Marketplace Interactions & Dual-Party Lifecycle
1. **Browsing Job Offers (`Offres` Tab)**:
   - Any authenticated user can view all published offers on the platform via `useOffers({ filter: 'all' })`.
   - Users can toggle the segmented control to `"Mes offres"` (`filter: 'mine'`) to isolate offers they authored.
   - Each card displays attribution: `"Publiée par vous"` for the author or `"Publiée par [Nom]"` for third-party recruiters.
2. **Applying to an Offer (Candidate Action)**:
   - On the Offer Detail screen (`src/app/offers/[id].tsx`), if the viewer is not the creator, the button `"Postuler à cette offre"` is displayed.
   - If the user is the offer creator, application buttons are hidden, and the database RLS policy (`NOT EXISTS (...)`) forbids self-applications.
   - Submitting an application creates a row in `public.applications` with initial status `Applied` and records the first entry in `status_history`.
3. **Reviewing Applicants (Offer Poster Action)**:
   - When the creator opens `src/app/offers/[id].tsx`, the `"Candidatures reçues"` section loads all applicants via `useOfferApplicants(offerId)`.
   - Each applicant card displays candidate metadata (`display_name`, `target_role`, `experience_level`, `skills`) joined from `public.profiles`.
   - Tapping an applicant navigates to `src/app/applications/[id].tsx`.
4. **Status Progression & Recruiter Debriefing**:
   - Both the candidate and the offer creator can update the status pill (`Saved`, `Applied`, `Interview`, `Offer`, `Rejected`).
   - The offer creator can evaluate and transition the candidate through interview rounds; the update mutation appends an audit event to `status_history`.
   - The mutation automatically invalidates `queryKey: ['applications']`, `['application', id]`, `['offerApplicants', offerId]`, and `['dashboardStats']`.
5. **Withdrawal (Candidate Only)**:
   - Only the candidate who applied can delete the application row. The RLS delete policy strictly checks `auth.uid() = user_id`.

---

## 2. Library & Stack Justifications

### Expo Router (File-Based Typed Routing)
- **Why Chosen**: Standardized in modern Expo SDKs, unifying web, iOS, and Android routing paradigms.
- **Architectural Advantages**:
  - File-system hierarchy directly mirrors app navigation (`(auth)` and `(tabs)` route groups).
  - Native deep-linking and static web generation work out of the box with `typedRoutes: true`.
  - Enables centralized layout guards (`_layout.tsx`) that inspect segments and redirect before child components render sensitive content.

### `expo-secure-store` vs `AsyncStorage`
- **Why Chosen**: `AsyncStorage` stores data as unencrypted plain text in SQLite or XML files on disk, vulnerable on rooted devices, ADB backups, or jailbroken iOS.
- **Security Benefits**:
  - `expo-secure-store` encrypts values with AES-256 using keys managed exclusively by iOS Keychain and Android Keystore.
  - Session refresh tokens stored here cannot be extracted by malicious apps or unauthorized disk inspection.

### React Hook Form + Zod
- **Why Chosen**: High performance form management paired with schema-first validation.
- **Key Trade-offs**:
  - **Uncontrolled Inputs**: React Hook Form minimizes re-renders on every keystroke by leveraging uncontrolled components through `Controller`, crucial for mobile UI responsiveness.
  - **Schema Validation with Zod**: Single source of truth for validation rules and TypeScript type inference (`z.infer<typeof schema>`), eliminating type divergence between validation logic and UI components.

### TanStack Query (`@tanstack/react-query`) vs Manual `useEffect` / `useState`
- **Why Chosen**: Declarative server-state management tailored for asynchronous REST/PostgREST backends.
- **Key Advantages**:
  - **Request Deduplication**: Prevents duplicate concurrent network requests when multiple components request the same data.
  - **Stale-While-Revalidate**: Renders cached data immediately upon navigation while refreshing in the background, eliminating blocking screen flickers.
  - **Coordinated Invalidation**: Eliminates fragile event emitters and manual state drilling across screens; updating an application in its detail view cleanly invalidates and refreshes the list and dashboard views.
  - **Pull-to-Refresh & Pagination**: Integrates seamlessly with React Native's `RefreshControl` and offset/limit pagination hooks (`range(from, to)`).

### Cache Invalidation on Logout (`queryClient.clear()`)
- **Security & Privacy Requirement**:
  - In mobile apps, multiple users may log into the same physical device over time.
  - Storing server data in an in-memory client cache without clearing it upon logout creates a severe data-leakage vulnerability: the subsequent user could momentarily view cached job offers or candidate profiles before their own queries resolve.
  - Calling `queryClient.clear()` directly inside `signOut` in `AuthContext` ensures every query cache entry is wiped when the active session terminates.

### Multi-Tenant Marketplace RLS Architecture
- **Splitting `SELECT` vs Mutation Policies**:
  - In a shared marketplace (LinkedIn-style), job offers and user profile summaries must be readable by any authenticated member (`auth.role() = 'authenticated'`).
  - However, mutation policies (`INSERT`, `UPDATE`, `DELETE`) remain strictly bound to the row owner (`auth.uid() = user_id` for offers, `auth.uid() = id` for profiles).
  - This separation ensures public discoverability while mathematically preventing unauthorized modifications.
- **Relational `EXISTS` Subqueries for Dual-Party Access**:
  - Applications link an applicant (`applications.user_id`) to a job offer (`applications.offer_id`) posted by an author (`job_offers.user_id`).
  - Instead of requiring custom API middleware to authorize recruiters, PostgreSQL RLS evaluates relational ownership in the database engine:
    ```sql
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.job_offers
      WHERE job_offers.id = applications.offer_id
        AND job_offers.user_id = auth.uid()
    )
    ```
  - Both parties gain read and update access to the application lifecycle automatically.
- **Defense-in-Depth Self-Application Prevention**:
  - To prevent authors from applying to their own job postings, the insert policy enforces:
    ```sql
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.job_offers
      WHERE job_offers.id = applications.offer_id
        AND job_offers.user_id = auth.uid()
    )
    ```
- **Explicit Scoping in Client Queries (`.eq('user_id', user.id)`)**:
  - Although RLS allows offer posters to read applications submitted to their offers, the user's personal `Candidatures` tab and `Accueil` dashboard counters must only reflect jobs *they* applied to.
  - Client queries explicitly apply `.eq('user_id', user.id)`. This provides defense-in-depth and precise UI scoping without relying on client-side array filtering.

---

## 3. Interview Q&A Bank

### Q1: How do you handle JWT session persistence and silent token refreshing on mobile?
> **Answer:**
> On mobile, session tokens must never be stored in plain text storage like `AsyncStorage`. We implement a custom storage adapter (`ExpoSecureStoreAdapter`) interfacing with `expo-secure-store`. This ensures refresh tokens are stored encrypted in the iOS Keychain and Android Keystore. The Supabase client is initialized with `autoRefreshToken: true` and `persistSession: true`. When the short-lived access token expires (typically 1 hour), the client uses the encrypted refresh token to negotiate a new JWT seamlessly in the background without user intervention.

### Q2: What is Row-Level Security (RLS), and how does it prevent horizontal privilege escalation?
> **Answer:**
> Horizontal privilege escalation occurs when User A modifies parameters (such as an ID) to view or update User B's resources. RLS stops this at the PostgreSQL engine level. When a request arrives, PostgreSQL extracts `auth.uid()` from the cryptographically verified JWT signature. Our migration applies policies such as `CREATE POLICY "users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id)`. Even if an attacker manipulates the client request or calls the REST endpoint directly with User B's ID, the database returns zero matching rows or rejects the operation.

### Q3: Why is progressive dependency management important in React Native projects?
> **Answer:**
> In React Native, each added dependency can increase JavaScript bundle size, introduce native link complexity, or cause version incompatibility between Expo SDK native modules. By following progressive dependency management (installing only packages required for the active phase—here, auth, secure store, validation, and query caching), we avoid premature optimization, maintain clean dependency audit trees, and ensure every package is intentionally justified and verified.

### Q4: How do you prevent layout flashing and unauthorized back-navigation on mobile logout?
> **Answer:**
> We implement root layout route guards using Expo Router's `useSegments()` and `useRouter()`. While initial session recovery runs (`isLoading: true`), we hold a clean splash/loading indicator so unauthenticated screens never flash. On logout, we call `router.replace('/(auth)/login')`, which clears the navigation stack so the back button cannot return to protected tabs. Additionally, on Android, an event listener on `BackHandler` prevents backward traversal into authenticated routes.

### Q5: What is the difference between PostgreSQL Table Privileges (`GRANT`) and Row-Level Security (`RLS`), and how do you ensure graceful UI degradation on mobile?
> **Answer:**
> In PostgreSQL and Supabase, access control operates in two distinct tiers:
> - **Table-Level Privileges (`GRANT`)**: Grants determine whether a database role (such as `authenticated` or `anon`) is allowed to execute specific SQL statements (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) on the relation at all. If `GRANT ... ON TABLE public.profiles TO authenticated` is missing, PostgreSQL immediately rejects requests with `permission denied for table profiles` before evaluating any row.
> - **Row-Level Security (`RLS`)**: Once table privileges are granted, RLS acts as a row filter determining *which rows* the role can access based on security expressions (e.g. `auth.uid() = id`). Both tiers are required for secure operation.
> 
> Regarding **Graceful UI Degradation**:
> Root session management must always be decoupled from feature-level data queries. If a table query fails (due to network timeout, missing privileges, or schema sync issues), the UI must display an inline error state without removing critical session actions. The logout button (`signOut`) must remain rendered and interactive in all states (loading, empty, or error) so the user is never trapped in a broken authenticated view.

### Q6: Why choose TanStack Query over manual `useEffect` / `useState` fetching in React Native?
> **Answer:**
> Manual state fetching in React Native leads to boilerplate code, unhandled race conditions, missing cancellation tokens, and lack of cross-screen cache coherence. TanStack Query provides:
> 1. **Deduplication & Caching**: Concurrent components mount without firing duplicate HTTP requests. Stale-while-revalidate provides instant transitions on mobile screens.
> 2. **Declarative Invalidation**: Mutations in detail screens immediately invalidate related list and summary queries via structured query keys without prop drilling or global pub/sub events.
> 3. **Native Lifecycle Fit**: Integrates directly with pull-to-refresh (`refetch`), window focus/app-state revalidation, and cursor/offset pagination.

### Q7: Why and how must client query caches be invalidated upon user logout?
> **Answer:**
> In client applications, query caches (such as TanStack Query's `QueryCache`) store server responses in memory. On mobile devices where multiple users might log into the application sequentially, failing to wipe the cache results in cross-tenant data leaks: the next logged-in user could view previously cached job offers, applications, or candidate details while new queries are in flight. We prevent this by invoking `queryClient.clear()` directly inside the `signOut` method of our `AuthContext`, wiping all in-memory query caches synchronously alongside token deletion.

### Q8: How does a shared marketplace model implement dual-party access in Supabase without a custom API server?
> **Answer:**
> In a marketplace where both applicants and job creators must interact with the same application record, creating custom backend endpoints with custom auth middleware adds unnecessary operational overhead. Supabase RLS handles this natively via relational subqueries:
> ```sql
> USING (
>   auth.uid() = user_id
>   OR EXISTS (
>     SELECT 1 FROM public.job_offers
>     WHERE job_offers.id = applications.offer_id
>       AND job_offers.user_id = auth.uid()
>   )
> )
> ```
> PostgreSQL executes this query within the database transaction. If the authenticated requester matches either the applicant's ID or the creator's ID on the linked job offer, access is granted.

### Q9: Why should client queries explicitly filter by `user_id` when PostgreSQL RLS already allows broader reads?
> **Answer:**
> In our shared marketplace, RLS permits offer creators to read applications submitted to their offers in addition to their own job applications. If the candidate's personal `Candidatures` tab or dashboard stats query ran `SELECT * FROM applications` without an explicit filter, the result set would inadvertently combine applications the user submitted with applications submitted by others to the user's job postings.
> By adding `.eq('user_id', user.id)` to personal queries, we ensure precise data scoping and eliminate client-side array partitioning, while maintaining defense-in-depth security.

### Q10: How do you prevent self-application attacks in a marketplace platform using database RLS?
> **Answer:**
> Allowing users to apply to their own job offers corrupts candidate metrics and causes state confusion in recruitment pipelines. Rather than relying solely on client UI checks (such as hiding the apply button), we enforce this rule at the database engine level inside the `INSERT` policy:
> ```sql
> WITH CHECK (
>   auth.uid() = user_id
>   AND NOT EXISTS (
>     SELECT 1 FROM public.job_offers
>     WHERE job_offers.id = applications.offer_id
>       AND job_offers.user_id = auth.uid()
>   )
> )
> ```
> Any direct API call attempting self-application is immediately rejected by PostgreSQL with a policy check violation.

---

## 4. Database Schema Reference

```sql
-- This migration updates row level security policies for the shared marketplace model.

-- 1. Profiles Table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  target_role text,
  location text,
  skills text[] DEFAULT '{}'::text[] NOT NULL,
  experience_level text,
  education_summary text,
  experience_summary text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Job Offers Table
CREATE TABLE public.job_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  title text NOT NULL,
  company text NOT NULL,
  location text,
  url text,
  description text,
  notes text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Applications Table
CREATE TABLE public.applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  offer_id uuid NOT NULL REFERENCES public.job_offers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'Applied' CHECK (status IN ('Saved', 'Applied', 'Interview', 'Offer', 'Rejected')),
  applied_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  notes text,
  status_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT unique_user_offer UNIQUE (user_id, offer_id)
);

-- Profiles Marketplace Policies
CREATE POLICY "authenticated users can view profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.role() = 'authenticated');

CREATE POLICY "users can insert their own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "users can update their own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "users can delete their own profile"
  ON public.profiles FOR DELETE TO authenticated
  USING (auth.uid() = id);

-- Job Offers Marketplace Policies
CREATE POLICY "authenticated users can view all job offers"
  ON public.job_offers FOR SELECT TO authenticated
  USING (auth.role() = 'authenticated');

CREATE POLICY "users can insert their own job offers"
  ON public.job_offers FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users can update their own job offers"
  ON public.job_offers FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users can delete their own job offers"
  ON public.job_offers FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Applications Dual-Party Marketplace Policies
CREATE POLICY "candidates and offer owners can view applications"
  ON public.applications FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.job_offers
      WHERE job_offers.id = applications.offer_id AND job_offers.user_id = auth.uid()
    )
  );

CREATE POLICY "candidates can apply to offers from other users"
  ON public.applications FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.job_offers
      WHERE job_offers.id = applications.offer_id AND job_offers.user_id = auth.uid()
    )
  );

CREATE POLICY "candidates and offer owners can update applications"
  ON public.applications FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.job_offers
      WHERE job_offers.id = applications.offer_id AND job_offers.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.job_offers
      WHERE job_offers.id = applications.offer_id AND job_offers.user_id = auth.uid()
    )
  );

CREATE POLICY "candidates can delete their own applications"
  ON public.applications FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
```

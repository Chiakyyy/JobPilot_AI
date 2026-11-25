# Architecture & Interview Guide — JobPilot AI

This document provides a technical overview of the architecture, engineering decisions, and security model implemented in JobPilot AI across:
- **Step 1 (App Foundation)**: Expo Router, TypeScript configuration, and French-first navigation layout.
- **Step 2 (Phase P1 / S03–S05)**: Supabase Authentication, Secure Session Persistence (`expo-secure-store`), Profile Management & Row-Level Security (RLS).
- **Step 3 (Phase P2 / S06–S08)**: Core CRUD, State Management (TanStack Query), LinkedIn-style Shared Marketplace RLS, Dual-Party Applications Workflow, Recruiter Consultation Tracking, and Dashboard Analytics.

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
     │ (Instant UI render)              │ HTTPS REST / PostgREST / RPC
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
                                                      - viewed_by_recruiter_at
```

### Recruiter Consultation Flow & Automatic Synchronization
1. **Recruiter Opens Candidate Application**:
   - The recruiter (owner of `job_offers`) taps a candidate card on `src/app/offers/[id].tsx` and navigates to `src/app/applications/[id].tsx`.
   - A `useEffect` detects that the viewer is the offer creator (`offer.user_id === user.id`) and `!application.viewed_by_recruiter_at`.
2. **Server-Side Idempotent RPC (`mark_application_viewed`)**:
   - The client invokes `supabase.rpc('mark_application_viewed', { p_application_id })`.
   - PostgreSQL verifies that `auth.uid()` owns the offer via `JOIN public.job_offers`.
   - If verified, it sets `viewed_by_recruiter_at = COALESCE(viewed_by_recruiter_at, now())`, preserving the exact initial consultation timestamp.
3. **Database Consistency Trigger**:
   - If a recruiter advances a candidate's status without opening the detail screen first, a `BEFORE UPDATE` trigger automatically sets `viewed_by_recruiter_at = COALESCE(NEW.viewed_by_recruiter_at, OLD.viewed_by_recruiter_at, now())`.
4. **Cache Invalidation & Real-Time Candidate Feedback**:
   - On success, TanStack Query invalidates `queryKey: ['applications']`, `['application', id]`, and `['dashboardStats']`.
   - When the candidate opens their app, the **`Vue par le recruteur`** badge appears on the `Accueil` and `Candidatures` tabs, and the detail view displays the exact consultation timestamp.

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

### Recruiter Viewed Indicator & Idempotent RPCs
- **Data Modeling: Nullable `timestamptz` vs Boolean**:
  - Storing a boolean flag (`is_viewed boolean`) requires adding a separate timestamp column (`viewed_at timestamptz`) if timing matters, introducing dual-column synchronization risks.
  - Storing a single nullable timestamp `viewed_by_recruiter_at timestamptz NULL` provides both boolean status (`Boolean(viewed_by_recruiter_at)`) and the exact audit timestamp in a single source of truth.
- **Server-Side Actor Enforcement & Idempotency**:
  - Client-side updates to `viewed_by_recruiter_at` are vulnerable to spoofing if done via direct table update.
  - The PostgreSQL function `mark_application_viewed(p_application_id uuid)` enforces authorization via `JOIN job_offers WHERE user_id = auth.uid()`.
  - Using `COALESCE(viewed_by_recruiter_at, now())` guarantees that subsequent opens by the recruiter do not overwrite the timestamp of the first consultation.
- **UI & Cache Synchronization**:
  - Invoking `mark_application_viewed` invalidates query keys `['applications']`, `['application', id]`, and `['dashboardStats']`.
  - When the candidate returns to the app, the viewed status reflects immediately across the `Accueil` activity feed, `Candidatures` tab badges, and `ApplicationDetail` consultation banner.

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

### Q11: Why is a nullable timestamp (`timestamptz`) preferred over a boolean flag for tracking read/view status in collaborative workflows?
> **Answer:**
> Using a boolean flag (`is_viewed boolean`) creates a lossy abstraction: it answers *whether* an item was seen, but cannot answer *when*. If product requirements later demand displaying "Consultée il y a 2 jours" or calculating recruiter response latency SLAs, a second column (`viewed_at timestamptz`) must be retrofitted, creating consistency hazards where `is_viewed = true` but `viewed_at IS NULL`.
> A single nullable timestamp (`viewed_by_recruiter_at timestamptz NULL`) elegantly satisfies both needs: `Boolean(viewed_by_recruiter_at)` derives the binary state, while the timestamp provides full auditability and precise UI presentation without redundant columns.

### Q12: How do idempotent RPC functions and database triggers work together to prevent race conditions in consultation tracking?
> **Answer:**
> If consultation tracking relies on raw client-side updates (`UPDATE applications SET viewed_by_recruiter_at = now()`), two problems arise:
> 1. An applicant could maliciously issue the update to fake recruiter interest.
> 2. Every subsequent open by the recruiter would overwrite the timestamp of the first view.
> We resolve this through a dedicated RPC function (`mark_application_viewed`) that verifies offer ownership (`JOIN job_offers WHERE user_id = auth.uid()`) and uses `COALESCE(viewed_by_recruiter_at, now())` for idempotency. Furthermore, a `BEFORE UPDATE` database trigger ensures that if a recruiter directly changes candidate status (e.g. from `Applied` to `Interview`) without opening the detail view, `viewed_by_recruiter_at` is automatically populated, keeping application state consistent under all paths.

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
  viewed_by_recruiter_at timestamp with time zone DEFAULT null,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT unique_user_offer UNIQUE (user_id, offer_id)
);

-- Consultation RPC Function
CREATE OR REPLACE FUNCTION public.mark_application_viewed(p_application_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_is_authorized boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.applications a
    JOIN public.job_offers o ON o.id = a.offer_id
    WHERE a.id = p_application_id AND o.user_id = auth.uid()
  ) INTO v_is_authorized;

  IF NOT v_is_authorized THEN
    RETURN false;
  END IF;

  UPDATE public.applications
  SET viewed_by_recruiter_at = COALESCE(viewed_by_recruiter_at, now())
  WHERE id = p_application_id;

  RETURN true;
END;
$$;

-- Consultation Status Consistency Trigger
CREATE OR REPLACE FUNCTION public.handle_application_viewed_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.viewed_by_recruiter_at = COALESCE(NEW.viewed_by_recruiter_at, OLD.viewed_by_recruiter_at, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_application_viewed_on_status_update ON public.applications;
CREATE TRIGGER set_application_viewed_on_status_update
  BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.handle_application_viewed_on_status_change();
```

# Architecture & Interview Guide — JobPilot AI

This document provides a technical overview of the architecture, engineering decisions, and security model implemented in JobPilot AI across:
- **Step 1 (App Foundation)**: Expo Router, TypeScript configuration, and French-first navigation layout.
- **Step 2 (Phase P1 / S03–S05)**: Supabase Authentication, Secure Session Persistence (`expo-secure-store`), Profile Management & Row-Level Security (RLS).
- **Step 3 (Phase P2 / S06–S08)**: Core CRUD, State Management (TanStack Query), Relational RLS, Audit History (`status_history`), and Dashboard Analytics.

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

### Core CRUD, State Management & Relational Flow (Step 3)

```
[ User Action / Mobile Screen ] (Offres, Candidatures, Accueil Dashboard)
          │
          ▼
[ TanStack Query Hook Layer ] (`useOffers`, `useApplications`, `useDashboardStats`)
          │
     ┌────┴─────────────────────────────┐
     │ Cache hit (stale-while-revalidate)│ Query / Mutation Execution
     ▼                                  ▼
[ React Query Cache ]             [ Supabase Client (`src/lib/supabase.ts`) ]
     │ (Instant UI render)              │ HTTPS REST / PostgREST
     ▼                                  ▼
[ Mobile UI State ]               [ PostgreSQL Database Engine ]
                                        │
                  ┌─────────────────────┴──────────────────────┐
                  │                                            │
                  ▼                                            ▼
         [ public.job_offers ]                       [ public.applications ]
         - RLS: auth.uid() = user_id                 - RLS: auth.uid() = user_id
                                                     - Relational RLS: EXISTS (job_offers)
                                                     - UNIQUE(user_id, offer_id)
                                                     - JSONB status_history
```

### Application Status Transition & Automatic Cache Synchronization Flow
1. **User Action in Detail Screen**:
   - The user selects a new pipeline status (for example, moving from `Applied` to `Interview`) in `src/app/applications/[id].tsx`.
2. **Mutation Execution (`useApplicationMutations`)**:
   - The mutation hook queries current `status_history` from `public.applications`.
   - It appends an audit event `{ "status": newStatus, "changed_at": new Date().toISOString() }` to the history array.
   - It issues an atomic `UPDATE` to Supabase updating `status`, `status_history`, and `updated_at`.
3. **Multi-Table Relational RLS Validation**:
   - PostgreSQL validates that the current user owns the application (`auth.uid() = user_id`).
   - PostgreSQL verifies relational integrity through `EXISTS (SELECT 1 FROM public.job_offers WHERE id = offer_id AND user_id = auth.uid())`.
4. **Cache Invalidation & Reactive UI Propagation**:
   - On mutation success, TanStack Query invalidates targeted query keys:
     - `['applications']`: Triggers background refetch of the Candidatures list.
     - `['application', id]`: Updates the active detail screen and progression timeline.
     - `['applicationByOffer', offerId]`: Syncs the badge inside the corresponding Offer detail screen.
     - `['dashboardStats']`: Automatically recalculates KPI cards and recent items on the Accueil tab.
   - Screen subscribers re-render with fresh data without manual event emitters, custom buses, or full screen reloads.

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

### Relational Row-Level Security (RLS) & Cross-Table Integrity
- **Why Relational RLS Is Crucial**:
  - In a relational schema where `applications` reference `job_offers`, verifying `auth.uid() = user_id` on the `applications` table alone is insufficient.
  - A malicious user could craft a request inserting an application with their own `user_id` but pointing to another candidate's `offer_id`.
  - Our RLS check policy enforces relational ownership:
    ```sql
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.job_offers
      WHERE id = offer_id AND user_id = auth.uid()
    )
    ```
  - This guarantees complete tenant isolation across both primary and foreign keys.

### Defense-in-Depth Duplicate Prevention: `UNIQUE(user_id, offer_id)`
- **Architectural Requirement**:
  - Disabling the "Créer une candidature" button in the client UI is a visual convenience, not a guarantee.
  - Network retries, concurrent tabs, or direct PostgREST calls can bypass client-side guards and cause duplicate entries.
  - The database constraint `CONSTRAINT unique_user_offer UNIQUE (user_id, offer_id)` stops race conditions at the storage engine level and guarantees that an applicant cannot have duplicate records for the same job offer.

### Targeted Indexing Strategy
- **Selective Composite Indexes**:
  - `idx_job_offers_user_created` (`user_id, created_at DESC`): Optimizes default offer list queries and pagination.
  - `idx_applications_user_status_updated` (`user_id, status, updated_at DESC`): Accelerates status-filtered lists and dashboard aggregation.
  - `idx_applications_offer_id` (`offer_id`): Speeds up foreign-key joins and relational RLS subquery lookups.
  - Avoiding unnecessary indexes preserves high-throughput write performance on mobile.

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

### Q8: How do you enforce relational data integrity and prevent cross-tenant offer hijacking with Supabase RLS?
> **Answer:**
> When a table references a parent table owned by users, enforcing `auth.uid() = user_id` on the child table alone is not enough. An attacker could craft an insert with their own `user_id` but link an `offer_id` owned by another user.
> To prevent this, we write cross-table relational RLS policies using `EXISTS`:
> ```sql
> WITH CHECK (
>   auth.uid() = user_id
>   AND EXISTS (
>     SELECT 1 FROM public.job_offers
>     WHERE id = offer_id AND user_id = auth.uid()
>   )
> )
> ```
> PostgreSQL runs this subquery within the database engine transaction, guaranteeing that child rows can only reference parent records that the authenticated user explicitly owns.

### Q9: Why is a database-level `UNIQUE(user_id, offer_id)` constraint necessary when the UI already disables the create button?
> **Answer:**
> Relying purely on client UI state (like disabling a button or redirecting) is a well-known anti-pattern. Mobile networks can cause duplicate network retries, users can click rapidly before state renders, or attackers can bypass the client UI by interacting directly with the Supabase PostgREST API.
> A database constraint (`CONSTRAINT unique_user_offer UNIQUE (user_id, offer_id)`) guarantees idempotency and database integrity under all concurrency conditions.

### Q10: How does JSONB `status_history` balance audit logging with document schema flexibility?
> **Answer:**
> In job tracking, users require a chronological audit trail of when an application progressed through stages (`Applied` -> `Interview` -> `Offer`). Instead of managing a separate `application_events` table with additional migrations, foreign keys, and multiple SQL joins for an MVP, we store history as an array of JSON objects inside a `jsonb` column: `[{"status": "Applied", "changed_at": "..."}]`.
> This approach keeps status changes atomic within a single row update, eliminates join overhead on list queries, and provides full flexibility to store status metadata (e.g. interviewer notes, round numbers) without requiring future schema migrations.

---

## 4. Database Schema Reference

```sql
-- This migration creates profiles, job offers and applications tables with relational security.

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

-- Grants & Row-Level Security
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.job_offers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.applications TO authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- Job Offers RLS Policies
CREATE POLICY "users can view their own job offers"
  ON public.job_offers FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "users can insert their own job offers"
  ON public.job_offers FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users can update their own job offers"
  ON public.job_offers FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users can delete their own job offers"
  ON public.job_offers FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Applications RLS Policies with Cross-Table Check
CREATE POLICY "users can view their own applications"
  ON public.applications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "users can insert their own applications"
  ON public.applications FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.job_offers
      WHERE id = offer_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "users can update their own applications"
  ON public.applications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.job_offers
      WHERE id = offer_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "users can delete their own applications"
  ON public.applications FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
```

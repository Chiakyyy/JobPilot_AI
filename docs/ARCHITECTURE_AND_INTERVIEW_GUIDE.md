# Architecture & Interview Guide — JobPilot AI

This document provides a technical overview of the architecture, engineering decisions, and security model implemented in JobPilot AI across:
- **Step 1 (App Foundation)**: Expo Router, TypeScript configuration, and French-first navigation layout.
- **Step 2 (Phase P1 / S03–S05)**: Supabase Authentication, Secure Session Persistence (`expo-secure-store`), Profile Management & Row-Level Security (RLS).
- **Step 3 (Phase P2 / S06–S08)**: Core CRUD, State Management (TanStack Query), LinkedIn-style Shared Marketplace RLS, Dual-Party Applications Workflow, Recruiter Consultation Tracking, and Dashboard Analytics.
- **Step 4 (Phase P3 / WF-03 / F03)**: Private File Storage, Binary Validation & Signed URLs (Supabase Storage, Expo Document Picker & FileSystem, Scanned-PDF Detection, Recruiter Preview).

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

### Private CV Storage & Signed URL Data Flow (Step 4)

```
[ Candidate / Mobile UI (`src/app/cv.tsx`) ]
          │
          ▼
[ Client-Side Validation (`src/services/cvService.ts`) ]
- Extension & MIME: .pdf / application/pdf
- Size limit: <= 5 Mo (5,242,880 bytes)
- Magic Header: 0x25 0x50 0x44 0x46 0x2D (%PDF-)
- Structure Scan: /Font and text stream operators (rejects image scans)
          │ (Binary ArrayBuffer)
          ▼
[ Supabase Private Storage (`cvs` bucket) ]
- Path: {user.id}/{timestamp}_{filename}.pdf
- Storage RLS: folder isolation (storage.foldername(name))[1] = auth.uid()
          │ (Upload OK)
          ▼
[ PostgreSQL Metadata (`public.user_cvs`) ]
- Unique user_id constraint (MVP single-CV rule)
- On DB failure: rollback removes storage file (no orphan files)
- On replacement: old storage object deleted after DB upsert
          │
     ┌────┴────────────────────────────────────────┐
     │                                             │
     ▼                                             ▼
[ Candidate Preview ]                     [ Recruiter Preview (`src/app/applications/[id].tsx`) ]
`getSignedCvUrl(path)` (300s TTL)         `getSignedCvUrl(path)` (300s TTL)
Authorized by ownership                   Authorized via EXISTS (applications + job_offers)
```

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

### Private File Storage, Binary Validation & Signed URLs (Step 4)
- **Private Buckets & Signed URLs vs Public URLs**:
  - Resumes (CVs) contain sensitive Personally Identifiable Information (PII) including full names, physical addresses, phone numbers, email addresses, and employment timelines.
  - Storing CVs in public cloud buckets creates permanent publicly indexable URLs that cannot be revoked or audited.
  - Our architecture marks the `cvs` bucket as private (`public = false`) and enforces strict RLS on `storage.objects`. Document access requires generating short-lived signed URLs (`createSignedUrl` with 300 seconds TTL). The signed tokens expire automatically, eliminating permanent exposure.
- **Defense-in-Depth File Validation (Magic Bytes & Scanned-PDF Detection)**:
  - Checking file extension (`.pdf`) or browser-reported MIME types (`application/pdf`) is trivial to spoof by simply renaming an executable or image file.
  - In `src/services/cvService.ts`, validation inspects the binary `ArrayBuffer` directly:
    1. **Magic Header Check**: Confirms that byte offsets 0 through 4 strictly match `%PDF-` (`0x25 0x50 0x44 0x46 0x2D`).
    2. **Scanned Image Detection**: Parses structural markers in the PDF content stream looking for font definitions (`/Font`, `/Type /Font`) and text rendering operators (`BT`, `ET`, `Tj`, `TJ`). Pure raster scans lacking selectable text are rejected immediately with the exact PRD message: `"Ce document ne peut pas être analysé dans cette version"`. This protects future AI parsing pipelines from wasting inference tokens on unreadable scans.
- **Preventing Orphan Storage Objects**:
  - In cloud systems, distributed transactions between SQL databases and blob storage buckets do not exist natively.
  - We employ an atomic sequence with rollback:
    1. Upload binary file to Storage path `{userId}/{timestamp}_{cleanName}`.
    2. Upsert database record in `public.user_cvs`.
    3. If database upsert fails, immediately trigger compensation: `storage.from('cvs').remove([targetFilePath])`.
    4. If replacement succeeded, remove the old file `oldFilePath` only after database upsert resolves.
  - This guarantees that no orphaned storage objects accumulate on failure, and no broken database rows point to nonexistent storage paths.
- **Storage Path Prefix RLS**:
  - The object storage policy inspects the path prefix via `(storage.foldername(name))[1]`.
  - For mutations (`INSERT`, `UPDATE`, `DELETE`), the folder must strictly match `auth.uid()::text`.
  - For reads (`SELECT`), access is granted if the folder matches `auth.uid()::text` OR if an application exists linking the candidate to one of the recruiter's published job offers (`EXISTS (SELECT 1 FROM public.applications a JOIN public.job_offers o ON o.id = a.offer_id WHERE a.user_id::text = (storage.foldername(name))[1] AND o.user_id = auth.uid())`).

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
> In React Native, each added dependency can increase JavaScript bundle size, introduce native link complexity, or cause version incompatibility between Expo SDK native modules. By following progressive dependency management (installing only packages required for the active phase), we avoid premature optimization, maintain clean dependency audit trees, and ensure every package is intentionally justified and verified.

### Q4: How do you prevent layout flashing and unauthorized back-navigation on mobile logout?
> **Answer:**
> We implement root layout route guards using Expo Router's `useSegments()` and `useRouter()`. While initial session recovery runs (`isLoading: true`), we hold a clean splash/loading indicator so unauthenticated screens never flash. On logout, we call `router.replace('/(auth)/login')`, which clears the navigation stack so the back button cannot return to protected tabs. Additionally, on Android, an event listener on `BackHandler` prevents backward traversal into authenticated routes.

### Q5: What is the difference between PostgreSQL Table Privileges (`GRANT`) and Row-Level Security (`RLS`), and how do you ensure graceful UI degradation on mobile?
> **Answer:**
> In PostgreSQL and Supabase, access control operates in two distinct tiers:
> - **Table-Level Privileges (`GRANT`)**: Grants determine whether a database role (such as `authenticated` or `anon`) is allowed to execute specific SQL statements (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) on the relation at all.
> - **Row-Level Security (`RLS`)**: Once table privileges are granted, RLS acts as a row filter determining *which rows* the role can access based on security expressions (e.g. `auth.uid() = id`). Both tiers are required for secure operation.
> 
> Regarding **Graceful UI Degradation**: Root session management must always be decoupled from feature-level data queries. If a table query fails, the UI displays an inline error state without removing critical session actions like the logout button.

### Q6: Why choose TanStack Query over manual `useEffect` / `useState` fetching in React Native?
> **Answer:**
> Manual state fetching in React Native leads to boilerplate code, unhandled race conditions, missing cancellation tokens, and lack of cross-screen cache coherence. TanStack Query provides automated deduplication, stale-while-revalidate caching, declarative cache invalidation linking mutations directly to queries, and seamless pull-to-refresh integration.

### Q7: Why and how must client query caches be invalidated upon user logout?
> **Answer:**
> In client applications, query caches store server responses in memory. On shared mobile devices where multiple users might log into the application sequentially, failing to wipe the cache results in cross-tenant data leaks: the next logged-in user could view previously cached job offers, applications, or candidate details while new queries are in flight. We prevent this by invoking `queryClient.clear()` directly inside the `signOut` method of our `AuthContext`.

### Q8: How does a shared marketplace model implement dual-party access in Supabase without a custom API server?
> **Answer:**
> Supabase RLS handles this natively via relational subqueries:
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
> PostgreSQL executes this query within the database transaction. If the authenticated requester matches either the applicant's ID or the creator's ID on the linked job offer, access is granted automatically.

### Q9: Why should client queries explicitly filter by `user_id` when PostgreSQL RLS already allows broader reads?
> **Answer:**
> In our shared marketplace, RLS permits offer creators to read applications submitted to their offers in addition to their own job applications. If the candidate's personal `Candidatures` tab or dashboard stats query ran `SELECT * FROM applications` without an explicit filter, the result set would inadvertently combine applications the user submitted with applications submitted by others to the user's job postings. Adding `.eq('user_id', user.id)` ensures accurate UI scoping and defense-in-depth.

### Q10: How do you prevent self-application attacks in a marketplace platform using database RLS?
> **Answer:**
> Rather than relying solely on client UI checks, we enforce this rule at the database engine level inside the `INSERT` policy:
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
> Using a boolean flag (`is_viewed boolean`) is lossy: it records *whether* an item was seen, but not *when*. A single nullable timestamp (`viewed_by_recruiter_at timestamptz NULL`) satisfies both: `Boolean(viewed_by_recruiter_at)` derives the binary state, while the timestamp provides full auditability and precise UI presentation without redundant columns.

### Q12: How do idempotent RPC functions and database triggers work together to prevent race conditions in consultation tracking?
> **Answer:**
> We implement a dedicated RPC function (`mark_application_viewed`) that verifies offer ownership (`JOIN job_offers WHERE user_id = auth.uid()`) and uses `COALESCE(viewed_by_recruiter_at, now())` for idempotency. Furthermore, a `BEFORE UPDATE` database trigger ensures that if a recruiter directly changes candidate status without opening the detail view, `viewed_by_recruiter_at` is automatically populated, keeping application state consistent under all paths.

### Q13: Why should resume/CV storage buckets always be private with short-lived signed URLs instead of public CDN links?
> **Answer:**
> Resumes contain sensitive Personally Identifiable Information (PII) including full names, phone numbers, physical addresses, and employment records. If stored in a public bucket, the generated URL is permanent, unauthenticated, and indexable by search engines or scrapers. In a private bucket, files cannot be accessed without an authorized cryptographic token. By generating short-lived signed URLs (`createSignedUrl` with 300s TTL), the application grants temporary access solely for the duration of the preview session, ensuring complete data sovereignty and GDPR compliance.

### Q14: How do you perform defense-in-depth file validation in React Native to prevent spoofed files and unparseable scans?
> **Answer:**
> File extensions and MIME types sent by client pickers can be easily spoofed or misreported. To defend against malicious or corrupt uploads, our service:
> 1. Verifies the file extension is `.pdf` and size does not exceed 5 Mo.
> 2. Reads the initial file bytes via `expo-file-system` / `ArrayBuffer` and verifies the `%PDF-` magic header (`0x25 0x50 0x44 0x46 0x2D`).
> 3. Scans the binary content stream for font dictionaries (`/Font`) and text rendering operators (`BT`, `Tj`, `TJ`). If the file is an image-only scan lacking selectable text, it is rejected immediately with `"Ce document ne peut pas être analysé dans cette version"`, saving server storage and avoiding downstream LLM parsing failures.

### Q15: How do you achieve consistency and avoid orphan files between cloud object storage and a SQL database?
> **Answer:**
> Because distributed two-phase commits do not exist across independent REST APIs for blob storage and relational databases, we implement a compensating transaction pattern:
> 1. Upload the file to the private Storage bucket under a unique path (`{userId}/{timestamp}_{cleanName}`).
> 2. Execute the database upsert in `public.user_cvs`.
> 3. If the database upsert fails, catch the error and issue an immediate compensation call (`storage.from('cvs').remove([targetFilePath])`), ensuring no orphan file remains in storage.
> 4. If the database upsert succeeds and replaces an older document, delete the `oldFilePath` from Storage only after the database commit completes.

### Q16: How does Supabase Storage RLS leverage the folder hierarchy to authorize recruiters reviewing candidate applications?
> **Answer:**
> Supabase Storage stores paths in `storage.objects.name` and exposes the helper `storage.foldername(name)`. By convention, we namespace every CV under its owner's UUID: `{userId}/{timestamp}_{filename}.pdf`.
> The Storage RLS policy enforces folder isolation for write operations:
> `(storage.foldername(name))[1] = auth.uid()::text`
> For read operations, it permits access if the folder belongs to the user OR if the requester owns a job offer that the candidate applied to:
> ```sql
> (storage.foldername(name))[1] = auth.uid()::text
> OR EXISTS (
>   SELECT 1 FROM public.applications a
>   JOIN public.job_offers o ON o.id = a.offer_id
>   WHERE a.user_id::text = (storage.foldername(name))[1]
>     AND o.user_id = auth.uid()
> )
> ```
> This secures file storage directly at the storage engine level without intermediary server proxies.

---

## 4. Database Schema Reference

```sql
-- This migration creates the private cv metadata table and storage policies.

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

-- 4. User CVs Table (Single CV per user constraint)
CREATE TABLE public.user_cvs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_size_bytes integer NOT NULL CHECK (file_size_bytes > 0 AND file_size_bytes <= 5242880),
  mime_type text NOT NULL DEFAULT 'application/pdf',
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Storage Bucket Configuration
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('cvs', 'cvs', false, 5242880, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- 6. Storage RLS Policies
CREATE POLICY "users can upload their own cv object"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'cvs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "users and authorized recruiters can read cv objects"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'cvs'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1
        FROM public.applications a
        JOIN public.job_offers o ON o.id = a.offer_id
        WHERE a.user_id::text = (storage.foldername(name))[1]
          AND o.user_id = auth.uid()
      )
    )
  );
```

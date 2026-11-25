# Architecture & Interview Guide — JobPilot AI

This document provides a technical overview of the architecture, engineering decisions, and security model implemented in JobPilot AI during **Step 1 (App Foundation)** and **Step 2 (Phase P1 / S03–S05: Authentication, Secure Session Persistence, Profile Management & RLS)**.

---

## 1. End-to-End Architecture & Data Flow

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

### Authentication & Lifecycle Flow
1. **App Launch & Initialization**:
   - `src/app/_layout.tsx` mounts `AuthProvider` (`src/context/AuthContext.tsx`).
   - `SplashScreen.preventAutoHideAsync()` prevents the native splash screen from hiding prematurely.
   - `AuthProvider` invokes `supabase.auth.getSession()` on mount, always resolving `isLoading` to `false` inside a `finally` block.
   - Once `isLoading` reaches `false`, `src/app/_layout.tsx` explicitly triggers `SplashScreen.hideAsync()`, guaranteeing that the native splash screen never overlays the interactive UI or traps touch events.
   - The root layout wraps `<Stack />` in a full-screen `flex: 1` container (`#F8FAFC`) ensuring full touch and render area across platforms.
2. **Hardware-Backed Encryption**:
   - On iOS, tokens reside in Apple Keychain with `kSecAttrAccessibleAfterFirstUnlock`.
   - On Android, tokens are encrypted via Android Keystore backed by hardware security module (HSM) or Trusted Execution Environment (TEE).
   - On Web, a fallback to standard `localStorage` is provided for local development and web previews.
3. **Route Guards & Segment Protection**:
   - `RootNavigationLayout` in `src/app/_layout.tsx` monitors `session` and `isLoading` alongside current route segments (`useSegments()`).
   - Unauthenticated users attempting to access `/(tabs)` or root `/` are immediately redirected via `router.replace('/(auth)/login')`.
   - Authenticated users attempting to visit `/(auth)` are redirected to `/(tabs)`.
   - Hardware back navigation on Android is intercepted, preventing backward traversal into protected tabs after logout.
4. **Row-Level Security (RLS) Enforcement**:
   - Every database query from `src/app/(tabs)/profile.tsx` passes the user's JWT in the `Authorization: Bearer <token>` header.
   - PostgreSQL parses `auth.uid()` from the verified JWT claims and enforces policies on `public.profiles`.
   - Even if client code were compromised or bypassed, the database layer refuses reads, writes, updates, or deletes for rows where `id != auth.uid()`.

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

### Supabase & PostgreSQL Row-Level Security (RLS)
- **Why Chosen**: Defense-in-depth architecture.
- **Security Justification**:
  - Mobile clients are inherently untrusted environments (reverse engineering, proxy inspection via Charles/Mitmproxy, memory dumps).
  - Relying on client-side `WHERE user_id = current_user` is a critical vulnerability.
  - PostgreSQL RLS enforces authorization at the database kernel level: every `SELECT`, `INSERT`, `UPDATE`, and `DELETE` evaluates `auth.uid() = id`.

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
> In React Native, each added dependency can increase JavaScript bundle size, introduce native link complexity, or cause version incompatibility between Expo SDK native modules. By following progressive dependency management (installing only packages required for the active phase—here, auth, secure store, and validation), we avoid premature optimization, maintain clean dependency audit trees, and ensure every package is intentionally justified and verified.

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

---

## 4. Database Schema Reference

```sql
-- Profiles table structure and permissions
TABLE public.profiles (
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

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO authenticated;
```

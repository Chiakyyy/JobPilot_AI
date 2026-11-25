# JobPilot AI 🚀

> 📖 **Technical & Interview Guide**: See the comprehensive [Architecture & Interview Guide](docs/ARCHITECTURE_AND_INTERVIEW_GUIDE.md) for architectural data flow, security model (RLS, SecureStore), and interview defense Q&A.

JobPilot AI is an intelligent mobile companion for candidates to discover job opportunities, track applications, and manage their career profile with automated AI matching. Built with **Expo SDK 58**, **TypeScript**, **Expo Router**, **Supabase**, and **PostgreSQL**.

---

## 🛠️ Tech Stack & Phase Progress

- **Framework**: Expo SDK 58 (React Native 0.88, React 19)
- **Navigation**: Expo Router (file-based routing with route protection guards)
- **Backend & Auth**: Supabase (PostgreSQL, Supabase Auth, Row-Level Security)
- **Session Storage**: `expo-secure-store` (hardware-backed Keychain & Keystore encryption)
- **Validation**: React Hook Form + Zod
- **Current Phase**: **Step 2 (Phase P1 / S03–S05: Authentication & Profile Foundation)**

---

## 🚀 Getting Started

### 1. Environment Configuration

Copy the example environment file and add your Supabase credentials:

```bash
cp .env.example .env
```

Ensure `.env` contains:
```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-anon-key
```

### 2. Database Migration

Run the SQL migration in your Supabase project:
- File: `supabase/migrations/001_profiles_and_rls.sql`
- Configures `public.profiles`, automated signup trigger `on_auth_user_created`, and strict RLS policies (`auth.uid() = id`).

### 3. Development Server

```bash
npx expo start
```

Press `w` to open on web, `a` for Android, or `i` for iOS.

---

## 🧪 Quality & Verification Checks

```bash
npx tsc --noEmit     # TypeScript typecheck
npm run lint         # ESLint validation
npx expo-doctor      # Dependency & configuration diagnostics
```

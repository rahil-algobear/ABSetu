# ABSetu Frontend

Next.js 16 + React 19 + TypeScript + Tailwind CSS.

## Quick Reference

```bash
npm install         # Install deps
npm run dev         # Dev server on :3000 (Turbopack)
npm run build       # Production build
npm run lint        # ESLint
```

## Architecture

```
src/
├── app/                            # Next.js App Router pages
│   ├── layout.tsx                  # Root layout
│   ├── page.tsx                    # Home page
│   ├── login/                      # Login page
│   └── {module}/                   # Feature pages
├── components/
│   ├── layout.tsx                  # Main layout wrapper
│   ├── Navigation.tsx              # Top nav bar
│   ├── Sidebar.tsx                 # Sidebar nav
│   ├── Providers.tsx               # Auth + Query providers
│   ├── Auth/                       # Auth components
│   ├── ui/                         # Reusable UI components (button, card, input, etc.)
│   └── {Module}/                   # Module-specific components
├── services/
│   ├── auth.tsx                    # AuthContext + useAuth hook
│   ├── api.ts                      # API endpoint functions
│   └── axios.ts                    # Axios instances (public + authenticated)
├── types/
│   └── index.ts                    # TypeScript interfaces
└── utils/
    ├── jwt.ts                      # Token management (cookies)
    ├── cn.ts                       # classname utility
    └── metadata.ts                 # Page metadata helper
```

## Patterns to Follow

### Adding a New Feature/Module

1. **Types:** Add interfaces to `src/types/index.ts`
2. **API functions:** Add to `src/services/api.ts` using `authAxios`
3. **Page:** Create `src/app/{module}/page.tsx`
4. **Components:** Create `src/components/{Module}/` for module-specific components
5. **Queries:** Use TanStack Query hooks in components for data fetching

### Data Fetching
- Use TanStack React Query (`@tanstack/react-query`) for server state
- `authAxios` (from `services/axios.ts`) for authenticated requests — auto-refreshes tokens on 401
- `publicAxios` for unauthenticated requests

### Styling
- Tailwind CSS for all styling — no CSS modules or styled-components
- `cn()` utility (from `utils/cn.ts`) for conditional classes
- Mobile-first: design for mobile, enhance for desktop
- Existing UI components in `components/ui/` — use these before adding new ones

### UI Components Available
- `button`, `card`, `input`, `label`, `badge`, `alert`, `switch`, `tabs`
- `page-layout`, `page-content`, `page-table`, `section-table`
- `custom-dropdown`, `expandable-div`, `action-bar`
- Built on Radix UI primitives + Headless UI

### Auth
- `useAuth()` hook from `services/auth.tsx` for auth state
- Protected pages should check auth status and redirect to `/login`
- Tokens stored in cookies via `utils/jwt.ts`

### Permissions
- Frontend checks permission keys (strings like `"beneficiary:create"`) not role names
- User's permissions come from their role via the API
- Conditionally render UI elements based on permissions

### Navigation
- Mobile: bottom tab bar
- Desktop: sidebar
- Both use the same route structure

## Environment Variables
- `NEXT_PUBLIC_API_BASE_URL` — API base (default: `http://localhost:8000/api`)
- `NEXT_PUBLIC_BRAND_NAME` — App name
- `NEXT_PUBLIC_S3_URL` — S3 bucket URL for assets
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — Maps API key

## Path Aliases
- `@/*` maps to `./src/*` (configured in tsconfig)

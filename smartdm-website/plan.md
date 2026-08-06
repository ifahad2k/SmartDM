# SmartDM Website — Firebase Spark Multi-Agent Implementation Plan

**Project:** SmartDM public website, user portal, feedback system, and administration panel  
**Deployment target:** Firebase Hosting on the no-cost Spark plan  
**Backend services:** Firebase Authentication and Cloud Firestore only  
**Binary delivery:** GitHub Releases only  
**Implementation model:** Multi-agent AI execution with isolated ownership, explicit contracts, staged integration, and security-first review  
**Primary objective:** Launch a modern, animated, production-quality SmartDM website that remains usable without paid infrastructure and can be extended later without a full rewrite.

---

## 1. Mission

Build and deploy a cohesive SmartDM web platform with four connected areas:

1. **Public product website**
   - Explain SmartDM clearly.
   - Present its Windows and Linux capabilities.
   - Show the existing SmartDM application screenshot in a premium animated layout.
   - Provide installation, browser-extension, security, checksum, troubleshooting, and FAQ documentation.

2. **Download system**
   - Detect the visitor's operating system.
   - Show Windows and Linux download choices.
   - Redirect every binary download to a GitHub Releases asset.
   - Read the active version, release links, checksums, and availability from Firestore.
   - Fall back to a bundled local configuration if Firestore is unavailable.

3. **User account and feedback portal**
   - Let users create an account and sign in.
   - Support email/password and Google sign-in.
   - Require a verified account before submitting feedback.
   - Let authenticated users submit bug reports and feature suggestions.
   - Let users review the status of their own submissions.

4. **Administration panel**
   - Use the same SmartDM visual system as the public website.
   - Require an admin ID and password.
   - Let administrators view, filter, search, update, and close feedback.
   - Let administrators change release versions, GitHub download links, checksums, and release availability.
   - Keep all privileged access enforced by Firebase Authentication claims and Firestore Security Rules, not only by hidden UI routes.

---

## 2. Non-Negotiable Free-Tier Policy

The implementation must remain compatible with the Firebase **Spark** plan and must not require a billing account.

### 2.1 Allowed production services

- Firebase Hosting
- Firebase Authentication
  - Email/password
  - Google sign-in
- Cloud Firestore
- Firebase App Check with a no-cost web provider
- GitHub Releases for executable and package files
- GitHub repository links, stars, discussions, and issue links
- GitHub Actions for a public open-source repository
- Local Firebase Emulator Suite for development and testing
- Open-source npm packages with permissive licenses

### 2.2 Prohibited production services

Do not introduce any of the following in version 1:

- Cloud Functions for Firebase
- Cloud Run
- Firebase App Hosting server runtimes
- Cloud Storage for Firebase
- Phone/SMS authentication
- Paid Firebase Extensions
- Paid email providers
- Paid CAPTCHA plans
- Paid analytics platforms
- Paid monitoring services
- A private API server
- A GitHub personal access token in browser code
- Any external AI API for the website itself

SmartDM may advertise the AI capabilities of the desktop application, but the website must not call Gemini, Ollama, or any other AI provider in version 1.

### 2.3 Free-tier operating targets

Design the system to stay comfortably below these operational ceilings:

- Firebase Hosting content should remain below 250 MB per deployment.
- Monthly Hosting transfer target: below 5 GB.
- Firestore target: below 10,000 reads and 2,000 writes per day.
- User authentication target: below 1,000 daily active users during the first release phase.
- Main website Firestore usage target: one configuration read per cold visit, cached afterward.
- Admin dashboard query target: paginated reads of 20 records at a time.

At the time this plan was written, Firebase documentation listed no-cost quotas that were substantially higher than these internal targets. The implementation team must verify current Firebase limits again immediately before production deployment.

### 2.4 Cost guardrail

Create an automated script named:

```text
scripts/free-tier-audit.mjs
```

The script must fail CI when it detects:

- a `functions/` directory;
- Cloud Functions dependencies;
- Cloud Storage imports;
- phone authentication code;
- server runtime configuration;
- paid third-party API keys;
- binary release files committed to the website repository;
- a Firebase project configured for a non-Spark-only architecture.

---

## 3. Recommended Technical Stack

Use a maintainable static single-page application architecture.

### 3.1 Frontend

- React
- TypeScript
- Vite
- React Router
- Firebase modular JavaScript SDK
- CSS Modules or structured global CSS with design tokens
- Zod for client-side schema validation
- Vitest for unit tests
- Playwright for browser tests
- ESLint and Prettier

### 3.2 Why this stack

The existing HTML/CSS prototype should be treated as the visual reference, but the production implementation should use modular components because the new scope includes authentication, account pages, protected routes, forms, Firestore data, an admin dashboard, and future feature growth.

The application remains a static build. React and Vite do not require a paid server and deploy directly to Firebase Hosting.

### 3.3 No UI framework requirement

Do not introduce a large visual component framework unless the orchestrator approves it. The SmartDM appearance must remain distinctive and consistent with the desktop application rather than resembling a generic dashboard template.

Use custom components and tokens for:

- buttons;
- cards;
- badges;
- navigation;
- form controls;
- dialogs;
- data tables;
- empty states;
- status indicators;
- notifications;
- skeleton loaders.

---

## 4. Product Scope

### 4.1 Public routes

```text
/
/downloads
/docs
/docs/install
/docs/browser-extension
/docs/video-downloads
/docs/security
/docs/troubleshooting
/community
/account/sign-in
/account/sign-up
/account/forgot-password
/account/verify-email
/account
/account/feedback
/account/feedback/new/bug
/account/feedback/new/feature
/account/feedback/:feedbackId
/privacy
/security
/terms
/404
```

### 4.2 Protected Admin routes

```text
/admin
/admin/feedback
/admin/feedback/:feedbackId
/admin/releases
/admin/settings
/admin/audit
```

### 4.3 Public website sections

The home page should include:

1. Animated hero with SmartDM product screenshot.
2. Platform-aware primary download button.
3. Windows and Linux download alternatives.
4. GitHub star call-to-action.
5. Core feature grid.
6. Multi-segment acceleration visualization.
7. Browser integration section.
8. Supported media platforms section.
9. AI cataloging section.
10. Security and privacy section.
11. Installation preview.
12. Community and feedback section.
13. FAQ.
14. Footer with GitHub, license, privacy, security, documentation, report, and feature links.

### 4.4 User account functions

Authenticated users can:

- view profile information;
- verify their email;
- submit a bug report;
- submit a feature suggestion;
- view their own submissions;
- view current status and admin response;
- edit a submission only while its status is `new`;
- withdraw a submission that has not been resolved;
- sign out;
- reset their password.

### 4.5 Admin functions

Administrators can:

- view dashboard totals;
- filter feedback by type, status, platform, date, and app version;
- search by title, reference ID, or user email;
- open the complete report;
- assign priority;
- update status;
- add an internal note;
- add a public response visible to the reporting user;
- mark duplicate reports;
- add an optional related GitHub issue URL;
- export filtered feedback as CSV in the browser;
- configure Windows and Linux release links;
- configure current version and release notes URL;
- configure SHA-256 values;
- enable or disable individual download assets;
- test a download link before saving;
- review an audit trail of administrative changes;
- sign out.

---

## 5. Core Architecture

```text
Visitor Browser
    |
    +-- Firebase Hosting
    |      +-- React/Vite static application
    |      +-- optimized images, icons, fonts, documentation content
    |
    +-- Firebase Authentication
    |      +-- user email/password
    |      +-- Google sign-in
    |      +-- admin email/password through admin-ID mapping
    |
    +-- Cloud Firestore
    |      +-- public release configuration
    |      +-- user profiles
    |      +-- bug reports and feature suggestions
    |      +-- admin-visible audit records
    |
    +-- GitHub
           +-- source repository
           +-- release assets
           +-- stars
           +-- optional public issues and discussions
```

No custom backend is required.

---

---

## 6. Unified Authentication & Role-Based Privilege Design

Instead of separate admin and user login forms, SmartDM uses a **single, unified authentication portal** (`/account/sign-in`). 

All users (normal users and administrators) sign in through the same portal using Email/Password, Google, or GitHub. Upon authentication, the application evaluates the user's role and dynamically unlocks elevated administrative features if the account holds an admin claim.

```text
                       Unified Sign-In Portal
                (/account/sign-in or OAuth Redirect)
                                  |
                                  v
                    Firebase Authentication Engine
            (Email/Password, Google OAuth, GitHub OAuth)
                                  |
                                  v
                     Token Claim Evaluation
                (`idTokenResult.claims.admin`)
                                 / \
                                /   \
          `admin == true`      /     \    `admin != true`
                              v       v
                     +-----------------+-----------------+
                     | Elevated Admin  | Standard User   |
                     | - Admin Nav     | - User Profile  |
                     | - /admin/*      | - Feedback Form |
                     | - Release Edit  | - My Reports    |
                     | - Audit Logs    |                 |
                     +-----------------+-----------------+
```

### 6.1 Supported Free Authentication Providers

Version 1 supports three zero-cost authentication methods natively on the Firebase Spark tier:

1. **Email and Password**: Standard registration, sign-in, and email verification.
2. **Google OAuth Sign-In**: One-tap sign-in via `GoogleAuthProvider` (100% free on Firebase Spark).
3. **GitHub OAuth Sign-In**: Native developer sign-in via `GithubAuthProvider` (100% free on Firebase Spark).

*Note: Phone/SMS authentication is strictly prohibited to maintain free-tier compatibility.*

### 6.2 Admin Grant & Token Claim Resolution

Administrative status is NOT tied to a separate login form or secret email domain. Any registered account (Email, Google, or GitHub) can be elevated to Admin status by attaching a Firebase Auth Custom Claim:

```json
{
  "admin": true,
  "role": "admin"
}
```

#### Admin Bootstrap Script (`scripts/bootstrap-admin.mjs`)
A local-only CLI script accepts a user's email address (or UID) and applies the custom admin claim using the Firebase Admin SDK:

```bash
node scripts/bootstrap-admin.mjs --email owner@smartdm.app --grant-admin
```

### 6.3 Dynamic Feature Elevation & UI Protection

When a user signs in:

1. Client calls `getIdTokenResult(true)` to fetch fresh custom claims.
2. If `claims.admin === true`:
   - `AuthContext` sets `isAdmin = true`.
   - The navigation header dynamically renders the **"Admin Dashboard"** link & badge.
   - Access to `/admin/*` routes is granted.
   - Elevated UI controls (triage controls, release link editors, checksum updates, audit logs) become visible.
3. If `claims.admin !== true`:
   - `AuthContext` sets `isAdmin = false`.
   - Standard user options (Profile, Submit Bug/Feature, My Submissions) are displayed.
   - Any manual URL navigation to `/admin/*` is intercepted by `<AdminRoute>` and redirected to `/404` or an access denied page.

### 6.4 Double-Layered Security Architecture

Client-side UI hidden routes are NOT the security boundary. Security is enforced across two distinct layers:

1. **Client Guard Layer (`<AdminRoute>`)**: Prevents non-admin users from rendering administrative UI views.
2. **Backend Security Boundary (Firestore Security Rules)**: Every read/write operation to privileged collections (`publicConfig`, `auditLogs`, global `feedback` triage fields) independently verifies `request.auth.token.admin == true`. Even if a malicious user alters client JavaScript state, Firestore Rules block unauthorized access.

### 6.5 Session & Security Policy

- Use local persistence for standard user sessions.
- Provide a visible, accessible sign-out button in the user dropdown menu.
- Display clear error messages for invalid credentials, disabled accounts, or unverified emails.
- Never store auth tokens or passwords in `localStorage`.

---

## 7. User Registration & Account Flow

### 7.1 Registration & OAuth Flow

1. **Email Registration**:
   - User submits name, email, password, and legal terms acceptance.
   - Firebase creates the account and dispatches an email verification link.
   - Creates `users/{uid}` profile document.
   - Feedback submission is disabled until email is verified.

2. **Google / GitHub OAuth Registration**:
   - User signs in via Google or GitHub popup/redirect.
   - Account email is automatically marked as verified by the OAuth provider.
   - `users/{uid}` profile document is automatically initialized with provider display name & photo URL.
   - Immediate access to feedback submission.

### 7.2 User Privacy

Store only essential profile metadata in Firestore (`users/{uid}`):
- Display name;
- Email address;
- Photo URL (when provided by Google or GitHub);
- Auth provider (`password`, `google.com`, `github.com`);
- Account creation & last sign-in timestamps;
- Accepted legal version.

Do not store passwords, IP addresses, location data, or device fingerprints.

---

## 8. Download and GitHub Releases Design

### 8.1 Source of truth

All binaries must be hosted in GitHub Releases.

Firebase Hosting must contain only the website and small static assets. Do not upload `.exe`, `.msi`, `.AppImage`, `.deb`, `.rpm`, `.zip`, or large media binaries to Firebase.

### 8.2 Supported link forms

The admin panel may save only GitHub links belonging to the configured SmartDM repository.

Preferred immutable asset form:

```text
https://github.com/<OWNER>/<REPO>/releases/download/v<VERSION>/<ASSET_FILENAME>
```

Optional latest-release page:

```text
https://github.com/<OWNER>/<REPO>/releases/latest
```

A primary download button should point to a specific asset whenever possible.

### 8.3 Release configuration fields

The public configuration must support:

```ts
interface DownloadAsset {
  id: string;
  platform: "windows" | "linux";
  architecture: "x64" | "arm64" | "universal";
  packageType: "exe" | "msi" | "appimage" | "deb" | "rpm" | "tar.gz";
  label: string;
  fileName: string;
  url: string;
  sha256: string;
  fileSizeLabel?: string;
  minimumOs?: string;
  enabled: boolean;
}

interface PublicSiteConfig {
  productName: "SmartDM";
  currentVersion: string;
  releaseDate: string;
  githubRepositoryUrl: string;
  githubLatestReleaseUrl: string;
  releaseNotesUrl?: string;
  assets: DownloadAsset[];
  maintenanceMessage?: string;
  updatedAt: Timestamp;
  updatedBy: string;
}
```

### 8.4 Platform detection

- Detect Windows, Linux, macOS, Android, iOS, and unknown platforms.
- Windows visitors receive the preferred enabled Windows asset.
- Linux visitors receive the preferred enabled Linux asset.
- Other visitors receive a “View all downloads” button.
- Never hide alternative platforms.
- Do not automatically start a download without a user click.

### 8.5 Firestore and fallback behavior

On public page load:

1. Read `publicConfig/main` once.
2. Validate it with Zod.
3. Save the sanitized result in memory and localStorage with a short cache timestamp.
4. Render the download buttons.
5. If Firestore fails, use `src/config/defaultReleaseConfig.ts`.
6. Clearly mark disabled or unavailable assets.

The local fallback must always contain at least the GitHub Releases page so the website never presents a dead primary action.

### 8.6 Admin release editor

The release editor must:

- show the current public configuration;
- validate semantic version format;
- validate SHA-256 as 64 hexadecimal characters;
- require HTTPS;
- restrict download URLs to the configured GitHub repository;
- require confirmation before publishing;
- open every new link in a safe test tab;
- perform a Firestore transaction or batch write;
- add an audit entry;
- show the previous and new values;
- support rollback by selecting an earlier audit snapshot.

Client-side link testing cannot guarantee asset availability because of browser cross-origin restrictions. The UI should therefore test navigation safely and tell the admin to confirm the GitHub asset page manually.

---

## 9. Feedback System Design

Use one extensible collection for bug reports and feature suggestions.

### 9.1 Common feedback fields

```ts
interface FeedbackBase {
  type: "bug" | "feature";
  title: string;
  summary: string;
  status: "new" | "triaged" | "planned" | "in_progress" | "resolved" | "closed" | "rejected" | "duplicate";
  priority: "unassigned" | "low" | "medium" | "high" | "critical";
  platform: "windows" | "linux" | "browser_extension" | "website" | "other";
  appVersion?: string;
  createdBy: string;
  createdByEmail: string;
  createdByName?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  adminPublicResponse?: string;
  relatedGithubIssueUrl?: string;
  duplicateOf?: string;
}
```

### 9.2 Bug-specific fields

```ts
interface BugDetails {
  stepsToReproduce: string;
  expectedBehavior: string;
  actualBehavior: string;
  frequency: "once" | "sometimes" | "often" | "always";
  operatingSystem?: string;
  browser?: string;
}
```

### 9.3 Feature-specific fields

```ts
interface FeatureDetails {
  problem: string;
  proposedSolution: string;
  useCase: string;
  alternatives?: string;
}
```

### 9.4 Submission constraints

- User must be authenticated.
- Email must be verified.
- Title length: 8–120 characters.
- Summary length: 20–5,000 characters.
- Detailed text fields: maximum 8,000 characters each.
- No HTML input.
- No attachments in version 1.
- No executable uploads.
- Show a generated human-readable reference ID.
- Prevent accidental double submission.
- Use Firebase App Check.
- Display a privacy notice before submission.

### 9.5 User feedback history

The user portal should query only documents where:

```text
createdBy == current user UID
```

Show:

- reference ID;
- type;
- title;
- status;
- priority;
- creation date;
- last update date;
- public admin response;
- related GitHub issue, when available.

### 9.6 Admin feedback workflow

Admin list behavior:

- 20 records per page;
- newest first;
- filters persisted in the URL query string;
- server-side Firestore filtering;
- no unbounded full-collection reads;
- exact total counts requested only when needed;
- cached dashboard counts for at least 60 seconds;
- manual refresh control;
- loading and empty states;
- keyboard-accessible table and mobile card view.

### 9.7 GitHub issue integration without a server

Do not automatically create GitHub issues through an API token.

Instead, the admin panel may provide:

- “Create GitHub issue” button;
- prefilled issue title and body in a GitHub issue URL;
- manual confirmation by the signed-in GitHub user;
- a field for saving the resulting public issue URL.

This keeps GitHub credentials out of the website and remains free.

---

## 10. Firestore Data Model

```text
publicConfig/
  main

users/
  {uid}

feedback/
  {feedbackId}

adminProfiles/
  {uid}

auditLogs/
  {auditId}
```

### 10.1 `publicConfig/main`

Publicly readable, admin writable.

Contains:

- current product version;
- GitHub repository URL;
- release notes URL;
- enabled download assets;
- checksums;
- optional maintenance message;
- update metadata.

### 10.2 `users/{uid}`

Readable and updateable by the same user. Readable by administrators.

Contains only profile metadata.

### 10.3 `feedback/{feedbackId}`

- Create: verified authenticated user.
- Read: owner or admin.
- Update by user: restricted fields and only while status is `new`.
- Update by admin: workflow fields and responses.
- Delete: denied in normal client operation.

Use soft withdrawal instead of deletion.

### 10.4 `adminProfiles/{uid}`

Readable by the matching admin and other admins. Client writes denied except through the trusted local bootstrap process or a carefully restricted admin update rule.

This document is informational only. Authorization comes from custom claims.

### 10.5 `auditLogs/{auditId}`

Admin-readable. Admin-create-only. No update and no delete from the client.

Log actions such as:

- release configuration changed;
- feedback status changed;
- feedback priority changed;
- public response added;
- GitHub issue link added;
- settings changed.

The audit log is an administrative record, not a tamper-proof compliance ledger, because it is written from a trusted admin client rather than a server.

---

## 11. Firestore Security Rules Contract

Agent 5 must implement and test rules based on the following policy.

```text
Default: deny all.
```

Required helpers:

```text
isSignedIn()
isAdmin()
isVerifiedUser()
isOwner(uid)
hasOnlyAllowedKeys()
validFeedbackCreate()
validUserFeedbackUpdate()
validAdminFeedbackUpdate()
validPublicConfig()
```

### 11.1 Authorization source

```text
request.auth.token.admin == true
```

Do not depend only on a publicly readable role document.

### 11.2 Public configuration policy

- Anyone may read `publicConfig/main`.
- Only admin claim holders may create or update it.
- Client deletion is denied.
- Allowed field names must be explicitly listed.
- URLs must be HTTPS and restricted to the configured GitHub repository where possible.

### 11.3 User profile policy

- User may create their own profile.
- User may read their own profile.
- User may update only display-name and legal-consent fields.
- User cannot change UID, email owner fields, admin fields, or creation timestamp.
- Admin may read profiles.
- Client deletion is denied.

### 11.4 Feedback policy

User creation must enforce:

- `createdBy == request.auth.uid`;
- `createdByEmail == request.auth.token.email`;
- verified email;
- `status == "new"`;
- `priority == "unassigned"`;
- valid type;
- server timestamp fields;
- allowed keys only;
- string-size limits.

User updates must not allow changes to:

- creator identity;
- admin response;
- priority;
- related GitHub issue;
- audit metadata;
- resolved status values.

Admin updates may change workflow fields but must not change creator identity or original creation timestamp.

### 11.5 Audit policy

- Admin may create audit records.
- Admin may read audit records.
- No client may modify or delete an audit record.

### 11.6 Rules testing

Use the Firebase Emulator Suite and automated rules tests for at least these scenarios:

- unauthenticated public config read succeeds;
- unauthenticated feedback read/write fails;
- unverified user feedback create fails;
- verified user valid feedback create succeeds;
- user cannot read another user's feedback;
- user cannot set themselves as admin;
- user cannot change status to resolved;
- non-admin cannot read all feedback;
- admin can read all feedback;
- admin can update release links;
- admin cannot alter immutable creator fields;
- malformed release URL fails;
- oversized text fails;
- unknown fields fail;
- audit update/delete fails.

---

## 12. Firestore Index Plan

Create only indexes required by real queries.

Initial composite indexes:

```text
feedback: createdBy ASC, createdAt DESC
feedback: type ASC, createdAt DESC
feedback: status ASC, createdAt DESC
feedback: type ASC, status ASC, createdAt DESC
feedback: platform ASC, createdAt DESC
feedback: priority ASC, createdAt DESC
```

Add indexes only after the application produces an explicit missing-index requirement. Do not create speculative index combinations for every possible filter.

Search by arbitrary text is not natively supported by Firestore. Version 1 should use:

- exact reference ID lookup;
- exact email lookup;
- client-side title filtering within the currently loaded page;
- structured filters.

Do not add Algolia or another paid search service.

---

## 13. Visual Design System

The website and admin panel must feel like one product.

### 13.1 Visual direction

- dark navy and midnight surfaces;
- cyan-to-violet gradients;
- subtle glass panels;
- precise thin borders;
- restrained neon glow;
- clean product typography;
- generous spacing;
- high-contrast text;
- modern technical visualizations;
- desktop-app-inspired side navigation in the admin panel;
- no generic stock-dashboard appearance.

### 13.2 Design tokens

Define tokens for:

- color;
- surface elevation;
- text hierarchy;
- border opacity;
- gradient presets;
- spacing;
- radii;
- shadows;
- blur;
- transition duration;
- easing;
- z-index layers;
- breakpoints.

### 13.3 Motion

Use CSS and the Web Animations API or a small permissively licensed animation library only when necessary.

Required motion:

- hero background drift;
- subtle cursor glow on capable devices;
- application screenshot tilt with safe limits;
- section reveal on scroll;
- animated speed/segment demonstration;
- button hover and focus transitions;
- modal and drawer transitions;
- table row state transitions;
- toast notifications.

Motion requirements:

- respect `prefers-reduced-motion`;
- never block interaction;
- never continuously animate large blurred layers on low-power mobile devices;
- target smooth 60 fps on typical desktop hardware;
- disable pointer-follow effects on touch devices;
- avoid motion that causes layout shift.

### 13.4 Accessibility

- WCAG 2.2 AA target.
- Full keyboard support.
- Visible focus indicators.
- Semantic headings and landmarks.
- Form labels and field-level errors.
- Status updates announced with appropriate live regions.
- Dialog focus trapping and restoration.
- Color is not the only status indicator.
- Tables have proper headers and mobile alternatives.
- Minimum touch target approximately 44 × 44 CSS pixels.

---

## 14. Repository Structure

```text
smartdm-web/
├─ .github/
│  ├─ workflows/
│  │  ├─ ci.yml
│  │  └─ firebase-hosting-deploy.yml
│  ├─ ISSUE_TEMPLATE/
│  └─ pull_request_template.md
├─ docs/
│  ├─ architecture.md
│  ├─ content-spec.md
│  ├─ design-system.md
│  ├─ firebase-setup.md
│  ├─ security-review.md
│  ├─ test-plan.md
│  └─ handoffs/
├─ public/
│  ├─ assets/
│  ├─ fonts/
│  ├─ favicon.svg
│  ├─ robots.txt
│  ├─ manifest.webmanifest
│  └─ social-preview.png
├─ scripts/
│  ├─ bootstrap-admin.mjs
│  ├─ free-tier-audit.mjs
│  ├─ validate-release-config.mjs
│  └─ verify-links.mjs
├─ src/
│  ├─ app/
│  │  ├─ App.tsx
│  │  ├─ router.tsx
│  │  └─ providers.tsx
│  ├─ components/
│  │  ├─ common/
│  │  ├─ marketing/
│  │  ├─ forms/
│  │  ├─ feedback/
│  │  └─ admin/
│  ├─ config/
│  │  ├─ env.ts
│  │  ├─ defaultReleaseConfig.ts
│  │  └─ constants.ts
│  ├─ features/
│  │  ├─ auth/
│  │  ├─ downloads/
│  │  ├─ feedback/
│  │  ├─ releases/
│  │  ├─ users/
│  │  └─ admin/
│  ├─ firebase/
│  │  ├─ app.ts
│  │  ├─ auth.ts
│  │  ├─ firestore.ts
│  │  ├─ appCheck.ts
│  │  └─ converters.ts
│  ├─ hooks/
│  ├─ layouts/
│  ├─ pages/
│  │  ├─ public/
│  │  ├─ account/
│  │  └─ admin/
│  ├─ schemas/
│  ├─ services/
│  ├─ styles/
│  ├─ types/
│  ├─ utils/
│  └─ main.tsx
├─ tests/
│  ├─ unit/
│  ├─ rules/
│  └─ e2e/
├─ .env.example
├─ .firebaserc.example
├─ firebase.json
├─ firestore.indexes.json
├─ firestore.rules
├─ index.html
├─ package.json
├─ plan.md
├─ README.md
├─ tsconfig.json
└─ vite.config.ts
```

---

## 15. Shared Contracts to Freeze Before Parallel Work

Agent 0 must approve the following before implementation agents work in parallel.

### 15.1 Route contract

Freeze all route paths listed in Section 4.

### 15.2 Type contract

Freeze:

- `PublicSiteConfig`;
- `DownloadAsset`;
- `FeedbackBase`;
- bug details;
- feature details;
- user profile;
- audit event;
- admin claims.

### 15.3 Firebase collection contract

Freeze collection names and document ownership.

### 15.4 Visual token contract

Freeze token names before the public website and admin panel are implemented separately.

### 15.5 Error contract

All Firebase service functions should return normalized application errors rather than exposing raw Firebase error strings directly to UI components.

Example:

```ts
type AppErrorCode =
  | "AUTH_INVALID_CREDENTIALS"
  | "AUTH_EMAIL_UNVERIFIED"
  | "AUTH_NOT_ADMIN"
  | "FIRESTORE_PERMISSION_DENIED"
  | "FIRESTORE_UNAVAILABLE"
  | "VALIDATION_FAILED"
  | "RELEASE_CONFIG_INVALID"
  | "UNKNOWN";
```

### 15.6 Agent ownership contract

No two active agents may write the same file at the same time. Shared interfaces must be created first and changed only through an orchestrator-approved contract update.

---

## 16. Multi-Agent Team

Use one orchestrator and eight specialist agents.

### Agent 0 — Orchestrator and Integration Lead

**Owns:** execution plan, shared contracts, dependency graph, merge order, final approval.

Responsibilities:

- read this plan fully;
- create `PROJECT_STATUS.md`;
- assign agents by file ownership;
- freeze shared contracts;
- maintain an issue and dependency board;
- review every handoff;
- merge in the defined order;
- run the final release checklist;
- reject paid-service additions;
- approve deployment.

Exclusive files:

- `plan.md`
- `PROJECT_STATUS.md`
- `CHANGELOG.md`
- final integration commits

### Agent 1 — Firebase Architecture and Free-Tier Guardian

**Owns:** Firebase service boundaries, cost controls, deployment architecture.

Deliverables:

- `docs/architecture.md`
- `docs/firebase-setup.md`
- `firebase.json`
- `.firebaserc.example`
- `.env.example`
- `scripts/free-tier-audit.mjs`
- free-tier compliance checklist

Must verify:

- Spark-plan compatibility;
- no Cloud Functions;
- no Cloud Storage;
- no phone auth;
- no paid APIs;
- correct Hosting SPA rewrites;
- correct cache headers;
- no secrets in the client.

### Agent 2 — UX, Visual Design, and Motion System

**Owns:** design language and responsive interaction specification.

Deliverables:

- `docs/design-system.md`
- design tokens;
- global styles;
- motion utilities;
- reusable visual primitives;
- responsive layouts;
- reduced-motion behavior.

Must reuse the SmartDM desktop application's visual identity and screenshot.

### Agent 3 — Public Website and Documentation Frontend

**Owns:** marketing routes and documentation routes.

Deliverables:

- public layouts;
- home page;
- downloads page;
- documentation pages;
- community page;
- legal and security pages;
- SEO metadata;
- structured data;
- no-JavaScript download fallback.

Must not implement Firebase writes.

### Agent 4 — User Authentication and Account Portal

**Owns:** normal user authentication and account routes.

Deliverables:

- email/password registration;
- email verification;
- Google sign-in;
- password reset;
- sign-in persistence;
- protected account routes;
- user profile creation;
- feedback history UI;
- normalized auth errors.

Must not implement admin claim creation.

### Agent 5 — Firestore Data, Security Rules, and Feedback Services

**Owns:** data models, schemas, Firestore access layer, rules, indexes.

Deliverables:

- Firestore converters;
- Zod schemas;
- feedback create/read/update services;
- public configuration service;
- `firestore.rules`;
- `firestore.indexes.json`;
- Emulator rules tests;
- data seeding utilities.

Has veto authority over insecure client access patterns.

### Agent 6 — Administration Panel

**Owns:** admin authentication interface and all admin pages.

Deliverables:

- admin ID/password sign-in;
- claim verification;
- protected admin shell;
- dashboard;
- feedback list and detail views;
- status and priority management;
- public response editor;
- release-link editor;
- audit view;
- browser CSV export;
- inactivity sign-out.

Must use shared tokens from Agent 2 and services from Agent 5.

### Agent 7 — GitHub Release and Community Integration

**Owns:** GitHub-facing behavior and repository support files.

Deliverables:

- GitHub release link validation;
- GitHub star button;
- release naming convention;
- checksum documentation;
- prefilled GitHub issue URL builder;
- `CONTRIBUTING.md`;
- `SECURITY.md`;
- issue templates;
- release checklist;
- `scripts/validate-release-config.mjs`;
- `scripts/verify-links.mjs`.

No GitHub token may be shipped to the browser.

### Agent 8 — QA, Accessibility, Security, and Deployment

**Owns:** integrated verification and production release.

Deliverables:

- `docs/test-plan.md`;
- unit tests;
- Playwright tests;
- accessibility audit;
- Lighthouse audit;
- responsive visual checks;
- dependency audit;
- security review;
- CI workflow;
- Firebase Hosting deployment workflow;
- release sign-off.

Agent 8 tests the integrated application, not isolated branches.

---

## 17. Execution Waves

### Wave 0 — Discovery and contract freeze

**Lead:** Agent 0  
**Participants:** Agents 1, 2, 5, 7, 8

Tasks:

1. Inspect the current prototype.
2. Confirm GitHub owner and repository name.
3. Confirm actual release asset names.
4. Confirm Windows and Linux package formats.
5. Confirm admin ID naming policy.
6. Confirm legal text and privacy scope.
7. Freeze routes, data types, collections, and tokens.
8. Create `PROJECT_STATUS.md`.
9. Record all unknowns as explicit blockers.

Exit criteria:

- no unresolved architecture conflict;
- no paid-service dependency;
- all shared contracts approved.

### Wave 1 — Foundation

Parallel work:

- Agent 1: Firebase project structure and Hosting config.
- Agent 2: design tokens and layout primitives.
- Agent 5: data schemas, converters, rules skeleton, emulator setup.
- Agent 7: GitHub contracts and release validation.

Agent 0 integrates:

- Vite/React/TypeScript base;
- routing shell;
- providers;
- linting and formatting;
- shared types;
- environment validation.

Exit criteria:

- application builds;
- emulator starts;
- design tokens compile;
- security rules deny by default;
- free-tier audit passes.

### Wave 2 — Public and account experiences

Parallel work:

- Agent 3: public website and documentation.
- Agent 4: user auth and account portal.
- Agent 5: feedback and config services.
- Agent 7: GitHub links and issue builders.

Exit criteria:

- public pages complete;
- users can register, verify, sign in, and sign out;
- verified users can submit feedback in emulator;
- users can view only their own feedback;
- download config fallback works.

### Wave 3 — Administration panel

Lead: Agent 6

Dependencies:

- shared design system;
- auth services;
- admin custom-claim contract;
- Firestore services and rules;
- release schema.

Tasks:

1. Implement admin login.
2. Implement admin route guard.
3. Implement feedback dashboard.
4. Implement feedback detail workflow.
5. Implement release settings editor.
6. Implement audit log UI.
7. Implement inactivity sign-out.
8. Implement CSV export.

Exit criteria:

- non-admin account cannot access admin data;
- admin can manage feedback;
- admin can change download links;
- public site reflects the new configuration;
- all admin changes create audit entries.

### Wave 4 — Security and quality hardening

Lead: Agent 8  
**Security support:** Agents 1 and 5

Tasks:

- complete Firestore rules tests;
- test App Check in monitoring mode;
- validate CSP and security headers;
- validate auth flows;
- run dependency audit;
- run accessibility tests;
- run browser tests;
- run responsive visual tests;
- verify reduced motion;
- verify offline/fallback download behavior;
- validate every GitHub link;
- validate no secrets are present;
- validate free-tier audit.

Exit criteria:

- zero critical or high security findings;
- no unauthorized Firestore access;
- no production console errors;
- no broken release links;
- all acceptance tests pass.

### Wave 5 — Firebase deployment

Lead: Agent 8  
**Approval:** Agent 0

Tasks:

1. Create Firebase project on Spark.
2. Register web app.
3. Enable email/password and Google auth.
4. Create one Firestore database.
5. Configure authorized domains.
6. Configure App Check.
7. Deploy Firestore rules and indexes.
8. Bootstrap the initial admin locally.
9. Seed `publicConfig/main`.
10. Build production assets.
11. Deploy Firebase Hosting.
12. Run production smoke tests.
13. Enable App Check enforcement only after metrics show valid traffic.
14. Tag the website release.

---

## 18. Firebase Setup Procedure

### 18.1 Create project

- Create a new Firebase project.
- Keep it on Spark.
- Do not link a billing account.
- Disable unnecessary products.
- Google Analytics is optional and should remain disabled initially to minimize privacy and complexity.

### 18.2 Register web application

Store public Firebase configuration in environment variables:

```text
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APPCHECK_SITE_KEY=
VITE_GITHUB_OWNER=
VITE_GITHUB_REPO=
VITE_ADMIN_AUTH_EMAIL_DOMAIN=
```

Firebase web configuration values are identifiers, not server secrets. Still restrict the API key to the production domains where practical and never place service-account credentials in the frontend.

### 18.3 Authentication

Enable:

- Email/Password;
- Google.

Add:

- production Firebase domain;
- custom domain, when used;
- localhost for development only.

### 18.4 Firestore

- Create one standard Firestore database.
- Choose the region nearest the expected user base while considering future permanence.
- Deploy rules before seeding data.
- Deploy only required indexes.

### 18.5 App Check

- Register the production web application.
- Use a no-cost web attestation provider.
- Begin in monitoring mode.
- Test local development with the official debug provider.
- Never commit a debug token.
- Enable Firestore enforcement after successful production observation.

### 18.6 Hosting

Required `firebase.json` behavior:

- serve from `dist`;
- rewrite unknown application routes to `/index.html`;
- exclude source maps from production unless intentionally retained;
- cache hashed assets for one year;
- do not aggressively cache `index.html`;
- add security headers;
- prevent MIME sniffing;
- set a strict referrer policy;
- set a permissions policy;
- add a tested Content Security Policy.

### 18.7 Initial admin creation

Run locally:

```text
npm run admin:bootstrap
```

The script should prompt for:

```text
Admin ID:
Initial password:
Confirm password:
Display name:
```

After creation:

- confirm the custom claim;
- sign in through the unified portal `/account/sign-in` (or Google/GitHub);
- verify elevated admin nav and features appear;
- delete or securely archive the local service-account key;
- never upload the key to GitHub or Firebase Hosting.

### 18.8 Seed public release configuration

Run:

```text
npm run seed:public-config
```

Seed only verified GitHub Release URLs and checksums.

---

## 19. Security Requirements

### 19.1 Authentication and authorization

- Admin custom claim required for every privileged read/write.
- Verified email required for feedback submission.
- Generic credential errors.
- Session timeout for admins.
- Reauthentication for release changes.
- No trust in hidden routes.
- No admin password in source code.

### 19.2 Input safety

- Validate with Zod before Firebase writes.
- Validate again with Firestore Rules.
- Treat all feedback as plain text.
- Never render user-submitted HTML.
- Escape CSV formulas during export by prefixing dangerous leading characters.
- Limit all text sizes.
- Reject unknown fields.

### 19.3 Link safety

- Restrict release links to HTTPS GitHub URLs.
- Add `rel="noopener noreferrer"` to external links opened in new tabs.
- Never construct executable download URLs from unsanitized user input.
- Display the destination domain near release management fields.

### 19.4 Secret management

Public and acceptable in client:

- Firebase web app config;
- App Check site key;
- GitHub repository URL;
- release URLs.

Private and forbidden in client or repository:

- service-account JSON;
- admin password;
- Firebase Admin SDK credentials;
- GitHub PAT;
- reCAPTCHA secret;
- deployment credentials.

### 19.5 Abuse mitigation

- Require authentication and verified email for submissions.
- Enable App Check.
- Disable attachments.
- Add client-side submission cooldown.
- Prevent repeated clicks.
- Use strict Firestore Rules.
- Monitor Firestore usage.
- Provide admin status `rejected` and `duplicate`.

Without a paid/custom backend, strict per-user time-based rate limiting cannot be made fully authoritative. The plan therefore uses authentication, verification, App Check, field validation, and quota monitoring as the free-tier defense-in-depth strategy.

---

## 20. Performance and Free-Tier Optimization

### 20.1 Hosting bandwidth

- Convert the SmartDM screenshot to optimized WebP and AVIF variants.
- Retain PNG only as fallback when necessary.
- Avoid autoplay background video.
- Lazy-load below-the-fold imagery.
- Self-host one variable font or use system fonts.
- Use hashed asset filenames.
- Keep the initial JavaScript bundle small through route-level code splitting.
- Lazy-load admin routes for non-admin visitors.

### 20.2 Firestore reads

Public website:

- one `getDoc` for `publicConfig/main`;
- local cache with a 5–15 minute TTL;
- no real-time listener.

User portal:

- paginate feedback history;
- stop listening when route is inactive;
- avoid duplicate profile reads.

Admin panel:

- 20-item pagination;
- explicit refresh;
- no unbounded listeners;
- cache aggregate counts briefly;
- fetch detail documents only when opened.

### 20.3 Firestore writes

- one feedback document per submission;
- batched admin update plus audit entry;
- no automatic heartbeat writes;
- no page-view logging;
- no custom analytics collection.

### 20.4 Graceful quota behavior

When Firebase is unavailable or quota-limited:

- public pages still render;
- default GitHub Release link still works;
- documentation still works;
- account forms show a clear temporary-unavailable message;
- no destructive retries occur;
- queued feedback is not silently stored in insecure local storage.

---

## 21. Testing Plan

### 21.1 Unit tests

Test:

- admin ID normalization;
- admin ID to internal email mapping;
- platform detection;
- release selection;
- semantic version validation;
- SHA-256 validation;
- GitHub URL validation;
- feedback schema validation;
- Firebase error normalization;
- CSV injection protection;
- query/filter serialization;
- local config fallback.

### 21.2 Firestore rules tests

Use Emulator Suite tests for every rule in Section 11.

### 21.3 End-to-end tests

Required Playwright flows:

1. Visitor opens home page and sees appropriate download option.
2. Visitor changes platform selection manually.
3. Visitor opens installation documentation.
4. User creates an email/password account.
5. Unverified user cannot submit feedback.
6. Verified user submits a bug report.
7. User sees the report in feedback history.
8. User cannot access another user's report.
9. Normal user cannot open admin data.
10. Admin signs in with admin ID and password.
11. Admin filters reports.
12. Admin updates status and public response.
13. User sees the updated response.
14. Admin changes Windows release link.
15. Public download button reflects the new link.
16. Firestore unavailable fallback still provides GitHub release access.
17. Sign-out protects account and admin routes.
18. Reduced-motion mode disables decorative motion.

### 21.4 Cross-browser matrix

Desktop:

- latest stable Chrome;
- latest stable Edge;
- latest stable Firefox;
- latest stable Safari where available.

Mobile:

- Chrome on Android;
- Safari on iOS.

Linux:

- Firefox and Chromium on a representative desktop distribution.

### 21.5 Quality targets

Representative mobile Lighthouse targets:

- Performance: 90+
- Accessibility: 95+
- Best Practices: 95+
- SEO: 95+

Additional targets:

- zero critical axe violations;
- zero production console errors;
- no broken internal navigation;
- no broken primary GitHub links;
- no layout overflow at 320 px width;
- keyboard-only completion of every form;
- all loading states visible and understandable.

---

## 22. CI and Deployment

### 22.1 Pull-request CI

Run:

```text
npm ci
npm run lint
npm run typecheck
npm run test
npm run test:rules
npm run build
npm run free-tier:audit
npm run verify:links
```

Run Playwright on integration or release branches.

### 22.2 Firebase Hosting deployment

For the public open-source repository, use GitHub Actions with a Firebase service-account credential stored only in GitHub repository secrets.

Deployment workflow:

- preview channel for pull requests;
- production deployment from `main` after required checks;
- no Cloud Functions deployment step;
- no Cloud Storage deployment step;
- rules and indexes deployed only from approved workflow or explicit maintainer action.

### 22.3 Rollback

Maintain rollback capability for:

- Firebase Hosting releases;
- `publicConfig/main` through audit snapshots;
- Firestore Rules through version control;
- release configuration through previous valid values.

---

## 23. Extensibility Rules

The architecture must support future features without breaking the free version.

### 23.1 Feature-module rule

Every new feature should live under:

```text
src/features/<feature-name>/
```

It should contain its own:

- components;
- hooks;
- service functions;
- schemas;
- types;
- tests.

### 23.2 Service abstraction rule

UI components must not call Firebase SDK functions directly. They must use typed service modules.

This allows later replacement or extension of:

- Firebase data sources;
- GitHub integrations;
- authentication providers;
- analytics;
- search;
- notifications.

### 23.3 Configuration-driven content

Keep changeable operational values in Firestore or typed configuration, including:

- download links;
- versions;
- checksums;
- release notes links;
- maintenance message;
- supported package types.

Do not move all marketing copy into Firestore. Static content should remain version-controlled to avoid unnecessary reads and unreviewed content changes.

### 23.4 Database evolution

- Add fields backward-compatibly.
- Treat missing optional fields safely.
- Version major document schemas when necessary.
- Keep migration scripts in `scripts/migrations/`.
- Never perform automatic destructive migrations from the browser.

### 23.5 Future-feature cost review

Every proposed future feature must answer:

1. Does it require a paid Firebase product?
2. Does it increase Firestore reads per visitor?
3. Does it require secrets or server-side code?
4. Can it be implemented client-side safely?
5. Can GitHub provide the capability for free?
6. What happens when the free quota is exhausted?
7. Is there a static fallback?

No future feature may be merged until the free-tier guardian approves the answers.

### 23.6 Potential future features that remain free-compatible

- release history page;
- changelog viewer;
- additional administrators through local claim bootstrap;
- multiple release channels such as stable and beta;
- localization files;
- user notification preferences displayed in-app;
- public roadmap stored as reviewed static content;
- export feedback as JSON/CSV;
- GitHub discussion links;
- PWA installation;
- offline documentation;
- dark/light appearance toggle;
- additional OAuth providers with no per-use charge;
- client-side full-text search over bundled documentation.

### 23.7 Features requiring separate approval

- file attachments;
- automatic GitHub issue creation;
- transactional email;
- AI chat on the website;
- server-side rate limiting;
- scheduled jobs;
- webhooks;
- automatic release synchronization;
- large media hosting;
- advanced full-text search;
- push notifications;
- phone authentication.

These features may require a backend, additional quotas, or paid services and are outside version 1.

---

## 24. Acceptance Criteria

The project is ready for launch only when all of the following are true.

### Public website

- Modern SmartDM design is complete and responsive.
- Existing application screenshot is presented clearly.
- Animations are polished and reduced-motion compatible.
- Documentation is readable and accurate.
- GitHub star action is visible.
- Windows and Linux downloads are available.
- Every binary link resolves to GitHub Releases.
- Public site works with Firestore unavailable using fallback config.

### Authentication

- User sign-up works.
- User sign-in works.
- Google sign-in works.
- Email verification works.
- Password reset works.
- Unverified users cannot submit feedback.
- User passwords are never stored by the application.

### Feedback

- Bug and feature forms validate correctly.
- Submissions are stored in Firestore.
- Users can view only their own feedback.
- Users can see admin public responses.
- No attachments are accepted.
- Duplicate submission protection works.

### Administration

- Admin signs in using admin ID and password.
- Admin claim is required.
- Non-admin users cannot read admin data.
- Admin can view and filter reports.
- Admin can change status, priority, and public response.
- Admin can change GitHub download links and checksums.
- Admin changes appear on the public site.
- Admin actions create audit records.
- Admin session expires after inactivity.

### Security

- Firestore default deny is active.
- Rules tests pass.
- No service-account key is committed.
- No admin credential is present in source.
- No GitHub token is present in browser code.
- App Check is configured.
- External links use safe attributes.
- User text is never rendered as HTML.

### Free-tier compliance

- Project remains on Spark.
- No billing account is required.
- No Cloud Functions deployed.
- No Cloud Storage used.
- No phone auth used.
- No binary stored on Firebase Hosting.
- Free-tier audit passes in CI.
- Usage targets are documented and monitored.

---

## 25. Definition of Done

A task is done only when:

- code is implemented;
- types are correct;
- tests are added;
- accessibility is checked;
- error and loading states exist;
- security implications are reviewed;
- free-tier implications are reviewed;
- documentation is updated;
- no placeholder remains;
- handoff notes are complete;
- orchestrator accepts the work.

---

## 26. Agent Handoff Format

Every agent must create a handoff file under:

```text
docs/handoffs/agent-<number>-<task>.md
```

Required format:

```md
# Handoff

## Scope completed

## Files created or changed

## Contracts used

## Tests run

## Security considerations

## Free-tier considerations

## Known limitations

## Follow-up tasks

## Blockers

## Recommended merge order
```

Agents must not report completion when tests have not been run. They must state exactly what remains unverified.

---

## 27. Orchestrator Prompt

Use the following prompt when assigning this plan to a multi-agent AI system:

```text
You are the integration orchestrator for the SmartDM Firebase website.

Read plan.md completely before making changes.

Primary objective:
Implement a modern, animated SmartDM product website, authenticated user portal, Firestore feedback system, and protected administration panel. Deploy the result to Firebase Hosting while remaining fully compatible with the Firebase Spark plan and using GitHub Releases for all binary downloads.

Non-negotiable constraints:
- No Cloud Functions.
- No Cloud Storage.
- No phone authentication.
- No paid API or service.
- No binary files hosted in Firebase.
- No GitHub token in client code.
- No admin password or service-account key in source control.
- Firestore must deny access by default.
- Admin authorization must use Firebase custom claims.
- Admin login UI must accept only admin ID and password.
- Every download asset must use an approved GitHub Releases URL.
- The public website must retain a working static fallback when Firestore is unavailable.
- All motion must respect prefers-reduced-motion.

Execution rules:
1. Create PROJECT_STATUS.md and the dependency graph.
2. Freeze route, data, visual-token, and service contracts before parallel work.
3. Assign files so that no two active agents edit the same file.
4. Require each agent to produce a handoff document.
5. Integrate in the wave order specified in plan.md.
6. Run the free-tier audit in every integration cycle.
7. Run Firestore rules tests before accepting any data-access task.
8. Reject incomplete, insecure, or paid-service-dependent work.
9. Do not invent production GitHub links, Firebase IDs, checksums, or credentials.
10. Stop and record a blocker when a required production value is unknown.

The final release is approved only when every acceptance criterion and the Definition of Done in plan.md are satisfied.
```

---

## 28. Maintainer Values Required Before Production

The implementation agents must use placeholders only during development. Before deployment, the maintainer must supply:

```text
GitHub owner:
GitHub repository name:
Production Firebase project ID:
Production site domain:
Admin authentication email domain:
Initial admin ID:
Current SmartDM version:
Windows release asset URL:
Linux release asset URL or URLs:
SHA-256 for each asset:
Release notes URL:
License identifier:
Security contact method:
Privacy contact method:
```

Never guess these values.

---

## 29. Final Deployment Checklist

```text
[ ] Firebase project is on Spark.
[ ] No billing account is linked.
[ ] Email/password auth is enabled.
[ ] Google auth is enabled.
[ ] Authorized domains are correct.
[ ] Firestore database exists.
[ ] Firestore Rules are deployed.
[ ] Required indexes are deployed.
[ ] App Check is configured.
[ ] Admin user is bootstrapped locally.
[ ] Admin custom claim is verified.
[ ] publicConfig/main contains real release data.
[ ] All GitHub release links are tested.
[ ] All SHA-256 values are verified.
[ ] No binary files are in the website repository.
[ ] No service-account file is committed.
[ ] No secrets exist in the production bundle.
[ ] Free-tier audit passes.
[ ] Unit tests pass.
[ ] Rules tests pass.
[ ] End-to-end tests pass.
[ ] Accessibility audit passes.
[ ] Lighthouse targets pass.
[ ] Reduced-motion mode is tested.
[ ] Firestore-unavailable fallback is tested.
[ ] Admin session timeout is tested.
[ ] Download-link update is tested end to end.
[ ] Firebase Hosting production deployment succeeds.
[ ] Production smoke test succeeds.
[ ] Rollback procedure is documented and tested.
```

---

**Plan status:** Ready for multi-agent implementation after production repository details and initial release asset information are supplied.

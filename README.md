# Akiba Organization Portal

Organization frontend using Next.js App Router, React, strict TypeScript and CSS Modules. Read [AGENTS.md](AGENTS.md) and the [.agents rules](.agents/README.md) before contributing.

## Human-run commands

Run commands from `app/organization`. Install dependencies with npm ci when needed; do not mix package managers.

For the initial Prettier setup, run the following yourself to install the pinned formatter and update package-lock.json. The agent has not run an install or changed the lockfile dependency graph:

```sh
npm install --save-dev --save-exact prettier@3.10.1
npm run format
```

Then use the full verification sequence below. Review the formatting diff before committing; the first pass may normalize existing files.

```sh
npm run format:check
npm run lint
npm test
npm run build
```

Only start the development server when requested; dev is separate from verification. Check the frontend/API port and trusted-origin configuration before integration. The authentication unit suite uses Node's built-in test runner and TypeScript stripping (Node 22.18+). Prettier uses .prettierrc.json and .prettierignore. No third-party test runner or typecheck script is configured.

Start the frontend separately when needed:

```sh
npm run dev
```

## Organization authentication

### UI icons

All application UI glyphs use Hugeicons Stroke Rounded through the shared `Icon` component in
`src/components/shared/icon.tsx`. It maps existing semantic names to static named imports from
`@hugeicons/core-free-icons` and renders them with `@hugeicons/react`. Add new mappings there rather
than introducing another icon library, custom SVG paths or remote icon requests. Decorative icons
are hidden from assistive technology; icon-only controls keep their own accessible names. The
primitive owns `icon.module.css` and uses currentColor for the existing light theme.
Next's import optimization is configured for the free icon pack to limit barrel-import processing.

The manifest pins the renderer and free icon pack. Run `npm install` to update the lockfile before
verification or using `npm ci`. Installation, build and browser verification have not been run by
the agent. Follow `.agents/icons.md` for future icon changes.

### Route groups and application theme

Authentication UI pages and their shared route layout live under src/app/(auth). The login file is src/app/(auth)/login/page.tsx; its URL remains /login. The group layout renders the reusable AuthScreen presentation once, including while the page checks the session.

Protected organization pages live under src/app/(platform), whose layout requires a verified organization session. API handlers remain in src/app/api/auth. Route groups organize pages without changing URLs, and never replace backend permission checks.

Akiba uses a light-only theme with primary color #3E0F8D and the Outfit variable font, optimized through next/font. The root loads one Latin font family with swap behavior; browsers receive self-hosted font assets rather than a Google stylesheet. Build-time font retrieval still requires an available font download/cache.

globals.css centralizes the purple palette, semantic status colors, h1–h6 scale, spacing, font weights, radii, shadows, stacking layers, focus treatment and common element/accessibility defaults. Component-specific styles stay in each component's matching CSS Module. No operating-system dark-mode override or theme persistence is used. Forced-colors and reduced-motion accessibility remain supported.

localStorage and sessionStorage are prohibited for all application data, including tokens, profiles, permissions, drafts and preferences. No current application code uses either API. ESLint rejects direct globals and named property access/destructuring; do not bypass the policy with dynamic aliases or persistence libraries. Transient UI state stays in memory, session credentials stay in backend-managed HttpOnly cookies, and only the existing double-submit CSRF cookie is intentionally readable.

### Configuration and prerequisites

Copy `.env.local.example` to an untracked `.env.local` if it does not already exist. The example uses `http://localhost:4001` for the organization portal, `http://localhost:4000` for Platform Admin, and `http://localhost:3000` for the API. The frontend requires no database connection or authentication secret.

Both `npm run dev` and `npm run start` select port 4001 by default. Run `npm run build` before `npm run start`.

- `AKIBA_ORGANIZATION_PORTAL_ORIGIN` must match the exact origin opened in the browser and the API's organization portal configuration.
- AKIBA_API_ORIGIN is the server-only upstream origin and must match the API's accepted API_PUBLIC_ORIGIN authority. It must resolve to the API, not back to Next. Do not configure an arbitrary internal authority that the API rejects.
- In local HTTP development the API must use OWNER_AUTH_COOKIE_SECURE=false. HTTPS frontend origins require the API's secure cookie configuration. Production requires HTTPS for both origins and OWNER_AUTH_COOKIE_SECURE=true.
- .env.production.example contains deployment placeholders, not deployed hostnames. Provide verified values through the deployment environment.

### Organization invitation preview

`/invitations/accept` can verify a delivered invitation and display the organization name. Set
`AKIBA_ORGANIZATION_PORTAL_ORIGIN` to the exact origin serving this deployment and configure
`AKIBA_API_ORIGIN` for the API. The portal origin must match the destination generated by the
delivery service. For local preview using the API's fixed default portal origin, set
`AKIBA_ORGANIZATION_PORTAL_ORIGIN=http://localhost:4001` and run `npm run dev`.
Production requires an approved HTTPS portal origin.

The page clears the email link fragment from the address bar and sends the proof in a same-origin
POST when the recipient selects **Check invitation**. **Continue to setup** starts enrollment.
The recipient creates or confirms a password, enters the emailed code, and accepts the invitation.
Delivery still requires the API's reviewed production worker and public HTTPS portal.

### Sign-in and session isolation

The portal uses password plus email OTP for organization owners. The API must have the reviewed
organization OTP migration applied and `OWNER_AUTH_EMAIL_OTP_ENABLED=true`. The browser receives an
owner session only after verification. An account with no active owner membership in the selected
portal receives an account-not-found message and no email.

The portal checks verified owner sessions using `GET /api/v1/owner/auth/session` and revokes
them using `POST /api/v1/owner/auth/logout`. Only the `akiba-owner-session` and `akiba-owner-csrf`
cookies are forwarded, with the `__Host-` prefix on HTTPS. Logout uses the exact portal origin
and the owner CSRF header. Platform Admin cookies can be present across localhost ports, so
the portal filters them out regardless of port.

Run `npm run format:check && npm run lint && npm test && npm run build`. With a local portal
running, sign in to Admin and the organization portal in the same browser. Confirm each portal
keeps its own session and signing out of the organization does not sign out Admin. A second dev command for the
same checkout may exit while the original server continues to serve `http://localhost:4001`.

## Shared components

Import components directly from src/components/shared; no additional dependency is required.

Each styled component file imports its own same-name CSS Module. Components do not share module files; global CSS contains shared design tokens and application foundations. Reusable Field markup owns field.module.css while each consuming control owns its own control styles.

| Module       | Exports                 | Behavior                                                                                  |
| ------------ | ----------------------- | ----------------------------------------------------------------------------------------- |
| button.tsx   | Button                  | Icons, variants, sizes, full width, pending state and async click locking                 |
| form.tsx     | Form                    | FormData submission, synchronous duplicate gate, pending context and safe fallback errors |
| input.tsx    | Input                   | Native input types, leading icon, label, hint and error                                   |
| textarea.tsx | Textarea                | Resizable native textarea with leading icon                                               |
| select.tsx   | Select                  | Native single choice or a checkbox dropdown for multiple choices                          |
| checkbox.tsx | Checkbox                | Native checkbox with label, hint and error                                                |
| radio.tsx    | Radio, RadioGroup       | Native radio navigation and semantic fieldset grouping                                    |
| toast.tsx    | ToastProvider, useToast | Globally mounted top-center notifications                                                 |
| icon.tsx     | Icon                    | Lightweight decorative SVG icons; no remote icon requests                                 |

Inputs, textareas, selects and buttons have default icons and accept a custom decorative React node through icon. Provide unique, stable id values and visible labels for form controls. Native attributes such as required, disabled, autoComplete, minLength and maxLength remain available on inputs and textareas. Checkbox and Radio accept native input attributes and refs. Radio options in one group must share a name; add required to the Radio inputs when selection is mandatory. RadioGroup groups and describes them; it does not invent a validation policy.

### Form composition

This example consumes a caller-supplied saveAction. It does not invent an API endpoint or authorize any operation. The trusted server operation must validate input, permissions and CSRF as applicable.

```tsx
"use client";

import { Button } from "@/components/shared/button";
import { Checkbox } from "@/components/shared/checkbox";
import { Form } from "@/components/shared/form";
import { Icon } from "@/components/shared/icon";
import { Input } from "@/components/shared/input";
import { Radio, RadioGroup } from "@/components/shared/radio";
import { Select } from "@/components/shared/select";
import { Textarea } from "@/components/shared/textarea";
import { useToast } from "@/components/shared/toast";

export function ProfileForm({
  saveAction,
}: {
  saveAction: (data: FormData) => Promise<void>;
}) {
  const toast = useToast();

  return (
    <Form
      onSubmitAction={async (data) => {
        await saveAction(data);
        toast.success("Changes saved.");
      }}
    >
      <Input
        id="profile-name"
        name="name"
        label="Name"
        required
        autoComplete="name"
        maxLength={100}
        icon={<Icon name="user" />}
      />
      <Input
        id="profile-email"
        name="email"
        type="email"
        label="Email"
        required
        autoComplete="email"
      />
      <Select
        id="profile-language"
        name="language"
        label="Language"
        required
        options={[{ value: "en", label: "English" }]}
      />
      <Select
        id="profile-notifications"
        name="notifications"
        label="Notifications"
        multiple
        options={[
          { value: "security", label: "Security updates" },
          { value: "product", label: "Product updates" },
        ]}
      />
      <RadioGroup id="profile-summary" label="Summary frequency">
        <Radio
          id="summary-daily"
          name="summary"
          value="daily"
          label="Daily"
          required
        />
        <Radio
          id="summary-weekly"
          name="summary"
          value="weekly"
          label="Weekly"
          required
        />
      </RadioGroup>
      <Checkbox
        id="profile-tips"
        name="tips"
        value="yes"
        label="Send helpful tips"
      />
      <Textarea id="profile-notes" name="notes" label="Notes" maxLength={500} />
      <Button type="submit" loadingLabel="Saving…" icon={<Icon name="check" />}>
        Save changes
      </Button>
    </Form>
  );
}
```

Apply layout spacing in the consuming feature's CSS Module. The primitives do not impose a page layout.

### Buttons and duplicate submission

- Button defaults to type="button" to prevent accidental form submission. Use type="submit" explicitly.
- Form captures FormData, including the submitter, before changing pending UI. A ref blocks repeated submit events immediately, including Enter and rapid clicks. All shared submit buttons inside it become disabled and show their loading state until the returned promise settles.
- Standalone Button awaits a returned onClick promise and blocks further clicks while it runs. Return/await the actual operation; fire-and-forget work cannot be tracked. Do not combine an asynchronous submit-button onClick with a separate form operation: async click actions cancel native submission to avoid running both.
- For React form actions, Button also observes useFormStatus. Use Form for the explicit synchronous submit gate, or implement equivalent submission handling in the feature.
- pending allows a feature to supply an external loading state. Variants are primary, secondary, danger and ghost; sizes are sm, md and lg. fullWidth fills the parent.
- The three-bead orbit indicator reserves label space and respects reduced motion. No artificial delay or simulated success is added.
- Rejected operations show generic inline feedback. Optional onErrorAction (Form) or onActionError (Button) callbacks can map errors into additional safe UI; they must not throw or log raw secrets. Handle field errors in the feature and pass safe messages through each control's error prop.

These locks prevent overlapping browser interactions, not replay from other tabs or clients. The backend still needs authorization, rate limits and idempotency. A network timeout may leave an unknown result: check the authoritative outcome before retrying. Form requires JavaScript; its POST fallback avoids putting field values in a query string, but is not a progressive-enhancement endpoint.

### Select behavior

Single selection preserves native platform keyboard and mobile behavior. Use value/defaultValue as a string. Multiple selection uses multiple={true}, string arrays, a disclosure button and native checkboxes. Options must have unique, nonempty values. Labels are plain text. Pass disabled on unavailable options.

Both modes accept name, form, required, disabled, hint, error and onValueChange. Use either controlled value with a state-updating onValueChange, or uncontrolled defaultValue. A controlled owner must update its own state on form reset; uncontrolled selections reset to their defaults. Multiple values are standard repeated FormData entries: read them with data.getAll("notifications"). The native backing select supplies required validation and excludes disabled options from submission.

Use Enter/Space to toggle the multiple-choice dropdown, ArrowDown to open and focus its first enabled checkbox, Tab to move, and Space to check. Escape, Done, outside pointer interaction and focus leaving the component close it. No focus trap is imposed. Required validation moves focus to the visible trigger when it is the first invalid form control.

Options are supplied by the feature and should be bounded. This is not a remote-search or virtualized picker. Dropdowns render locally: avoid clipping them with overflow-hidden containers; a future modal/portal integration must explicitly handle positioning and focus.

### Toasts

ToastProvider is already mounted in the root layout. Client components call useToast:

```tsx
const toast = useToast();
toast.success("Changes saved."); // Only after confirmed server success.
toast.error("We couldn't load the page. Try again.");
toast.info("Your export is being prepared.");
toast.warning("Review these changes before continuing.");
const id = toast.show({
  title: "Update",
  message: "Settings saved.",
  tone: "success",
  duration: 8000,
});
toast.dismiss(id);
```

Toasts appear at the top center with a maximum stack of four. New entries replace the oldest entry that does not own keyboard focus. Non-error defaults last six seconds; errors remain until dismissal or stack eviction. Set duration: 0 for manual dismissal. Nonzero durations are bounded to 5–60 seconds and pause while hovered, keyboard-focused or the document is hidden. Close buttons and Escape support dismissal; live regions announce messages without moving focus.

Use short safe messages. React renders them as text, not HTML. Keep important errors inline as well: a toast may be replaced. Never pass backend exception strings, credentials, MFA codes or sensitive identity details to notifications. Do not show delivery, approval or security success before the server confirms it.

## Verification

The component implementation has not been browser-tested or built by the agent. Humans should run lint/build above and check:

- Rapid double-click and repeated Enter invoke a deferred form action once; loading clears after success or rejection.
- Standalone async buttons lock until settlement; synchronous controls still work normally.
- Native validation blocks submission; a required empty multiple select focuses its visible trigger.
- Multiple selections serialize with getAll, disabled values are excluded, and uncontrolled forms reset correctly.
- Single and multiple selects work with keyboard, outside click, Escape and long labels.
- Toasts stay top-center, support dismissal/pause, remain bounded and announce through assistive technology.
- Every control has a label, visible focus and useful disabled/error states at narrow widths, high zoom, with a dark operating-system preference (the application remains light) and with reduced motion.

The shared components need no additional runtime dependencies. Prettier is a development-only formatter. The native authentication-policy tests supplement the manual checks above; API integration and server-side guarantees remain the responsibility of the consuming feature and canonical backend.

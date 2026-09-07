# ClipForge email collection

English transactional emails with a flat charcoal background, restrained violet CTA and five outlined icons inspired by the supplied reference: clapperboard, play, lightning, folder and people. No glow, blur, gradients, glass panels, web fonts or tracking. Primary formatting is inline; mobile CSS progressively enhances the layout. Rounded corners can degrade gracefully in older Outlook versions.

Small PNG icons are hosted at `https://frontend-mu-flame-44.vercel.app/email-icons/`. Deploy `frontend/public/email-icons/` before activating these templates. The offline preview embeds local PNG copies for convenience; production templates use HTTPS image URLs, not data URIs or inline SVG. Icons are decorative and labels remain readable when an email client blocks images. The three-feature row appears only in signup and invitation emails; security emails stay focused on the account action. The sender avatar and mail-app toolbar in the reference image are not part of the HTML body and are not changed here.

## Preview and install

Open `preview.html` for desktop and mobile examples. These contain fake links and codes; **never paste the preview into Supabase**.

In Supabase → Authentication → Emails → Templates, open the matching template. Replace the entire Body / Source with the corresponding file from `ready/`, set the subject from `subjects.json`, preview, then save. Do not append to an existing HTML document.

| Supabase template | File | Subject |
| --- | --- | --- |
| Confirm sign up | `ready/confirm-sign-up.html` | Confirm your email — ClipForge |
| Invite user | `ready/invite-user.html` | You're invited to ClipForge |
| Magic link or OTP | `ready/magic-link.html` | Your sign-in link — ClipForge |
| Change email address | `ready/change-email.html` | Confirm your email change — ClipForge |
| Reset password | `ready/reset-password.html` | Reset your password — ClipForge |
| Reauthentication | `ready/reauthentication.html` | Your verification code — ClipForge |

Preserve `{{ .ConfirmationURL }}`, `{{ .NewEmail }}` and `{{ .Token }}` exactly. Reauthentication uses the code, not a confirmation button. Magic link uses the existing link-based login flow. No fixed expiry time is claimed because that depends on project settings.

These files do not change SMTP, auth URLs or security notification settings. Vercel deployment is needed only to publish the static icon assets; Render is unchanged. Copying templates into hosted Supabase is a separate step. Support mail goes to `clipforge160@gmail.com`; verify that mailbox is monitored before publishing. The design does not guarantee inbox placement or prevent email-client dark-mode recoloring.

## Rebuild and checks

From the repository root:

```sh
node scripts/build-email-icons.mjs
node scripts/build-emails.mjs
node scripts/build-emails.mjs --check
```

Edit `base.html` and `templates.json`, then rebuild. Files in `ready/` are generated copy/paste outputs. Test real delivered messages in Gmail mobile/desktop and Outlook before replacing every live template. Check signup, sign-in, reset, email-change and reauthentication flows with new messages, never old confirmation links. The local preview is a browser rendering, not an email-client compatibility test.

Supabase variable reference: https://supabase.com/docs/guides/auth/auth-email-templates

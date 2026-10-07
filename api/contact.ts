import { createContactHandler } from '../src/server/contact.js';

// Vercel deploys /api files independently of Astro's static pages.
// Node ESM resolves the emitted JavaScript path, including its extension.
// Read private values at function runtime, never in browser or build-time code.
const handleContact = createContactHandler({
    // Log only fixed stage/reason codes and HTTP status, without secrets or drafts.
    reportFailure: (failure) => console.error('[contact]', JSON.stringify(failure)),
    getConfig: () => ({
        turnstileSecret: process.env.TURNSTILE_SECRET,
        resendToken: process.env.RESEND_API_TOKEN,
        from: process.env.CONTACT_FROM_EMAIL,
        to: process.env.CONTACT_TO_EMAIL,
    }),
});

export default { fetch: handleContact };

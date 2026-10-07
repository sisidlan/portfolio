import { createContactHandler } from '../src/server/contact';

// Vercel deploys /api files independently of Astro's static pages.
// Read private values at function runtime, never in browser or build-time code.
const handleContact = createContactHandler({
    getConfig: () => ({
        turnstileSecret: process.env.TURNSTILE_SECRET,
        resendToken: process.env.RESEND_API_TOKEN,
        from: process.env.CONTACT_FROM_EMAIL,
        to: process.env.CONTACT_TO_EMAIL,
    }),
});

export default { fetch: handleContact };

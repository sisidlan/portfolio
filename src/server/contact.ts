import { createHash } from 'node:crypto';

const ALLOWED_ORIGINS = new Set(['https://kevindegraaf.com', 'https://www.kevindegraaf.com']);
const BODY_LIMIT = 64 * 1024;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 5;

type ContactConfig = {
    turnstileSecret?: string;
    resendToken?: string;
    from?: string;
    to?: string;
};

type Dependencies = {
    getConfig: () => ContactConfig;
    fetch?: typeof fetch;
    now?: () => number;
    reportFailure?: (failure: {
        stage: 'configuration' | 'turnstile' | 'resend';
        reason: string;
        status?: number;
    }) => void;
};

class InvalidBody extends Error {}
class OversizedBody extends Error {}

function result(status: number, message?: string, extraHeaders: Record<string, string> = {}) {
    return Response.json(message ? { ok: false, message } : { ok: true }, {
        status,
        headers: {
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            ...extraHeaders,
        },
    });
}

async function readFields(request: Request) {
    const type = request.headers.get('content-type')?.split(';', 1)[0].trim();
    if (type !== 'application/x-www-form-urlencoded') throw new InvalidBody();
    const declaredLength = Number(request.headers.get('content-length'));
    if (declaredLength > BODY_LIMIT) throw new OversizedBody();
    if (!request.body) throw new InvalidBody();

    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > BODY_LIMIT) {
                await reader.cancel();
                throw new OversizedBody();
            }
            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return new URLSearchParams(new TextDecoder('utf-8', { fatal: true }).decode(body));
}

function singleField(fields: URLSearchParams, name: string, max: number) {
    const values = fields.getAll(name);
    if (values.length !== 1 || values[0].length > max) throw new InvalidBody();
    const value = values[0].trim();
    if (!value || value.includes('\0')) throw new InvalidBody();
    return value;
}

function validEmail(value: string) {
    return (
        value.length <= 254 &&
        !/[\r\n]/.test(value) &&
        /^[^\s@<>(),;:"\\]+@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,63}$/.test(value)
    );
}

export function createContactHandler(dependencies: Dependencies) {
    const send = dependencies.fetch ?? fetch;
    const now = dependencies.now ?? Date.now;
    // A bounded, per-instance backstop. Configure the Vercel Firewall rule in
    // docs/contact-setup.md for throttling across serverless instances.
    const requests = new Map<string, { count: number; expires: number }>();

    return async (request: Request): Promise<Response> => {
        if (request.method !== 'POST') {
            return result(405, 'Use POST to submit a message.', { Allow: 'POST' });
        }
        const origin = request.headers.get('origin');
        if (!origin || !ALLOWED_ORIGINS.has(origin)) {
            return result(403, 'Submission not allowed.');
        }
        if (request.headers.get('sec-fetch-site') === 'cross-site') {
            return result(403, 'Submission not allowed.');
        }

        const config = dependencies.getConfig();
        if (
            !config.turnstileSecret ||
            !config.resendToken ||
            !config.from ||
            /[\r\n]/.test(config.from) ||
            !config.to ||
            !validEmail(config.to)
        ) {
            dependencies.reportFailure?.({
                stage: 'configuration',
                reason: 'missing_or_invalid_config',
            });
            return result(503, 'Messaging is temporarily unavailable.');
        }

        const time = now();
        for (const [key, entry] of requests) {
            if (entry.expires <= time) requests.delete(key);
        }
        // Vercel supplies x-vercel-forwarded-for. Do not rely on an arbitrary
        // client-supplied x-forwarded-for header as a security boundary.
        const ip = request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim();
        const key = createHash('sha256')
            .update(ip || 'unknown')
            .digest('hex');
        const entry = requests.get(key);
        if (entry && entry.count >= MAX_REQUESTS) {
            return result(429, 'Please wait before sending another message.', {
                'Retry-After': String(Math.ceil((entry.expires - time) / 1000)),
            });
        }
        if (!entry && requests.size >= 10_000) {
            return result(429, 'Please try again later.', { 'Retry-After': '60' });
        }
        requests.set(key, {
            count: (entry?.count ?? 0) + 1,
            expires: entry?.expires ?? time + WINDOW_MS,
        });

        let name: string;
        let email: string;
        let message: string;
        let token: string;
        try {
            const fields = await readFields(request);
            name = singleField(fields, 'name', 100);
            email = singleField(fields, 'email', 254);
            message = singleField(fields, 'message', 5000);
            token = singleField(fields, 'cf-turnstile-response', 2048);
            if (/[\u0000-\u001f\u007f]/.test(name) || !validEmail(email)) {
                throw new InvalidBody();
            }
        } catch (error) {
            if (error instanceof OversizedBody) return result(413, 'Message is too large.');
            return result(400, 'Check your fields and complete the security verification.');
        }

        // Fail closed on outages, invalid/replayed tokens, wrong hostnames,
        // and tokens generated by widgets used for a different action.
        try {
            const verification = await send(
                'https://challenges.cloudflare.com/turnstile/v0/siteverify',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ secret: config.turnstileSecret, response: token }),
                    signal: AbortSignal.timeout(5000),
                },
            );
            if (!verification.ok) {
                dependencies.reportFailure?.({
                    stage: 'turnstile',
                    reason: 'provider_rejected',
                    status: verification.status,
                });
                return result(503, 'Security verification is unavailable.');
            }
            const verified = (await verification.json()) as {
                success?: boolean;
                hostname?: string;
                action?: string;
            };
            if (
                verified.success !== true ||
                verified.hostname !== new URL(origin).hostname ||
                verified.action !== 'contact'
            ) {
                dependencies.reportFailure?.({
                    stage: 'turnstile',
                    reason:
                        verified.success !== true
                            ? 'invalid_token'
                            : verified.hostname !== new URL(origin).hostname
                              ? 'hostname_mismatch'
                              : 'action_mismatch',
                });
                return result(403, 'Security verification failed. Please try again.');
            }
        } catch {
            dependencies.reportFailure?.({ stage: 'turnstile', reason: 'provider_unavailable' });
            return result(503, 'Security verification is unavailable.');
        }

        try {
            const response = await send('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${config.resendToken}`,
                    'Content-Type': 'application/json',
                    // Reusing the same token cannot create duplicate emails.
                    'Idempotency-Key': `contact-${createHash('sha256').update(token).digest('hex')}`,
                },
                body: JSON.stringify({
                    from: config.from,
                    to: [config.to],
                    reply_to: email,
                    subject: 'New portfolio contact message',
                    // Plain text keeps visitor-supplied markup out of HTML.
                    text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
                }),
                signal: AbortSignal.timeout(7000),
            });
            if (!response.ok) {
                dependencies.reportFailure?.({
                    stage: 'resend',
                    reason: 'provider_rejected',
                    status: response.status,
                });
                return result(502, 'Unable to send message. Please try again later.');
            }
            const accepted = (await response.json()) as { id?: string };
            if (!accepted.id) {
                dependencies.reportFailure?.({
                    stage: 'resend',
                    reason: 'invalid_provider_response',
                });
                return result(502, 'Unable to send message. Please try again later.');
            }
            return result(200);
        } catch {
            dependencies.reportFailure?.({ stage: 'resend', reason: 'provider_unavailable' });
            // Do not automatically retry: the provider may have accepted mail
            // even if the response was lost. Never log credentials or drafts.
            return result(502, 'Unable to send message. Please try again later.');
        }
    };
}

import { expect, test } from '@playwright/test';
import { createContactHandler } from '../src/server/contact';

const config = {
    turnstileSecret: 'test-private-turnstile-credential',
    resendToken: 'test-private-resend-credential',
    from: 'Kevin de Graaf <contact@contact.kevindegraaf.com>',
    to: 'kdegraaf97@icloud.com',
};

function submission(values: Record<string, string> = {}, headers: Record<string, string> = {}) {
    return new Request('https://www.kevindegraaf.com/api/contact/', {
        method: 'POST',
        headers: {
            Origin: 'https://www.kevindegraaf.com',
            'Content-Type': 'application/x-www-form-urlencoded',
            'x-vercel-forwarded-for': '192.0.2.1',
            ...headers,
        },
        body: new URLSearchParams({
            name: 'Visitor',
            email: 'visitor@example.com',
            message: 'Hello <script>alert(1)</script> & friends!',
            'cf-turnstile-response': 'fresh-token',
            ...values,
        }),
    });
}

function backend(
    options: {
        verification?: Record<string, unknown>;
        verificationStatus?: number;
        mailStatus?: number;
        unavailable?: boolean;
        now?: () => number;
    } = {},
) {
    const calls: { url: string; init: RequestInit }[] = [];
    const handler = createContactHandler({
        getConfig: () => config,
        now: options.now,
        fetch: async (url, init) => {
            calls.push({ url: String(url), init: init! });
            if (options.unavailable) throw new Error('Private provider details');
            if (String(url).includes('siteverify')) {
                return Response.json(
                    options.verification ?? {
                        success: true,
                        hostname: 'www.kevindegraaf.com',
                        action: 'contact',
                    },
                    { status: options.verificationStatus ?? 200 },
                );
            }
            return Response.json({ id: 'accepted-message' }, { status: options.mailStatus ?? 200 });
        },
    });
    return { handler, calls };
}

test('verified submissions send plain text to the configured recipient with visitor Reply-To', async () => {
    const { handler, calls } = backend();
    const response = await handler(
        submission({ to: 'attacker@example.com', from: 'attacker@example.com' }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(calls).toHaveLength(2);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
        secret: config.turnstileSecret,
        response: 'fresh-token',
    });
    expect(JSON.parse(String(calls[1].init.body))).toEqual({
        from: config.from,
        to: [config.to],
        reply_to: 'visitor@example.com',
        subject: 'New portfolio contact message',
        text: 'Name: Visitor\nEmail: visitor@example.com\n\nHello <script>alert(1)</script> & friends!',
    });
    const mailHeaders = calls[1].init.headers as Record<string, string>;
    expect(mailHeaders.Authorization).toBe(`Bearer ${config.resendToken}`);
    expect(mailHeaders['Idempotency-Key']).toMatch(/^contact-[a-f0-9]{64}$/);
});

for (const verification of [
    { success: false, 'error-codes': ['timeout-or-duplicate'] },
    { success: true, hostname: 'attacker.example', action: 'contact' },
    { success: true, hostname: 'www.kevindegraaf.com', action: 'login' },
    { success: true },
]) {
    test(`rejects untrusted verification ${JSON.stringify(verification)}`, async () => {
        const { handler, calls } = backend({ verification });
        expect((await handler(submission())).status).toBe(403);
        expect(calls).toHaveLength(1);
    });
}

test('does not contact providers for missing or foreign browser origins and non-POST requests', async () => {
    const { handler, calls } = backend();
    expect((await handler(submission({}, { Origin: 'https://attacker.example' }))).status).toBe(
        403,
    );
    const missingOrigin = submission();
    missingOrigin.headers.delete('origin');
    expect((await handler(missingOrigin)).status).toBe(403);
    expect((await handler(submission({}, { 'Sec-Fetch-Site': 'cross-site' }))).status).toBe(403);
    const response = await handler(new Request('https://www.kevindegraaf.com/api/contact/'));
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    expect(calls).toEqual([]);
});

const invalidFields: Record<string, string>[] = [
    { name: ' ' },
    { name: 'Visitor\r\nBcc: attacker@example.com' },
    { email: 'visitor@example.com\r\nBcc: attacker@example.com' },
    { email: 'invalid' },
    { message: 'x'.repeat(5001) },
    { 'cf-turnstile-response': '' },
    { 'cf-turnstile-response': 'x'.repeat(2049) },
];

for (const values of invalidFields) {
    test(`rejects invalid ${Object.keys(values)[0]} before provider calls (${Object.values(values)[0].length} characters)`, async () => {
        const { handler, calls } = backend();
        expect((await handler(submission(values))).status).toBe(400);
        expect(calls).toEqual([]);
    });
}

test('rejects duplicate fields, unsupported bodies, and oversized bodies even without Content-Length', async () => {
    const { handler, calls } = backend();
    const original = submission();
    const fields = new URLSearchParams(await original.text());
    fields.append('email', 'attacker@example.com');
    expect(
        (
            await handler(
                new Request(original.url, {
                    method: 'POST',
                    headers: original.headers,
                    body: fields,
                }),
            )
        ).status,
    ).toBe(400);
    expect((await handler(submission({}, { 'Content-Type': 'application/json' }))).status).toBe(
        400,
    );
    expect((await handler(submission({ message: 'x'.repeat(70_000) }))).status).toBe(413);
    expect(calls).toEqual([]);
});

test('missing server credentials fail closed without exposing private values', async () => {
    const handler = createContactHandler({ getConfig: () => ({ ...config, resendToken: '' }) });
    const response = await handler(submission());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(config.turnstileSecret);
});

test('provider outages and rejected mail never report success or disclose provider details', async () => {
    for (const options of [
        { unavailable: true },
        { verificationStatus: 503 },
        { mailStatus: 422 },
    ]) {
        const { handler, calls } = backend(options);
        const response = await handler(submission());
        expect(response.status).toBe(options.mailStatus ? 502 : 503);
        const body = await response.text();
        expect(body).not.toContain(config.turnstileSecret);
        expect(body).not.toContain(config.resendToken);
        expect(body).not.toContain('Private provider details');
        expect(calls).toHaveLength(options.mailStatus ? 2 : 1);
    }
});

test('per-instance throttling blocks repeated submissions and expires after ten minutes', async () => {
    let time = 1000;
    const { handler, calls } = backend({ now: () => time });
    for (let i = 0; i < 5; i++) {
        expect((await handler(submission({ 'cf-turnstile-response': `token-${i}` }))).status).toBe(
            200,
        );
    }
    const throttled = await handler(submission());
    expect(throttled.status).toBe(429);
    expect(throttled.headers.get('retry-after')).toBe('600');
    expect(calls).toHaveLength(10);
    time += 600_000;
    expect((await handler(submission())).status).toBe(200);
});

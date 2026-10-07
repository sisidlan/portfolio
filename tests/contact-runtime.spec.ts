import { expect, test } from '@playwright/test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

test('the compiled Vercel entry point starts in native Node ESM', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'contact-runtime-'));
    try {
        await writeFile(join(directory, 'package.json'), '{"type":"module"}');
        for (const source of ['api/contact.ts', 'src/server/contact.ts']) {
            const destination = join(directory, source.replace(/\.ts$/, '.js'));
            await mkdir(join(destination, '..'), { recursive: true });
            const compiled = ts.transpileModule(await readFile(source, 'utf8'), {
                compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
            });
            await writeFile(destination, compiled.outputText);
        }
        const output = execFileSync(
            process.execPath,
            [
                '--input-type=module',
                '-e',
                "import handler from './api/contact.js'; const response = await handler.fetch(new Request('https://www.kevindegraaf.com/api/contact/')); process.stdout.write(String(response.status));",
            ],
            { cwd: directory, encoding: 'utf8' },
        );
        expect(output.trim()).toBe('405');
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

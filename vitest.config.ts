import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
    resolve: {
        alias: {
            '@shared': path.resolve(__dirname, 'src/shared'),
            vscode: path.resolve(__dirname, 'test/mocks/vscode.ts')
        }
    },
    test: {
        include: ['test/**/*.test.ts'],
        environment: 'node'
    }
});

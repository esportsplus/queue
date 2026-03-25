import { defineConfig } from 'vitest/config';


export default defineConfig({
    test: {
        coverage: {
            exclude: ['build/**', 'node_modules/**', 'tests/**'],
            provider: 'v8',
            reporter: ['text', 'html'],
            thresholds: {
                branches: 80,
                functions: 80,
                lines: 80,
                statements: 80
            }
        },
        globals: false,
        include: ['tests/**/*.ts']
    }
});

import js from '@eslint/js';
import nxPlugin from '@nx/eslint-plugin';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**']
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    plugins: {
      '@nx': nxPlugin
    }
  },
  {
    languageOptions: {
      parserOptions: {
        project: [
          './apps/backend/tsconfig.app.json',
          './packages/contracts/tsconfig.lib.json',
          './packages/llm/tsconfig.lib.json'
        ],
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          fixStyle: 'inline-type-imports'
        }
      ]
    }
  },
  {
    files: ['apps/**/*.{ts,tsx,js,jsx}', 'packages/**/*.{ts,tsx,js,jsx}'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          allow: [],
          enforceBuildableLibDependency: true,
          depConstraints: [
            {
              sourceTag: 'type:app',
              onlyDependOnLibsWithTags: ['type:boundary']
            },
            {
              sourceTag: 'type:boundary',
              onlyDependOnLibsWithTags: ['type:boundary']
            }
          ]
        }
      ]
    }
  },
  {
    files: ['apps/backend/src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='sql'][callee.property.name='raw']",
          message: 'Raw SQL construction is forbidden; use parameterized sql templates.'
        }
      ]
    }
  },
  {
    files: ['apps/**/*.tsx', 'apps/**/*.jsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='className'] Literal[value=/\\b(bg|text|p|m|flex|grid|rounded|border)-/]",
          message: 'Tailwind utility classes are allowed only in packages/ui.'
        }
      ]
    }
  },
  {
    files: ['tools/**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly'
      }
    }
  }
);

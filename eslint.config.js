// @ts-check
const eslint = require('@eslint/js');
const { defineConfig, globalIgnores } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const prettier = require('eslint-plugin-prettier/recommended');

module.exports = defineConfig([
  globalIgnores(['dist/**', 'out-tsc/**', '.angular/**', 'coverage/**']),
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],

      // Angular v22+ conventions from .claude/CLAUDE.md.
      '@angular-eslint/prefer-standalone': 'error',
      '@angular-eslint/prefer-signals': 'error',
      '@angular-eslint/prefer-signal-model': 'error',
      '@angular-eslint/prefer-output-emitter-ref': 'error',
      '@angular-eslint/prefer-output-readonly': 'error',
      '@angular-eslint/prefer-inject': 'error',
      '@angular-eslint/prefer-service-decorator': 'error',
      // Host bindings belong in the `host` object, not @HostBinding/@HostListener.
      '@angular-eslint/prefer-host-metadata-property': 'error',
      '@angular-eslint/no-attribute-decorator': 'error',
      '@angular-eslint/no-uncalled-signals': 'error',
      '@angular-eslint/use-lifecycle-interface': 'error',
      '@angular-eslint/no-async-lifecycle-method': 'error',
      // NOT enabled: prefer-on-push-component-change-detection. OnPush is the
      // default in v22+ and CLAUDE.md forbids setting it explicitly.

      'no-restricted-syntax': [
        'error',
        {
          selector:
            'Decorator[expression.callee.name=/^(Component|Directive)$/] Property[key.name="standalone"]',
          message: 'standalone is the default in Angular v22+; remove the property.',
        },
        {
          selector:
            'Decorator[expression.callee.name=/^(Component|Directive)$/] Property[key.name="changeDetection"]',
          message: 'OnPush is the default in Angular v22+; remove the property.',
        },
      ],
      // Standalone components must import these to use them, so banning the
      // import is an effective way to ban ngClass/ngStyle.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@angular/common',
              importNames: ['NgClass', 'NgStyle'],
              message: 'Use [class.x] and [style.x] bindings instead.',
            },
          ],
        },
      ],

      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Specs get the same rules, minus the ones that fight with test ergonomics.
    files: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {
      '@angular-eslint/template/prefer-control-flow': 'error',
      '@angular-eslint/template/prefer-class-binding': 'error',
      '@angular-eslint/template/prefer-ngsrc': 'error',
      '@angular-eslint/template/prefer-self-closing-tags': 'error',
      '@angular-eslint/template/prefer-at-empty': 'error',
      '@angular-eslint/template/no-inline-styles': 'error',
      '@angular-eslint/template/button-has-type': 'error',
      '@angular-eslint/template/no-positive-tabindex': 'error',
      '@angular-eslint/template/no-autofocus': 'error',
      '@angular-eslint/template/require-switch-default': 'error',
      '@angular-eslint/template/valid-aria': 'error',
      '@angular-eslint/template/role-has-required-aria': 'error',
    },
  },
  // Prettier last so formatting rules win every conflict.
  prettier,
]);

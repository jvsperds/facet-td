import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Determinism (docs/PLAN.md, Multiplayer): the sim may only use basic arithmetic and the seeded RNG.
const banned = [
  'random',
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'pow',
  'exp',
  'log',
  'log2',
  'log10',
  'sinh',
  'cosh',
  'tanh',
  'cbrt',
  'hypot',
  'expm1',
  'log1p',
];

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'tools', '.claude'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/sim/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...banned.map((property) => ({
          object: 'Math',
          property,
          message: 'Not deterministic across engines; see docs/PLAN.md.',
        })),
        { object: 'Date', property: 'now', message: 'No wall clock in the sim.' },
        { object: 'performance', property: 'now', message: 'No wall clock in the sim.' },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date']", message: 'No wall clock in the sim.' },
      ],
      'no-restricted-imports': [
        'error',
        { patterns: ['three', 'preact', '@preact/*', '*/world/*', '*/hud/*'] },
      ],
    },
  },
);

import next from "eslint-config-next";

// Next.js 16 ships a native ESLint flat config (core-web-vitals + typescript),
// so we spread it directly. FlatCompat / @eslint/eslintrc must NOT be used here:
// pairing it with Next 16's flat config crashes the config validator
// ("Converting circular structure to JSON").
const eslintConfig = [
  ...next,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "drizzle/**",
      "next-env.d.ts",
      "coverage/**",
    ],
  },
];

export default eslintConfig;

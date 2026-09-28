import js from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/.expo/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "apps/mobile/**",
      "pnpm-lock.yaml",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["apps/api/**/*.ts"],
    languageOptions: { globals: { ...globals.node } },
    rules: { "no-undef": "off" },
  },
  {
    files: ["apps/landing/**/*.mjs"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ["**/*.{js,mjs,ts,tsx}"],
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  prettier,
];

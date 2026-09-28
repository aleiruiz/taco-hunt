import js from "@eslint/js";
import expo from "eslint-config-expo/flat.js";
import prettier from "eslint-config-prettier/flat";
import globals from "globals";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/.expo/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "pnpm-lock.yaml",
    ],
  },
  js.configs.recommended,
  ...expo,
  {
    files: ["apps/api/**/*.ts"],
    languageOptions: { globals: { ...globals.node } },
    rules: { "no-undef": "off" },
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

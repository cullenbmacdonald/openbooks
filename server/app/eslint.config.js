// @ts-check
import js from "@eslint/js";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist", "node_modules", "playwright-report", "test-results"]
  },
  {
    // Applies to every linted file, including this config file itself.
    // "detect" requires resolving the installed react package at lint
    // time, which doesn't reliably happen for the flat-config recommended
    // preset here. Pin explicitly; bump alongside the React version during
    // the dependency upgrade.
    settings: {
      react: {
        version: "18.2.0"
      }
    }
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactPlugin.configs.flat.recommended,
  reactPlugin.configs.flat["jsx-runtime"],
  jsxA11y.flatConfigs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks
    },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2021
      }
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // --- Pragmatic exceptions for the pre-upgrade codebase ---
      //
      // This lint setup is NEW (added as part of the dependency-upgrade
      // safety net) and the existing `server/app/src` code predates it.
      // `npm run lint` runs with --max-warnings=0, so any rule that fires on
      // existing code must be turned off here rather than left as "warn".
      // These are intentionally disabled ONLY because the current code
      // trips them; they are good rules and should be re-enabled (and the
      // flagged code fixed) opportunistically as files are touched during
      // the Mantine/React/RTK upgrade. Do not add NEW violations of these.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "react/prop-types": "off",
      "jsx-a11y/click-events-have-key-events": "off",
      "jsx-a11y/no-static-element-interactions": "off",
      "jsx-a11y/no-noninteractive-tabindex": "off",
      "react-hooks/exhaustive-deps": "off",

      // --- Mechanical style rules with pre-existing violations ---
      // `no-var` / `prefer-const` / `no-empty` are cheap, logic-preserving
      // fixes (var->const/let, drop an empty catch body). Left as errors;
      // existing violations were fixed alongside this config (see commit).
      "no-empty": ["error", { allowEmptyCatch: true }]
    }
  },
  {
    files: ["**/*.config.{js,ts}", "playwright/**/*.ts", "e2e/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  {
    files: ["**/*.test.{ts,tsx}", "src/test/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.vitest
      }
    }
  }
);

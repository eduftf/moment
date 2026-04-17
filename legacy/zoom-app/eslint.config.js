import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: ["dist"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Common pattern: sync ref.current with latest callback during render
      "react-hooks/refs": "off",
      // Syncing state from external sources in effects is valid
      "react-hooks/set-state-in-effect": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      // SDK try/catch blocks intentionally swallow errors
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
);

import prettierConfig from "eslint-config-prettier";

export default [
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        // GJS/GNOME Shell globals
        imports: "readonly",
        global: "readonly",
        log: "readonly",
        logError: "readonly",
        print: "readonly",
        printerr: "readonly",
        // Node.js built-ins not available in GJS
        console: "off",
      },
    },
    rules: {
      // Core JavaScript best practices
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "prefer-const": "error",
      "no-var": "error",
      "eqeqeq": ["error", "always"],

      // GJS-specific: allow logError instead of console
      "no-console": "off",

      // Modern JavaScript
      "prefer-arrow-callback": "error",
      "prefer-template": "error",
      "object-shorthand": "error",
      "no-useless-constructor": "error",

      // Code quality
      "no-duplicate-imports": "error",
      "no-unreachable": "error",
      "no-constant-condition": "error",
    },
  },

  // Prettier config (must be last to override formatting rules)
  prettierConfig,
];

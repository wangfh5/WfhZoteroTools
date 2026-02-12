// @ts-check Let TS check this config file

import zotero from "@zotero-plugin/eslint-config";

export default [
  // Ignore external skill documentation
  {
    ignores: [".cursor/skills/**"],
  },

  // Zotero plugin configuration
  ...zotero({
    overrides: [
      {
        files: ["**/*.ts"],
        rules: {
          // We disable this rule here because the template
          // contains some unused examples and variables
          "@typescript-eslint/no-unused-vars": "off",
        },
      },
    ],
  }),

  // Node.js scripts (CommonJS)
  {
    files: ["scripts/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        // Node.js globals
        require: "readonly",
        module: "readonly",
        process: "readonly",
        console: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
        // Browser automation globals (Puppeteer injected)
        document: "readonly",
        window: "readonly",
        navigator: "readonly",
      },
    },
    rules: {
      // Relax some rules for scripts
      "no-console": "off",
      "no-unused-vars": "warn",
    },
  },

  // Cursor hooks (ES modules)
  {
    files: [".cursor/hooks/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        // Node.js globals
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
      },
    },
    rules: {
      "no-console": "off",
      "no-unused-vars": "warn",
    },
  },
];

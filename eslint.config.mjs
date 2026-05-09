import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "dashboard/.next/**",
      "dashboard/convex/_generated/**",
      "**/*.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        console: "readonly",
        fetch: "readonly",
        Request: "readonly",
        Response: "readonly",
        Headers: "readonly",
        URL: "readonly",
        WebSocket: "readonly",
        WebSocketPair: "readonly",
        MessageBatch: "readonly",
        Queue: "readonly",
        DurableObjectNamespace: "readonly",
        DurableObjectState: "readonly",
        R2Bucket: "readonly",
        KVNamespace: "readonly",
        VectorizeIndex: "readonly",
        ExportedHandler: "readonly",
        process: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        globalThis: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["scripts/**/*.{js,mjs}"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];

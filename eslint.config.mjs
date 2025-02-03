import globals from "globals";
import pluginJs from "@eslint/js";


/** @type {import('eslint').Linter.Config[]} */
export default [
  {files: ["**/*.js"], languageOptions: {sourceType: "commonjs"}},
  {files: ["**/*.test.js"], languageOptions: { globals: globals.jest }},
  {languageOptions: { globals: globals.browser }},
  pluginJs.configs.recommended,
];
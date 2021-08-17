module.exports = {
  parser: "@typescript-eslint/parser",
  extends: [
    "plugin:@typescript-eslint/recommended",
    "standard",
  ],
  env: {
    mocha: true,
  },
  plugins: [
    "@typescript-eslint",
  ],
  rules: {
    "comma-dangle": [2, "always-multiline"],
    "no-eval": 2,
    "no-proto": 2,
    "no-unused-vars": 1,
    "prefer-const": 0,
    camelcase: 0,
    quotes: [2, "double"],
  },
}

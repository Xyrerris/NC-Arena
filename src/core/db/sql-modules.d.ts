/**
 * drizzle-kit's `driver: 'expo'` output imports the generated `.sql` files directly, and
 * `babel-plugin-inline-import` (see babel.config.js) turns each one into a string at build
 * time. TypeScript needs to be told the same thing.
 */
declare module '*.sql' {
  const statements: string;
  export default statements;
}

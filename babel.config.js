/**
 * Added in Phase 2 for one reason: drizzle-kit's `driver: 'expo'` output imports the
 * generated migration `.sql` files, and `inline-import` is what turns each one into a
 * string literal at build time. Without it the migrations bundle does not resolve and
 * `useMigrations` has nothing to run.
 *
 * `babel-preset-expo` is the SDK 57 default and is stated explicitly here because the
 * file now exists — declaring the config does not mean opting out of the template.
 */
module.exports = (api) => {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};

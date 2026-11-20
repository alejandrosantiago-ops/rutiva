module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      // `nativewind/babel` ya registra el plugin de Reanimated/Worklets,
      // por eso se desactiva aquí para no aplicarlo dos veces.
      ['babel-preset-expo', { jsxImportSource: 'nativewind', reanimated: false, worklets: false }],
      'nativewind/babel',
    ],
  };
};

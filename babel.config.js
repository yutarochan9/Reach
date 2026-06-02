module.exports = function (api) {
  // Jest 実行時は軽量な汎用プリセットを使う
  // expo export / Metro バンドル時は babel-preset-expo を使う（require.context 変換に必須）
  if (api.env('test')) {
    api.cache(false)
    return {
      presets: [
        ['@babel/preset-env', { targets: { node: 'current' } }],
        '@babel/preset-typescript',
        ['@babel/preset-react', { runtime: 'automatic' }],
      ],
    }
  }

  api.cache(true)
  return {
    // unstable_transformProfile: 'hermes-v0' を強制することで
    // babel-preset-expo が hermes-v1（プライベートフィールド変換なし）ではなく
    // hermes-v0（プライベートフィールドを Babel でトランスパイル）を使うようにする。
    // hermesc 0.12 はプライベートクラスフィールド(#x など)をコンパイルできないため必須。
    presets: [['babel-preset-expo', { unstable_transformProfile: 'hermes-v0' }]],
  }
}

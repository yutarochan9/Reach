const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const config = getDefaultConfig(__dirname)

// Hermes 0.12 はプライベートクラスフィールド(#x など)をコンパイルできない。
// 以下の2つのモジュールを問題なくバンドルできるよう resolveRequest で置き換える。
//
//   1. @napi-rs/canvas       → サーバー専用（OGP生成スクリプト用）。空モジュールに差し替え。
//   2. react-native の DOMRectReadOnly.js → プライベートフィールドを使うため
//                              アンダースコアプロパティに書き換えたパッチ版にリダイレクト。

const EMPTY_MODULE = path.join(__dirname, 'patches', 'empty.js')
const DOM_RECT_PATCH = path.join(__dirname, 'patches', 'DOMRectReadOnly.js')

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // @napi-rs/canvas を空モジュールに差し替え
  if (
    moduleName === '@napi-rs/canvas' ||
    moduleName.startsWith('@napi-rs/canvas/')
  ) {
    return { type: 'sourceFile', filePath: EMPTY_MODULE }
  }

  // react-native の DOMRectReadOnly をパッチ版に差し替え
  if (
    moduleName.includes('DOMRectReadOnly') &&
    context.originModulePath.includes('react-native')
  ) {
    return { type: 'sourceFile', filePath: DOM_RECT_PATCH }
  }

  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config

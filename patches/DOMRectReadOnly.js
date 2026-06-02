/**
 * Hermes 0.12 はプライベートクラスフィールド(#x など)を hermesc でコンパイルできない。
 * そのため react-native の DOMRectReadOnly.js をアンダースコアプロパティに書き換えた
 * パッチ版。metro.config.js の resolveRequest でこのファイルにリダイレクトしている。
 */

function castToNumber(value) {
  return value ? Number(value) : 0;
}

export default class DOMRectReadOnly {
  constructor(x, y, width, height) {
    this.__x = castToNumber(x);
    this.__y = castToNumber(y);
    this.__width = castToNumber(width);
    this.__height = castToNumber(height);
  }

  get x() { return this.__x; }
  get y() { return this.__y; }
  get width() { return this.__width; }
  get height() { return this.__height; }

  get top() {
    return this.__height < 0 ? this.__y + this.__height : this.__y;
  }
  get right() {
    return this.__width < 0 ? this.__x : this.__x + this.__width;
  }
  get bottom() {
    return this.__height < 0 ? this.__y : this.__y + this.__height;
  }
  get left() {
    return this.__width < 0 ? this.__x + this.__width : this.__x;
  }

  toJSON() {
    const { x, y, width, height, top, left, bottom, right } = this;
    return { x, y, width, height, top, left, bottom, right };
  }

  static fromRect(rect) {
    if (!rect) return new DOMRectReadOnly();
    return new DOMRectReadOnly(rect.x, rect.y, rect.width, rect.height);
  }

  __getInternalX()      { return this.__x; }
  __getInternalY()      { return this.__y; }
  __getInternalWidth()  { return this.__width; }
  __getInternalHeight() { return this.__height; }

  __setInternalX(x)      { this.__x = castToNumber(x); }
  __setInternalY(y)      { this.__y = castToNumber(y); }
  __setInternalWidth(w)  { this.__width = castToNumber(w); }
  __setInternalHeight(h) { this.__height = castToNumber(h); }
}

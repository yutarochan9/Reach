module.exports = {
  Platform: { OS: 'web', select: (obj) => obj.web ?? obj.default },
  Alert: { alert: jest.fn() },
  Linking: { openURL: jest.fn() },
}

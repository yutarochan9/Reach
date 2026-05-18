// Flags to prevent _layout.tsx from reacting to intermediate auth events during 2FA flow
export const authFlags = {
  skipNextSignedIn: false,
  skipNextSignedOut: false,
}

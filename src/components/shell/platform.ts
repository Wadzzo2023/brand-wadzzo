/**
 * This portal's platform: its name and the other apps the sidebar links to (the AR app, the fan
 * marketplace, and the phone app's store pages; a missing store page hides its button).
 */
export const platformBranding = {
  name: "Wadzzo",
  urls: {
    arWeb: "https://web.wadzzo.com",
    fanApp: "https://app.wadzzo.com",
    appStore: "https://apps.apple.com/us/app/wadzzo/id1639649037" as string | undefined,
    playStore: undefined as string | undefined,
  },
};

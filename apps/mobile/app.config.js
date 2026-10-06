const appJson = require("./app.json");

module.exports = () => ({
  ...appJson.expo,
  android: {
    package: "com.aleiruiz.tacohunt",
    // Brand marker on the theme's cream (colors.cream); sources in assets/*.svg.
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#FBF3E6",
    },
  },
  ios: {
    ...(appJson.expo.ios ?? {}),
    bundleIdentifier: "com.aleiruiz.tacohunt",
    infoPlist: {
      ...(appJson.expo.ios?.infoPlist ?? {}),
      LSApplicationQueriesSchemes: ["comgooglemaps", "maps"],
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  plugins: [
    ...appJson.expo.plugins,
    "./plugins/withAndroidCxxShared",
    [
      "react-native-maps",
      {
        androidGoogleMapsApiKey: process.env.ANDROID_MAPS_API_KEY,
        iosGoogleMapsApiKey: process.env.IOS_MAPS_API_KEY,
      },
    ],
  ],
});

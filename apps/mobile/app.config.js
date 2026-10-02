const appJson = require("./app.json");

module.exports = () => ({
  ...appJson.expo,
  android: {
    package: "com.aleiruiz.tacohunt",
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

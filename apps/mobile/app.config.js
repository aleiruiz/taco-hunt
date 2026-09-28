const appJson = require("./app.json");

module.exports = () => ({
  ...appJson.expo,
  android: {
    package: "com.aleiruiz.tacohunt",
  },
  ios: {
    ...(appJson.expo.ios ?? {}),
    infoPlist: {
      ...(appJson.expo.ios?.infoPlist ?? {}),
      LSApplicationQueriesSchemes: ["comgooglemaps", "maps"],
    },
  },
  plugins: [
    ...appJson.expo.plugins,
    [
      "react-native-maps",
      {
        androidGoogleMapsApiKey: process.env.ANDROID_MAPS_API_KEY,
      },
    ],
  ],
});

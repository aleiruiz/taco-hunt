const appJson = require("./app.json");

module.exports = () => ({
  ...appJson.expo,
  android: {
    package: "com.aleiruiz.tacohunt",
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

const appJson = require("./app.json");

module.exports = () => ({
  ...appJson.expo,
  plugins: [
    ...appJson.expo.plugins,
    [
      "react-native-maps",
      {
        androidGoogleMapsApiKey: process.env.EXPO_PUBLIC_ANDROID_MAPS_API_KEY,
      },
    ],
  ],
});

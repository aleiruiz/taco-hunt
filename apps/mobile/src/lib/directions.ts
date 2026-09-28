import { Linking, Platform } from "react-native";

type Coordinates = {
  latitude: number;
  longitude: number;
};

function validCoordinates({ latitude, longitude }: Coordinates) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function encodedDestination({ latitude, longitude }: Coordinates) {
  return `${latitude},${longitude}`;
}

/** Opens turn-by-turn directions without sending or persisting a route. */
export async function openDirections(coordinates: Coordinates): Promise<boolean> {
  if (!validCoordinates(coordinates)) return false;

  const destination = encodedDestination(coordinates);
  const fallback = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
  const candidates =
    Platform.OS === "android"
      ? [`google.navigation:q=${destination}`]
      : [
          `comgooglemaps://?daddr=${destination}&directionsmode=driving`,
          `maps://?daddr=${destination}&dirflg=d`,
        ];

  for (const url of candidates) {
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      // Try the next installed map application or the web fallback.
    }
  }

  try {
    await Linking.openURL(fallback);
    return true;
  } catch {
    return false;
  }
}

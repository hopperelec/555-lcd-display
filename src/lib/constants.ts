import type {
	ApiConstants,
	MetroApiClient,
	PlatformNumber,
} from "metro-api-client";

export let proxy: MetroApiClient;
export let constants: ApiConstants;
export let validStations: string[];

export function init(client: MetroApiClient, apiConstants: ApiConstants) {
	proxy = client;
	constants = apiConstants;
    validStations = [...new Set([...constants.LINES.green, ...constants.LINES.yellow])];
}

export function getStationCode(station: string, platform?: PlatformNumber) {
	station = station.toLowerCase();
	if (station === "monument") {
		if (platform === 1 || platform === 2) return "MTS";
		if (platform === 3 || platform === 4) return "MTW";
	}
	for (const [code, name] of Object.entries(constants.LOCATION_ABBREVIATIONS)) {
		if (name.toLowerCase() === station && constants.PASSENGER_STOPS.includes(code)) return code;
	}
}

import type {
	ApiConstants,
	MetroApiClient,
	PlatformNumber,
} from "metro-api-client";

export let proxy: MetroApiClient;
export let constants: ApiConstants;

export function init(client: MetroApiClient, apiConstants: ApiConstants) {
	proxy = client;
	constants = apiConstants;
}

export function getStationCode(station: string, platform?: PlatformNumber) {
	station = station.toLowerCase();
	if (station === "monument") {
		if (platform === 1 || platform === 2) return "MTS";
		if (platform === 3 || platform === 4) return "MTW";
	}
	for (const [code, name] of Object.entries(constants.STATION_CODES)) {
		if (name.toLowerCase() === station) {
			if (code in constants.NIS_STATIONS) return;
			return code;
		}
	}
}

import { getStationCode, proxy } from "$lib/constants";
import sourcedData from "$lib/sourced-data.svelte";
import {
	type CollatedTrain,
	type FullTrainsResponse,
	MetroApiError,
	type TrainDataApi,
} from "tnw-metro-api-client";

type APIStatus = {
	destination: string | undefined;
	station: string | undefined;
	platformNumber: number | undefined;
	departed: boolean | undefined;
};

let trn: string | undefined;

let currentStatuses: Record<string, APIStatus> = {};

/** The API currently being followed, or undefined if stopped */
let currentApi: TrainDataApi | undefined;
let currentToken: string | undefined;
let stream: { close(): void } | undefined;

function parseStatus(
	status: CollatedTrain,
	api: TrainDataApi,
): APIStatus | undefined {
	if (api === "TIMES") {
		const timesAPIData = status.timesAPI;
		if (!timesAPIData) return;
		// Locations are only strings if they couldn't be parsed
		const { location } = timesAPIData.lastEvent;
		const parsedLocation = typeof location === "string" ? undefined : location;
		return {
			destination: timesAPIData.plannedDestinations[0]?.name,
			station: parsedLocation?.station,
			platformNumber: parsedLocation?.platformNumber,
			departed: timesAPIData.lastEvent.type === "DEPARTED",
		};
	}
	const geoAPIData = status.geoAPI;
	if (!geoAPIData) return;
	// Last seen statuses are only strings if they couldn't be parsed
	const { lastSeen } = geoAPIData;
	const parsedLastSeen = typeof lastSeen === "string" ? undefined : lastSeen;
	return {
		destination: geoAPIData.destination,
		station: parsedLastSeen?.station,
		platformNumber: parsedLastSeen?.platformNumber,
		departed: parsedLastSeen ? parsedLastSeen.type === "DEPARTED" : undefined,
	};
}

/** Updates a train's status, where a null status means it is no longer active */
function updateTrain(changedTRN: string, status: CollatedTrain | null) {
	const currentStatus =
		status && currentApi ? parseStatus(status, currentApi) : undefined;
	if (currentStatus) {
		if (!sourcedData.possibleTRNs.includes(changedTRN)) {
			sourcedData.possibleTRNs.push(changedTRN);
		}
		currentStatuses[changedTRN] = currentStatus;
		if (changedTRN === trn) {
			updatedSourcedData(currentStatus);
		}
	} else {
		const index = sourcedData.possibleTRNs.indexOf(changedTRN);
		if (index !== -1) {
			sourcedData.possibleTRNs.splice(index, 1);
		}
		delete currentStatuses[changedTRN];
	}
}

/** Gets the current statuses, then subscribes to changes to them */
async function connect() {
	stream?.close();
	stream = undefined;
	currentToken = undefined;
	const api = currentApi;
	if (!api) return;
	try {
		const { token } = await proxy.createSubscriptionToken([
			{ topic: "trains", apis: [api] },
		]);
		const { trains } = (await proxy.getTrains()) as FullTrainsResponse;
		if (api !== currentApi) {
			// The source changed while connecting
			proxy.deleteSubscriptionToken(token).catch(() => {});
			return;
		}
		currentToken = token;
		currentStatuses = {};
		sourcedData.possibleTRNs = [];
		for (const [activeTRN, entry] of Object.entries(trains)) {
			updateTrain(activeTRN, entry.status);
		}
		stream = proxy.streamSubscriptions(token, {
			onTrain: (message) => updateTrain(message.trn, message.status),
			// The token is lost if the proxy restarts, in which case a new one is needed
			onDisconnect: () => checkToken(token),
			onStreamClosed: () => connect(),
		});
	} catch (e) {
		console.error("Failed to connect to the proxy, retrying in 10s", e);
		setTimeout(() => {
			if (api === currentApi && !currentToken) connect();
		}, 10 * 1000);
	}
}

/** Reconnects if the token no longer exists */
async function checkToken(token: string) {
	try {
		await proxy.getSubscriptions(token);
	} catch (e) {
		// Other errors (e.g. the proxy being unreachable) are left to the stream to retry
		if (
			e instanceof MetroApiError &&
			e.status === 404 &&
			token === currentToken
		) {
			await connect();
		}
	}
}

export async function start(api: TrainDataApi) {
	currentApi = api;
	await connect();
}

export function stop() {
	currentApi = undefined;
	currentStatuses = {};
	stream?.close();
	stream = undefined;
	if (currentToken) {
		proxy.deleteSubscriptionToken(currentToken).catch(() => {});
		currentToken = undefined;
	}
}

export function setTRN(newTrn: string) {
	trn = newTrn;
	if (trn in currentStatuses) {
		updatedSourcedData(currentStatuses[trn]);
	}
}

function updatedSourcedData(currentStatus: APIStatus) {
	console.log(currentStatus);
	if (currentStatus.destination) {
		const stationCode = getStationCode(currentStatus.destination);
		if (stationCode) sourcedData.to = stationCode;
	}
	if (currentStatus.station) {
		const stationCode = getStationCode(
			currentStatus.station,
			currentStatus.platformNumber,
		);
		if (stationCode) sourcedData.current = stationCode;
	}
	if (currentStatus.departed !== undefined) {
		sourcedData.departed = currentStatus.departed;
	}
}

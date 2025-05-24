import { getStationCode, proxy } from "$lib/constants";
import sourcedData from "$lib/sourced-data.svelte";
import {
	type CollatedTrain,
	type FullTrainsResponse,
	type TimesApiData,
	type TrainStatusesApiData,
	parseLastSeen,
	parseTimesAPILocation,
} from "metro-api-client";

type APIStatus = {
	destination: string | undefined;
	current: string | undefined;
	departed: boolean | undefined;
};

let trn: string | undefined;

let currentStatuses: Record<string, APIStatus> = {};

let close: (() => void) | undefined;

function parseStatus(status: CollatedTrain, api: string): APIStatus {
	if (api === "times-api") {
		const timesAPIData = status.timesAPI as TimesApiData;
		const parsedLocation = parseTimesAPILocation(
			timesAPIData.lastEvent.location,
		);
		return {
			destination: timesAPIData.plannedDestinations[0].name,
			current: parsedLocation ? parsedLocation.station : "",
			departed: timesAPIData.lastEvent.type === "DEPARTED",
		};
	}
	const trainStatusesAPIData = status.trainStatusesAPI as TrainStatusesApiData;
	const parsedLastSeen = parseLastSeen(trainStatusesAPIData.lastSeen);
	return {
		destination: trainStatusesAPIData.destination,
		current: parsedLastSeen?.station,
		departed: parsedLastSeen ? parsedLastSeen.state === "Departed" : undefined,
	};
}

export async function start(api: string) {
	const apiCode = api === "times-api" ? "timesAPI" : "trainStatusesAPI";
	const trains = Object.entries(
		((await proxy.getTrains()) as FullTrainsResponse).trains,
	).filter(([_, entry]) => {
		return apiCode in entry.status;
	});
	sourcedData.possibleTRNs = trains.map(([trn]) => trn);
	for (const [activeTRN, entry] of trains) {
		const currentStatus = parseStatus(entry.status, api);
		currentStatuses[activeTRN] = currentStatus;
		if (activeTRN === trn) {
			updatedSourcedData(currentStatus);
		}
	}
	close = proxy.streamTrainsHistory(
		{
			onNewHistoryEntries: (entries) => {
				for (const [newTRN, entry] of Object.entries(entries)) {
					if (entry.active) {
						if (!sourcedData.possibleTRNs.includes(newTRN)) {
							sourcedData.possibleTRNs.push(newTRN);
						}
						const currentStatus = parseStatus(entry.status, api);
						currentStatuses[newTRN] = currentStatus;
						if (newTRN === trn) {
							updatedSourcedData(currentStatus);
						}
					} else {
						const index = sourcedData.possibleTRNs.indexOf(newTRN);
						if (index !== -1) {
							sourcedData.possibleTRNs.splice(index, 1);
						}
						delete currentStatuses[newTRN];
					}
				}
			},
		},
		{ trainProps: [`status.${apiCode}`] },
	).close;
}

export function stop() {
	currentStatuses = {};
	if (close) {
		close();
		close = undefined;
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
	if (currentStatus.current) {
		const stationCode = getStationCode(currentStatus.current);
		if (stationCode) sourcedData.current = stationCode;
	}
	if (currentStatus.departed !== undefined) {
		sourcedData.departed = currentStatus.departed;
	}
}

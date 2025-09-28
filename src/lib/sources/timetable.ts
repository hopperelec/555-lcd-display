import {constants, proxy, validStations} from "$lib/constants";
import sourcedData from "$lib/sourced-data.svelte.js";

type FormattedTrainTimetable = {
	timeSeconds: number;
	departed: boolean;
	station: string;
	from: string;
	destination: string;
}[];

type Options = {
	sync: boolean;
	date: Date;
};

export function timeNumbersToSeconds(
	hour: number,
	minute: number,
	second: number,
	newDayHour: number,
) {
	if (hour < newDayHour) hour += 24;
	return (hour * 60 + minute) * 60 + second;
}

export function timeDateToSeconds(date: Date, newDayHour: number) {
	return timeNumbersToSeconds(
		date.getHours(),
		date.getMinutes(),
		date.getSeconds(),
		newDayHour,
	);
}

let formattedTrainTimetable: FormattedTrainTimetable | undefined;
let lastDate: Date | undefined;
let syncTimeout: NodeJS.Timeout | undefined;

export async function fetchTimetabledTRNs(date: Date | undefined) {
	const timetable = await proxy.getTimetable({
		date: date,
        limit: 1,
	});
	sourcedData.possibleTRNs = Object.keys(timetable.trains);
}

function getStationCode(location: string) {
    return location.split("_")[0];
}

export async function start(trn: string, opts: Options) {
	clearInterval(syncTimeout);

	const dayTimetable = await proxy.getTimetable({
		trns: [trn],
		date: opts.date,
	});
    const trainTimetable = dayTimetable.trains[trn];
    formattedTrainTimetable = [];

    let currentFrom = "";
    let currentDestination = "";
    let setCurrentFrom = false;
    for (let i = 0; i < trainTimetable.length; i++) {
        const entry = trainTimetable[i];
        const station = getStationCode(entry.location);
        if (!entry.arrivalTime) {
            setCurrentFrom = true;
            findDestination: for (let j = i; j < trainTimetable.length; j++) {
                const entry = trainTimetable[j];
                if (!entry.departureTime) {
                    // Backtrack to find the last valid station
                    for (let k = j; k >= 0; k--) {
                        const entry = trainTimetable[k];
                        const station = getStationCode(entry.location);
                        if (validStations.includes(station)) {
                            currentDestination = station;
                            break findDestination;
                        }
                    }
                }
            }
        }
        if (!validStations.includes(station)) continue;
        if (setCurrentFrom) {
            currentFrom = station;
            setCurrentFrom = false;
        }
        if (entry.arrivalTime) {
            formattedTrainTimetable.push({
                timeSeconds: entry.arrivalTime,
                departed: false,
                station,
                from: currentFrom,
                destination: currentDestination,
            });
        }
        if (entry.departureTime) {
            formattedTrainTimetable.push({
                timeSeconds: entry.departureTime,
                departed: true,
                station,
                from: currentFrom,
                destination: currentDestination,
            });
        }
    }

	await setOptions(opts);
}

export async function setOptions(options: Options) {
	clearTimeout(syncTimeout);
	const referenceDate = options.sync ? new Date() : options.date;
	const referenceTime = timeDateToSeconds(
		referenceDate,
		constants.NEW_DAY_HOUR,
	);
	if (lastDate) {
		const newDate = new Date(referenceDate);
		if (newDate.getHours() < constants.NEW_DAY_HOUR) {
			newDate.setDate(newDate.getDate() - 1);
		}
		if (lastDate.getDate() !== newDate.getDate()) {
			lastDate = newDate;
			await fetchTimetabledTRNs(referenceDate);
		}
	}
	if (!formattedTrainTimetable) return;
	for (let i = 0; i < formattedTrainTimetable.length; i++) {
		if (referenceTime >= formattedTrainTimetable[i].timeSeconds) continue;
		let nextPart = formattedTrainTimetable[i - 1];
		function useNextPart() {
			if (nextPart) {
				sourcedData.from = nextPart.from;
				sourcedData.to = nextPart.destination;
				sourcedData.current = nextPart.station;
				sourcedData.departed = nextPart.departed;
				if (options.sync) {
					nextPart = formattedTrainTimetable![i++];
					const currentTime = timeDateToSeconds(
						new Date(),
						constants.NEW_DAY_HOUR,
					);
					syncTimeout = setTimeout(
						useNextPart,
						(nextPart.timeSeconds - currentTime) * 1000,
					);
				}
			} else {
				// TODO: NIS screen
				syncTimeout = undefined;
			}
		}
		useNextPart();
		return;
	}
}

export function stop() {
	formattedTrainTimetable = undefined;
	lastDate = undefined;
	clearInterval(syncTimeout);
}

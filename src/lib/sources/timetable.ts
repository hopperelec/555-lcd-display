import sourcedData from "$lib/sourced-data.svelte.js";
import {proxy, constants} from "$lib/constants";

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
}

const ARRIVAL_PADDING = 15; // Number of seconds before and after a train's due time to show it as "arrived"

export function timeNumbersToSeconds(hour: number, minute: number, second: number, newDayHour: number) {
    if (hour < newDayHour) hour += 24;
    return (hour * 60 + minute) * 60 + second;
}

export function timeDateToSeconds(date: Date, newDayHour: number) {
    return timeNumbersToSeconds(date.getHours(), date.getMinutes(), date.getSeconds(), newDayHour);
}

// time is "HHMMSS"
function timeStringToSeconds(time: string, newDayHour: number) {
    return timeNumbersToSeconds(+time.slice(0, 2), +time.slice(2, 4), +time.slice(4), newDayHour);
}

let formattedTrainTimetable: FormattedTrainTimetable | undefined;
let lastDate: Date | undefined;
let syncTimeout: NodeJS.Timeout | undefined;

export async function fetchTimetabledTRNs(date: Date | undefined) {
    const timetabledTRNs = await proxy.getTimetable({
        date: date,
        direction: 'none',
        emptyManeuvers: 'none',
    });
    sourcedData.possibleTRNs = Object.keys(timetabledTRNs);
}

export async function start(
    trn: string,
    opts: Options,
) {
    clearInterval(syncTimeout);

    const trainTimetable = await proxy.getTimetable({
        trn,
        date: opts.date,
        emptyManeuvers: 'none',
    });

    const formattedRoutes: FormattedTrainTimetable[] = [];
    for (const direction of ["in","out"] as const) {
        for (const route of trainTimetable[direction]) {
            const sortedStations = (
                Object.entries(route.stations as Record<string,string>)
                    .filter(([station]) => station !== 'FORMS') as [string, string][]
            ).map(([station, time]) => [station, timeStringToSeconds(time, constants.NEW_DAY_HOUR)] as [string, number]);
            if (sortedStations.length === 0) continue;
            const from = sortedStations[0][0];
            const destination = sortedStations[sortedStations.length - 1][0];

            const formattedRoute: FormattedTrainTimetable = [];
            for (const [station, time] of sortedStations) {
                formattedRoute.push({
                    timeSeconds: time - ARRIVAL_PADDING,
                    station, from, destination,
                    departed: false
                });
                formattedRoute.push({
                    timeSeconds: time + ARRIVAL_PADDING,
                    station, from, destination,
                    departed: true
                });
            }
            formattedRoute.pop(); // Don't depart from the destination until the start of the next route
            formattedRoutes.push(formattedRoute);
        }
    }
    formattedRoutes.sort((a, b) => a[0].timeSeconds - b[0].timeSeconds);
    formattedTrainTimetable = formattedRoutes.flat();

    await setOptions(opts);
}

export async function setOptions(options: Options) {
    clearTimeout(syncTimeout);
    const referenceDate = options.sync ? new Date() : options.date;
    const referenceTime = timeDateToSeconds(referenceDate, constants.NEW_DAY_HOUR);
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
        let nextPart = formattedTrainTimetable[i-1];
        function useNextPart() {
            if (nextPart) {
                sourcedData.from = nextPart.from;
                sourcedData.to = nextPart.destination
                sourcedData.current = nextPart.station;
                sourcedData.departed = nextPart.departed;
                if (options.sync) {
                    nextPart = (formattedTrainTimetable as FormattedTrainTimetable)[i++];
                    const currentTime = timeDateToSeconds(new Date(), constants.NEW_DAY_HOUR);
                    syncTimeout = setTimeout(useNextPart, (nextPart.timeSeconds - currentTime) * 1000);
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

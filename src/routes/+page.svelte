<script lang="ts">
import LineDot from "$lib/components/LineDot.svelte";
import StationSelector from "$lib/components/StationSelector.svelte";
import { init } from "$lib/constants";
import sourcedData from "$lib/sourced-data.svelte.js";
import {
	setTRN as setAPIStreamTRN,
	start as startAPIStream,
	stop as stopAPIStream,
} from "$lib/sources/api-stream";
import {
	fetchTimetabledTRNs,
	setOptions as setTimetableOptions,
	start as startTimetable,
	stop as stopTimetable,
} from "$lib/sources/timetable";
import { SvelteDate } from "svelte/reactivity";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();
init(data.proxy, data.constants);

// Options

let source: "manual" | "timetable" | "times-api" | "trainstatuses-api" =
	$state("manual");

let timetableOptions = $state({
	sync: true,
	date: new Date(),
});

let trn: string | null = $state(null);

// Source handling

let stopCurrentSource: (() => void) | undefined;

async function changeSource() {
	stopCurrentSource?.();
	sourcedData.possibleTRNs = [];
	switch (source) {
		case "manual":
			stopCurrentSource = undefined;
			break;
		case "timetable":
			stopCurrentSource = stopTimetable;
			await fetchTimetabledTRNs(
				timetableOptions.sync ? undefined : timetableOptions.date,
			);
			if (trn) await startTimetable(trn, timetableOptions);
			break;
		case "times-api":
		case "trainstatuses-api":
			stopCurrentSource = stopAPIStream;
			await startAPIStream(source);
			if (trn) setAPIStreamTRN(trn);
			break;
	}
}

async function changeTRN() {
	if (!trn) return;
	switch (source) {
		case "timetable":
			stopCurrentSource?.();
			await startTimetable(trn, timetableOptions);
			break;
		case "times-api":
		case "trainstatuses-api":
			setAPIStreamTRN(trn);
			break;
	}
}

async function changeTimetableOptions() {
	await setTimetableOptions(timetableOptions);
}

// Rendering

const STAGGERED_PLATFORMS = [
	"BFT",
	"KSP",
	"FAW",
	"WBR",
	"BDE",
	"HEB",
	"SMR",
	"HOW",
];

function getDisplayName(station: string) {
	if (["MTS", "MTW"].includes(station)) return "Monument";
	const stationName = data.constants.STATION_CODES[station] || station;
	if (STAGGERED_PLATFORMS.includes(station))
		return `${stationName} ${outLine ? 2 : 1}`;
	return stationName;
}

function getLineName(station: string) {
	if (data.constants.LINES.yellow.includes(station)) {
		if (data.constants.LINES.green.includes(station)) return "shared";
		return "yellow";
	}
	return "green";
}
type LineName = ReturnType<typeof getLineName>;

let fromLineName: LineName = $derived(getLineName(sourcedData.from));
let toLineName: LineName = $derived(getLineName(sourcedData.to));
let currentLineName: LineName = $derived(getLineName(sourcedData.current));

let comparison = $derived.by(() => {
	if (currentLineName === "shared") {
		return {
			lineName: toLineName === "shared" ? fromLineName : toLineName,
			toFrom: false,
		};
	}
	const onFromLine = fromLineName === currentLineName;
	const onToLine = toLineName === currentLineName;
	if (onFromLine || onToLine) {
		return {
			lineName: currentLineName,
			toFrom: toLineName !== "shared" && onFromLine && !onToLine,
		};
	}
});
let comparisonLine = $derived(
	comparison ? data.constants.LINES[comparison.lineName] : undefined,
);

let { outLine, nextStations } = $derived.by(() => {
	if (!comparison || !comparisonLine) return {};

	let outLine: boolean; // Heading in the direction of Airport or St James
	let nextStations: string[];
	let currentIndex = comparisonLine.indexOf(sourcedData.current);
	if (comparison.toFrom) {
		const fromIndex = comparisonLine.indexOf(sourcedData.from);
		// Doesn't work if currentIndex === fromIndex
		// But there isn't a good way to figure out the direction in that case
		// without hard-coding it for each of the four non-shared sections
		outLine = currentIndex < fromIndex;
		if (outLine) {
			if (sourcedData.departed) currentIndex--;
			nextStations = comparisonLine.slice(0, currentIndex + 1).reverse();
		} else {
			if (sourcedData.departed) currentIndex++;
			nextStations = comparisonLine.slice(currentIndex);
		}
	} else {
		const toIndex = comparisonLine.indexOf(sourcedData.to);
		outLine = currentIndex > toIndex;
		if (outLine) {
			if (sourcedData.departed) currentIndex--;
			nextStations = comparisonLine.slice(toIndex, currentIndex + 1).reverse();
		} else {
			if (sourcedData.departed) currentIndex++;
			nextStations = comparisonLine.slice(currentIndex, toIndex + 1);
		}
	}
	nextStations = nextStations.filter((station) => station !== "PJC"); // Don't show Pelaw Junction
	return { outLine, nextStations };
});

let routeCode = $derived.by(() => {
	const fallback = fromLineName === "yellow" ? "YELLOW LINE" : "GREEN LINE";
	if (!comparison) return fallback;
	if (sourcedData.from === "SHL" && sourcedData.to === "APT") return "MASTER";
	let possible: {
		from: { [key in string]?: number };
		to: { [key in string]?: number };
	};
	if (comparison.lineName === "yellow") {
		if (outLine)
			possible = {
				from: data.constants.ROUTE_CODES.yellow.in,
				to: data.constants.ROUTE_CODES.yellow.out,
			};
		else
			possible = {
				from: data.constants.ROUTE_CODES.yellow.out,
				to: data.constants.ROUTE_CODES.yellow.in,
			};
	}
	if (comparison.lineName === "green") {
		if (outLine)
			possible = {
				from: data.constants.ROUTE_CODES.green.in,
				to: data.constants.ROUTE_CODES.green.out,
			};
		else
			possible = {
				from: data.constants.ROUTE_CODES.green.out,
				to: data.constants.ROUTE_CODES.green.in,
			};
	}
	const sharedInLine = {
		...data.constants.ROUTE_CODES.green.in,
		...data.constants.ROUTE_CODES.yellow.in,
	};
	const sharedOutLine = {
		...data.constants.ROUTE_CODES.green.out,
		...data.constants.ROUTE_CODES.yellow.out,
	};
	if (outLine) possible = { from: sharedInLine, to: sharedOutLine };
	else possible = { from: sharedOutLine, to: sharedInLine };
	const fromCode = possible.from[sourcedData.from];
	if (!fromCode) return fallback;
	const toCode = possible.to[sourcedData.to];
	if (!toCode) return fallback;
	return `T${fromCode}v${toCode}`;
});

let date = new SvelteDate();
setTimeout(
	() => {
		date.setTime(Date.now());
		setInterval(() => {
			date.setTime(Date.now());
		}, 60000);
	},
	60000 - (Date.now() % 60000),
);
</script>

<div id="page-container">
    <ul id="options">
        <li>
            <label for="source-input">Source</label>
            <select bind:value={source} onchange={changeSource} id="source-input">
                <option value="manual">Manual</option>
                <option value="timetable">Timetable</option>
                <option value="times-api">Times API</option>
                <option value="trainstatuses-api">Train Statuses API</option>
            </select>
        </li>
        {#if source !== "manual"}
            <li>
                <label for="trn-input">TRN</label>
                <select id="trn-input" bind:value={trn} onchange={changeTRN}>
                    {#each sourcedData.possibleTRNs as trn}
                        <option value={trn}>{trn}</option>
                    {/each}
                </select>
            </li>
        {/if}
        {#if source === "timetable"}
            <li>
                <label for="sync">Sync</label>
                <input id="sync" type="checkbox"
                       bind:checked={timetableOptions.sync}
                       onchange={changeTimetableOptions}
                />
            </li>
            <li>
                <label for="date">Date/time</label>
                <input id="date" type="datetime-local" step="15"
                       bind:value={
               () => {
                   const date = timetableOptions.date;
                   const pad = (n: number) => n.toString().padStart(2, '0');
                   return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
               },
               (value) => timetableOptions.date = new Date(value)
           }
                       onchange={changeTimetableOptions}
                       disabled={timetableOptions.sync}
                />
            </li>
        {/if}
        {#if source !== "timetable"}
            <li>
                <label for="from-station-input">From</label>
                <StationSelector bind:station={sourcedData.from} id="from-station-input" stations={data.constants.STATION_CODES}/>
            </li>
        {/if}
        {#if source === "manual"}
            <li>
                <label for="to-station-input">To</label>
                <StationSelector bind:station={sourcedData.to} id="to-station-input" stations={data.constants.STATION_CODES}/>
            </li>
            <li>
                <label for="current-station-input">Current</label>
                <StationSelector bind:station={sourcedData.current} id="current-station-input" stations={data.constants.STATION_CODES}/>
            </li>
            <li>
                <label for="departed-input">Departed?</label>
                <input id="departed-input" type="checkbox" bind:checked={sourcedData.departed}/>
            </li>
        {/if}
    </ul>
    <div id="display-container" class:yellow={fromLineName === "yellow"} class:manual={source === "manual"}>
        <div>
            <div id="header">
                <span id="next-station">Next station:</span>
                <span id="final-station">Final station:</span>
            </div>
            {#if nextStations}
                <ol
                        id="next-stations"
                        class:terminus={nextStations.length === 1}
                        class:missingStations={nextStations.length > 4}
                >
                    <li>
                        <span>{getDisplayName(nextStations[0])}</span>
                        <div>
                            <div class="line-container colored"><div></div></div>
                            <LineDot type={sourcedData.departed ? "departed" : "arrived"}
                                     onclick={() => {
                                     if (sourcedData.departed) {
                                         sourcedData.current = nextStations[0];
                                         sourcedData.departed = false;
                                     } else if (nextStations.length === 1) {
                                         const temp = sourcedData.from;
                                         sourcedData.from = sourcedData.to;
                                         sourcedData.to = temp;
                                     } else {
                                         sourcedData.departed = true;
                                     }
                                 }}
                                     enableButton={source === "manual"}
                                     title={
                                     sourcedData.departed
                                         ? "Arrive at this station"
                                         : (
                                             nextStations.length > 1
                                                ? "Depart this station"
                                                : "Turn around"
                                         )
                                 }
                            />
                        </div>
                    </li>
                    {#each nextStations.slice(1, 3) as station, index}
                        <li>
                            <div class="line-container colored">
                                {#if source === "manual"}
                                    <button onclick={() => {
                                        sourcedData.current = nextStations[index]; // Previous "Next station"
                                        sourcedData.departed = true;
                                    }}
                                            title="Go between these stations"
                                            aria-label="Go between these stations"
                                    ></button>
                                {:else}
                                    <div></div>
                                {/if}
                            </div>
                            <span>{getDisplayName(station)}</span>
                            <LineDot type="normal"
                                     onclick={() => {
                                     sourcedData.current = station;
                                     sourcedData.departed = false;
                                 }}
                                     enableButton={source === "manual"}
                                     title="Arrive at this station"
                            />
                        </li>
                    {/each}
                    {#if nextStations.length > 3}
                        <li>
                            <div class="line-container continuation">
                                {#each { length: 4  } as _}
                                    <div></div>
                                {/each}
                            </div>
                            <span>{getDisplayName(sourcedData.to)}</span>
                            <LineDot type="normal"
                                     onclick={() => {
                                     sourcedData.current = sourcedData.to;
                                     sourcedData.departed = false;
                                 }}
                                     enableButton={source === "manual"}
                                     title="Arrive at this station"
                            />
                        </li>
                    {/if}
                </ol>
            {/if}
            <div id="footer">
                <span id="time">{date.toLocaleTimeString("en-GB", { hour: '2-digit', minute: '2-digit' })}</span>
                <div id="carriages-container">
                    <ol>
                        {#each sourcedData.capacity as capacity, carriageIndex}
                            <li
                                    class:medium={capacity === 1}
                                    class:high={capacity === 2}
                            >
                                {#each [2, 1, 0] as row}
                                    {@const title = `Set capacity of carriage ${carriageIndex + 1} to ${row}`}
                                    <button
                                            onmousedown={() => sourcedData.capacity[carriageIndex] = row}
                                            onmouseenter={(event) => {
                                            if (event.buttons === 1) sourcedData.capacity[carriageIndex] = row;
                                        }}
                                            class:filled={capacity >= row}
                                            {title}
                                            aria-label={title}
                                    ></button>
                                {/each}
                            </li>
                        {/each}
                    </ol>
                </div>
                <div id="status-message-container">
                    <div id="marquee">
                        <span id="marquee-text">{sourcedData.statusMessage}</span>
                    </div>
                    <input type="text" bind:value={sourcedData.statusMessage} />
                </div>
                <span id="route-code" title="Route code">{routeCode}</span>
                <div id="line-color" title={`${comparison?.lineName === 'yellow' ? "Yellow" : "Green"} line`}></div>
            </div>
        </div>
    </div>

    <footer>
        <p>
            This is a <em>recreation</em> and is not affiliated, associated, authorized, endorsed by, or in any way
            officially connected with Tyne and Wear Transport Executive or Tyne and Wear Metro.
        </p>
        <p>
            This project is open-source. You can view all of it's the code, report any issues, make suggestions or contribute
            <a href="https://github.com/hopperelec/555-lcd-display">here</a>.
        </p>
    </footer>
</div>

<style lang="scss">
$left-padding: 2.6rem;
$right-padding: 9rem;
$text-offset: .5rem;
$wheel-position: .07rem;
$backlight-color: #191919;

#page-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

#options {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  list-style: none;

  & > li {
    margin: 0 .5rem;
  }
}

#display-container {
--line-color: #0c8;

  &.yellow {
    --line-color: #fd0;
  }

  background: #000;
  padding: 1rem;
  margin: 1em 0;
  width: 100%;
  box-sizing: border-box;
  overflow-x: auto;

  & > div {
    position: relative;
    background: $backlight-color;
    color: #fff;
    font-family: Verdana, sans-serif;
    display: grid;
    grid-template-rows: 1fr auto 1fr;
    min-width: 55rem;
    width: 55rem;
    margin: 0 auto;
  }

  & input {
    background: transparent;
    border: none;
    color: inherit;
    font: inherit;
    width: 100%;
    padding: 0;
  }
}

#header > span {
  position: absolute;
  font-size: .9rem;
}

#next-station {
  left: calc($left-padding - $text-offset);
}

#final-station {
  left: calc(100% - $right-padding - $text-offset);
}

#next-stations {
  display: grid;
  width: calc(100% - $right-padding);
  list-style-type: none;
  padding: 0;
  height: 3.3rem;
  margin: 0;
  grid-template-columns:
          $left-padding /* Leader */
          repeat(auto-fit, minmax(0, 1fr)); /* Other line segments */

  & > li {
    position: relative;

    & > span {
      position: absolute;
      left: calc(100% - $text-offset);
      width: 16ch;
      bottom: 50%;
    }

    &:first-child,
    &:last-child {
      & > span {
        font-size: 1.2rem;
        font-weight: bold;
      }
    }

    &:last-child > span {
      width: 10ch;
    }
  }
}

.line-container {
  height: 50%;
  position: absolute;
  bottom: 0;
  display: flex;
  align-items: center;
  width: 100%;

  & > * {
    width: 100%;
  }
}

.colored > * {
  background: var(--line-color);
  height: .35rem;
}

.colored > button {
  cursor: pointer;
  border: none;
}

.continuation {
  align-items: center;
  margin-left: .35rem; /* Don't include preceding dot */

  & > * {
    width: 0;
    margin-left: calc(100% / 6);
    border: .28em solid #fff;
    border-radius: 50%;
  }
}

#footer {
  display: grid;
  grid-template-columns: auto auto 1fr 4em auto;
  align-items: end;
  padding: .6rem;
}

#time  {
  font-size: 1.1rem;
}

#carriages-container {
  margin: 0 3rem;

  & > ol {
    display: flex;
    list-style: none;
    margin: 0;
    padding: 0;

    & > li {
      --carriage-color: #0f0;

      &.medium {
        --carriage-color: #fb0;
      }

      &.high {
        --carriage-color: #f00;
      }

      display: flex;
      flex-direction: column;
      justify-content: stretch;
      border: .15em solid #fff;
      border-radius: 1px;
      margin: .065rem .065rem .2rem;
      position: relative;

      & > button {
        background: transparent;
        cursor: pointer;
        height: .22rem;
        border: .04em solid $backlight-color;
        width: 1.5rem;
        z-index: 1; /* Over wheels */

        &.filled {
          background: var(--carriage-color);
        }
      }

      /* Wheels */
      &::before,
      &::after {
        $diameter: .4rem;

        content: "";
        background: #fff;
        border-radius: 50%;
        width: $diameter;
        height: $diameter;
        position: absolute;
        bottom: calc($diameter / -2);
      }

      /* Left wheel */
      &::before {
        left: $wheel-position;
      }

      /* Right wheel */
      &::after {
        right: $wheel-position;
      }
    }

    &::after {
      /* Right arrow */
      content: "";
      width: 0;
      height: 0;
      border-top: .45em solid transparent;
      border-bottom: .45em solid transparent;
      border-left: .3em solid #fff;
      margin-left: .2rem;
    }
  }
}

#status-message-container {
  position: relative;
  overflow: hidden;
  width: 100%;

  & input {
    color: transparent;

    &:focus {
      color: #999;
    }
  }
}

#marquee {
  position: absolute;
  top: 0;
  width: 100%;
  white-space: nowrap;
  overflow: hidden;
  pointer-events: none;
}

#marquee-text {
  display: inline-block;
  padding-left: 100%; /* Start off screen */
  animation: marquee 10s linear infinite;
}

@keyframes marquee {
  0% {
    transform: translateX(0%);
  }

  100% {
    transform: translateX(-100%);
  }
}

#route-code {
  font-size: .5rem;
  color: var(--line-color);
  text-align: right;
}

#line-color {
  display: block;
  margin-left: 1ch;
  height: .5rem;
  width: 3rem;
  background-color: var(--line-color);
  cursor: help;
}

footer {
  text-align: center;
}
</style>
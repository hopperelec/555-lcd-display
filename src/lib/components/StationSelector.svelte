<script lang="ts">
import {validStations,constants} from "$lib/constants";

let {
	station = $bindable("SJM"),
	id,
}: {
	station: string;
	id: string;
} = $props();
</script>

<select bind:value={station} {id}>
    {#each validStations as code}
        <option value={code}>{constants.LOCATION_ABBREVIATIONS[code]}</option>
    {/each}
</select>
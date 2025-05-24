<script lang="ts">
let {
	station = $bindable("SJM"),
	stations,
	id,
}: {
	station: string;
	stations: Record<string, string>;
	id: string;
} = $props();
</script>

<select bind:value={station} {id}>
    {#each Object.entries(stations) as [code, name]}
        <option value={code}>{name}</option>
    {/each}
</select>
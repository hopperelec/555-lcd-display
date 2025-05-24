let sourcedData = $state({
    from: "SJM",
    to: "SSS",
    current: "SJM",
    departed: false,
    capacity: [0,0,0,0,0] as number[],
    statusMessage: "Click here to change the status message",
    possibleTRNs: [] as string[],
});

export default sourcedData;

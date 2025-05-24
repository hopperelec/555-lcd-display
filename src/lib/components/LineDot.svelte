<script lang="ts">
let {
	type,
	enableButton,
	onclick,
	title,
}: {
	type: "normal" | "arrived" | "departed";
	enableButton: boolean;
	onclick: () => void;
	title: string;
} = $props();
</script>

<div
        id="positioner"
        class:normal={type === "normal"}
        class:border={type !== "normal"}
        class:inclusive={type === "arrived"}
>
    <button
            id="background"
            {onclick}
            disabled={!enableButton}
            {title}
            aria-label={title}
    ><span id="dot"></span></button>
</div>

<style>
#positioner {
    position: absolute;
    right: 0;
    bottom: 25%;
    transform: translate(100%, 50%);
    z-index: 1;
    pointer-events: none;
}

#background {
    display: block;
    z-index: 1; /* So that background shows over line */
    background: #191919; /* $backlight-color */
    transform: translateX(-50%);
    pointer-events: all;

    /* Button reset */
    border: none;
    padding: 0;
    cursor: pointer;

    &[disabled] {
        cursor: not-allowed;
    }
}

#dot {
    display: block;
    width: var(--diameter);
    height: var(--diameter);
    border-radius: 50%;
    margin: .06em;
}

.border {
    --diameter: 1rem;

    & #dot {
        border: .25em solid #fff;
    }
}

.inclusive #dot {
    display: flex;
    align-items: center;
    justify-content: center;

    &::after {
        content: "";
        border-radius: 50%;
        width: .82rem;
        height: .82rem;
        background: #fff;
    }
}

.normal {
    --diameter: .75rem;

    & #dot {
        background: #fff;
    }
}
</style>
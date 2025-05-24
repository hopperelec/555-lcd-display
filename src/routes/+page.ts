import {MetroApiClient} from "metro-api-client";
import {PUBLIC_PROXY_BASE_URL} from "$env/static/public";
import type { PageLoad } from './$types';

export const load: PageLoad = async () => {
    const proxy = new MetroApiClient(PUBLIC_PROXY_BASE_URL);
    return {
        proxy,
        constants: await proxy.getConstants(),
    };
};
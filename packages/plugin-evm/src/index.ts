export * from "./actions/deposit";
export * from "./providers/wallet";
export * from "./types";

import type { Plugin } from "@elizaos/core";
import { evmWalletProvider } from "./providers/wallet";
import { depositAction } from "./actions/deposit";

export const evmPlugin: Plugin = {
    name: "evm",
    description: "EVM blockchain integration plugin",
    providers: [evmWalletProvider],
    evaluators: [],
    services: [],
    actions: [depositAction],
};

export default evmPlugin;

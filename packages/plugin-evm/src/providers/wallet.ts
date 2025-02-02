import {
    createPublicClient,
    createTestClient,
    createWalletClient,
    defineChain,
    erc20Abi,
    formatUnits,
    http,
    publicActions,
    walletActions,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
    type IAgentRuntime,
    type Provider,
    type Memory,
    type State,
    type ICacheManager,
    elizaLogger,
} from "@elizaos/core";
import type {
    Address,
    WalletClient,
    PublicClient,
    Chain,
    HttpTransport,
    Account,
    PrivateKeyAccount,
    TestClient,
} from "viem";
import { DeriveKeyProvider, TEEMode } from "@elizaos/plugin-tee";
import NodeCache from "node-cache";
import * as path from "node:path";

import type { SupportedChain } from "../types";

const viemChains = {
    bg1: defineChain({
        id: 9991,
        name: 'ChainFusion',
        nativeCurrency: { name: 'CFN', symbol: 'CFN', decimals: 18 },
        rpcUrls: {
            default: {
                http: ['https://rpc-bg1.chainfusion.org'],
            },
        },
        blockExplorers: {
            default: {
                name: 'Blockscout',
                url: 'https://explorer-bg1.chainfusion.org/',
                apiUrl: 'https://explorer-bg1.chainfusion.org/api',
            },
        },
    }),
    bg2: defineChain({
        id: 9992,
        name: 'ChainFusion',
        nativeCurrency: { name: 'CFN', symbol: 'CFN', decimals: 18 },
        rpcUrls: {
            default: {
                http: ['https://rpc-bg2.chainfusion.org'],
            },
        },
        blockExplorers: {
            default: {
                name: 'Blockscout',
                url: 'https://explorer-bg2.chainfusion.org/',
                apiUrl: 'https://explorer-bg2.chainfusion.org/api',
            },
        },
    }),
    bg3: defineChain({
        id: 9993,
        name: 'ChainFusion',
        nativeCurrency: { name: 'CFN', symbol: 'CFN', decimals: 18 },
        rpcUrls: {
            default: {
                http: ['https://rpc-bg3.chainfusion.org'],
            },
        },
        blockExplorers: {
            default: {
                name: 'Blockscout',
                url: 'https://explorer-bg3.chainfusion.org/',
                apiUrl: 'https://explorer-bg3.chainfusion.org/api',
            },
        },
    }),
};

export class WalletProvider {
    private cache: NodeCache;
    private cacheKey = "evm/wallet";
    private currentChain: string = "chainfusion";
    private CACHE_EXPIRY_SEC = 5;
    chains: Record<string, Chain> = viemChains;
    account: PrivateKeyAccount;

    tokenAddress: Record<string, Record<string, Address>> = {
        "bg1": {
            "USDT": "0x8021ECA3E253c3763245054EDf102BB2c422130E",
            "USDC": "0x5C9A70419C23231ee3EC706D5a12Fb73c8cedBBB",
        },
        "bg2": {
            "USDT": "0x8021ECA3E253c3763245054EDf102BB2c422130E",
            "USDC": "0x5C9A70419C23231ee3EC706D5a12Fb73c8cedBBB",
        },
        "bg3": {
            "USDT": "0x8021ECA3E253c3763245054EDf102BB2c422130E",
            "USDC": "0x5C9A70419C23231ee3EC706D5a12Fb73c8cedBBB",
        },
    };

    liquidityPools: Record<string, Address> = {
        "bg1": "0x85EBE7a44555921154a62AD35d5fB2490d58C956",
        "bg2": "0x85EBE7a44555921154a62AD35d5fB2490d58C956",
        "bg3": "0x85EBE7a44555921154a62AD35d5fB2490d58C956",
    };

    constructor(
        accountOrPrivateKey: PrivateKeyAccount | `0x${string}`,
        private cacheManager: ICacheManager,
        chains?: Record<string, Chain>
    ) {
        this.setAccount(accountOrPrivateKey);
        this.setChains(chains);

        if (chains && Object.keys(chains).length > 0) {
            this.setCurrentChain(Object.keys(chains)[0] as SupportedChain);
        }

        this.cache = new NodeCache({ stdTTL: this.CACHE_EXPIRY_SEC });
    }

    getAddress(): Address {
        return this.account.address;
    }

    getCurrentChain(): Chain {
        return this.chains[this.currentChain];
    }

    getPublicClient(
        chainName: string
    ): PublicClient<HttpTransport, Chain, Account | undefined> {
        const transport = this.createHttpTransport(chainName);

        const publicClient = createPublicClient({
            chain: this.chains[chainName],
            transport,
        });
        return publicClient;
    }

    getWalletClient(chainName: SupportedChain): WalletClient {
        const transport = this.createHttpTransport(chainName);

        const walletClient = createWalletClient({
            chain: this.chains[chainName],
            transport,
            account: this.account,
        });

        return walletClient;
    }

    getChainConfigs(chainName: SupportedChain): Chain {
        const chain = viemChains[chainName];

        if (!chain?.id) {
            throw new Error(`Invalid chain name: ${chainName}`);
        }

        return chain;
    }

    async getWalletBalance(): Promise<string | null> {
        const cacheKey = `walletBalance_${this.currentChain}`;
        const cachedData = await this.getCachedData<string>(cacheKey);
        if (cachedData) {
            elizaLogger.log(
                `Returning cached wallet balance for chain: ${this.currentChain}`
            );
            return cachedData;
        }

        try {
            const client = this.getPublicClient(this.currentChain);
            const balance = await client.getBalance({
                address: this.account.address,
            });
            const balanceFormatted = formatUnits(balance, 18);
            this.setCachedData<string>(cacheKey, balanceFormatted);
            elizaLogger.log(
                "Wallet balance cached for chain: ",
                this.currentChain
            );
            return balanceFormatted;
        } catch (error) {
            console.error("Error getting wallet balance:", error);
            return null;
        }
    }

    async getWalletBalanceForChain(
        chainName: string
    ): Promise<string | null> {
        try {
            const client = this.getPublicClient(chainName);
            const balance = await client.getBalance({
                address: this.account.address,
            });
            return formatUnits(balance, 18);
        } catch (error) {
            console.error("Error getting wallet balance:", error);
            return null;
        }
    }

    addChain(chain: Record<string, Chain>) {
        this.setChains(chain);
    }

    switchChain(chainName: SupportedChain, customRpcUrl?: string) {
        if (!this.chains[chainName]) {
            const chain = WalletProvider.genChainFromName(
                chainName,
                customRpcUrl
            );
            this.addChain({ [chainName]: chain });
        }
        this.setCurrentChain(chainName);
    }

    private async readFromCache<T>(key: string): Promise<T | null> {
        const cached = await this.cacheManager.get<T>(
            path.join(this.cacheKey, key)
        );
        return cached;
    }

    private async writeToCache<T>(key: string, data: T): Promise<void> {
        await this.cacheManager.set(path.join(this.cacheKey, key), data, {
            expires: Date.now() + this.CACHE_EXPIRY_SEC * 1000,
        });
    }

    private async getCachedData<T>(key: string): Promise<T | null> {
        // Check in-memory cache first
        const cachedData = this.cache.get<T>(key);
        if (cachedData) {
            return cachedData;
        }

        // Check file-based cache
        const fileCachedData = await this.readFromCache<T>(key);
        if (fileCachedData) {
            // Populate in-memory cache
            this.cache.set(key, fileCachedData);
            return fileCachedData;
        }

        return null;
    }

    private async setCachedData<T>(cacheKey: string, data: T): Promise<void> {
        // Set in-memory cache
        this.cache.set(cacheKey, data);

        // Write to file-based cache
        await this.writeToCache(cacheKey, data);
    }

    private setAccount = (
        accountOrPrivateKey: PrivateKeyAccount | `0x${string}`
    ) => {
        if (typeof accountOrPrivateKey === "string") {
            this.account = privateKeyToAccount(accountOrPrivateKey);
        } else {
            this.account = accountOrPrivateKey;
        }
    };

    private setChains = (chains?: Record<string, Chain>) => {
        if (!chains) {
            return;
        }
        for (const chain of Object.keys(chains)) {
            this.chains[chain] = chains[chain];
        }
    };

    private setCurrentChain = (chain: string) => {
        this.currentChain = chain;
    };

    private createHttpTransport = (chainName: string) => {
        const chain = this.chains[chainName];

        if (chain.rpcUrls.custom) {
            return http(chain.rpcUrls.custom.http[0]);
        }
        return http(chain.rpcUrls.default.http[0]);
    };

    static genChainFromName(
        chainName: string,
        customRpcUrl?: string | null
    ): Chain {
        const baseChain = viemChains[chainName];

        if (!baseChain?.id) {
            throw new Error(`Invalid chain name: ${chainName}`);
        }

        const viemChain: Chain = customRpcUrl
            ? {
                ...baseChain,
                rpcUrls: {
                    ...baseChain.rpcUrls,
                    custom: {
                        http: [customRpcUrl],
                    },
                },
            }
            : baseChain;

        return viemChain;
    }

    async getBridgePoolBalances() {
        let result: Record<string, Record<Address, string>> = {}
        console.log(this.chains)
        for (let chainName in this.chains) {
            console.log(chainName)
            result[chainName] = {}
            for (let token in this.tokenAddress[chainName]) {
                console.log(token)

                let client = this.getPublicClient(chainName);
                let tokenAddr = this.tokenAddress[chainName][token];
                let balance = await client.readContract({
                    address: this.tokenAddress[chainName][token],
                    abi: erc20Abi,
                    functionName: "balanceOf",
                    args: [this.liquidityPools[chainName]]
                });

                result[chainName][tokenAddr] = balance.toString();
            }
        }
        return result;
    }
}

const genChainsFromRuntime = (
    runtime: IAgentRuntime
): Record<string, Chain> => {
    const chainNames =
        (runtime.character.settings.chains?.evm as SupportedChain[]) || [];
    const chains: Record<string, Chain> = {};

    for (const chainName of chainNames) {
        const rpcUrl = runtime.getSetting(
            `ETHEREUM_PROVIDER_${chainName.toUpperCase()}`
        );
        const chain = WalletProvider.genChainFromName(chainName, rpcUrl);
        chains[chainName] = chain;
    }

    return chains;
};

export const initWalletProvider = async (runtime: IAgentRuntime) => {
    const teeMode = runtime.getSetting("TEE_MODE") || TEEMode.OFF;

    const chains = genChainsFromRuntime(runtime);

    if (teeMode !== TEEMode.OFF) {
        const walletSecretSalt = runtime.getSetting("WALLET_SECRET_SALT");
        if (!walletSecretSalt) {
            throw new Error(
                "WALLET_SECRET_SALT required when TEE_MODE is enabled"
            );
        }

        const deriveKeyProvider = new DeriveKeyProvider(teeMode);
        const deriveKeyResult = await deriveKeyProvider.deriveEcdsaKeypair(
            walletSecretSalt,
            "evm",
            runtime.agentId
        );
        return new WalletProvider(
            deriveKeyResult.keypair,
            runtime.cacheManager,
            chains
        );
    } else {
        const privateKey = runtime.getSetting(
            "EVM_PRIVATE_KEY"
        ) as `0x${string}`;
        if (!privateKey) {
            throw new Error("EVM_PRIVATE_KEY is missing");
        }
        return new WalletProvider(privateKey, runtime.cacheManager, chains);
    }
};


export const evmWalletProvider: Provider = {
    async get(
        runtime: IAgentRuntime,
        _message: Memory,
        state?: State
    ): Promise<string | null> {
        try {
            const walletProvider = await initWalletProvider(runtime);
            const address = walletProvider.getAddress();
            const balance = await walletProvider.getWalletBalance();
            const chain = walletProvider.getCurrentChain();
            const agentName = state?.agentName || "The agent";
            const balances = await walletProvider.getBridgePoolBalances();

            let t = `${agentName}'s EVM Wallet Address: ${address}\nBalance: ${balance} ${chain.nativeCurrency.symbol}\nChain ID: ${chain.id}, Name: ${chain.name}`;
            t += `\nLiquidity Pool's token balances:` + JSON.stringify(balances);
            console.log("provider info:", t);
            return t;
        } catch (error) {
            console.error("Error in EVM wallet provider:", error);
            return null;
        }
    },
};

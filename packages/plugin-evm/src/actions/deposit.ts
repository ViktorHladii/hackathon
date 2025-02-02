import { type ByteArray, formatEther, parseEther, encodeFunctionData, type Hex, erc20Abi } from "viem";
import {
    type Action,
    composeContext,
    generateObjectDeprecated,
    type HandlerCallback,
    ModelClass,
    type IAgentRuntime,
    type Memory,
    type State,
} from "@elizaos/core";

import erc20BArtifacts from "../contracts/artifacts/ERC20Bridge.json";

import { approve } from "thirdweb/extensions/erc20";
import { sendTransaction } from "thirdweb";

import { initWalletProvider, type WalletProvider } from "../providers/wallet";
import { depositTemplate as depositTemplate } from "../templates";
import type { DepositParams as DepositParams, Transaction, TransferParams } from "../types";



import * as viemChains from "viem/chains";

const _SupportedChainList = Object.keys(viemChains) as Array<
    keyof typeof viemChains
>;
type SupportedChain = (typeof _SupportedChainList)[number];

export { depositTemplate as addLiquidityTemplate };

export class DepositAction {
    constructor(private walletProvider: WalletProvider) {
        this.walletProvider = walletProvider;
    }

    async deposit(params: DepositParams): Promise<Transaction> {
        const walletClient = this.walletProvider.getWalletClient(params.chain);
        console.log(`!!!!!!!!!!!!!!!!!! PARAMS ${JSON.stringify(params)}`)



        const approveTxData = encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [
                params.bridge,
                params.amount,
            ],
        });

        const depositTxData = encodeFunctionData({
            abi: erc20BArtifacts.abi,
            functionName: "deposit",
            args: [
                params.token,
                params.chainId,
                walletClient.account.address,
                params.amount,
            ],
        });

        var arrTx: Transaction[] = [];
        for (const data of [{to: params.token, data:approveTxData}, {to: params.bridge, data:depositTxData}]) {
            try {
                this.walletProvider.switchChain(params.chain);

                const chainConfig = this.walletProvider.getChainConfigs(
                    params.chain
                );

                // Log current block before sending transaction
                const publicClient = this.walletProvider.getPublicClient(
                    params.chain
                );

                const hash = await walletClient.sendTransaction({
                    account: walletClient.account,
                    to: data.to,
                    value: BigInt(0),
                    data: data.data as Hex,
                    chain: chainConfig,
                    kzg: {
                        blobToKzgCommitment: (_blob: ByteArray): ByteArray => {
                            throw new Error("Function not implemented.");
                        },
                        computeBlobKzgProof: (
                            _blob: ByteArray,
                            _commitment: ByteArray
                        ): ByteArray => {
                            throw new Error("Function not implemented.");
                        },
                    },
                });

                const receipt = await publicClient.waitForTransactionReceipt({
                    hash,
                });

                var tx = {
                    hash: hash,
                    from: walletClient.account.address,
                    to: params.bridge,
                    value: BigInt(0),
                    data: data.data as Hex,
                    chainId: this.walletProvider.getChainConfigs(params.chain).id,
                    logs: receipt.logs,
                };
                
                arrTx.push(tx);

            } catch (error) {
                throw new Error(`Vote failed: ${error.message}`);
            }
        }

        return arrTx[1];
    }
}

export const depositAction = {
    name: "deposit",
    description: "deposit",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: any,
        callback?: HandlerCallback
    ) => {
        if (!state) {
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

        console.log("Transfer action handler called");
        const walletProvider = await initWalletProvider(runtime);
        const action = new DepositAction(walletProvider);

        // Compose transfer context
        const paramOptions = await buildTransferDetails(
            state,
            runtime,
            walletProvider
        );

        if (!paramOptions.token || !paramOptions.chainId || !paramOptions.amount || !paramOptions.chain || !paramOptions.bridge) {
            throw new Error("Missing required parameters for deposit");
        }

        // erc20Abi.


        try {
            const depositResp = await action.deposit(paramOptions);
            if (callback) {
                callback({
                    text: `Successfully deposit ${paramOptions.amount} tokens to ${paramOptions.bridge}\nTransaction Hash: ${depositResp.hash}`,
                    content: {
                        success: true,
                        hash: depositResp.hash,
                        amount: formatEther(depositResp.value),
                        recipient: depositResp.to,
                    },
                });
            }
            return true;
        } catch (error) {
            console.error("Error during token transfer:", error);
            if (callback) {
                callback({
                    text: `Error transferring tokens: ${error.message}`,
                    content: { error: error.message },
                });
            }
            return false;
        }
    },
    validate: async (runtime: IAgentRuntime) => {
        const privateKey = runtime.getSetting("EVM_PRIVATE_KEY");
        return typeof privateKey === "string" && privateKey.startsWith("0x");
    },
    examples: [
        [
            // {
            //     user: "user",
            //     content: {
            //         text: "Deposit 30 usdt from bg1 to bg2",
            //         action: "DEPOSIT",
            //     },
            // },
            {
                user: "assistant",
                content: {
                    text: "I'll help you to balance liquidity pools from bg1 (usdt: 1300) to bg2 (usdt: 700) by depositing 300 usdt from bg2 to bg1",
                    action: "DEPOSIT",
                },
            },
            {
                user: "user",
                content: {
                    text: "Rebalance liquidity pools: bg1 (usdc: 150), bg2 (usdc: 100), bg3 (usdc: 50) by depositing 50 usdc from bg3 to bg1",
                    action: "DEPOSIT",
                },
            },
        ],
    ],
    similes: ["DEPOSIT", "REBALANCE", "REBALANCE_POOLS", "REBALANCE_LIQUIDITY"],
}; // TODO: add more examples

const buildTransferDetails = async (
    state: State,
    runtime: IAgentRuntime,
    wp: WalletProvider
): Promise<DepositParams> => {
    const context = composeContext({
        state,
        template: depositTemplate,
    });

    console.log(context);

    const depositDetails = (await generateObjectDeprecated({
        runtime,
        context,
        modelClass: ModelClass.SMALL,
    })) as DepositParams;

    return depositDetails;
};
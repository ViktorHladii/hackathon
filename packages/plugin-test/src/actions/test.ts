import { ethers } from "ethers";
import dotenv from "dotenv";
import {
    type Action,
    type IAgentRuntime,
    type Memory,
    type HandlerCallback,
    type State,
    composeContext,
    generateObject,
    ModelClass,
    elizaLogger,
} from "@elizaos/core";

dotenv.config();

export interface Manager extends ethers.Contract{
    add(tokenA: string, tokenB: string, amountADesired: number, amountBDesired: number, amountAMin: number, amountBMin: number, to: string, deadline: number): Promise<void>;
}

class LiquidityManager {
    private provider: ethers.providers.JsonRpcProvider;
    private wallet: ethers.Wallet;
    private contract: ethers.Contract;
  
    constructor(rpcUrl: string, privateKey: string, contractAddress: string, abi: any) {
      this.provider = new ethers.providers.JsonRpcProvider(rpcUrl);
      this.wallet = new ethers.Wallet(privateKey, this.provider);
      this.contract = new ethers.Contract(contractAddress, abi, this.wallet);
    }

    async addLiquidity(amount: ethers.BigNumber): Promise<ethers.providers.TransactionResponse> {
        const tx = await (this.contract as Manager).add(amount, { value: amount });
        await tx.wait();
        return tx;
      }

}

export const manageLiquidityAction: Action = {
    name: "MANAGE_LIQUIDITY",
    description: "manage liquidity pull",
    validate: async (runtime: IAgentRuntime, _message: Memory) => {
        return !!runtime.character.settings.secrets?.API_KEY;
    },
    handler: async (
        runtime: IAgentRuntime,
        _message: Memory,
        state: State,
        _options: object,
        callback: HandlerCallback
    ) => {
        try {
            
        } catch (error) {
            elizaLogger.error("Error creating resource:", error);
            callback(
                { text: "Failed to create resource. Please check the logs." },
                []
            );
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Create a new resource with the name 'Resource1' and type 'TypeA'",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: `Resource created successfully:
- Name: Resource1
- Type: TypeA`,
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Create a new resource with the name 'Resource2' and type 'TypeB'",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: `Resource created successfully:
- Name: Resource2
- Type: TypeB`,
                },
            },
        ],
    ],
};

import { AsyncCommand } from "fast-check/lib/types/fast-check-default"
import { VanillaModel, VanillaTestSystem } from "./Model"
import { JsonRpcProvider } from "@ethersproject/providers"

export class IncreaseBlockTimestamp implements AsyncCommand<VanillaModel, VanillaTestSystem> {
  // eslint-disable-next-line no-useless-constructor
  constructor (readonly provider: JsonRpcProvider, readonly days: number) {
  }

  check = (): boolean => true;

  run = async (): Promise<void> => {
    await this.provider.send("evm_increaseTime", [this.days * 24 * 60 * 60])
    await this.provider.send("evm_mine", [])
  };

  toString (): string {
    return `  - increase block.timestamp by ${this.days} days`
  }
}

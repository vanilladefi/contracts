/* eslint-disable camelcase */
import hardhatConfig from "./hardhat.base"
import { task } from "hardhat/config"
import checkEpochAction from "./hardhat/CheckEpoch.action"
import listTestAccounts from "./hardhat/ListTestAccounts.action"
import checkReserves from "./hardhat/CheckUniV2Reserves.action"
import inspectSafelist from "./hardhat/InspectSafelist.action"
import checkMigrationEligibility from "./hardhat/CheckMigrationEligibility.action"
import testTrading from "./hardhat/TestTrading.action"
import updateMigrationState from "./hardhat/UpdateMigrationState.action"
import updateSafeList from "./hardhat/UpdateSafeList.action"

task("check-epoch", "Checks the epoch of the deployed VanillaRouter", checkEpochAction)

task("test-accounts", "Prints the list of test accounts", listTestAccounts)

task("reserve-check", "checks the Uniswap pair reserves in the network", checkReserves)

task("inspect-safelist", "verifies the status of safelist token pools in Uni v3", inspectSafelist)

task("migration-eligibility", "verifies the given address is eligible for migration")
  .addParam("account", "The account's address")
  .setAction(checkMigrationEligibility)

task("trading-test", "executes buy- and sell- transactions in a test network", testTrading)

task("update-migration-state", "updates Vanilla v1.1 migration state", updateMigrationState)
task("update-safelist", "updates Vanilla v1.1 safelist", updateSafeList)
export default hardhatConfig

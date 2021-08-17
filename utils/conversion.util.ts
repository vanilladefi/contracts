import { MerkleTree } from "merkletreejs"
import keccak256 from "keccak256"
import { BigNumber, constants, Event, utils } from "ethers"
import { VanillaV1MigrationState__factory, VanillaV1Token01, VanillaV1Token02 } from "../typechain/vanilla_v1.1"

export type SnapshotState = {
  blockNumber: number,
  timeStamp: number,
  accounts: {[address: string]: BigNumber}
}

const toSnapshotState = (state: SnapshotState, event: { blockNumber: number, from: string, to:string, value:BigNumber }) => {
  let prev = state.accounts[event.to] || BigNumber.from(0)
  state.accounts[event.to] = prev.add(event.value)

  if (event.from !== constants.AddressZero) {
    if (!state.accounts[event.from]) {
      if (event.value.gt(0)) { throw new Error(`something went wrong in ${event.blockNumber} from=${event.from} value=${event.value}`) }
      state.accounts[event.from] = BigNumber.from(0)
    }
    prev = state.accounts[event.from]
    state.accounts[event.from] = prev.sub(event.value)
  }
  state.blockNumber = Math.max(event.blockNumber, state.blockNumber || 0)
  return state
}

export type AddressBalance = {
  address: string
  amount: BigNumber
}

export const toKeccak256Leaf = (balance: AddressBalance): string => utils.solidityKeccak256(["address", "string", "uint256"], [balance.address, ":", balance.amount])

export class ConversionState {
  public merkleTree: MerkleTree
  public root: string

  constructor (readonly state: SnapshotState) {
    const leaves = Object.entries(state.accounts).map(([address, amount]) => ({ address, amount, hash: toKeccak256Leaf({ address, amount }) }))
    this.merkleTree = new MerkleTree(leaves.map(x => x.hash), keccak256, { sortPairs: true, hashLeaves: false })
    if (this.merkleTree.getHexRoot() === "0x" && leaves.length > 0) {
      console.table(leaves)
      throw new Error("Invalid root")
    }
    this.root = utils.hexZeroPad(this.merkleTree.getHexRoot(), 32)
  }

  verify (balance: AddressBalance) {
    let leaf = toKeccak256Leaf(balance)
    return this.merkleTree.verify(this.merkleTree.getHexProof(leaf), leaf, this.root)
  }

  getProof (balance: AddressBalance) {
    return this.merkleTree.getHexProof(toKeccak256Leaf(balance)).map(hex => utils.hexZeroPad(hex, 32))
  }
}
const copy = ({ blockNumber, timeStamp, accounts }: SnapshotState): SnapshotState => ({ blockNumber, timeStamp, accounts: Object.assign({}, accounts) })

export const snapshot = async (vnlToken01: VanillaV1Token01, vnlToken02: VanillaV1Token02): Promise<{ onchain: ConversionState, pending: ConversionState }> => {
  const snapshotBlock = await vnlToken02
    .migrationState()
    .then((address) =>
      VanillaV1MigrationState__factory.connect(
        address,
        vnlToken02.provider,
      ).blockNumber(),
    )
  const tokenTransfers = await vnlToken01.queryFilter(vnlToken01.filters.Transfer(null, null, null))
  let byBlockIndexOrder = (a: Event, b: Event) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex
  let transfers = tokenTransfers
    .sort(byBlockIndexOrder)
    .map(({ blockNumber, args }) => ({ blockNumber, ...args }))

  let snapshotState, pendingState

  if (snapshotBlock.eq(0)) {
    // no snapshot so everything goes into pending state
    snapshotState = { blockNumber: 0, accounts: {}, timeStamp: 0 }
    pendingState = transfers.reduce(toSnapshotState, copy(snapshotState))
    pendingState.timeStamp = (await vnlToken01.provider.getBlock(pendingState.blockNumber)).timestamp
  } else {
    let firstEventIndex = transfers.findIndex(({ blockNumber }) => blockNumber > snapshotBlock.toNumber())
    if (firstEventIndex < 0) {
      // no transfers after snapshot block so everything is included in the snapshot state (snapshot state == pending state)
      snapshotState = transfers.reduce(toSnapshotState, { blockNumber: 0, accounts: {}, timeStamp: 0 })
      // fetch the timestamp after event reduction since it's timestamps are not included in the event data
      snapshotState.timeStamp = (await vnlToken01.provider.getBlock(snapshotState.blockNumber)).timestamp
      pendingState = copy(snapshotState)
    } else {
      // transfers found after snapshot block so reducing post-snapshot events to pending state
      snapshotState = transfers.slice(0, firstEventIndex).reduce(toSnapshotState, {
        blockNumber: 0,
        accounts: {},
        timeStamp: 0,
      })
      pendingState = transfers.slice(firstEventIndex).reduce(toSnapshotState, copy(snapshotState))
      // fetch the timestamp after event reduction since it's timestamps are not included in the event data
      let [snapshotTs, currentTs] = await Promise.all([
        vnlToken01.provider.getBlock(snapshotState.blockNumber).then(b => b.timestamp),
        vnlToken01.provider.getBlock(pendingState.blockNumber).then(b => b.timestamp),
      ])
      snapshotState.timeStamp = snapshotTs
      pendingState.timeStamp = currentTs
    }
  }

  return {
    onchain: new ConversionState(snapshotState),
    pending: new ConversionState(pendingState),
  }
}

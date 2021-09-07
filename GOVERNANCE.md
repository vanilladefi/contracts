## Governance tooling

Vanilla v1.1 contract API offers few operations which change the shared, operational state of the Vanilla system:

- **Updating safelist**. The safelist contains the ERC-20 addresses which are accepted in profit mining. In other words, trading in safelisted tokens is the only way to generate VNL.
- **Updating the migration state snapshot**. The snapshot determines which addresses are able to convert their VNL v1 to VNL v1.1.
- **Approving the next version**. Approving a next contract version means that Vanilla system is able to allow traders to migrate their positions to the next version.

All these operations have impact on safety of the system and can only be executed by the [Vanilla DAO multisig](https://etherscan.io/address/0xa135f339B5acd1f4eCB1C6eEd69a31482f878545).

_The rest of the document is only useful for the DAO multisig members_ (others will not be able to use the tools). The document describes how the member can propose the transactions for the DAO. This repository provides command-line tooling for enqueuing the proposals for DAO to multi-sign and execute.

### Setup

We assume all DAO members are using a Ledger hardware wallet. Other wallets work too, but all the existing code is built based on this assumption.

#### Initialize the NPM/Hardhat environment
All tooling is implemented as Hardhat tasks, so the development environment needs to be initialized first.

```shell
npm install -g pnpm
pnpm install
pnpm run compile:sol
pnpm run generate:typechain
```

#### Update `.secrets.env`
Copy the `.secrets.env.example` as `.secrets.env`:
```shell
cp .secrets.env.example .secrets.env
```

Then, remove all but the following rows from `.secrets.env`:

```
MAINNET_DEPLOYER_HDPATH=<the HD path for signing the Mainnet contract operations, must be an owner in MAINNET_DEPLOYER_ADDRESS>
MAINNET_DEPLOYER_ADDRESS=<the Mainnet multi-sig address>
ALCHEMY_MAINNET_APIKEY=<Alchemy API key for mainnet app>
```

- The mainnet multisig address is `0xa135f339B5acd1f4eCB1C6eEd69a31482f878545`.
- The HDPATH comes from the Ledger address which is used in multisig - for example, the first address in "Ethereum/Legacy" form is `m/44'/60'/0'/0`.
- The Alchemy API key is needed for non-throttled access to blockchain state, if you don't already have one, obtain it directly by [signing up](https://docs.alchemy.com/alchemy/introduction/getting-started) or contact [hello@vanilladefi.com]() for assistance.


#### Add udev-rules to make Ledger devices work in Linux
Download and execute the rules from the official Ledger HQ repository:
```shell
wget -q -O - https://raw.githubusercontent.com/LedgerHQ/udev-rules/master/add_udev_rules.sh | sudo bash
```
Without these rules, the Ledger USB device gets incorrect permissions once plugged in and signing will fail.


TODO: is this step required in MacOS?


### Update Migration State

Before executing any task, plug in your Ledger with USB and open the Ethereum app.

Then just execute:
```shell
pnpx hardhat --network mainnet update-migration-state
```
which will:
- calculate the new Merkle tree root for snapshot state
- create the transaction and sign it using the Ledger (note: when the task outputs `updateConvertibleState(root=<new root in hexadecimal>, bn=<latest block.number>) - sign the transaction in Ledger`, then it needs to be signed in your Ledger)
- send the signed transaction to the Gnosis Safe transaction service (note: this is when it will show up in Gnosis Safe UI as an enqueued transaction)
- wait until the transaction has been approved by multisig quorum and executed

### Update Safelist
TODO
### Approve Next Version
TODO

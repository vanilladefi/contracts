# Deployment

Vanilla v1.1 contracts have been deployed already in following public networks:

## Mainnet

- VanillaV1Router02: [`0x72C8B3aA6eD2fF68022691ecD21AEb1517CfAEa6`](https://etherscan.io/address/0x72C8B3aA6eD2fF68022691ecD21AEb1517CfAEa6)
- VanillaV1Token02: [`0xbf900809f4c73e5a3476eb183d8b06a27e61f8e5`](https://etherscan.io/address/0xbf900809f4c73e5a3476eb183d8b06a27e61f8e5)
- VanillaV1Safelist01: [`0x2d0338725b04533bf4f6d2b4c56f008613679517`](https://etherscan.io/address/0x2d0338725b04533bf4f6d2b4c56f008613679517)
- VanillaV1MigrationState: [`0xb62726743eec0573ec48457bdf02cb23f2387153`](https://etherscan.io/address/0xb62726743eec0573ec48457bdf02cb23f2387153)

Contracts in mainnet are owned by the Vanilla DAO, a Gnosis Safe multi-sig, deployed at [`0xa135f339B5acd1f4eCB1C6eEd69a31482f878545`](https://etherscan.io/address/0xa135f339B5acd1f4eCB1C6eEd69a31482f878545).

## Rinkeby

- VanillaV1Router02: [`0xf228eED278A124B091B77aA8cb9BAC13B97d0dEC`](https://rinkeby.etherscan.io/address/0xf228eED278A124B091B77aA8cb9BAC13B97d0dEC)
- VanillaV1Token02: [`0xbf900809f4c73e5a3476eb183d8b06a27e61f8e5`](https://rinkeby.etherscan.io/address/0xbf900809f4c73e5a3476eb183d8b06a27e61f8e5)
- VanillaV1Safelist01: [`0x1cAFF34426a7a984887dfBF5C961C7F93dbeE9Ab`](https://rinkeby.etherscan.io/address/0x1cAFF34426a7a984887dfBF5C961C7F93dbeE9Ab)
- VanillaV1MigrationState: [`0x88c083D723C69e1d6eeE8472172343d13432E670`](https://rinkeby.etherscan.io/address/0x88c083D723C69e1d6eeE8472172343d13432E670)

Contracts in Rinkeby are owned by a Gnosis Safe multi-sig, deployed at [`0xEA7E95b1A49Fbb472Ad2c0a3000DFF9e40Ec5184`](https://rinkeby.etherscan.io/address/0xea7e95b1a49fbb472ad2c0a3000dff9e40ec5184)

## Configuration

Deployment is configured by the network config in `hardhat.config.ts`.
However, it is parametrized by environment variables via `.secrets.env` file, so usually that's the only place which needs changes if deploying to pre-configured networks (including the [local mainnet fork](#deploy-contracts-to-a-local-mainnet-fork)).

1. Copy `.secrets.env.example` to `.secrets.env` and add in your keys. Never commit your keys to version control, which
   is why `.secrets.env` is .gitignored.
2. Alternatively, you can override the `.secrets.env` environment variables the way you prefer.

We use [`dotenv`-package](https://www.npmjs.com/package/dotenv) for reading the environment variables from the file.

## Deploy contracts to a local mainnet fork

Set the `ALCHEMY_MAINNET_APIKEY` in `.secrets.env` and execute:

```shell
pnpm run node:mainnet-fork
```

which starts a localhost node, which acts like a mainnet node during deployment. Other archive node providers for mainnet forks (Infura etc) are not currently supported.

Be aware that while mainnet fork lets you freely modify the mainnet state locally, the state-changing operations in mainnet `VanillaV1Safelist01`- and `VanillaV1MigrationState` -contracts require multisig approval which cannot currently be done fully locally because they rely on publicly available Gnosis Safe Transaction services. Therefore they should not be attempted.

### Running the local mainnet fork in a Docker container

There is [Dockerfile](Dockerfile) to build an image to run a containerized Hardhat testnet with Vanilla contracts deployed on it.

To build and run it, execute the following commands (podman works too):

```
docker build -t local-vanilla-mainnet-fork .
docker run --rm -d --env-file .secrets.env -p 8545:8545 local-vanilla-mainnet-fork
```

Alternatively, you can use docker-compose (see [docker-compose.yml](docker-compose.yml)):

```shell
docker-compose up -d
```

### Get a list of local test accounts
By default, Hardhat creates a list of accounts with Ether for local testing. To import them into Metamask the private keys are needed, and there's a helper command for fetching them:

```shell
pnpm run node:test-accounts
```

## Deploy contracts to Goerli

Set the `ALCHEMY_GOERLI_APIKEY` and `GOERLI_DEPLOYER_PRIVATE_KEY` in `.secrets.env` and execute:

```shell
pnpm run deploy:goerli
```

## Deploy contracts to Ropsten

Set the `ALCHEMY_ROPSTEN_APIKEY` and `ROPSTEN_DEPLOYER_PRIVATE_KEY` in `.secrets.env` and execute:

```shell
pnpm run deploy:ropsten
```

## Deploy contracts to Rinkeby

Set the `ALCHEMY_RINKEBY_APIKEY`, `RINKEBY_DEPLOYER_HDPATH` and `RINKEBY_DEPLOYER_ADDRESS` in `.secrets.env` and execute:

```shell
pnpm run deploy:rinkeby
```

Sign the transactions locally in your wallet, then proceed to gather required signatures and execute the transactions using multi-sig in `RINKEBY_DEPLOYER_ADDRESS`.
Meanwhile, do _not_ abort the above command - once the multi-sig executes the deployment transaction, the command will save the deployment artifacts to `deployments/rinkeby`- directory and exit normally.

## Deploy contracts to Mainnet

Set the `ALCHEMY_MAINNET_APIKEY`, `MAINNET_DEPLOYER_HDPATH` and `MAINNET_DEPLOYER_ADDRESS` in `.secrets.env` and execute:

```shell
pnpx hardhat --network mainnet deploy
```

Sign the transactions locally in your wallet, then proceed to gather required signatures and execute the transactions using multi-sig in `MAINNET_DEPLOYER_ADDRESS`.
Meanwhile, do _not_ abort the above command - once the multi-sig executes the deployment transaction, the command will save the deployment artifacts to `deployments/mainnet`- directory and exit normally.

## Deployment verification

Quickest way to sanity-test the deployment is to execute the following Hardhat task in the network, and compare it to the block number of the deployment transaction:
```shell
pnpx hardhat --network <network_name> check-epoch
```

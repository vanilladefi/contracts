# Deployment

We use Hardhat also for deployment in different networks. Vanilla has been deployed already in following public networks:

- Mainnet: [`0xE13E9010e818D48df1A0415021d9526ef845e2Cd`](https://etherscan.io/address/0xe13e9010e818d48df1a0415021d9526ef845e2cd)
- Ropsten: [`0xcEb9A8c92689b5AeEC26160D06236cC711Fa3836`](https://ropsten.etherscan.io/address/0xceb9a8c92689b5aeec26160d06236cc711fa3836)
- Goerli: [`0x9D9B49892ae40D59C325494cf0b19444E7b1440C`](https://goerli.etherscan.io/address/0x9d9b49892ae40d59c325494cf0b19444e7b1440c)

## Configuration

Deployment is configured by environment variables, `.secrets.env` file, and ultimately the network config
in `hardhat.config.ts`.

1. Copy `.secrets.env.example` to `.secrets.env` and add in your keys. Never commit your keys to version control, which
   is why `.secrets.env` is .gitignored.
2. Alternatively, you can override the `.secrets.env` environment variables the way you prefer.

We use [`dotenv`-package](https://www.npmjs.com/package/dotenv) for reading the environment variables from the file.

## Deploy contracts to a local mainnet fork

Set the `ALCHEMY_MAINNET_APIKEY` and execute:

```shell
npm run node:mainnet-fork
```

which starts a localhost node, which acts like a mainnet node during deploy.

Other archive node providers for mainnet forks (Infura etc) are not supported.

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
npm run node:test-accounts
```

## Deploy contracts to Goerli

Set the `ALCHEMY_GOERLI_APIKEY` and `GOERLI_DEPLOYER_PRIVATE_KEY` in `.secrets.env` and execute:

```shell
npm run deploy:goerli
```

## Deploy contracts to Ropsten

Set the `ALCHEMY_ROPSTEN_APIKEY` and `ROPSTEN_DEPLOYER_PRIVATE_KEY` in `.secrets.env` and execute:

```shell
npm run deploy:ropsten
```

## Deploy contracts to mainnet

Set the `ALCHEMY_MAINNET_APIKEY` and `MAINNET_DEPLOYER_PRIVATE_KEY` in `.secrets.env`, adjust the gas price in `hardhatConfig.networks.mainnet` high enough (located in `hardhat.config.ts`) and execute:

```shell
npx hardhat --network mainnet deploy
```

## Deployment verification

Quickest way to sanity-test the deployment is to execute the following Hardhat task in the network, and compare it to the block number of the deployment transaction:
```shell
npx hardhat --network <network_name> check-epoch
```

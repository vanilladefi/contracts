# Vanilla Contracts v1.1

This repository contains the core smart contracts for Vanilla. For documentation, see [the technical overview](contracts/README.md) of the contracts.

## Install Yarn

We use [Yarn](https://yarnpkg.com/) instead of npm.

```shell
curl --compressed -o- -L https://yarnpkg.com/install.sh | bash
```

## Build and Test

We use [Hardhat](https://hardhat.org/) as a build tool.

To build, `yarn install` (generates Typechain bindings), and run model tests:
```
yarn install
yarn test
```

To run coverage reports
```
yarn run coverage:sol
```

## Lint and reformat

We use [ESLint](https://eslint.org/) for JS/TS code and [Prettier](https://prettier.io/) for Solidity code.

To run lint checks:
```
yarn run lint:js
yarn run lint:sol
```

To reformat / prettify:
```
yarn run format:js
yarn run format:sol
```

## Deployment

We use Hardhat also for all deployments. See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed instructions.

## License

All source code is licensed under [GPL-3.0-or-later](LICENSE) except:
- [contracts/Tickmath.sol](contracts/TickMath.sol) -library, which is a derived work from a similar library in [Uniswap v3 Core](https://github.com/Uniswap/uniswap-v3-core/blob/main/contracts/libraries/TickMath.sol), and is licensed under [GPL-2.0-or-later](LICENSE_TICKMATH)

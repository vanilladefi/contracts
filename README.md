# Vanilla Contracts v1.1

This repository contains the core smart contracts for Vanilla. For documentation, see [the technical overview](contracts/README.md) of the contracts.

## Install PNPM

We use [pnpm](https://pnpm.io/) instead of npm. Use npm to install pnpm:

```shell
npm install -g pnpm
```

## Build and Test

We use [Hardhat](https://hardhat.org/) as a build tool.

To build, generate Typechain bindings, and run model tests:
```
pnpm install
pnpm run compile:sol
pnpm run generate:typechain
pnpm test
```

To run coverage reports
```
pnpm run coverage:sol
```

## Lint and reformat

We use [ESLint](https://eslint.org/) for JS/TS code and [Prettier](https://prettier.io/) for Solidity code.

To run lint checks:
```
pnpm run lint:js
pnpm run lint:sol
```

To reformat / prettify:
```
pnpm run format:js
pnpm run format:sol
```

## Deployment

We use Hardhat also for all deployments. See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed instructions.

## License

All source code is licensed under [GPL-3.0-or-later](LICENSE) except:
- [contracts/Tickmath.sol](contracts/TickMath.sol) -library, which is a derived work from a similar library in [Uniswap v3 Core](https://github.com/Uniswap/uniswap-v3-core/blob/main/contracts/libraries/TickMath.sol), and is licensed under [GPL-2.0-or-later](LICENSE_TICKMATH)

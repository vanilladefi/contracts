# Vanilla Contracts v1

This repository contains the core smart contracts for Vanilla. For documentation, see [the technical overview](contracts/README.md) of the contracts.

## Build and Test

We use [Hardhat](https://hardhat.org/) as a build tool.

To build and run tests:
```
npm install
npm test
```

## Lint and reformat

We use [ESLint](https://eslint.org/) for JS/TS code and [Prettier](https://prettier.io/) for Solidity code.

To run lint checks:
```
npm run lint:js
npm run lint:sol
```

To reformat / prettify:
```
npm run format:js
npm run format:sol
```

## Deployment

We use Hardhat also for all deployments. See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed instructions.

## License

[GPL 3.0](LICENSE)

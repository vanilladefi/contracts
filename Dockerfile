FROM node:alpine

USER root

RUN mkdir /home/node/app

WORKDIR /home/node/app

COPY package.json *.config.ts *.base.ts tsconfig.json ./
COPY contracts ./contracts
COPY utils ./utils
COPY deploy ./deploy
COPY deployments ./deployments
COPY hardhat ./hardhat
COPY test /home/node/app/test
COPY .secrets.env /home/node/app/.secrets.env

RUN chown node /home/node/app/*

RUN apk add --update --no-cache g++ make python3 py3-pip bash git hidapi linux-headers eudev-dev openssh libusb-dev libusb curl && ln -sf python3 /usr/bin/python
RUN npm install -g pnpm

USER node

RUN python3 -m ensurepip
RUN pip3 install --no-cache --upgrade pip setuptools

USER root

RUN pnpm install && pnpm run compile:sol && pnpm run generate:typechain

EXPOSE 8545

CMD pnpm run node:mainnet-fork


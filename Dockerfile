FROM node:12-alpine

WORKDIR /home/node/app

COPY package.json *.config.ts tsconfig.json ./
COPY contracts ./contracts
COPY utils ./utils
COPY deploy ./deploy
COPY deployments ./deployments
RUN apk add --virtual build-dependencies git && \
    npm install -g pnpm && \
    pnpm install && \
    apk del build-dependencies

EXPOSE 8545

CMD pnpm run node:mainnet-fork

